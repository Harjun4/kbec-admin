# Architecture Document
## Arsitektur Sistem — Dashboard Pengajar KBEC (Terpisah dari Super Admin)
### Versi: 2.0 | Status: FINAL

---

### 1. Prinsip Arsitektur: Separated UI, Shared Database

```
╔══════════════════════════════════════════════════════════════════════╗
║              KBEC SYSTEM — 2 DASHBOARD, 1 DATABASE                 ║
╠══════════════════════════╦═══════════════════════════════════════════╣
║   SUPER ADMIN DASHBOARD  ║       TEACHER DASHBOARD                  ║
║                          ║                                           ║
║   login.html             ║   teacher-login.html                     ║
║   dashboard.html         ║   teacher-dashboard.html                 ║
║   siswa.html             ║   teacher-checkin.html                   ║
║   pengajar.html          ║   teacher-classes.html                   ║
║   kelas.html             ║   teacher-attendance.html                ║
║   absensi.html           ║   teacher-grades.html                    ║
║   pembayaran.html        ║   teacher-schedules.html                 ║
║   program.html           ║   teacher-profile.html                   ║
║   jadwal.html            ║                                           ║
║   profile.html           ║                                           ║
╠══════════════════════════╩═══════════════════════════════════════════╣
║                    server.js — Express.js                           ║
║         /api/admin/*  ←──────────────────→  /api/teacher/*         ║
╠══════════════════════════════════════════════════════════════════════╣
║              TiDB Cloud — kbec_db (Single Shared Database)         ║
║   [students] [teachers] [classes] [attendance] [payments]          ║
║   [teacher_checkins] [student_grades] [activity_logs] ...          ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

### 2. Technology Stack

| Layer | Teknologi | Catatan |
|---|---|---|
| **Frontend UI** | HTML5, Vanilla JavaScript (ES6+), TailwindCSS (CDN), Lucide Icons | Konsisten dengan Super Admin, zero bundler |
| **GPS & Geolocation** | Browser Geolocation API + Haversine Formula (server-side) | Native, tanpa library tambahan |
| **Backend** | Node.js + Express.js (`server.js`) | Satu file server untuk kedua dashboard |
| **Database** | TiDB Cloud `kbec_db` | Database bersama — sumber kebenaran tunggal |
| **Autentikasi** | SHA-256 HMAC Salting — tabel `teachers`, key sesi berbeda | `teacherSession` vs `authToken` di localStorage |
| **Hosting** | Vercel Serverless | Auto CI/CD dari GitHub `main` |

---

### 3. Routing & RBAC Middleware

Satu file `server.js` melayani kedua dashboard dengan middleware yang berbeda:

```javascript
// ============================================================
// MIDDLEWARE RBAC — DIPISAHKAN PER ROUTE PREFIX
// ============================================================

// Guard untuk Super Admin: hanya role 'admin'
function requireAdmin(req, res, next) {
    const role = req.headers['x-user-role'];
    if (role === 'admin') return next();
    return res.status(403).json({ success: false, message: 'Akses ditolak: Khusus Super Admin.' });
}

// Guard untuk Pengajar: role 'teacher' atau 'admin' (admin bisa lihat semua)
function requireTeacher(req, res, next) {
    const role = req.headers['x-user-role'];
    if (role === 'teacher' || role === 'admin') return next();
    return res.status(403).json({ success: false, message: 'Akses ditolak: Khusus akun Pengajar.' });
}

// Contoh penerapan:
app.post('/api/teacher/login', ...);               // Publik
app.get('/api/teacher/dashboard',  requireTeacher, ...); // Teacher only
app.get('/api/admin/teacher-checkins', requireAdmin, ...); // Admin only
```

---

### 4. Alur Autentikasi — Dua Login Terpisah

#### Super Admin Login Flow:
```
login.html ──POST /api/auth/login──► server.js ──► tabel users ──► authToken di localStorage
```

#### Teacher Login Flow:
```
teacher-login.html ──POST /api/teacher/login──► server.js ──► tabel teachers ──► teacherSession di localStorage
```

**Guard halaman di setiap `teacher-*.html`:**
```javascript
const session = JSON.parse(localStorage.getItem('teacherSession') || 'null');
if (!session || session.role !== 'teacher') {
    window.location.href = 'teacher-login.html';
}
```

---

### 5. Arsitektur GPS Geofencing & Check-in

#### Alur Teknis (Tatap Muka):
```
[Pengajar tekan "CHECK-IN KELAS" di teacher-checkin.html]
         │
         ▼
[navigator.geolocation.getCurrentPosition()]
         │
         ├─ Ditolak ──► Toast error "Izin GPS wajib diaktifkan"
         │
         ▼ Berhasil mendapat koordinat
[Client kirim POST /api/teacher/checkin:
  { class_id, lat, lng, accuracy, tipe: "tatap_muka" }]
         │
         ▼ Di SERVER (bukan di client):
[Hitung jarak Haversine(lat, lng, KBEC_LAT, KBEC_LNG)]
         │
         ├─ jarak > 100m ──► HTTP 403: "Di luar radius KBEC (XXXm)"
         │
         ▼ jarak ≤ 100m
[INSERT teacher_checkins:
  checkin_time = NOW()   ← Timestamp DARI SERVER, bukan klien
  status_lokasi = 'VALID_IN_RANGE'
  jarak_dari_kbec = jarak]
         │
         ▼
[logActivity() ──► activity_logs]
[Super Admin melihat di Dashboard dalam <1 detik]
```

> **Kritis — Keamanan Timestamp**: Validasi jarak & pencatatan waktu **selalu dilakukan di server** menggunakan `NOW()` MySQL. Client hanya mengirim koordinat, tidak mengirim waktu.

#### Koordinat KBEC (Dikonfigurasi via ENV):
```env
KBEC_LATITUDE=-7.9666
KBEC_LONGITUDE=112.6326
KBEC_RADIUS_METERS=100
```

#### Formula Haversine (Dijalankan di server.js):
```javascript
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
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

### 6. Endpoint API Lengkap

#### Teacher Dashboard Endpoints (`/api/teacher/*`)
| Method | Endpoint | Deskripsi | Guard |
|---|---|---|---|
| `POST` | `/api/teacher/login` | Login pengajar | Publik |
| `GET` | `/api/teacher/dashboard` | Statistik & jadwal hari ini | `requireTeacher` |
| `GET` | `/api/teacher/classes` | Kelas yang diampu pengajar login | `requireTeacher` |
| `GET` | `/api/teacher/classes/:id/students` | Siswa di kelas tertentu | `requireTeacher` |
| `POST` | `/api/teacher/attendance` | Input presensi siswa | `requireTeacher` |
| `GET` | `/api/teacher/grades` | Data nilai siswa | `requireTeacher` |
| `POST` | `/api/teacher/grades` | Upsert nilai & progress note | `requireTeacher` |
| `POST` | `/api/teacher/checkin` | Check-in + validasi GPS | `requireTeacher` |
| `POST` | `/api/teacher/checkout` | Check-out + hitung durasi | `requireTeacher` |
| `GET` | `/api/teacher/checkins` | Riwayat check-in diri sendiri | `requireTeacher` |
| `PUT` | `/api/teacher/profile` | Update profil & password | `requireTeacher` |

#### Admin Monitoring Endpoints (`/api/admin/*`)
| Method | Endpoint | Deskripsi | Guard |
|---|---|---|---|
| `GET` | `/api/admin/teacher-checkins` | Rekap check-in semua pengajar | `requireAdmin` |
| `GET` | `/api/admin/teacher-checkins/:id` | Rekap check-in 1 pengajar | `requireAdmin` |

---

### 7. Integrasi Data dengan Super Admin

Semua data yang diinput pengajar tersimpan ke tabel yang sama sehingga Super Admin dapat memantau tanpa ada duplikasi data:

```
Teacher input absensi siswa ──► tabel attendance ──► dibaca Super Admin di absensi.html
Teacher input nilai         ──► tabel student_grades ──► dibaca Super Admin di siswa.html
Teacher check-in GPS        ──► tabel teacher_checkins ──► dibaca Super Admin di pengajar.html
Semua aksi pengajar         ──► tabel activity_logs ──► muncul di dashboard.html Super Admin
```
