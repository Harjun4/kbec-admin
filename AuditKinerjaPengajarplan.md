# Implementation Plan: Pemantauan & Audit Kinerja Pengajar Terpadu (Super Admin)
**Target Pengguna:** Khusus Super Admin (Universal Access)  
**Dokumen:** `AuditKinerjaPengajarplan.md`  
**Tanggal:** 16 Oktober 2026  
**Status:** Selesai Diimplementasikan (100% Lolos Verifikasi & Seluruh Komentar Pengguna Dipenuhi)

---

## 1. Latar Belakang & Tujuan Bisnis

Saat ini, data aktivitas pengajar di sistem KBEC tersebar di beberapa tempat terpisah:
- Presensi datang/pulang pengajar berada di modul **Absensi Pengajar** (`absensi-pengajar.html`).
- Daftar jadwal dan kelas mengajar berada di modul **Kelas & Jadwal** (`kelas.html` & `jadwal.html`).
- Absensi kehadiran siswa berada di modul **Absensi Siswa** (`absensi.html`).
- Input evaluasi kerja/nilai siswa (lembar kerja SB/WB, materi, catatan) berada di modul **Laporan Kinerja Siswa** (`absensi.html?mode=excel`).

Kondisi ini menyebabkan **Super Admin harus membuka banyak tab dan mencocokkan data secara manual** untuk mengetahui:
1. Apakah guru tersebut hadir tepat waktu hari ini?
2. Apakah kelas yang seharusnya diajar sudah benar-benar dilaksanakan?
3. Apakah guru masuk kelas terlambat dibandingkan jadwal resminya?
4. Apakah guru disiplin menginput evaluasi nilai/kinerja siswa setelah mengajar, atau menunggak?
5. Bagaimana keadaan kelasnya: apakah siswanya rajin masuk atau banyak yang membolos?

**Tujuan Implementasi:**  
Membangun satu fitur terpadu berbentuk **"Single-Tab Executive Command Center"** khusus Super Admin, di mana seluruh indikator di atas dirangkum secara otomatis, ringkas, real-time, dan dilengkapi drill-down detail per guru.

---

## 2. 5 Dimensi Utama Pemantauan Kinerja Pengajar

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PUSAT MONITORING KINERJA PENGAJAR (SUPER ADMIN)                 │
├───────────────────┬───────────────────┬──────────────────┬─────────────────┬───────────┤
│ 1. Absensi Guru   │ 2. Realisasi Kelas│ 3. Input Kinerja │ 4. Kesehatan    │ 5. Disiplin│
│    (Datang/Pulang)│    (Diajar/Belum) │    Siswa (SB/WB) │    Kelas Siswa  │    Jadwal &│
│    & Total Durasi │    & Topik Materi │    (Lengkap/Blm) │    (% Bolos/In) │    Keterlam-│
│    Jam Kerja      │    Hari Ini       │    per Sesi      │    per Guru     │    batan   │
└───────────────────┴───────────────────┴──────────────────┴─────────────────┴───────────┘
```

### 2.1. Dimensi 1: Absensi Kehadiran & Jam Kerja Guru
* **Status Presensi Harian:** 
  * `Hadir (Selesai)`: Sudah Check-in dan Check-out.
  * `Aktif Mengajar`: Sedang Check-in di lokasi/kelas, belum Check-out.
  * `Izin / Sakit`: Tercatat izin/sakit dengan lampiran keterangan.
  * `Belum Hadir / Alpha`: Tidak ada presensi hingga jam operasional lewat.
* **Waktu Kedatangan & Kepulangan:** Jam Check-in Datang vs Jam Check-out Pulang (WIB).
* **Akumulasi Jam Kerja:** Total menit/jam kerja hari ini dan total akumulasi kerja dalam bulan berjalan.
* **Integritas Kehadiran:** Validasi selfie kamera langsung dan radius lokasi GPS (apakah berada di area fisik KBEC atau luar radius).

### 2.2. Dimensi 2: Status Pelaksanaan Kelas Mengajar (Teaching Execution)
* **Pencocokan Jadwal Hari Ini:** Sistem otomatis mengambil seluruh kelas yang dijadwalkan pada hari tersebut untuk pengajar terkait.
* **Status Realisasi per Kelas:**
  * 🟢 **Sudah Diajar:** Pengajar telah melakukan presensi `sesi_mengajar` untuk kelas tersebut pada tanggal terkait.
  * 🟡 **Menunggu Jadwal / Sedang Berlangsung:** Jadwal kelas belum mulai atau baru saja dimulai.
  * 🔴 **Belum Diajar / Terlewat:** Jam selesai kelas sudah lewat, tetapi tidak ditemukan rekaman sesi mengajar dari pengajar tersebut.
* **Log Pengajaran:** Super Admin dapat membaca topik materi (`topic_material`), metode belajar (Tatap Muka / Online), dan bukti foto aktivitas mengajar.

### 2.3. Dimensi 3: Kepatuhan Input Kinerja Siswa (Student Grading Compliance)
* **Kewajiban Pengajar:** Setiap sesi kelas yang diajar, guru wajib menginput evaluasi lembar kerja siswa (`student_grades`: halaman SB, halaman WB, dan nilai/catatan kemampuan siswa).
* **Status Kepatuhan per Kelas:**
  * 🟢 **Lengkap (100%):** Semua siswa terdaftar di kelas tersebut sudah memiliki data evaluasi pada sesi tanggal tersebut.
  * 🟡 **Parsial / Sebagian (X%):** Baru sebagian siswa yang diinput nilainya oleh guru.
  * 🔴 **Belum Diinput (0% - Menunggak):** Kelas sudah diajar, namun guru belum menginput evaluasi siswa sama sekali.
* **Penghitung Tunggakan:** Menghitung berapa sesi kelas yang evaluasi nilainya masih menunggak.

### 2.4. Dimensi 4: Kesehatan & Kehadiran Kelas Siswa (Student Engagement Health)
* **Tingkat Kehadiran Siswa di Bawah Guru Tersebut:**
  * Persentase Siswa Hadir ($\% \text{Hadir}$).
  * Persentase Izin / Sakit ($\% \text{Izin/Sakit}$).
  * Persentase Alpha / Tanpa Keterangan ($\% \text{Alpha}$).
* **Deteksi Anomali Kelas:**
  * Badge Peringatan Otomatis: `⚠️ Kehadiran Siswa Rendah (< 70%)` jika banyak siswa di kelas guru tersebut yang jarang masuk.
  * Indikator siswa rawan bolos (siswa yang alpha $\ge 3$ kali) di kelas yang diampu oleh pengajar terkait.

### 2.5. Dimensi 5: Ketepatan Waktu Sesi & Kesesuaian Jadwal (Punctuality & Schedule Integrity)
* **Audit Ketepatan Waktu (Punctuality):**
  * Selisih waktu antara **Jam Mulai Resmi Kelas** (dari tabel `classes.mulai`, misal `08:00`) dengan **Jam Pengajar Check-in Sesi** (dari `teacher_checkins.check_time`, misal `08:18`).
  * Kategori Keterlambatan:
    * **Tepat Waktu / Awal:** Hadir $\le$ toleransi 5 menit.
    * **Terlambat Ringan (Kuning):** Masuk 6 – 15 menit setelah jadwal.
    * **Terlambat Berat (Merah):** Masuk $> 15$ menit setelah jadwal (menampilkan label: `Telat 18 Menit`).
* **Audit Kesesuaian Kelas (Schedule Integrity):**
  * Memverifikasi apakah guru mengajar di kelas yang resmi dialokasikan untuknya.
  * Deteksi anomali jika guru mengajar di luar jadwal hari resmi (indikasi tukar jadwal mandiri / guru pengganti).

---

## 3. Formula Skor Kinerja / KPI Pengajar (Objective Rating)

Untuk memberikan rangkuman instan bagi Super Admin, sistem dapat menghitung **Skor Disiplin & Kinerja Pengajar (0 - 100)** dengan bobot transparan:

$$\text{Total Skor} = (S_{\text{kehadiran}} \times 30\%) + (S_{\text{ketepatan}} \times 25\%) + (S_{\text{realisasi}} \times 25\%) + (S_{\text{input\_nilai}} \times 20\%)$$

| Komponen | Bobot | Cara Hitung |
| :--- | :---: | :--- |
| **Kehadiran Guru ($S_{\text{kehadiran}}$)** | 30% | Hadir tepat hari kerja = 100 poin, Izin/Sakit resmi = 80 poin, Alpha/Mangkir = 0 poin. |
| **Ketepatan Waktu Sesi ($S_{\text{ketepatan}}$)** | 25% | Tepat waktu = 100 poin, Telat $\le 10$ mnt = 80 poin, Telat $11-20$ mnt = 60 poin, Telat $> 20$ mnt = 30 poin. |
| **Realisasi Kelas Mengajar ($S_{\text{realisasi}}$)** | 25% | $\frac{\text{Jumlah Kelas Selesai Diajar}}{\text{Jumlah Kelas Sesuai Jadwal}} \times 100$ |
| **Kepatuhan Input Nilai Siswa ($S_{\text{input\_nilai}}$)** | 20% | $\frac{\text{Jumlah Siswa Dinilai}}{\text{Total Siswa Terdaftar di Kelas}} \times 100$ |

**Kategori Indeks Nilai (KPI Grade):**
* **Grade A (90 - 100):** Sangat Disiplin & Prima (Hijau)
* **Grade B (75 - 89):** Baik & Memenuhi Standar (Biru)
* **Grade C (60 - 74):** Cukup / Perlu Peringatan Keterlambatan/Input Nilai (Kuning)
* **Grade D (< 60):** Kurang / Evaluasi Khusus Super Admin (Merah)

---

## 4. Desain Tampilan Antarmuka (UI/UX) — Single Tab Terpadu

### 4.1. Opsi Penempatan Fitur di Aplikasi
1. **Opsi A (Rekomendasi Utama):**
   * Ditambahkan sebagai **Tab Submenu Baru di `absensi-pengajar.html`**:
     `[ Presensi Mandiri ]` `[ Log & Riwayat Presensi ]` `[ 📊 Audit & Monitoring Kinerja Guru (Super Admin Only) ]`
   * Tab ini **hanya muncul jika role login adalah Super Admin**. Role Pengajar atau Staff tidak dapat melihat tab ini.
2. **Opsi B (Halaman Terpisah):**
   * Dibuat file halaman baru `public/monitoring-pengajar.html` yang terdaftar di sidebar menu `Akademik` khusus Super Admin.

> *Pertanyaan untuk Anda:* Manakah penempatan yang lebih nyaman untuk Anda (Opsi A atau Opsi B)?

---

### 4.2. Wireframe Tampilan Tab Monitoring

```
+---------------------------------------------------------------------------------------------------------+
| [Header] MONITORING KINERJA & AUDIT PENGAJAR (SUPER ADMIN)                                             |
| Ringkasan terpadu kehadiran, ketepatan waktu, kelas mengajar, dan kepatuhan input nilai siswa.          |
+---------------------------------------------------------------------------------------------------------+
| FILTER CERDAS:                                                                                          |
| [Pilih Tanggal: 16/10/2026] [Pilih Unit: Semua Unit ▼] [Filter Status Guru: Semua ▼] [Cari Guru: ...]    |
+---------------------------------------------------------------------------------------------------------+
| KARTU KPI RINGKASAN HARI INI:                                                                          |
| ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐            |
| │ Guru Hadir         │ │ Kelas Mengajar     │ │ Ketepatan Waktu    │ │ Input Nilai Siswa  │            |
| │ 8 / 10 Guru (80%)  │ │ 14 / 16 Selesai    │ │ 87.5% On-Time      │ │ 82.0% Lengkap      │            |
| └────────────────────┘ └────────────────────┘ └────────────────────┘ └────────────────────┘            |
+---------------------------------------------------------------------------------------------------------+
| TABEL AUDIT KINERJA PER PENGAJAR:                                                                       |
| ------------------------------------------------------------------------------------------------------- |
| Pengajar     | Absensi Datang/Pulang | Kelas Hari Ini    | Ketepatan Sesi | Input Nilai | Kelas Siswa | Skor | Aksi   |
| -------------+-----------------------+-------------------+----------------+-------------+-------------+------+------- |
| [Foto]       | Hadir                 | 2/2 Selesai       | Tepat Waktu    | Lengkap     | 95% Hadir   | 96   | [Buka  |
| Ms. Sarah J. | 07:55 - 16:10 (8j 15m)| (Beginner 1A & 2B)| (Awal 5 mnt)   | (100%)      | (Sehat)     | (A)  | Audit] |
| -------------+-----------------------+-------------------+----------------+-------------+-------------+------+------- |
| [Foto]       | Hadir (Aktif)         | 1/2 Selesai       | Telat 18 Mnt ⚠️| Belum ⚠️    | 60% Hadir ⚠️| 68   | [Buka  |
| Mr. David K. | 09:18 - Masih Aktif   | (1 Menunggu Sore) | Sesi 1 Masuk   | Diisi (0%)  | (Banyak     | (C)  | Audit] |
|              |                       |                   | jam 09:18      |             | Bolos)      |      |        |
| -------------+-----------------------+-------------------+----------------+-------------+-------------+------+------- |
| [Foto]       | Izin (Sakit)          | 0/1 (Dibatalkan)  | -              | -           | -           | -    | [Buka  |
| Ms. Amanda   | Surat Terlampir       | Jadwal Dialihkan  |                |             |             |      | Audit] |
+---------------------------------------------------------------------------------------------------------+
```

### 4.3. Fitur Modal Drilldown "Detail Audit Pengajar"
Ketika Super Admin menekan tombol **`[Buka Audit]`** pada salah satu baris pengajar, akan muncul modal pop-up interaktif:
1. **Header Profil Pengajar:** Nama lengkap, ID/NIS, kontak, status kontrak, dan rata-rata skor bulanan.
2. **Blok 1 — Audit Presensi Datang & Pulang:**
   * Jam check-in & check-out.
   * Pratinjau foto selfie kamera langsung saat datang dan pulang.
   * Koordinat GPS dan jarak radius dari kantor KBEC.
3. **Blok 2 — Audit Setiap Sesi Kelas Hari Ini:**
   * Nama kelas & ruangan.
   * Jam jadwal resmi vs jam aktual guru melakukan check-in sesi.
   * Selisih keterlambatan dalam menit (dilengkapi badge peringatan jika telat).
   * Topik materi yang diinput guru (`topic_material`).
   * Foto bukti aktivitas belajar di kelas.
4. **Blok 3 — Audit Siswa & Evaluasi Kinerja (SB/WB):**
   * Daftar siswa di kelas tersebut.
   * Status presensi masing-masing siswa (Hadir / Izin / Sakit / Alpha).
   * Halaman SB / WB yang dicatat oleh guru untuk masing-masing siswa.
   * Jika masih kosong, muncul tombol pintasan: `[Kirim Notifikasi/Teguran ke Guru]`.

---

## 5. Desain Arsitektur Backend & Database

### 5.1. Hubungan Data (Data Relationships)
Sistem ini memanfaatkan tabel-tabel database yang sudah ada tanpa memerlukan perombakan skema tabel yang berisiko:
* `teachers`: Data master pengajar (ID, nama, status).
* `classes`: Data kelas, jadwal hari (`hari`), jam mulai (`mulai`), jam selesai (`selesai`), dan guru pengampu (`teacher_id`, `pengajar`).
* `class_students` & `students`: Siswa yang terdaftar di masing-masing kelas.
* `teacher_checkins`: Presensi harian (`checkin_harian`, `checkout_harian`), presensi sesi (`sesi_mengajar`), jam (`check_time`), foto bukti (`proof_image`), materi (`topic_material`), GPS (`lat`, `lng`, `distance_meters`).
* `attendance`: Rekap kehadiran siswa (Hadir, Izin, Sakit, Alpha).
* `student_grades`: Lembar nilai & evaluasi lembar kerja siswa (`sb_page`, `wb_page`, `presensi`, `notes`).

### 5.2. Endpoint API Baru
* **Metode & Path:** `GET /api/teachers/performance-monitoring`
* **Middleware Keamanan:**
  * `requireAuth` (Wajib token JWT valid).
  * `requireRole('Super Admin')` (Ditolak dengan status 403 jika diakses oleh Pengajar, Admin biasa, atau Staff).
* **Controller:** `src/controllers/teacher.controller.js` -> fungsi `getTeacherPerformanceMonitoring`.

---

## 6. Rencana Kerja Bertahap (Action Plan & Phased Implementation)

```
[Tahap 1: Backend Controller & Algoritma Agregasi]
  ├── Tambah fungsi `getTeacherPerformanceMonitoring` di `teacher.controller.js`
  ├── Integrasikan perhitungan keterlambatan jam mengajar (mulai vs check_time)
  ├── Integrasikan pengecekan kelengkapan data di `student_grades`
  ├── Integrasikan persentase kehadiran siswa kelas di `attendance`
  └── Daftarkan rute GET `/performance-monitoring` di `src/routes/teacher.routes.js`

[Tahap 2: Pengujian Otomatis (TDD & Security Tests)]
  ├── Buat file uji `tests/teacher_performance_monitoring.test.js`
  ├── Uji pembatasan hak akses (Super Admin = 200 OK, Pengajar/Staff = 403 Forbidden)
  ├── Uji keakuratan deteksi telat (jam mulai vs waktu check-in)
  ├── Uji akurasi status kelengkapan nilai siswa (Lengkap vs Belum Diisi)
  └── Jalankan seluruh rangkaian test suite KBEC agar tetap 100% lulus

[Tahap 3: Implementasi Frontend Antarmuka Super Admin]
  ├── Rancang komponen visual Tab "Monitoring & Audit Kinerja" di antarmuka web
  ├── Hubungkan API endpoint dengan dynamic rendering Vanilla JS & TailwindCSS
  ├── Tambahkan fitur Filter Tanggal, Filter Unit, dan Pencarian Pengajar
  ├── Implementasikan Modal Popup "Detail Audit Pengajar" (Drilldown View)
  └── Tambahkan tombol Ekspor Laporan Ringkas Kinerja (Excel/PDF)

[Tahap 4: Otorisasi & Navigasi]
  ├── Pastikan tab/menu hanya dirender untuk role `Super Admin` di `global-user.js`
  └── Uji perlindungan URL di `public/js/route-guard.js`

[Tahap 5: Verifikasi Akhir & Validasi]
  └── Uji coba interaktif melalui browser untuk memastikan tidak ada bug visual atau layout patah
```

---

## 7. Kolom Komentar & Catatan Pengguna (Feedback Section)

Silakan tuliskan komentar, preferensi, atau penyesuaian Anda di bawah ini:

* **Preferensi Lokasi Penempatan:** [ ] Opsi A (Tab di Absensi Pengajar)  /  [ ] Opsi B (Halaman Baru Tersendiri) halaman baru tersendiri
* **Batas Toleransi Keterlambatan:** Apakah 5 menit cukup, atau ingin angka lain (misal 10 menit)? 10 - 15 menit lah toleransi keterlambatan
* **Fitur Tambahan:** Apakah diperlukan tombol Ekspor Laporan Rekap Kinerja Bulanan ke Excel / PDF? yak boleh
* **Catatan Tambahan dari Anda:**
  *(Tuliskan catatan atau instruksi tambahan Anda di sini...)*
hanya khusus untuk super admin saja ya akses ke halaman ini, kalau untuk admin biasa jangan bisa akses halaman ini 
jangan lupa juga untuk keadaan kelasnya apakah dikelas tersebut ada siswa yang bermasalah (jarang masuk dan sebagainya) atau tidak, kalau ada tandai warna merah dan ada tulisan siswa bermasalah di kolom siswa di bagian halaman pengajar dan juga pada halaman audit kinerja pengajar 

---

## 8. Ringkasan Realisasi Implementasi Sesuai Komentar

1. **Halaman Baru Tersendiri:**
   - Dibuat halaman dedicated: [`public/audit-kinerja-pengajar.html`](file:///c:/Users/Juna/Documents/KBEC%20PROJECT/kbec-admin/public/audit-kinerja-pengajar.html).
   - Sidebar navigasi link dibuat dinamis di [`public/global-user.js`](file:///c:/Users/Juna/Documents/KBEC%20PROJECT/kbec-admin/public/global-user.js) di bawah menu Akademik dan hanya dirender untuk role `Super Admin`.

2. **Toleransi Keterlambatan 10 - 15 Menit:**
   - Diimplementasikan pada fungsi `calculatePunctuality` di [`src/controllers/teacher.controller.js`](file:///c:/Users/Juna/Documents/KBEC%20PROJECT/kbec-admin/src/controllers/teacher.controller.js):
     - $\le 10$ menit: **Tepat Waktu** (Hijau).
     - $11 - 15$ menit: **Toleransi Keterlambatan** (Kuning/Amber).
     - $> 15$ menit: **Terlambat Berat** (Merah/Rose) dengan label telat menit.

3. **Pembatasan Hak Akses Khusus Super Admin (Admin Biasa Ditolak):**
   - **Backend API:** `GET /api/teachers/audit-monitoring` diproteksi middleware `requireAuth` dan `requireRole('Super Admin')`. Akses oleh Admin biasa, Staff, atau Pengajar ditolak dengan status **403 Forbidden**.
   - **Frontend Route Guard:** [`public/js/route-guard.js`](file:///c:/Users/Juna/Documents/KBEC%20PROJECT/kbec-admin/public/js/route-guard.js) mencegat siapa pun selain `Super Admin` yang mencoba membuka `audit-kinerja-pengajar.html` dan mengarahkannya kembali ke dashboard dengan peringatan.

4. **Deteksi Siswa Bermasalah (Warna Merah & Tulisan Siswa Bermasalah):**
   - **Mesin Deteksi:** Fungsi `evaluateProblematicStudents` mendeteksi siswa yang jarang masuk (Alpha $\ge 3$ kali atau persentase kehadiran $< 75\%$).
   - **Halaman Audit Kinerja:** [`public/audit-kinerja-pengajar.html`](file:///c:/Users/Juna/Documents/KBEC%20PROJECT/kbec-admin/public/audit-kinerja-pengajar.html) menampilkan badge merah mencolok `⚠️ Siswa Bermasalah (X Jarang Masuk)` dan rincian nama siswa pada modal drilldown.
   - **Halaman Pengajar:** [`public/pengajar.html`](file:///c:/Users/Juna/Documents/KBEC%20PROJECT/kbec-admin/public/pengajar.html) memiliki kolom baru **"Keadaan Kelas / Siswa"**, badge merah `⚠️ Siswa Bermasalah (X jarang masuk)`, filter dropdown `Semua Keadaan Siswa`, serta modal detail "Lihat Detail" yang menampilkan daftar siswa bermasalah.

5. **Ekspor Laporan Excel & PDF:**
   - Tersedia tombol ekspor data audit ke spreadsheet Excel (`.xlsx`) via SheetJS serta opsi cetak/PDF berformat resmi KBEC.

6. **Pengujian Otomatis (100% Lulus):**
   - Seluruh skenario telah diuji melalui [`tests/teacher_performance_monitoring.test.js`](file:///c:/Users/Juna/Documents/KBEC%20PROJECT/kbec-admin/tests/teacher_performance_monitoring.test.js) dan seluruh 9 test suite backend lulus 100%. 
