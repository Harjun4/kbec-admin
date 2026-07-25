# Product Requirements Document (PRD)
## Dashboard Khusus Pengajar - KBEC (Kampung Bahasa English Course)

---

### 1. Ringkasan Eksekutif & Visi Produk
**Dashboard Khusus Pengajar KBEC** adalah portal terdedikasi yang dirancang khusus untuk para tenaga pengajar (instruktur/tentor) di Kampung Bahasa English Course. Portal ini memisahkan hak akses pengajar dari Super Admin, memberikan pengalaman pengguna yang cepat, intuitif, dan bebas gangguan untuk mengelola kelas mengajar, presensi harian siswa, penilaian progres belajar, serta jadwal mengajar harian.

Visi produk ini adalah meningkatkan efisiensi operasional pengajar hingga 80% dalam pencatatan kehadiran dan evaluasi belajar siswa, serta memberikan transparansi akademis secara real-time.

---

### 2. User Persona & Peran (Role)
- **Role**: `pengajar` (Teacher / Instruktur KBEC)
- **Target Pengguna**: Seluruh tentor/guru KBEC yang mengampu program kursus (Basic, Intermediate, Advanced, TOEFL Prep, dll).
- **Karakteristik & Kebutuhan**:
  - Membutuhkan akses cepat ke daftar siswa di kelas yang diajarnya saja.
  - Menginginkan tombol presensi cepat (Hadir/Izin/Sakit/Alpa) tanpa konfigurasi rumit.
  - Membutuhkan form pengisian nilai & catatan perkembangan (*progress notes*) siswa per pertemuan.
  - Memerlukan tampilan jadwal harian/mingguan yang jelas beserta lokasi ruang kelas.

---

### 3. Lingkup Fitur Utama (Core Features)

#### A. Autentikasi & Portal Masuk Pengajar (`teacher-login.html`)
- Login khusus pengajar menggunakan Email/Kontak & Password akun pengajar.
- Sesi terisolasi dengan penanda hak akses `role: "teacher"`.
- Proteksi navigasi otomatis: Pengajar tidak dapat mengakses fitur administratif Super Admin (seperti keuangan, hapus akun, atau ubah kurikulum).

#### B. Dashboard Ringkasan Pengajar (`teacher-dashboard.html`)
- **Statistik Ringkas Pengajar**:
  - Total Kelas yang Diampu
  - Total Siswa Aktif di Kelas Pengajar
  - Jam Mengajar Minggu Ini
  - Persentase Kehadiran Siswa di Kelas Pengajar
- **Widget Jadwal Mengajar Hari Ini**: Kartu interaktif berisi nama kelas, waktu mengajar (misal: 08:00 - 09:30), program, dan ruang kelas.
- **Log Aktivitas Pengajar**: Catatan riwayat presensi & penilaian yang baru saja diinput oleh pengajar tersebut.

#### C. Manajemen Kelas Saya (`teacher-classes.html`)
- Daftar kartu kelas yang secara khusus diampu oleh pengajar yang sedang login.
- Detail Siswa Per Kelas: Menampilkan daftar siswa terdaftar, status keaktifan, dan rekapitulasi kehadiran.

#### D. Presensi & Absensi Cepat (`teacher-attendance.html`)
- Pilihan tanggal & kelas mengajar.
- Fitur **One-Click Attendance**: Tombol Status Hadir (H), Sakit (S), Izin (I), Alpa (A) untuk setiap siswa.
- Tombol **"Tandai Semua Hadir"** untuk mempercepat proses absensi.
- Penyimpanan langsung ke database TiDB Cloud.

#### E. Penilaian & Catatan Perkembangan Siswa (`teacher-grades.html`)
- Input nilai evaluasi siswa:
  - Nilai Tugas / Daily Test (0-100)
  - Nilai UTS / Mid Test (0-100)
  - Nilai UAS / Final Test (0-100)
- Catatan Perkembangan (*Progress Notes*): Catatan kualitatif mengenai kelancaran berbicara (*speaking*), tata bahasa (*grammar*), dan keaktifan siswa di kelas.

#### F. Jadwal Mengajar Mingguan (`teacher-schedules.html`)
- Kalender/tabel interaktif jadwal mengajar dari Senin hingga Sabtu.
- Filter berdasarkan hari dan tipe kelas (Reguler / Private / Online).

#### G. Profil Pengajar (`teacher-profile.html`)
- Melihat & memperbarui data pribadi (Nama, Email, Kontak, Spesialisasi/Expertise, Foto Avatar).
- Perbarui Kata Sandi (Password) Keamanan dengan fitur ikon mata (*show/hide password*).

---

### 4. Non-Functional Requirements (NFR)
- **Performa**: Waktu muat halaman & respon API presensi < 1 detik.
- **Keamanan**: Autentikasi ketat berbasis hash SHA-256 + HMAC salt. Pengajar hanya bisa membaca & mengubah data kelas yang secara sah ditugaskan kepadanya.
- **Responsivitas**: Tampilan 100% responsif (Mobile-first ready), sehingga pengajar dapat mengabsen langsung melalui smartphone atau tablet saat mengajar di kelas.

---

### 5. Kriteria Keberhasilan (Success Metrics)
- 100% data absensi siswa terisi secara digital tanpa penggunaan kertas manual.
- Zero data breach / tidak ada kebocoran akses data keuangan kepada role pengajar.
- Kepuasan pengajar (CSAT) terhadap kecepatan penginputan nilai dan absensi harian > 90%.
