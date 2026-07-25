# Business Rules & Authorization (Rules.md)
## Aturan Bisnis & Batasan Hak Akses Pengajar — KBEC

---

### 1. Aturan Hak Akses (RBAC Rules)

#### A. Batasan Data Pengajar (Data Scoping)
- **RBAC-01 (Strict Ownership)**: Pengajar **HANYA** dapat melihat kelas, siswa, dan jadwal yang nama pengajarnya tercantum pada kolom `classes.pengajar`.
- **RBAC-02 (Prohibition of Admin Features)**: Pengajar **DILARANG**:
  - Mengakses data keuangan / pembayaran (`payments`).
  - Menambah, mengubah, atau menghapus data pengajar lain.
  - Menghapus kelas atau program studi.
  - Menghapus data siswa dari database.
- **RBAC-03 (Session Guard)**: Tanpa token valid dengan `role: "teacher"`, sistem mengarahkan ke `teacher-login.html`.
- **RBAC-04 (Cross-Access View)**: Super Admin DAPAT melihat rekap check-in, absensi siswa, dan nilai yang diinput pengajar, namun pengajar **tidak bisa** melihat data pengajar lain.

---

### 2. Aturan Absensi Kehadiran Pengajar — GPS Check-in

- **CHK-01 (Geofencing Validation)**: Check-in kelas tatap muka **hanya diizinkan** jika jarak GPS pengajar ≤ **100 meter** dari koordinat resmi gedung KBEC. Jarak dihitung menggunakan formula Haversine di server-side untuk keamanan.
- **CHK-02 (Server Timestamp)**: Waktu check-in dan check-out **selalu menggunakan `NOW()` di sisi server TiDB Cloud** — bukan waktu dari perangkat pengajar. Hal ini mencegah manipulasi waktu.
- **CHK-03 (Single Check-in per Session)**: Pengajar tidak dapat melakukan check-in lebih dari satu kali pada kelas & tanggal yang sama. Sistem akan menampilkan status "Sudah Check-in" dan hanya memperbolehkan Check-out.
- **CHK-04 (Online Mode Bypass)**: Jika jadwal kelas ditandai bertipe `"online"`, validasi geofencing dilewati secara otomatis dan status lokasi dicatat sebagai `ONLINE_MODE`.
- **CHK-05 (Mandatory GPS Permission)**: Untuk kelas tatap muka, pengajar **wajib** mengizinkan akses GPS browser. Jika izin ditolak, tombol Check-in menjadi nonaktif disertai instruksi cara mengaktifkan GPS.
- **CHK-06 (Retroactive Prohibition)**: Pengajar **tidak dapat** melakukan check-in untuk tanggal atau waktu di masa lalu. Check-in hanya bisa dilakukan untuk hari ini (H+0).
- **CHK-07 (Coordinate Logging)**: Setiap check-in menyimpan: `latitude`, `longitude`, `accuracy` (akurasi GPS dalam meter), `jarak_dari_kbec` (dalam meter), dan `status_lokasi` ke tabel `teacher_checkins`.

---

### 3. Aturan Bisnis Presensi Siswa (Attendance Rules)

- **ATT-01 (Retroactive Limit)**: Presensi siswa hanya dapat diisi atau diperbarui untuk hari ini atau maksimal **7 hari ke belakang**.
- **ATT-02 (Overwrite Safety)**: Penginputan presensi pada tanggal & kelas yang sama akan melakukan UPDATE, bukan membuat entri duplikat (`ON DUPLICATE KEY UPDATE`).
- **ATT-03 (Activity Logging)**: Setiap pengisian presensi otomatis mencatat ke `activity_logs` dengan format: `"Pengajar [Nama] mengisi Presensi Kelas [Kelas] — [Tanggal]"`.
- **ATT-04 (Tied to Check-in)**: Pengajar direkomendasikan (tidak diwajibkan secara teknis) untuk melakukan check-in terlebih dahulu sebelum mengisi presensi siswa.

---

### 4. Aturan Bisnis Penilaian & Evaluasi (Grading Rules)

- **GRD-01 (Valid Score Range)**: Nilai tugas, UTS, dan UAS harus berupa angka bulat di rentang **0 hingga 100**.
- **GRD-02 (Auto Grade Letter)**: Nilai akhir otomatis dikonversi ke huruf: A (85-100), B (70-84), C (55-69), D (40-54), E (<40).
- **GRD-03 (Read-Only for Alumni)**: Siswa berstatus `Alumni` atau `Cuti` tidak dapat diubah nilainya kecuali dengan izin Super Admin.

---

### 5. Aturan Profil & Keamanan Akun (Security Rules)

- **SEC-01 (Password Complexity)**: Password baru minimal **6 karakter**.
- **SEC-02 (Unique Email)**: Email pengajar tidak boleh sama dengan pengguna lain yang terdaftar.
- **SEC-03 (Same Email Update)**: Memperbarui profil tanpa mengubah email tidak boleh memicu error UNIQUE KEY di TiDB Cloud.
- **SEC-04 (Coordinate Privacy)**: Data koordinat GPS pengajar hanya dapat dilihat oleh `role: "admin"` dan pengajar itu sendiri. Tidak dapat diakses oleh pengajar lain.
