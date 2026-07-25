# Product Requirements Document (PRD)
## Dashboard Khusus Pengajar — KBEC (Kampung Bahasa English Course)

---

### 1. Ringkasan Eksekutif & Visi Produk
**Dashboard Khusus Pengajar KBEC** adalah portal terdedikasi yang dirancang khusus untuk para tenaga pengajar (instruktur/tentor) di Kampung Bahasa English Course. Portal ini memisahkan hak akses pengajar dari Super Admin, memberikan pengalaman pengguna yang cepat, intuitif, dan aman untuk mengelola presensi harian siswa, penilaian progres belajar, jadwal mengajar harian, serta absensi kehadiran pengajar itu sendiri dengan bukti waktu (timestamp) dan lokasi GPS terverifikasi.

> **Prinsip Integrasi**: Dashboard Pengajar BUKAN sistem terpisah. Seluruh data (presensi siswa, nilai, absensi pengajar, log aktivitas) secara real-time tersinkron ke Dashboard Super Admin yang sudah ada, sehingga Super Admin dapat memantau seluruh aktivitas pengajar dari satu titik kontrol terpusat.

---

### 2. User Persona & Peran (Role)
- **Role**: `pengajar` (Teacher / Instruktur KBEC)
- **Target Pengguna**: Seluruh tentor/guru KBEC yang mengampu program kursus (Basic, Intermediate, Advanced, TOEFL Prep, dll).
- **Karakteristik & Kebutuhan**:
  - Membutuhkan akses cepat ke daftar siswa di kelas yang diajarnya saja.
  - Menginginkan tombol presensi cepat (Hadir/Izin/Sakit/Alpa) tanpa konfigurasi rumit.
  - Membutuhkan form pengisian nilai & catatan perkembangan (*progress notes*) siswa per pertemuan.
  - Memerlukan tombol **Check-in** kehadiran diri sendiri dengan bukti GPS & waktu yang terverifikasi.

---

### 3. Lingkup Fitur Utama (Core Features)

#### A. Autentikasi & Portal Masuk Pengajar (`teacher-login.html`)
- Login khusus pengajar menggunakan Email & Password akun pengajar dari tabel `teachers`.
- Sesi terisolasi dengan penanda hak akses `role: "teacher"`.
- Proteksi navigasi otomatis: Pengajar tidak dapat mengakses fitur administratif Super Admin.

#### B. Dashboard Ringkasan Pengajar (`teacher-dashboard.html`)
- **Statistik Ringkas Pengajar**:
  - Total Kelas yang Diampu
  - Total Siswa Aktif di Kelas Pengajar
  - Jam Mengajar Minggu Ini
  - Persentase Kehadiran Siswa di Kelas Pengajar
- **Widget Jadwal Mengajar Hari Ini**: Kartu berisi nama kelas, waktu, program, dan ruang kelas.
- **Log Aktivitas Pengajar**: Riwayat presensi & check-in yang baru saja dilakukan.

#### C. Absensi Kehadiran Pengajar dengan GPS Check-in (`teacher-checkin.html`)
Fitur utama baru: Sistem absensi kehadiran pengajar itu sendiri (bukan siswa) dengan validasi waktu & lokasi nyata.

**Sub-fitur Mekanisme Check-in / Check-out**:

1. **Check-in Kelas Tatap Muka (Geofencing)**:
   - Pengajar menekan tombol **"Check-in Kelas"**.
   - Browser meminta izin akses GPS (`navigator.geolocation`).
   - Sistem menghitung jarak antara koordinat GPS pengajar dengan titik koordinat resmi gedung KBEC.
   - Jika pengajar berada dalam radius ≤ 100 meter dari gedung KBEC → **Check-in diizinkan & timestamp + koordinat disimpan**.
   - Jika pengajar berada di luar radius → **Check-in DITOLAK** dengan pesan error informatif.
   - Setelah selesai mengajar, pengajar menekan tombol **"Check-out"** yang juga menyimpan timestamp akhir.

2. **Check-in Kelas Online (Fleksibel)**:
   - Untuk kelas online/remote, geofencing dinonaktifkan secara otomatis.
   - Pengajar cukup menekan tombol Check-in yang langsung menyimpan timestamp server (bukan timestamp klien) untuk mencegah manipulasi waktu.

3. **Bukti Rekam Kehadiran**:
   - Setiap Check-in menyimpan: `waktu_checkin` (ISO timestamp), `latitude`, `longitude`, `alamat_otomatis` (reverse geocoding), `status_lokasi` (`"VALID_IN_RANGE"` / `"OUT_OF_RANGE_BYPASS"` / `"ONLINE_MODE"`), dan `foto_selfie` (opsional, Base64 thumbnail).

#### D. Manajemen Kelas Saya (`teacher-classes.html`)
- Daftar kelas yang secara khusus diampu oleh pengajar yang sedang login.
- Detail Siswa Per Kelas: Daftar siswa terdaftar, status keaktifan, dan rekapitulasi kehadiran.

#### E. Presensi Siswa Harian (`teacher-attendance.html`)
- Pilihan tanggal & kelas mengajar.
- Fitur **One-Click Attendance**: Tombol status Hadir (H), Sakit (S), Izin (I), Alpa (A) untuk setiap siswa.
- Tombol **"Tandai Semua Hadir"** untuk mempercepat proses absensi.
- Penyimpanan langsung ke TiDB Cloud dan otomatis muncul di log aktivitas Super Admin.

#### F. Penilaian & Catatan Perkembangan Siswa (`teacher-grades.html`)
- Input nilai evaluasi siswa: Nilai Tugas (0-100), UTS (0-100), UAS (0-100).
- Catatan *Progress Notes*: Catatan kualitatif kelancaran speaking, grammar, dan keaktifan.
- Data langsung tersinkron ke tabel `student_grades` dan dapat dilihat oleh Super Admin.

#### G. Jadwal Mengajar Mingguan (`teacher-schedules.html`)
- Kalender/tabel jadwal mengajar Senin-Sabtu.
- Filter berdasarkan hari dan tipe kelas (Reguler / Private / Online).

#### H. Profil Pengajar (`teacher-profile.html`)
- Update data pribadi (Nama, Email, Kontak, Spesialisasi, Foto Avatar).
- Perbarui Password dengan fitur ikon mata show/hide.

---

### 4. Integrasi dengan Dashboard Super Admin

| Fitur Pengajar | Terlihat oleh Super Admin | Lokasi di Super Admin |
|---|---|---|
| Check-in / Check-out Pengajar | ✅ Ya | Halaman Pengajar → Tab Rekam Kehadiran |
| Presensi Siswa yang Diisi Pengajar | ✅ Ya | Halaman Absensi (data gabungan) |
| Nilai & Progress Note Siswa | ✅ Ya | Detail Profil Siswa → Tab Nilai |
| Log Aktivitas Pengajar | ✅ Ya | Dashboard → Widget Log Aktivitas Terbaru |
| Penambahan Pengajar Baru | ❌ Hanya Super Admin | Manajemen Pengajar → Tambah Pengajar |

---

### 5. Non-Functional Requirements (NFR)
- **Performa**: Waktu muat halaman & respon API presensi < 1 detik. Respon validasi GPS < 3 detik.
- **Keamanan**: Timestamp check-in menggunakan waktu server (`NOW()` di TiDB Cloud) bukan waktu klien, sehingga tidak bisa dimanipulasi.
- **Responsivitas**: Tampilan 100% responsif (Mobile-first ready), sehingga pengajar dapat mengabsen menggunakan smartphone di lokasi kelas.
- **Privasi Lokasi**: Koordinat GPS pengajar disimpan dengan enkripsi dan hanya dapat dilihat oleh Super Admin.

---

### 6. Kriteria Keberhasilan (Success Metrics)
- 100% data absensi siswa terisi secara digital tanpa penggunaan kertas manual.
- 100% kehadiran pengajar tercatat dengan timestamp + koordinat GPS yang terverifikasi.
- Zero manipulasi waktu kehadiran (server-side timestamp enforcement).
- Zero data breach / tidak ada kebocoran akses data keuangan kepada role pengajar.
- Kepuasan pengajar (CSAT) terhadap kecepatan penginputan nilai dan absensi harian > 90%.
