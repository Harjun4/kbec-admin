# Implementation Plan: Pemisahan Role Akses KBEC Admin System
**Target Roles:** Super Admin, Admin, Staff, Pengajar  
**Tanggal:** 28 September 2026  
**Status:** Selesai Diimplementasikan (Implemented & Verified 100%)

---

## 1. Latar Belakang & Tujuan

Saat ini sistem otorisasi di KBEC Admin masih menggunakan model numerik linier (`ROLE_HIERARCHY`: Super Admin = 3, Admin = 2, Pengajar = 1), di mana hak akses Admin mengasumsikan mencakup seluruh fitur di bawah Super Admin (termasuk akademik dan inventaris). Selain itu, role `Staff` belum didefinisikan secara resmi di sistem backend sehingga belum memiliki batasan hak akses yang mandiri.

Tujuan implementasi ini adalah memisahkan tanggung jawab operasional menjadi **4 Role Terpisah** dengan prinsip pemisahan tugas (*separation of duties*):

1. **Super Admin**: **TETAP** (Akses penuh ke semua halaman, API, pengaturan sistem, manajemen user, program, dan persetujuan akun).
2. **Admin**: Fokus pada operasional siswa, keuangan, dan pelaporan:
   - ✅ Data Siswa
   - ✅ Keuangan (Tagihan SPP, Non-SPP, Pembayaran/Kuitansi, Setoran Kasir, Kas Kecil, Voucher)
   - ✅ Laporan (Laporan Pembayaran, Setoran, Kas Besar/Kecil, Rekap Kehadiran)
   - ✅ Profil Saya
   - ❌ *Dilarang/Disembunyikan:* Akademik (Kelola Guru, Kelas & Jadwal, Absensi/Nilai), Inventaris, Manajemen User.
3. **Staff**: Fokus pada operasional akademik dan sarana/inventaris:
   - ✅ Data Siswa
   - ✅ Akademik: Kelola Guru / Pengajar, Kelas dan Jadwal
   - ✅ Inventaris (Manajemen Barang, Stok, Mutasi)
   - ✅ Profil Saya
   - ❌ *Dilarang/Disembunyikan:* Keuangan, Laporan Keuangan/Manajerial, Manajemen User, Pengisian Absensi/Nilai kelas Pengajar.
4. **Pengajar**: Khusus instruktur/guru kursus:
   - ✅ Akademik terbatas:
     - Melihat jadwal mengajar kursus
     - Mengisi absensi & matrik kinerja siswa (**hanya sesuai kelas yang diajarnya**)
   - ✅ Profil Saya
   - ❌ *Dilarang/Disembunyikan:* Dashboard umum, Data Siswa global, Kelola Guru, Kelola Kelas/Jadwal master, Keuangan, Inventaris, Laporan, Manajemen User.

---

## 2. Matriks Hak Akses Lengkap (Role Permission Matrix)

| Modul / Fitur | Halaman Frontend | Super Admin | Admin | Staff | Pengajar | Catatan Otorisasi |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Dashboard** | `dashboard.html` | ✅ Penuh | ✅ Penuh | ❌ | ❌ | Hanya Super Admin & Admin. Pengajar diarahkan ke `jadwal.html`, Staff diarahkan ke `siswa.html` |
| **Data Siswa** | `siswa.html` | ✅ Penuh | ✅ Penuh | ✅ Penuh | ❌ | Admin & Staff dapat melihat & mengelola data siswa |
| **Akademik: Guru/Pengajar** | `pengajar.html` | ✅ Penuh | ❌ | ✅ Penuh | ❌ | Dikelola oleh Staff & Super Admin |
| **Akademik: Kelas & Jadwal** | `kelas.html` | ✅ Penuh | ❌ | ✅ Penuh | ❌ | Setup kelas, assign pengajar, plot siswa |
| **Akademik: Jadwal Kursus** | `jadwal.html` | ✅ Penuh | ❌ | ✅ Penuh | ✅ Baca | Pengajar hanya melihat jadwal mengajar |
| **Akademik: Presensi & Matrik** | `absensi.html` | ✅ Penuh | ❌ | ❌ | ✅ Terbatas | Pengajar hanya mengisi kelas ajarannya |
| **Keuangan: Tagihan & SPP** | `pembayaran.html#bills` | ✅ Penuh | ✅ Penuh | ❌ | ❌ | Khusus Admin Keuangan & Super Admin |
| **Keuangan: Non-SPP / Biaya Lain**| `biaya-lain.html` | ✅ Penuh | ✅ Penuh | ❌ | ❌ | Khusus Admin Keuangan & Super Admin |
| **Keuangan: Kasir & Pembayaran** | `pembayaran.html#payments` | ✅ Penuh | ✅ Penuh | ❌ | ❌ | Khusus Admin Keuangan & Super Admin |
| **Keuangan: Setoran & Kas Kecil** | `pembayaran.html#deposits` | ✅ Penuh | ✅ Input | ❌ | ❌ | Verifikasi setoran tetap SA Only |
| **Keuangan: Voucher** | `voucher.html` | ✅ Penuh | ✅ Penuh | ❌ | ❌ | Khusus Admin Keuangan & Super Admin |
| **Inventaris** | `inventaris.html` | ✅ Penuh | ❌ | ✅ Penuh | ❌ | Dikelola oleh Staff & Super Admin |
| **Laporan** | `laporan.html`, `rekap-kehadiran.html` | ✅ Penuh | ✅ Penuh | ❌ | ❌ | Laporan Keuangan, Kas, dan Rekap Presensi |
| **Unit & Program** | `program.html` | ✅ Penuh | ❌ | ❌ | ❌ | Master program hanya Super Admin |
| **Manajemen User** | `datauser.html` | ✅ Penuh | ❌ | ❌ | ❌ | Tambah, edit role, approval user baru |
| **Profil Saya** | `profile.html` | ✅ | ✅ | ✅ | ✅ | Semua akun dapat mengelola profil sendiri |

---

## 3. Desain Teknis & Arsitektur

### 3.1 Refactoring Backend Auth Middleware (`src/middlewares/auth.middleware.js`)
* **Masalah:** Model `ROLE_HIERARCHY = { 'super admin': 3, 'admin': 2, 'pengajar': 1 }` mengasumsikan hak akses bertingkat satu arah. Model ini tidak dapat membedakan domain orthogonal Admin vs Staff.
* **Solusi:**
  - Ganti perbandingan numerik `userLevel < minRequiredLevel` dengan **Set-based Role Matching**:
    ```javascript
    function requireRole(...allowedRoles) {
        return (req, res, next) => {
            if (!req.user || !req.user.role) {
                return res.status(401).json({ success: false, message: 'Akses ditolak. Pengguna belum terautentikasi.' });
            }
            const userRole = req.user.role.trim().toLowerCase();
            
            // Super Admin memiliki akses universal
            if (userRole === 'super admin') return next();

            const normalizedAllowed = allowedRoles.map(r => r.trim().toLowerCase());
            
            // Normalisasi alias: 'staf' / 'staff', 'teacher' / 'pengajar' / 'guru'
            const roleAliases = {
                'staff': ['staff', 'staf'],
                'staf': ['staff', 'staf'],
                'pengajar': ['pengajar', 'guru', 'teacher'],
                'guru': ['pengajar', 'guru', 'teacher'],
                'teacher': ['pengajar', 'guru', 'teacher'],
                'admin': ['admin'],
                'super admin': ['super admin']
            };

            const userRolesEquivalent = roleAliases[userRole] || [userRole];
            const hasAccess = userRolesEquivalent.some(r => normalizedAllowed.includes(r));

            if (!hasAccess) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Akses dilarang. Anda tidak memiliki hak akses untuk tindakan ini.' 
                });
            }
            next();
        };
    }
    ```

### 3.2 Pembaruan Validasi & Helper (`src/middlewares/validate.middleware.js` & `src/utils/helpers.js`)
* Perbarui Zod `userSchema` agar menerima `Staff` dan `Staf`:
  ```javascript
  role: z.enum(['Super Admin', 'Admin', 'Staff', 'Staf', 'Pengajar'])
  ```
* Tambahkan dukungan penomoran ID/NIS user di `generateUniqueUserId`:
  - Super Admin: `-SA`
  - Admin: `-ADM`
  - Staff: `-STF`
  - Pengajar: `-TCH`

### 3.3 Penyesuaian Endpoint API Backend
* **`src/routes/student.routes.js`**:
  - `POST /`, `PUT /:id`, `POST /bulk`: `requireRole('Super Admin', 'Admin', 'Staff')`
  - `DELETE /:id`: `requireRole('Super Admin')`
* **`src/routes/finance.routes.js` & `src/routes/voucher.routes.js`**:
  - Seluruh endpoint keuangan: `requireRole('Super Admin', 'Admin')` (Staff & Pengajar ditolak)
* **`src/routes/report.routes.js` & `src/routes/attendance.routes.js` (`/report`)**:
  - Endpoint laporan: `requireRole('Super Admin', 'Admin')` (Staff & Pengajar ditolak)
* **`src/routes/teacher.routes.js`**:
  - CRUD Pengajar (`POST`, `PUT`, `DELETE`): `requireRole('Super Admin', 'Staff')` (Admin ditolak)
  - `GET /` & check-in: terbuka bagi role terautentikasi
* **`src/routes/class.routes.js`**:
  - CRUD Kelas & Jadwal (`POST`, `PUT`, `DELETE`, `students` mapping): `requireRole('Super Admin', 'Staff')` (Admin ditolak)
  - `GET /`: dapat dibaca oleh Super Admin, Staff, Pengajar
* **`src/routes/inventory.routes.js`**:
  - CRUD Inventaris & Mutasi: `requireRole('Super Admin', 'Staff')` (Admin ditolak)
* **`src/routes/attendance.routes.js`**:
  - Simpan presensi & nilai siswa (`POST /`, `POST /student-grades`): Super Admin & Pengajar (dengan validasi bahwa pengajar hanya bisa menyimpan presensi & nilai kelas miliknya)
* **`src/controllers/auth.controller.js`**:
  - Perbaiki logika saat login agar `user.teacher_id` tidak menimpa role jika user adalah `Super Admin`, `Admin`, atau `Staff`.

### 3.4 Pembaruan Frontend Guard & Navigasi
1. **`public/js/route-guard.js`**:
   Perbarui pemetaan `rolePermissions`:
   ```javascript
   const rolePermissions = {
       'Super Admin': ['*'],
       'Admin': [
           'dashboard.html', 'siswa.html',
           'pembayaran.html', 'biaya-lain.html', 'voucher.html',
           'laporan.html', 'rekap-kehadiran.html',
           'profile.html'
       ],
       'Staff': [
           'siswa.html',
           'pengajar.html', 'kelas.html', 'jadwal.html',
           'inventaris.html',
           'profile.html'
       ],
       'Pengajar': [
           'jadwal.html', 'absensi.html', 'profile.html'
       ]
   };
   ```
   Redirect jika akses ditolak:
   - Pengajar: fallback ke `absensi.html`
   - Admin / Staff: fallback ke `dashboard.html`

2. **`public/global-user.js`**:
   - Hitung status role secara presisi:
     ```javascript
     const isSuperAdmin = userRole.includes('super');
     const isAdmin = userRole === 'admin';
     const isStaff = userRole === 'staff' || userRole === 'staf';
     const isTeacher = userRole.includes('pengajar') || userRole.includes('guru') || userRole.includes('teacher');
     ```
   - Render item sidebar dinamis:
     - **Dashboard**: Tampil untuk `Super Admin`, `Admin`. (Sembunyi untuk `Staff` dan `Pengajar`!).
     - **Data Siswa**: Tampil untuk `Super Admin`, `Admin`, `Staff`. (Sembunyi untuk `Pengajar`).
     - **Akademik**: Tampil untuk `Super Admin`, `Staff`, `Pengajar`. (Sembunyi untuk `Admin`!).
       - Sub-item Guru/Pengajar: `Super Admin`, `Staff`.
       - Sub-item Kelas & Jadwal: `Super Admin`, `Staff`.
       - Sub-item Jadwal Kursus: `Super Admin`, `Staff`, `Pengajar`.
       - Sub-item Absensi & Matrik Kinerja: `Super Admin`, `Pengajar`.
     - **Keuangan**: Tampil untuk `Super Admin`, `Admin`. (Sembunyi untuk `Staff` dan `Pengajar`!).
     - **Inventaris**: Tampil untuk `Super Admin`, `Staff`. (Sembunyi untuk `Admin` dan `Pengajar`!).
     - **Laporan**: Tampil untuk `Super Admin`, `Admin`. (Sembunyi untuk `Staff` dan `Pengajar`!).
     - **Pengelolaan Unit & Program**: Hanya `Super Admin`.
     - **Manajemen User**: Hanya `Super Admin`.
     - **Profil Saya**: Tampil untuk seluruh role.
   - Perbarui badge formatting role: `SUPER ADMINISTRATOR`, `ADMIN`, `STAFF`, `PENGAJAR`.

3. **`public/datauser.html`**:
   - Tambahkan opsi `<option value="Staff">Staff</option>` pada:
     - Dropdown role Tambah/Edit User (`user-modal-role`)
     - Dropdown role Approval User (`approval-role`)
   - Tambahkan format badge warna dan styling khusus role `Staff` (warna indigo / purple).

4. **`public/js/ui-guard.js`**:
   - Sesuaikan aturan penyembunyian tombol/tab aksi sensitif per role.

---

## 4. Rencana Tahapan Eksekusi (Step-by-Step)

### Tahap 1: Backend Auth Middleware & Helpers
- [x] Ubah `src/middlewares/auth.middleware.js`: implementasikan `requireRole` berbasis matriks/set matching dengan universal bypass untuk Super Admin dan pemetaan alias (`staff`/`staf`, `pengajar`/`guru`/`teacher`).
- [x] Perbarui `src/middlewares/validate.middleware.js`: daftarkan `Staff` dan `Staf` ke Zod enum `userSchema`.
- [x] Perbarui `src/utils/helpers.js`: tambahkan suffix `-STF` pada `generateUniqueUserId` saat role adalah `Staff`.
- [x] Perbarui `src/controllers/auth.controller.js`: cegah override otomatis ke `Pengajar` jika akun user memiliki role eksplisit `Staff` atau `Admin`.

### Tahap 2: Route Guard API Endpoints
- [x] Perbarui `src/routes/student.routes.js`: izinkan Super Admin, Admin, Staff.
- [x] Perbarui `src/routes/finance.routes.js` & `src/routes/voucher.routes.js`: batasi hanya Super Admin & Admin.
- [x] Perbarui `src/routes/report.routes.js`: batasi hanya Super Admin & Admin.
- [x] Perbarui `src/routes/teacher.routes.js`: batasi mutasi ke Super Admin & Staff.
- [x] Perbarui `src/routes/class.routes.js`: batasi mutasi kelas ke Super Admin & Staff.
- [x] Perbarui `src/routes/inventory.routes.js`: batasi mutasi ke Super Admin & Staff.
- [x] Perbarui `src/routes/attendance.routes.js`: pastikan simpan nilai/absensi hanya untuk Super Admin & Pengajar (dengan pemeriksaan kelasnya).
- [x] Perbarui `src/routes/dashboard.routes.js`: batasi endpoint dashboard `/stats` & `/activities` hanya untuk Super Admin & Admin.

### Tahap 3: Route Guard & Navigasi Frontend
- [x] Ubah `public/js/route-guard.js`: sesuaikan `rolePermissions` untuk 4 role dan redirect fallback (Pengajar -> `jadwal.html`, Staff -> `siswa.html`, Admin/SA -> `dashboard.html`).
- [x] Ubah `public/global-user.js`: sesuaikan percabangan menu sidebar, sembunyikan Dashboard & Keuangan & Laporan dari Staff, sembunyikan Dashboard dari Pengajar, sembunyikan Akademik & Inventaris dari Admin.
- [x] Perbarui `public/datauser.html`: tambahkan opsi `Staff` pada modal Tambah/Edit User dan Approval User, serta styling badge tabel dan suffix `-STF`.
- [x] Perbarui `public/login.html`: landing page redirect setelah login untuk Pengajar ke `jadwal.html` dan Staff ke `siswa.html`.
- [x] Perbarui `public/js/ui-guard.js`: pastikan kontrol tombol aksi di halaman sesuai peran masing-masing.

### Tahap 4: Pengujian & Validasi (Verification)
- [x] Jalankan dan perbarui unit test di `tests/route_guard.test.js` dan `tests/auth.test.js`.
- [x] Verifikasi 4 role RBAC permissions:
  - Super Admin: Akses ke seluruh domain (TETAP)
  - Admin: Akses Siswa, Keuangan, Laporan, Profil; ditolak di Akademik & Inventaris
  - Staff: Akses Siswa, Akademik, Inventaris, Profil; ditolak di Dashboard, Keuangan & Laporan
  - Pengajar: Akses Jadwal & Absensi kelas sendiri, Profil; ditolak di Dashboard, Siswa global, Keuangan, Inventaris, Laporan
- [x] Menjalankan test suite otomatis (`npm test`) -> 100% Lulus (Exit Code 0).

---

## 5. Pertanyaan & Konfirmasi Sebelum Eksekusi

Sebelum mengeksekusi penulisan kode, mohon konfirmasi:
1. **Dashboard untuk Pengajar**: Apakah Pengajar tidak perlu melihat `dashboard.html` sama sekali dan langsung diarahkan ke `absensi.html` (atau `jadwal.html`), ataukah Pengajar tetap boleh melihat ringkasan jadwal di dashboard? *(Sesuai rincian permintaan Anda: Pengajar hanya Akademik & Profil saya, sehingga dashboard disembunyikan)*. iya tidak perlu sam sekali langsung arahkan ke jadwal.html
2. **Akun Staff Eksisting**: Apakah saat ini sudah ada akun dengan role Staff di database yang perlu dimigrasikan statusnya, ataukah role Staff akan dibuat melalui halaman `datauser.html` setelah fitur ini siap? tidak perlu migrasi data karena role staff masih baru,staf pun juga tidak bisa liihat dashboard, yanv lihat dashboard hanya Admin dan super admin 

super admin berhak atas semuanya (tetap seperti seblumnya)

