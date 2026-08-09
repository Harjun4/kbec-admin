# AUDIT LAPORAN: Matriks Peran, Otorisasi CRUD, dan Keamanan
# KBEC Admin System

---

| Informasi Audit       | Detail                                                   |
|-----------------------|----------------------------------------------------------|
| **Jenis Audit**       | Security, Role Authorization, CRUD & Feature Matrix      |
| **Tanggal Audit**     | 9 Agustus 2026                                           |
| **Status**            | READ-ONLY — Tidak ada perubahan kode dilakukan            |
| **Auditor**           | Antigravity AI (via kode analisis statis)                |
| **Cakupan File**      | server.js, src/routes/*, src/controllers/*, src/middlewares/*, public/global-user.js |

---

## 1. Arsitektur Otorisasi Sistem

### 1.1 Mekanisme Autentikasi

Sistem menggunakan **JWT (JSON Web Token)** yang disimpan di `localStorage` dan dikirim melalui header `Authorization: Bearer <token>`. Token dikonfigurasi di `auth.middleware.js`.

```
Fallback JWT_SECRET → hardcoded 'kbec_jwt_production_secret_2026_randomized_key'
Expiry             → 24h (dari env JWT_EXPIRES_IN atau default)
Payload Token      → { id, nis, name, email, role, teacher_id }
```

> **TEMUAN KEAMANAN (SEV-001):** Jika `JWT_SECRET` tidak terdapat di environment variable, server menggunakan nilai hardcoded fallback. Risiko: Siapa pun yang mengakses kode sumber dapat memalsukan token JWT dengan role `Super Admin`.

### 1.2 Hierarki Role & Level Akses

Didefinisikan di `auth.middleware.js` — `requireRole()` menggunakan sistem **minimum level**.

```javascript
const ROLE_HIERARCHY = {
    'super admin': 3,
    'admin':       2,
    'pengajar':    1,
    'teacher':     1  // alias
};
```

| Role           | Level | Akses Kumulatif                                               |
|----------------|-------|---------------------------------------------------------------|
| `Super Admin`  | 3     | Semua fitur termasuk delete data, approve user, manajemen sistem |
| `Admin`        | 2     | Fitur operasional (CRUD dasar, keuangan, kelas, inventaris)  |
| `Pengajar`     | 1     | Absensi kelas sendiri, check-in, evaluasi kinerja siswa      |
| `Staf`         | —     | **TIDAK TERDEFINISI** di ROLE_HIERARCHY (level 0 = ditolak semua endpoint) |

> **TEMUAN (SEV-004):** Role `Staf` terdaftar di `userSchema` validasi tapi tidak ada dalam `ROLE_HIERARCHY`. User dengan role `Staf` otomatis **ditolak seluruh endpoint** yang menggunakan `requireRole()`.

### 1.3 Logika requireRole() — Catatan Desain

```javascript
// requireRole('Super Admin', 'Admin') → level minimum = 2
// Admin (level 2) dan Super Admin (level 3) DITERIMA
const minRequiredLevel = Math.min(...allowedLevels);
if (userLevel < minRequiredLevel) → 403 Forbidden
```

Desain ini sudah tepat. Namun implikasinya: `requireRole('Super Admin')` saja → hanya level 3.

---

## 2. Matriks Hak Akses Role per Endpoint/Fitur

**Legenda:** `[C]` = Create | `[R]` = Read | `[U]` = Update | `[D]` = Delete | `[-]` = Ditolak

### 2.1 Autentikasi & Profil

| Endpoint / Fitur                          | Method   | Super Admin | Admin | Pengajar | Staf |
|-------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `POST /api/auth/register`                 | Public   | `[C]`       | `[C]` | `[C]`    | `[C]`|
| `POST /api/auth/login`                    | Public   | `[R]`       | `[R]` | `[R]`    | `[R]`|
| `GET /api/auth/validate`                  | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `PUT /api/auth/profile`                   | Auth     | `[U]`       | `[U]` | `[U]`    | `[-]`|
| `PUT /api/auth/change-password`           | Auth     | `[U]`       | `[U]` | `[U]`    | `[-]`|
| `GET /api/users/profile`                  | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `PUT /api/users/profile`                  | Auth     | `[U]`       | `[U]` | `[U]`    | `[-]`|

### 2.2 Manajemen User (datauser.html)

| Endpoint / Fitur                          | Method   | Super Admin | Admin | Pengajar | Staf |
|-------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/users`                          | SA Only  | `[R]`       | `[-]` | `[-]`    | `[-]`|
| `POST /api/users`                         | SA Only  | `[C]`       | `[-]` | `[-]`    | `[-]`|
| `PUT /api/users/:id`                      | SA Only  | `[U]`       | `[-]` | `[-]`    | `[-]`|
| `DELETE /api/users/:id`                   | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|
| `GET /api/users/next-id`                  | SA Only  | `[R]`       | `[-]` | `[-]`    | `[-]`|
| `PUT /api/admin/users/:id/approval`       | SA Only  | `[U]`       | `[-]` | `[-]`    | `[-]`|
| `GET /api/admin/unlinked-teachers`        | SA Only  | `[R]`       | `[-]` | `[-]`    | `[-]`|

### 2.3 Data Siswa (siswa.html)

| Endpoint / Fitur                          | Method   | Super Admin | Admin | Pengajar | Staf |
|-------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/students`                       | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `GET /api/students/next-id`               | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/students`                      | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `PUT /api/students/:id`                   | Admin+   | `[U]`       | `[U]` | `[-]`    | `[-]`|
| `DELETE /api/students/:id`                | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|
| `POST /api/students/bulk`                 | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|

### 2.4 Akademik — Pengajar (pengajar.html)

| Endpoint / Fitur                          | Method   | Super Admin | Admin | Pengajar | Staf |
|-------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/teachers`                       | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/teachers`                      | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `PUT /api/teachers/:id`                   | Admin+   | `[U]`       | `[U]` | `[-]`    | `[-]`|
| `DELETE /api/teachers/:id`                | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|
| `POST /api/teachers/checkin`              | Auth     | `[C]`       | `[C]` | `[C]`    | `[-]`|
| `GET /api/teachers/checkin-logs`          | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|

### 2.5 Akademik — Kelas & Jadwal (kelas.html)

| Endpoint / Fitur                              | Method   | Super Admin | Admin | Pengajar | Staf |
|-----------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/classes`                            | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `GET /api/classes/schedule`                   | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `GET /api/schedules`                          | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/classes`                           | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `PUT /api/classes/:id`                        | Admin+   | `[U]`       | `[U]` | `[-]`    | `[-]`|
| `DELETE /api/classes/:id`                     | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|
| `GET /api/classes/:id/students`               | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/classes/:id/students`              | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `DELETE /api/classes/:id/students/:student_id`| Admin+   | `[D]`       | `[D]` | `[-]`    | `[-]`|

### 2.6 Akademik — Presensi & Kinerja (absensi.html)

| Endpoint / Fitur                          | Method   | Super Admin | Admin | Pengajar | Staf |
|-------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/attendance`                     | Auth     | `[R]`       | `[R]` | `[R]*`   | `[-]`|
| `GET /api/attendance/monthly`             | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/attendance`                    | Auth     | `[C/U]`     | `[C/U]`| `[C/U]` | `[-]`|
| `POST /api/attendance/bulk`               | Auth     | `[C/U]`     | `[C/U]`| `[C/U]` | `[-]`|
| `GET /api/attendance/student-grades`      | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/attendance/student-grades`     | Auth     | `[C/U]`     | `[C/U]`| `[C/U]` | `[-]`|
| `GET /api/attendance/performance-report`  | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `GET /api/attendance/report`              | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|

> `[R]*` — Pengajar mendapat auto-filter ke kelas mereka via logika backend (soft-filter berdasarkan email/nama). Namun jika `class_id` disuplai manual via query param, filter ini bisa dilewati.

### 2.7 Keuangan & Tagihan (pembayaran.html)

| Endpoint / Fitur                              | Method   | Super Admin | Admin | Pengajar | Staf |
|-----------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/finance/bills`                      | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `GET /api/finance/bills/per-student`          | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/finance/bills/generate-spp`        | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `POST /api/finance/bills`                     | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `PUT /api/finance/bills/:id`                  | Admin+   | `[U]`       | `[U]` | `[-]`    | `[-]`|
| `DELETE /api/finance/bills/:id`               | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|
| `GET /api/finance/payments`                   | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `GET /api/finance/payments/receipt/:id`       | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/finance/payments`                  | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `PUT /api/finance/payments/:id`               | Admin+   | `[U]`       | `[U]` | `[-]`    | `[-]`|
| `DELETE /api/finance/payments/:id`            | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|
| `GET /api/finance/deposits`                   | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/finance/deposits`                  | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `PUT /api/finance/deposits/:id`               | Admin+   | `[U]`       | `[U]` | `[-]`    | `[-]`|
| `PUT /api/finance/deposits/:id/verify`        | SA Only  | `[U]`       | `[-]` | `[-]`    | `[-]`|
| `PUT /api/finance/deposits/:id/unverify`      | SA Only  | `[U]`       | `[-]` | `[-]`    | `[-]`|
| `DELETE /api/finance/deposits/:id`            | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|
| `GET /api/finance/petty-cash`                 | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/finance/petty-cash`                | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `DELETE /api/finance/petty-cash/:id`          | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|
| `GET /api/finance/summary`                    | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|

### 2.8 Program & Unit (program.html)

| Endpoint / Fitur                          | Method   | Super Admin | Admin | Pengajar | Staf |
|-------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/programs`                       | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/programs`                      | SA Only  | `[C]`       | `[-]` | `[-]`    | `[-]`|
| `PUT /api/programs/:id`                   | SA Only  | `[U]`       | `[-]` | `[-]`    | `[-]`|
| `DELETE /api/programs/:id`                | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|

### 2.9 Inventaris (inventaris.html)

| Endpoint / Fitur                          | Method   | Super Admin | Admin | Pengajar | Staf |
|-------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/inventory`                      | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/inventory`                     | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `PUT /api/inventory/:id`                  | Admin+   | `[U]`       | `[U]` | `[-]`    | `[-]`|
| `DELETE /api/inventory/:id`               | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|
| `POST /api/inventory/mutate`              | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `GET /api/inventory/mutations`            | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|

### 2.10 Dashboard & Analytics (dashboard.html)

| Endpoint / Fitur                          | Method   | Super Admin | Admin | Pengajar | Staf |
|-------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/dashboard/stats`                | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `GET /api/dashboard/activities`           | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `GET /api/logs/latest`                    | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `GET /api/logs/all`                       | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|

> **TEMUAN (SEV-005):** Activity logs mencatat transaksi keuangan dan persetujuan user — dapat diakses oleh Pengajar. Tidak ada pembatasan role pada endpoint log.

### 2.11 Reminder / Agenda (dashboard.html)

| Endpoint / Fitur                          | Method   | Super Admin | Admin | Pengajar | Staf |
|-------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/reminders`                      | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `POST /api/reminders`                     | Admin+   | `[C]`       | `[C]` | `[-]`    | `[-]`|
| `DELETE /api/reminders/:id`               | SA Only  | `[D]`       | `[-]` | `[-]`    | `[-]`|

### 2.12 Laporan Terpadu (laporan.html, rekap-kehadiran.html)

| Endpoint / Fitur                              | Method   | Super Admin | Admin | Pengajar | Staf |
|-----------------------------------------------|----------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/reports/attendance-recap`           | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| `GET /api/reports/student-performance`        | Auth     | `[R]`       | `[R]` | `[R]`    | `[-]`|
| Export Excel/PDF (frontend-only)              | Frontend | `[R]`       | `[R]` | `[-]*`   | `[-]`|

> `[-]*` — Export di UI disembunyikan untuk Pengajar tapi data tetap bisa diakses langsung via API (SEV-006).

### 2.13 Search Global

| Endpoint / Fitur              | Method | Super Admin | Admin | Pengajar | Staf |
|-------------------------------|--------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/search`             | Auth   | `[R]`       | `[R]` | `[R]`    | `[-]`|

### 2.14 Diagnostic / Sistem

| Endpoint / Fitur              | Method  | Super Admin | Admin | Pengajar | Staf |
|-------------------------------|---------|:-----------:|:-----:|:--------:|:----:|
| `GET /api/health`             | Public  | `[R]`       | `[R]` | `[R]`    | `[R]`|
| `GET /api/test-db`            | SA Only | `[R]`       | `[-]` | `[-]`    | `[-]`|

---

## 3. Perbandingan Frontend (UI Guard) vs Backend (API Guard)

### 3.1 Mekanisme Frontend Guard

File `public/global-user.js` mengimplementasi guard berbasis `localStorage`:
- **Autentikasi:** Cek `currentUser` di localStorage → jika tidak ada redirect ke `login.html`
- **Token Validation:** Verifikasi async ke `GET /api/auth/validate`
- **Sidebar Rendering:** Menu ditampilkan/disembunyikan berdasarkan `userRole` dari localStorage

```javascript
const userRole    = (user.role || 'Admin').toLowerCase();
const isSuperAdmin = userRole.includes('super');
const isTeacher   = userRole.includes('pengajar') || userRole.includes('teacher');
```

### 3.2 Tabel Mismatch Frontend vs Backend

| Fitur / Menu                         | Tersembunyi di UI (Pengajar) | Diblokir di API (Pengajar) | Status       |
|--------------------------------------|:----------------------------:|:--------------------------:|:------------:|
| Dashboard (stats/activities)         | ✅ Ya                         | ❌ Tidak                    | ⚠️ MISMATCH  |
| Data Siswa — GET                     | ✅ Ya                         | ❌ Tidak (semua auth)       | ⚠️ MISMATCH  |
| Data Siswa — CUD                     | ✅ Ya                         | ✅ Ya (Admin+)              | ✅ OK        |
| Guru / Pengajar — GET                | Sebagian (SA di sidebar)      | ❌ Tidak (semua auth)       | ⚠️ MISMATCH  |
| Kelas — GET                          | ✅ Ya                         | ❌ Tidak (semua auth)       | ⚠️ MISMATCH  |
| Kelas — CUD                          | ✅ Ya                         | ✅ Ya                       | ✅ OK        |
| Absensi — POST (simpan)              | ✅ Ditampilkan                | ✅ Dibuka (OK untuk guru)   | ✅ OK        |
| Absensi — lintas kelas               | ❌ Tidak dibatasi             | ❌ Tidak dibatasi           | ⚠️ CELAH     |
| Student Grades — POST                | ✅ Ditampilkan                | ✅ Dibuka (OK untuk guru)   | ⚠️ Scope gap |
| Keuangan — semua GET                 | ✅ Ya                         | ❌ Tidak (semua auth)       | ⚠️ MISMATCH  |
| Keuangan — CUD                       | ✅ Ya                         | ✅ Ya                       | ✅ OK        |
| Verifikasi Setoran                   | ✅ Ya                         | ✅ SA Only                  | ✅ OK        |
| Program/Unit — CUD                   | ✅ Ya                         | ✅ SA Only                  | ✅ OK        |
| Inventaris — GET                     | ✅ Ya                         | ❌ Tidak (semua auth)       | ⚠️ MISMATCH  |
| Inventaris — CUD                     | ✅ Ya                         | ✅ Ya                       | ✅ OK        |
| Laporan Keuangan                     | ✅ Ya                         | ❌ API terbuka              | ⚠️ MISMATCH  |
| Laporan Kinerja Siswa                | ✅ SA only di sidebar         | ❌ API terbuka semua auth   | ⚠️ MISMATCH  |
| Manajemen User                       | ✅ SA only                    | ✅ SA Only di API           | ✅ OK        |
| Approval User                        | ✅ Ya                         | ✅ SA Only                  | ✅ OK        |
| Activity Logs                        | ✅ Di dashboard               | ❌ Terbuka ke semua auth    | ⚠️ MISMATCH  |
| Ganti Password                       | ✅ Semua user                 | ✅ Semua auth user          | ✅ OK        |

---

## 4. Temuan Celah Otorisasi & Keamanan

### 🔴 CRITICAL — SEV-001: Hardcoded JWT Secret Fallback

**Lokasi:** `src/middlewares/auth.middleware.js:2`

```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'kbec_jwt_production_secret_2026_randomized_key';
```

**Risiko:** Penyerang yang mengetahui nilai ini dari repositori kode dapat membuat JWT palsu dengan role `Super Admin` dan mengakses seluruh sistem.

**Rekomendasi:**
```javascript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET tidak ditemukan!');
    process.exit(1);
}
```

---

### 🔴 CRITICAL — SEV-002: Presensi Lintas Kelas Dapat Ditulis Pengajar Mana Pun

**Lokasi:** `src/routes/attendance.routes.js:10-11`

```javascript
router.post('/', requireAuth, validate(attendanceSchema), attendanceController.saveAttendance);
router.post('/bulk', requireAuth, validate(attendanceSchema), attendanceController.saveAttendance);
```

**Deskripsi:** Tidak ada `requireRole` dan tidak ada validasi kepemilikan kelas di controller. Pengajar Kelas A dapat mengubah presensi siswa di Kelas B melalui API langsung.

**Skenario Eksploitasi:** `POST /api/attendance` dengan body `{ kelas: "Kelas B", student_id: "SIS-XXX", status: "Hadir" }` berhasil diterima oleh Pengajar Kelas A.

**Rekomendasi:** Tambahkan validasi scope di `saveAttendance` — verifikasi bahwa `class_id`/`kelas` yang dikirim adalah kelas yang dipegang oleh `req.user.teacher_id`.

---

### 🔴 CRITICAL — SEV-003: Student Grades Tanpa Scope Isolation

**Lokasi:** `src/routes/attendance.routes.js:13-14`

```javascript
router.get('/student-grades', requireAuth, attendanceController.getStudentGrades);
router.post('/student-grades', requireAuth, attendanceController.saveStudentGrade);
```

**Deskripsi:** Pengajar dapat membaca dan menulis evaluasi kinerja siswa di kelas manapun tanpa verifikasi kepemilikan.

**Rekomendasi:** Tambahkan pengecekan `req.user.teacher_id` terhadap `class_id` yang dikirim di dalam controller.

---

### 🟠 HIGH — SEV-004: Role 'Staf' Tidak Terdefinisi di ROLE_HIERARCHY

**Lokasi:** `src/middlewares/auth.middleware.js:49-54` & `src/middlewares/validate.middleware.js:39-42`

**Deskripsi:** `userSchema` mengizinkan role `Staf` tapi `ROLE_HIERARCHY` tidak mencakupnya. User `Staf` mendapat level `0` dan ditolak seluruh endpoint `requireRole()`.

**Rekomendasi:** Definisikan `'staf': 1` di `ROLE_HIERARCHY` dengan akses view-only yang sesuai, atau hapus `Staf` dari `userSchema` jika memang tidak direncanakan.

---

### 🟠 HIGH — SEV-005: Activity Logs Terbuka untuk Pengajar

**Lokasi:** `src/routes/log.routes.js`

```javascript
router.get('/latest', requireAuth, logController.getLatestLogs);
router.get('/all', requireAuth, logController.getAllLogs);
```

**Deskripsi:** Log berisi informasi transaksi keuangan, persetujuan user, dan aktivitas seluruh sistem. Pengajar dapat mengakses semua log ini.

**Rekomendasi:** Tambahkan `requireRole('Super Admin', 'Admin')` pada endpoint log, atau filter log berdasarkan role di controller.

---

### 🟠 HIGH — SEV-006: Laporan Kinerja Siswa — UI vs API Mismatch

**Lokasi:**
- UI: `public/global-user.js:331` — hanya tampil untuk `isSuperAdmin`
- API: `src/routes/report.routes.js:7` — hanya `requireAuth`

**Deskripsi:** Menu "Laporan Kinerja Siswa" hanya tampil untuk Super Admin di sidebar, namun `GET /api/reports/student-performance` tidak dibatasi. Admin dan Pengajar dapat mengakses data ini langsung via API.

**Rekomendasi:** Tambahkan `requireRole('Super Admin', 'Admin')` pada endpoint tersebut, atau buka juga menu di UI untuk Admin agar konsisten.

---

### 🟡 MEDIUM — SEV-007: Global Search Tanpa Scoping Per Role

**Lokasi:** `src/routes/search.routes.js`

```javascript
router.get('/', requireAuth, globalSearch);
```

**Deskripsi:** Search global mengembalikan hasil dari seluruh entitas tanpa filter berdasarkan role. Pengajar dapat mencari nama siswa di kelas lain, data pengajar lain, dll.

**Rekomendasi:** Terapkan scoping hasil pencarian berdasarkan role — Pengajar hanya menemukan data yang relevan dengan kelasnya.

---

### 🟡 MEDIUM — SEV-008: Rate Limiter Terlalu Longgar untuk Production

**Lokasi:** `src/middlewares/rateLimiter.middleware.js`

```javascript
max: 5000,  // Global: terlalu tinggi untuk production
max: 1000,  // Auth login: memungkinkan brute-force
```

**Rekomendasi:**
- Global: `max: 200` per 15 menit
- Auth/Login: `max: 15` per 15 menit

---

### 🟡 MEDIUM — SEV-009: Frontend Guard Berbasis localStorage (Bypassable)

**Lokasi:** `public/global-user.js:102-104`

**Deskripsi:** Role yang menentukan tampilan sidebar diambil dari `localStorage`. User dapat memanipulasi `localStorage.currentUser.role = "Super Admin"` di browser console untuk melihat semua menu.

**Mitigasi yang Ada:** Backend JWT tetap menjaga akses data sesungguhnya — bypass localStorage tidak memberikan akses ke data.

**Rekomendasi:** Ambil role dari hasil `GET /api/auth/validate` (server-side) untuk menentukan tampilan menu, bukan dari localStorage.

---

### 🟡 MEDIUM — SEV-010: Kuitansi Pembayaran Dapat Diakses Pengajar

**Lokasi:** `src/routes/finance.routes.js:15`

```javascript
router.get('/payments/receipt/:id', requireAuth, financeController.getReceipt);
```

**Deskripsi:** Detail kuitansi SPP siswa dapat diakses siapa saja yang sudah login, termasuk Pengajar, dengan mengetahui `payment_id`.

**Rekomendasi:** Tambahkan `requireRole('Super Admin', 'Admin')` jika kuitansi dianggap data keuangan sensitif.

---

### 🟢 LOW — SEV-011: changePassword Tidak Memvalidasi oldPassword Secara Ketat

**Lokasi:** `src/controllers/auth.controller.js:188`

```javascript
if (oldPassword) { // Jika tidak dikirim, langsung ganti password!
    const isMatch = await verifyPassword(oldPassword, user.password);
    ...
}
```

**Deskripsi:** Jika `oldPassword` tidak disertakan dalam request, password langsung diganti tanpa verifikasi. Ini berbahaya jika token dicuri.

**Rekomendasi:** Jadikan `oldPassword` wajib di endpoint change-password.

---

### 🟢 LOW — SEV-012: Pengajar Dapat Membaca Semua Data Keuangan via API

**Deskripsi:** Endpoint GET keuangan (tagihan, pembayaran, setoran, kas kecil, ringkasan) hanya memerlukan autentikasi. Pengajar dapat membaca seluruh data keuangan meski menu disembunyikan di UI.

**Rekomendasi:** Evaluasi bisnis — jika Pengajar tidak perlu melihat keuangan, tambahkan `requireRole('Super Admin', 'Admin')` pada endpoint GET keuangan.

---

### 🟢 LOW — SEV-013: Teacher Check-in Menerima teacher_id dari Body Request

**Lokasi:** `src/controllers/teacher.controller.js:104`

```javascript
const teacher_id = req.body.teacher_id || req.user.id || req.user.nis;
```

**Deskripsi:** Admin dapat check-in atas nama pengajar lain dengan mengirimkan `teacher_id` sembarang di body request.

**Rekomendasi:** Gunakan `req.user.teacher_id` langsung (abaikan body input), atau tambahkan `requireRole('Pengajar')` pada endpoint ini.

---

## 5. Ringkasan Temuan

| ID       | Severity    | Deskripsi Singkat                                                      | Prioritas |
|----------|-------------|------------------------------------------------------------------------|-----------|
| SEV-001  | 🔴 Critical | Hardcoded JWT Secret fallback di auth middleware                       | Segera    |
| SEV-002  | 🔴 Critical | Presensi lintas kelas bisa ditulis oleh semua Pengajar                 | Segera    |
| SEV-003  | 🔴 Critical | Student Grades tanpa scope isolation per pengajar                      | Segera    |
| SEV-004  | 🟠 High     | Role 'Staf' tidak terdefinisi di ROLE_HIERARCHY (level = 0)            | Tinggi    |
| SEV-005  | 🟠 High     | Activity Logs terbuka untuk Pengajar (data keuangan/approval visible)  | Tinggi    |
| SEV-006  | 🟠 High     | Laporan Kinerja: UI SA only, API terbuka ke semua auth user            | Tinggi    |
| SEV-007  | 🟡 Medium   | Global Search tanpa scoping berdasarkan role pengajar                  | Menengah  |
| SEV-008  | 🟡 Medium   | Rate limiter terlalu longgar (5000/15 mnt global, 1000 login)          | Menengah  |
| SEV-009  | 🟡 Medium   | Frontend guard berbasis localStorage yang bisa dimanipulasi            | Menengah  |
| SEV-010  | 🟡 Medium   | Kuitansi pembayaran dapat diakses Pengajar                             | Menengah  |
| SEV-011  | 🟢 Low      | changePassword tidak wajib verifikasi password lama                    | Rendah    |
| SEV-012  | 🟢 Low      | Pengajar bisa read semua data keuangan via API langsung                | Rendah    |
| SEV-013  | 🟢 Low      | Check-in pengajar menerima teacher_id dari body (identity spoofable)   | Rendah    |

**Total: 13 Temuan** — 3 Critical | 3 High | 4 Medium | 3 Low

---

## 6. Rekomendasi Pengetatan Akses

### 6.1 Prioritas Tinggi (Segera Diperbaiki)

**a. Proteksi Endpoint Presensi & Student Grades (SEV-002, SEV-003)**

Tambahkan validasi scope kepemilikan kelas di `saveAttendance` dan `saveStudentGrade`:
- Cek apakah `class_id` yang dikirim dalam request cocok dengan kelas yang dipegang `req.user.teacher_id`
- Gunakan query: `SELECT id FROM classes WHERE teacher_id = $req.user.teacher_id`
- Jika Pengajar mencoba simpan data kelas lain → 403 Forbidden

**b. Hapus Hardcoded JWT Secret Fallback (SEV-001)**

Ubah fallback dari nilai default menjadi `process.exit(1)` jika `JWT_SECRET` tidak ada di env.

**c. Definisikan Role 'Staf' atau Hapus (SEV-004)**

Tambahkan `'staf': 1` ke `ROLE_HIERARCHY` dengan level yang sesuai, atau hapus `Staf` dari `userSchema`.

### 6.2 Prioritas Menengah

**d. Batasi Activity Logs Per Role (SEV-005)**

```
GET /api/logs/latest  → requireRole('Super Admin', 'Admin')
GET /api/logs/all     → requireRole('Super Admin', 'Admin')
```

**e. Selaraskan Backend Laporan Kinerja dengan Frontend (SEV-006)**

```
GET /api/reports/student-performance → requireRole('Super Admin', 'Admin')
```

Atau jika Admin juga diizinkan, buka juga menu di sidebar untuk Admin.

**f. Kembalikan Rate Limiter ke Nilai Aman untuk Production (SEV-008)**

```
globalRateLimiter  → max: 200  (dari 5000)
authRateLimiter    → max: 15   (dari 1000)
```

### 6.3 Prioritas Rendah

**g. Wajibkan oldPassword di Change Password (SEV-011)**

Tambahkan validasi: jika `!oldPassword`, return 400 error.

**h. Evaluasi Akses Keuangan untuk Pengajar (SEV-012)**

Diskusi bisnis: apakah Pengajar perlu membaca data keuangan? Jika tidak, tambahkan `requireRole('Super Admin', 'Admin')` pada endpoint GET keuangan.

---

## 7. Aspek Keamanan yang Sudah Baik

| Aspek                               | Keterangan                                                            |
|-------------------------------------|-----------------------------------------------------------------------|
| JWT Authentication                  | Implementasi standar dengan waktu kadaluarsa 24 jam                  |
| Hierarki role berbasis level        | Scalable dan mudah diperluas untuk role baru                          |
| CSRF Header Validation              | `requireCsrf` diterapkan di semua endpoint `/api` (kecuali GET)      |
| Helmet.js untuk HTTP Security       | Diaktifkan di server.js, melindungi dari common web vulnerabilities   |
| Bcrypt untuk password hashing       | Salt rounds 10, mendukung migrasi dari HMAC legacy                   |
| Input validation dengan Zod         | Schema validasi tersedia untuk siswa, pengajar, kelas, payment, dll. |
| XSS Prevention via escapeHTML       | Diterapkan sebelum INSERT/UPDATE di sebagian besar controller         |
| Parameterized Queries (SQL Safety)  | Menggunakan `?` placeholder, mencegah SQL injection                   |
| Super Admin Approval Flow           | Registrasi baru berstatus Pending, tidak bisa login sebelum disetujui |
| Scope auto-filter untuk Pengajar    | `getAttendance` melakukan soft-filtering kelas untuk role pengajar    |
| GPS Verification untuk Check-in     | Haversine distance validation mencegah check-in palsu dari jarak jauh |

---

## 8. Metadata Audit

```
Tanggal       : 9 Agustus 2026
Waktu Lokal   : 13:43 WIB (UTC+7)
Metode        : Static code analysis — READ-ONLY, tanpa eksekusi kode
Perubahan Kode: TIDAK ADA (audit murni non-destruktif)

File yang Dianalisis:
  - server.js
  - src/routes/*.js (14 file)
  - src/controllers/*.js (14 file)
  - src/middlewares/*.js (4 file)
  - public/global-user.js (frontend guard)
  - public/schema.sql (database schema)
```
