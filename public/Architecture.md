# Architecture Document
## Arsitektur Sistem & Spesifikasi Teknis — Dashboard Pengajar KBEC

---

### 1. Overview Arsitektur Sistem

Dashboard Pengajar bukan sistem terpisah, melainkan **ekstensi terintegrasi** dari sistem KBEC Admin yang sudah ada. Pengajar mengakses Portal Pengajar (`teacher-*.html`) dan seluruh data ditulis ke TiDB Cloud yang sama — sehingga Super Admin dapat memantau semua aktivitas secara real-time.

```
┌─────────────────────────────────────────────────────────────────┐
│                    KBEC INTEGRATED SYSTEM                       │
│                                                                 │
│  [ Super Admin Dashboard ]     [ Teacher Dashboard ]           │
│        (admin-*.html)               (teacher-*.html)           │
│              │                           │                     │
│              └─────────────┬─────────────┘                     │
│                            │ HTTP / HTTPS (REST API)            │
│                            ▼                                    │
│         [ Vercel Serverless — server.js / api/index.js ]       │
│                            │                                    │
│         ┌──────────────────┼──────────────────┐                │
│         │           Node MySQL2                │                │
│         ▼                  ▼                  ▼                │
│  [  teachers  ]    [  attendance  ]   [ teacher_checkins ]     │
│  [ students   ]    [ student_grades ] [  activity_logs  ]     │
│  [  classes   ]    [  schedules    ] [   reminders      ]     │
│         └──────────────────┴──────────────────┘                │
│                    TiDB Cloud (Shared Database)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2. Technology Stack

| Layer | Teknologi | Alasan Pemilihan |
|---|---|---|
| **Frontend UI** | HTML5, Vanilla JavaScript (ES6+), TailwindCSS (CDN) | Ringan, tanpa bundler berat, kompatibel penuh lintas perangkat mobile/desktop. |
| **GPS & Geolocation** | Browser Geolocation API (`navigator.geolocation`) + Haversine Formula | Native API browser, tanpa library tambahan, akurasi tinggi. |
| **Iconography** | Lucide Icons | Visual modern, konsisten dengan antarmuka Super Admin. |
| **Backend Server** | Node.js + Express.js | Arsitektur event-driven non-blocking, cepat untuk REST API simultan. |
| **Database** | TiDB Cloud (MySQL Engine, Shared) | Database yang sama dengan Super Admin — satu sumber kebenaran (*single source of truth*). |
| **Keamanan Auth** | SHA-256 HMAC Salting + Server-side Timestamp | Kata sandi aman, timestamp kehadiran tidak bisa dimanipulasi dari klien. |
| **Hosting** | Vercel Serverless Functions | Auto CI/CD dari GitHub `main` branch, skalabilitas otomatis. |

---

### 3. Arsitektur Keamanan & Hak Akses (RBAC)

Sistem menggunakan **Role-Based Access Control (RBAC)** tiga tingkat:

| Role | Akses |
|---|---|
| `admin` | Akses penuh ke seluruh sistem, termasuk monitoring rekap kehadiran pengajar |
| `teacher` | Terbatas pada data kelas milik sendiri, absensi siswa, nilai, check-in diri sendiri |
| `guest` | Redirect otomatis ke halaman login |

```javascript
// Middleware Guard: Hanya izinkan role teacher atau admin
function requireTeacherRole(req, res, next) {
    const userRole = req.headers['x-user-role'];
    if (userRole === 'teacher' || userRole === 'admin') return next();
    return res.status(403).json({ success: false, message: 'Akses ditolak: Khusus akun Pengajar.' });
}
```

---

### 4. Arsitektur Geofencing & GPS Check-in

#### Alur Teknis Check-in Tatap Muka:
```
[Pengajar tekan tombol Check-in]
         │
         ▼
[Browser request GPS via navigator.geolocation.getCurrentPosition()]
         │
         ├─ Izin Ditolak ──► Tampilkan error "Izin GPS diperlukan"
         │
         ▼ Izin Diberikan
[Kalkulasi jarak Haversine:
  distance = haversine(user.lat, user.lng, kbec.lat, kbec.lng)]
         │
         ├─ distance > 100m ──► Tampilkan error "Di luar radius KBEC (XXXm)"
         │
         ▼ distance <= 100m
[Kirim POST /api/teacher/checkin ke server:
  { class_id, latitude, longitude, tipe: "hadir" }]
         │
         ▼
[Server mencatat waktu dengan NOW() MySQL — BUKAN waktu klien]
[INSERT INTO teacher_checkins (..., checkin_time = NOW())]
         │
         ▼
[Server JUGA memanggil logActivity() → activity_logs]
[Super Admin melihat log baru di Dashboard dalam <1 detik]
```

#### Koordinat Referensi KBEC (Dapat Dikonfigurasi via ENV):
```javascript
// Koordinat Resmi Fasilitas KBEC (bisa diubah di .env)
const KBEC_LAT = process.env.KBEC_LATITUDE  || -7.9666;  // default: contoh koordinat
const KBEC_LNG = process.env.KBEC_LONGITUDE || 112.6326; // default: contoh koordinat
const KBEC_RADIUS_M = parseInt(process.env.KBEC_RADIUS_METERS || '100'); // 100 meter
```

#### Formula Haversine (Jarak antara 2 Koordinat GPS):
```javascript
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Radius bumi dalam meter
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1 * Math.PI/180) *
              Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

---

### 5. Rute REST API Terdedikasi Pengajar

| Method | Endpoint API | Deskripsi | Scope |
|---|---|---|---|
| `POST` | `/api/teacher/login` | Login khusus pengajar | Publik |
| `GET` | `/api/teacher/dashboard` | Statistik & jadwal hari ini | Teacher |
| `GET` | `/api/teacher/classes` | Kelas yang diampu pengajar | Teacher |
| `GET` | `/api/teacher/classes/:id/students` | Daftar siswa di kelas tertentu | Teacher |
| `POST` | `/api/teacher/attendance` | Input presensi harian siswa | Teacher |
| `GET` | `/api/teacher/grades` | Data nilai siswa | Teacher |
| `POST` | `/api/teacher/grades` | Input / update nilai & progress note | Teacher |
| `POST` | `/api/teacher/checkin` | Check-in kehadiran pengajar + GPS | Teacher |
| `POST` | `/api/teacher/checkout` | Check-out kehadiran pengajar | Teacher |
| `GET` | `/api/teacher/checkins` | Riwayat rekam kehadiran pengajar | Teacher |
| `GET` | `/api/admin/teacher-checkins` | Rekap kehadiran semua pengajar | Admin only |
| `PUT` | `/api/teacher/profile` | Update profil & password pengajar | Teacher |

---

### 6. Pola Integrasi dengan Super Admin

Seluruh aksi pengajar yang mengubah data secara otomatis memanggil fungsi `logActivity()` di server, sehingga log langsung tampil di widget **Log Aktivitas Terbaru** pada Dashboard Super Admin:

```javascript
// Dipanggil setelah setiap aksi penting pengajar di server.js
await logActivity(
    teacher.nama,
    'Check-in Kelas · GPS Terverifikasi',
    `[${kelas}] · ${distance.toFixed(0)}m dari KBEC`,
    'Berhasil',
    'text-emerald-600 bg-emerald-50'
);
```
