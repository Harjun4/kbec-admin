# Architecture Document
## Arsitektur Sistem & Spesifikasi Teknis - Dashboard Pengajar KBEC

---

### 1. Overview Arsitektur Sistem
Dashboard Pengajar KBEC dibangun dengan arsitektur **Single-Page Application (SPA) / Multi-Page Web App (MPA) Hybrid Lightweight** yang berjalan di atas platform **Node.js Express** dan disebarkan (*deployed*) secara terdistribusi pada **Vercel Serverless Network** dengan database cloud berkinerja tinggi **TiDB Cloud (MySQL-Compatible)**.

```
[ Browser Client (Pengajar UI) ] 
       │
       │ HTTP / HTTPS (REST API & Auth Token)
       ▼
[ Vercel Serverless Edge Layer (index.js / server.js) ]
       │
       │ Node-MySQL2 Connection Pool (SSL / TLS)
       ▼
[ TiDB Cloud Database (gateway01.ap-southeast-1.prod.aws.tidbcloud.com) ]
```

---

### 2. Technology Stack

| Layer | Teknologi | Alasan Pemilihan |
|---|---|---|
| **Frontend UI** | HTML5, Vanilla JavaScript (ES6+), TailwindCSS (CDN) | Ringan, tanpa bundler berat, kompatibel penuh lintas perangkat mobile/desktop, serta beban rendering instan. |
| **Iconography** | Lucide Icons | Visual modern, konsisten dengan antarmuka Super Admin. |
| **Backend Server** | Node.js + Express.js | Arsitektur event-driven non-blocking yang sangat cepat untuk menangani request REST API simultan. |
| **Database** | TiDB Cloud (MySQL Engine) | Database Distributed SQL modern berkapasitas tinggi dengan jaminan ketersediaan 99.9% dan kompatibilitas query MySQL 8.0. |
| **Keamanan Auth** | SHA-256 HMAC Salting & Session Tokens | Menjamin enkripsi satu arah yang aman pada kata sandi pengguna tanpa celah dekripsi. |
| **Hosting & Deployment** | Vercel Serverless Functions | Automatic CI/CD dari GitHub repository (`main` branch) dengan skalabilitas otomatis gratis & latency rendah. |

---

### 3. Arsitektur Keamanan & Hak Akses (RBAC)

Sistem menggunakan **Role-Based Access Control (RBAC)** dua tingkat:
1. **Role `admin`**: Akses penuh ke seluruh fitur (Siswa, Pengajar, Kelas, Keuangan, Program, User Management, Laporan).
2. **Role `teacher`**: Terisolasi hanya untuk membaca & mengelola data yang terkait dengan dirinya sendiri (`teacher.id` / `teacher.nama`).

```javascript
// Middleware Validasi Role Pengajar pada Server Endpoint
function requireTeacherRole(req, res, next) {
    const userRole = req.headers['x-user-role'] || req.body.role;
    if (userRole === 'teacher' || userRole === 'admin') {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Akses ditolak: Khusus akun Pengajar.' });
}
```

---

### 4. Struktur Rute REST API Terdedikasi Pengajar

| Method | Endpoint API | Deskripsi | Scope Akses |
|---|---|---|---|
| `POST` | `/api/teacher/login` | Login khusus akun pengajar | Publik |
| `GET` | `/api/teacher/dashboard` | Mengambil data statistik & jadwal pengajar | Pengajar Logged In |
| `GET` | `/api/teacher/classes` | Mengambil daftar kelas yang diampu oleh pengajar | Pengajar Logged In |
| `GET` | `/api/teacher/classes/:id/students` | Mengambil siswa pada kelas tertentu yang diampu | Pengajar Logged In |
| `POST` | `/api/teacher/attendance` | Menginput presensi harian siswa | Pengajar Logged In |
| `GET` | `/api/teacher/grades` | Mengambil data nilai & evaluasi siswa | Pengajar Logged In |
| `POST` | `/api/teacher/grades` | Menginput/Memperbarui nilai & *progress notes* | Pengajar Logged In |
| `PUT` | `/api/teacher/profile` | Memperbarui foto, kontak, & password pengajar | Pengajar Logged In |

---

### 5. Alur Komunikasi Data (Data Flow Diagram)

#### Flow Input Presensi Siswa oleh Pengajar:
1. Pengajar memilih Kelas & Tanggal Mengajar di UI `teacher-attendance.html`.
2. Browser mengirim `POST /api/teacher/attendance` dengan payload JSON (`{ class_id, tanggal, list: [{ student_id, status }] }`).
3. Server memverifikasi apakah `class_id` tersebut benar-benar diampu oleh Pengajar yang sedang login.
4. Server mengeksekusi batch `INSERT INTO attendance ... ON DUPLICATE KEY UPDATE` di TiDB Cloud.
5. Server otomatis memicu fungsi `logActivity()` untuk mencatat kegiatan presensi ke log aktivitas.
6. Browser menerima respons `{ success: true }` dan menampilkan notifikasi Toast sukses.
