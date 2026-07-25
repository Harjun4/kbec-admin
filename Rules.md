# Business Rules & Authorization (Rules.md)
## Aturan Bisnis & Batasan Hak Akses Pengajar - KBEC

---

### 1. Aturan Hak Akses (Access Control Rules)

#### A. Batasan Data Pengajar (Data Scoping)
1. **Rule RBAC-01 (Strict Ownership)**: Pengajar **HANYA** dapat melihat daftar kelas, daftar siswa, dan jadwal mengajar yang mana nama pengajar tersebut tercantum pada kolom `classes.pengajar` di database.
2. **Rule RBAC-02 (Prohibition of Admin Features)**: Pengajar **TIDAK BISA** dan **DILARANG**:
   - Mengakses data keuangan / pembayaran (`payments`).
   - Menambah, mengubah, atau menghapus data pengajar lain (`teachers`).
   - Menghapus kelas atau program studi (`classes`, `programs`).
   - Menghapus data siswa dari database (`students`).
3. **Rule RBAC-03 (Session Guard)**: Jika sesi login pengajar tidak memiliki token valid atau memiliki `role: 'guest'`, sistem wajib mengarahkan pengajar kembali ke `teacher-login.html`.

---

### 2. Aturan Bisnis Presensi & Absensi (Attendance Business Rules)

1. **Rule ATT-01 (Retroactive Limit)**: Presensi harian siswa hanya dapat diisi atau diperbarui untuk **hari ini** atau maksimal **7 hari ke belakang**. Pengajar tidak dapat mengabsen untuk tanggal di masa depan (*future date*).
2. **Rule ATT-02 (Overwrite Safety)**: Penginputan presensi pada tanggal & kelas yang sama akan memperbarui (*overwrite/update*) data presensi sebelumnya, bukan membuat entri duplikat.
3. **Rule ATT-03 (Activity Logging)**: Setiap pengisian presensi oleh pengajar wajib otomatis mencatat log ke tabel `activity_logs` dengan format:
   `Pengajar [Nama] melakukan Presensi Harian Kelas [Nama Kelas] ([Tanggal])`.

---

### 3. Aturan Bisnis Penilaian & Evaluasi Siswa (Grading Rules)

1. **Rule GRD-01 (Valid Score Range)**: Nilai tugas, UTS, dan UAS wajib berupa angka bulat positif di rentang **0 hingga 100**.
2. **Rule GRD-02 (Progress Note Required)**: Catatan perkembangan (*progress note*) bersifat opsional untuk harian, namun **wajib diisi** saat evaluasi akhir bulan/semester.
3. **Rule GRD-03 (Read-Only for Alumni)**: Siswa yang berstatus `Alumni` atau `Cuti` tidak dapat diubah nilainya oleh pengajar kecuali dengan izin Super Admin.

---

### 4. Aturan Bisnis Profil & Keamanan Akun (Profile & Security Rules)

1. **Rule SEC-01 (Password Complexity)**: Password baru pengajar minimal terdiri dari **6 karakter**.
2. **Rule SEC-02 (Unique Email)**: Email pengajar tidak boleh sama dengan email pengguna/admin lain yang sudah terdaftar di database.
3. **Rule SEC-03 (Same Email Update)**: Memperbarui nama atau profil tanpa mengubah email tidak boleh memicu error keunikan di TiDB Cloud.
