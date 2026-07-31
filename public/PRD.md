# Product Requirements Document (PRD)
## Sistem Informasi Manajemen & Administrasi KBEC (Kampung Bahasa English Course)
### Versi: 3.2 | Status: APPROVED | Pendekatan: Process-Driven Business Architecture & Existing Codebase Integration

---

## 1. Visi & Latar Belakang Sistem

Sistem Manajemen KBEC dikembangkan untuk memodernisasi dan mengintegrasikan seluruh operasional institusi pendidikan Kampung Bahasa English Course (KBEC) dan Yayasan. Menggabungkan alur kerja operasional nyata dengan arsitektur sistem terpadu, sistem ini dibangun dengan pendekatan **Proses Bisnis Terpadu** yang mengelola **5 Unit Yayasan Resmi**:
1. **Unit KBEC** (English Course: Beginner, Elementary, BTP, CTP, Intermediate, Advance)
2. **Unit Bimbel** (Bimbingan Belajar Akademik Sekolah SD-SMP)
3. **Unit Calistung** (Baca Tulis Hitung: Level 1A–3B)
4. **Unit TK** (Preschool / PAUD / Kelompok Bermain / TK A / TK B)
5. **Unit Arabin** (Program Beasiswa Bantuan Keagamaan & Pendidikan Anak Pemulung / Kurang Mampu)

Dengan pemisahan peran dan hak akses dinamis berbasis **Role + Permission**, sistem ini dirancang fleksibel, aman, efisien, serta dilengkapi fitur analitik pertumbuhan, pencarian global real-time, manajemen agenda/reminder, presensi bulk/bulanan, pengelolaan inventaris, dan monitoring presensi guru berbasis GPS Geofencing.

---

## 2. Struktur Navigasi & Sidebar Berbasis Role

Struktur antarmuka menyesuaikan peran pengguna (Role) untuk memastikan setiap pengguna fokus pada tugas dan tanggung jawabnya.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STUKTUR SIDEBAR PER ROLE                           │
├──────────────────────────────┬──────────────────────────────┬───────────────┤
│ 👑 Super Admin (Full Access) │ 👨💼 Admin (Operasional)      │ 👩🏫 Pengajar │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│ 🔍 Pencarian Global          │ 🔍 Pencarian Global          │ 🏠 Dashboard  │
│ 🏠 Dashboard                 │ 🏠 Dashboard                 │ 👨🎓 Siswa Saya│
│ 👨🎓 Data Siswa               │ 👨🎓 Data Siswa               │ 📚 Kelas Saya │
│    • Semua Siswa             │    • Semua Siswa             │ 📍 Check-in   │
│    • Data KBEC / TK / Bimbel │    • Data KBEC / TK / Bimbel │    Guru (GPS) │
│      Calistung / Arabin      │      Calistung / Arabin      │ 📝 Kinerja    │
│ 📚 Akademik                  │ 📚 Akademik                  │    Siswa      │
│    • Guru                    │    • Kelas                   │ 📅 Agenda Saya│
│    • Kelas & Jadwal          │    • Kinerja Siswa           │ 📊 Laporan    │
│    • Presensi & Check-in     │    • Agenda & Reminders      │    Saya       │
│    • Kinerja Siswa           │ 💰 Keuangan                  │               │
│    • Agenda & Reminders      │    • Tagihan SPP             │               │
│ 💰 Keuangan                  │    • Pembayaran & Kuitansi   │               │
│    • Tagihan SPP             │    • Setoran Kasir           │               │
│    • Pembayaran & Kuitansi   │    • Kas Kecil               │               │
│    • Setoran Kasir           │ 🏫 Pengelolaan Unit & Program│               │
│    • Kas Kecil               │    • Unit KBEC / Bimbel /    │               │
│ 🏫 Pengelolaan Unit & Program│      Calistung / TK / Arabin │               │
│    • Unit KBEC / Bimbel /    │ 📦 Inventaris                │               │
│      Calistung / TK / Arabin │ 📊 Laporan                   │               │
│ 📦 Inventaris                │                              │               │
│ 📊 Laporan                   │                              │               │
│ 👤 Manajemen User            │                              │               │
│ ⚙️ Pengaturan                │                              │               │
└──────────────────────────────┴──────────────────────────────┴───────────────┘
```

---

## 3. Spesifikasi Fitur Terperinci per Modul

### 🔍 Fitur Global: Pencarian Cepat Real-Time (Global Search)
* **Bar Pencarian Header**: Tersedia di seluruh halaman admin untuk mencari data secara serentak dari entitas utama:
  * **Siswa**: NIS Resmi, Nama, Program, Level, Status.
  * **Guru**: Nama, Email, Spesialisasi.
  * **Kelas**: Nama Kelas, Program, Pengajar.
  * **Pembayaran & Tagihan**: ID Tagihan (`TAG-...`), No Invoice/Kuitansi (`INV-...`), Nama Siswa, Nominal.

---

### 🏠 Modul 1: Dashboard
Halaman utama yang menyajikan ringkasan eksekutif dan operasional sesuai dengan role pengguna yang sedang login.

* **Widget Ringkasan Metrik**:
  * **Total Siswa Aktif**: Jumlah akumulasi siswa terdaftar berstatus aktif di 5 Unit Yayasan.
  * **Pembayaran Hari Ini**: Nominal transaksi pembayaran SPP/pendaftaran yang diterima hari ini.
  * **Pendapatan Bulan Ini & Total Revenue**: Total akumulasi pemasukan keuangan per periode.
  * **Tagihan Belum Lunas**: Jumlah siswa / total akumulasi nominal tunggakan pembayaran.
  * **Tingkat Presensi Kehadiran Hari Ini**: Persentase & perbandingan siswa/guru yang hadir hari ini.
* **Widget Visualisasi Analitik & Log**:
  * **Grafik Pertumbuhan Siswa (Growth Analytics)**: Visualisasi kurva pertumbuhan pendaftaran siswa dengan filter periode (`Semua Bulan`, `6 Bulan`, `3 Bulan`, atau `Filter Per Bulan`).
  * **Grafik Pendapatan per Program**: Pie chart/Bar chart distribusi pendapatan berdasarkan program studi.
  * **Widget Agenda & Reminders Mingguan**: List jadwal agenda penting terdekat.
  * **Log Aktivitas Terbaru**: Log real-time dari transaksi, presensi, pendaftaran, dan pembaruan kinerja siswa.

---

### 👨🎓 Modul 2: Data Siswa (5 Unit Yayasan)
Pusat manajemen data induk siswa yang mengelompokkan siswa berdasarkan Unit Yayasan.

* **Sub-menu & Filter Unit Yayasan**:
  * **Semua Siswa**: Katalog master seluruh siswa terdaftar.
  * **Data KBEC**: Siswa program reguler Kampung Bahasa English Course.
  * **Data TK**: Siswa kelompok belajar Taman Kanak-Kanak / Preschool / PAUD / KB.
  * **Data Bimbel**: Siswa bimbingan belajar akademik sekolah SD-SMP.
  * **Data Calistung**: Siswa program Baca Tulis Hitung (1A–3B).
  * **Data Arabin**: Siswa program Beasiswa Bantuan Keagamaan & Pendidikan Anak Pemulung / Kurang Mampu.
* **Format NIS Resmi**: `[YY][MM][000001][SUFFIX]` (`-C` untuk Calistung, `-B` untuk Bimbel, `-TK` untuk TK, `-A` untuk Arabin, tanpa suffix untuk KBEC).
* **Auto-Filter Dynamic Dropdown**: Dropdown Level Kursus pada form modal dan filter tabel secara otomatis menyaring level spesifik sesuai Unit Yayasan yang dipilih.

---

### 📚 Modul 3: Akademik & Presensi
Modul pengelolaan operasional pengajaran, penjadwalan, presensi, dan penilaian kinerja akademik siswa.

* **Guru**: Data Pengajar, NIP, kontak, spesialisasi, dan Check-in GPS Geofencing (radius ≤ 100m).
* **Kelas & Jadwal**: Daftar kelas, serial, kapasitas, jam, dan ruang.
* **Presensi Harian & Bulanan**: Input presensi bulk harian dan matriks bulanan.
* **Kinerja Siswa**: Evaluasi 7 Komponen (Presensi, Lesson, Speaking, WB, SB, Material Tambahan, Catatan Guru).
* **Agenda & Reminders**: Kalender pengingat kegiatan lembaga.

---

### 💰 Modul 4: Keuangan
Modul akuntansi dan pengelolaan arus kas operasional KBEC & Yayasan.

* **Tagihan SPP (`pembayaran.html#bills`)**:
  * Penerbitan lembar pernyataan kewajiban pembayaran SPP (`TAG-[YYYYMM]-[RAND4/SEQ]`).
  * Dukungan filter per Periode Bulan, Unit Yayasan (5 Unit), Status, dan Pencarian Siswa.
  * Opsi **Auto-Generate SPP Bulanan** untuk seluruh siswa aktif.
* **Pembayaran & Kuitansi (`pembayaran.html#payments`)**:
  * Pencatatan bukti penerimaan uang dan penerbitan Kuitansi / Invoice resmi (`INV-[YYMM]-[RAND4]`).
  * Pelunasan tagihan SPP secara langsung dengan pembaharuan status tagihan real-time.
* **Setoran Kasir (`pembayaran.html#deposits`)**:
  * Penyerahan kas harian kasir ke bendahara/manajemen.
* **Kas Kecil / Petty Cash (`pembayaran.html#petty`)**:
  * Pencatatan pengeluaran & pemasukan operasional harian (ATK, konsumsi, kebersihan, dll).

---

### 🏫 Modul 5: Pengelolaan Unit & Program (`program.html`)
Modul manajemen master program kursus dan tarif per Unit Yayasan.

* **Tab Navigasi 5 Unit**: `Semua Unit`, `Unit KBEC`, `Unit Bimbel`, `Unit Calistung`, `Unit TK`, `Unit Arabin (Beasiswa)`.
* **Sinkronisasi Dua Arah**: Terhubung langsung dengan tree sub-menu sidebar global.
* **Manajemen Level & Tarif**: Penambahan, pengeditan, dan penghapusan level program, deskripsi, biaya SPP, durasi, dan jumlah sesi.

---

### 📦 Modul 6: Inventaris (`inventaris.html`)
Pengelolaan stok barang operasional, modul ajar, dan atribut siswa.

* **Katalog Barang Inventaris**:
  * Modul Cetak (KBEC, Calistung, Bimbel, TK, Arabin)
  * Merchandise & Atribut (PIN, Kaos/Seragam, Vocabulary Book)
  * Alat Tulis Kantor (ATK) & Perlengkapan Operasional Gedung
* **Spesifikasi Atribut Barang**: `kode_barang`, `nama_barang`, `kategori`, `stok`, `stok_min`, `satuan`, `harga_beli`, `harga_jual`, `lokasi`, `keterangan`.
* **Mutasi Stok (Stock In / Stock Out)**: Pencatatan otomatis riwayat penambahan stok (pembelian) dan pendistribusian stok keluar ke siswa/kelas.
* **Alert Stok Minimum**: Peringatan visual otomatis jika sisa stok berada di bawah ambang minimum (`stok <= stok_min`).

---

### 📊 Modul 7: Laporan
Pusat rekapitulasi data dan analitik pelaporan manajemen:
* Laporan Tagihan & Pembayaran SPP (5 Unit)
* Laporan Kas Kecil & Setoran Kasir
* Laporan Kehadiran Siswa & GPS Check-in Guru
* Laporan Mutasi & Value Nilai Inventaris

---

### 👤 Modul 8: Manajemen User & ⚙️ Pengaturan (Super Admin)
* Manajemen Akun Admin, Kasir, Pengajar dengan NIS resmi user (`-SA`, `-ADM`, `-TCH`).
* Matriks Role & Permissions granular.
* Backup Database MySQL & Audit Log Activity System.

---

## 4. Matriks Peran & Hak Akses (RBAC)

```
┌─────────────────────────┬─────────────┬─────────────┬─────────────┐
│ Modul / Menu            │ Super Admin │    Admin    │  Pengajar   │
├─────────────────────────┼─────────────┼─────────────┼─────────────┤
│ Global Search           │ Full (R/W)  │ Full (R/W)  │ Full (R/W)  │
│ Dashboard               │ Full (R/W)  │ Full (R/W)  │ Ringkasan   │
│ Data Siswa (5 Unit)     │ Full (CRUD) │ Full (CRUD) │ Siswa Saya  │
│ Akademik                │ Full (CRUD) │ Full (CRUD) │ Kelas Saya  │
│ Keuangan (Tagihan/Inv)  │ Full (CRUD) │ Full (CRUD) │ No Access   │
│ Pengelolaan Unit/Program│ Full (CRUD) │ Full (CRUD) │ No Access   │
│ Inventaris              │ Full (CRUD) │ Full (CRUD) │ View Stok   │
│ Laporan                 │ Full (CRUD) │ Full (CRUD) │ Read (Own)  │
│ Manajemen User & Setting│ Full (CRUD) │ No Access   │ No Access   │
└─────────────────────────┴─────────────┴─────────────┴─────────────┘
```
