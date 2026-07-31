# DB Schema Documentation - KBEC Admin System

Dokumentasi resmi struktur tabel dan skema database MySQL (`kbec_db`) untuk KBEC Admin Management System.

---

## 📋 Ringkasan Tabel Utama

| Nama Tabel | Primary Key | Deskripsi & Format ID / NIS |
| :--- | :--- | :--- |
| `users` | `id` (VARCHAR) | Akun Pengguna System / Admin / Pengajar (NIS: `[YY][MM][SEQ][SUFFIX]` misal `2607000001-SA`, `2607000001-ADM`, `2607000001-TCH`) |
| `students` | `id` (VARCHAR) | Data Siswa Terdaftar (NIS: `[YY][MM][SEQ][SUFFIX]` misal `2607000001`, `2607000001-C`, `2607000001-B`, `2607000001-TK`, `2607000001-A`) |
| `teachers` | `id` (VARCHAR) | Data Pengajar & Guru (Format: `KBEC-T001`) |
| `programs` | `id` (INT AUTO) | Program Kursus & 5 Unit Yayasan (KBEC, Bimbel, Calistung, TK, Arabin) |
| `classes` | `id` (INT AUTO) | Data Kelas & Jadwal Belajar |
| `class_students` | `(class_id, student_id)` | Relasi Mapping Siswa dalam Kelas |
| `bills` | `id` (VARCHAR) | Lembar Tagihan SPP / Receivables Statement (`TAG-202607-0001`) |
| `payments` | `id` (VARCHAR) | Kuitansi Transaksi Pembayaran / Invoice (`INV-2607-1234`) |
| `petty_cash` | `id` (INT AUTO) | Transaksi Arus Kas Kecil Operasional |
| `inventory` | `id` (INT AUTO) | Data Master Barang Inventaris & Stok |
| `inventory_mutations` | `id` (INT AUTO) | Log Mutasi Stok Masuk & Stok Keluar |
| `attendance` | `id` (INT AUTO) | Catatan Presensi Siswa Harian/Bulanan |
| `activity_logs` | `id` (INT AUTO) | Audit Log Aktivitas Sistem |
| `reminders` | `id` (INT AUTO) | Agenda & Pengingat Kegiatan |

---

## 📐 Spesifikasi Detail Format NIS (Nomor Induk Siswa & User)

1. **Struktur Kode NIS**: `[YY][MM][6DIGIT_SEQ][SUFFIX]`
   - `[YY]`: 2 Digit Tahun Pendaftaran (contoh: `26` untuk 2026)
   - `[MM]`: 2 Digit Bulan Pendaftaran (contoh: `07` untuk Juli)
   - `[6DIGIT_SEQ]`: 6 Digit Nomor Urut Terdaftar (contoh: `000001`)
   - `[SUFFIX]`:
     - **Siswa**:
       - `KBEC`: Tanpa Suffix (contoh: `2607000001`)
       - `Calistung`: `-C` (contoh: `2607000001-C`)
       - `Bimbel`: `-B` (contoh: `2607000001-B`)
       - `TK`: `-TK` (contoh: `2607000001-TK`)
       - `Arabin` (Beasiswa Anak Pemulung / Kurang Mampu): `-A` (contoh: `2607000001-A`)
     - **User System**:
       - `Super Admin`: `-SA` (contoh: `2607000001-SA`)
       - `Admin`: `-ADM` (contoh: `2607000001-ADM`)
       - `Pengajar`: `-TCH` (contoh: `2607000001-TCH`)

---

## 🗄️ DDL (Data Definition Language) SQL

```sql
CREATE DATABASE IF NOT EXISTS kbec_db;
USE kbec_db;

-- 1. Tabel Users
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    nis VARCHAR(50) UNIQUE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Programs (Master 5 Unit & Levels)
CREATE TABLE IF NOT EXISTS programs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) UNIQUE NOT NULL,
    cat VARCHAR(50) NOT NULL,
    level VARCHAR(50),
    deskripsi TEXT,
    biaya INT DEFAULT 0,
    durasi VARCHAR(50),
    sesi VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel Students
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(50) PRIMARY KEY,
    nama VARCHAR(100) UNIQUE NOT NULL,
    alamat TEXT,
    kontak VARCHAR(30),
    program VARCHAR(100),
    level VARCHAR(50),
    status VARCHAR(30) DEFAULT 'Aktif',
    initial VARCHAR(10),
    color VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL
);

-- 4. Tabel Bills (Tagihan SPP)
CREATE TABLE IF NOT EXISTS bills (
    id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(50),
    nama VARCHAR(100) NOT NULL,
    program VARCHAR(100),
    unit VARCHAR(50),
    bulan_tagihan VARCHAR(10) NOT NULL,
    kategori VARCHAR(50) DEFAULT 'SPP',
    nominal INT DEFAULT 0,
    terbayar INT DEFAULT 0,
    status VARCHAR(30) DEFAULT 'Tertagih',
    jatuh_tempo DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL
);

-- 5. Tabel Payments (Kuitansi Pembayaran)
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(50),
    nama VARCHAR(100) NOT NULL,
    program VARCHAR(100),
    unit VARCHAR(50),
    kategori VARCHAR(50) DEFAULT 'SPP',
    bill_id VARCHAR(50),
    jumlah INT NOT NULL,
    metode VARCHAR(50) DEFAULT 'Tunai',
    status VARCHAR(30) DEFAULT 'Lunas',
    tanggal DATE NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (bill_id) REFERENCES bills(id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- 6. Tabel Inventory (Barang & Stok)
CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kode_barang VARCHAR(50) UNIQUE NOT NULL,
    nama_barang VARCHAR(100) NOT NULL,
    kategori VARCHAR(50) NOT NULL,
    stok INT DEFAULT 0,
    stok_min INT DEFAULT 10,
    satuan VARCHAR(30) DEFAULT 'Pcs',
    harga_beli INT DEFAULT 0,
    harga_jual INT DEFAULT 0,
    lokasi VARCHAR(100),
    keterangan TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabel Inventory Mutations (Mutasi Stok Masuk / Keluar)
CREATE TABLE IF NOT EXISTS inventory_mutations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    jenis VARCHAR(20) NOT NULL, -- 'Masuk' atau 'Keluar'
    jumlah INT NOT NULL,
    keterangan TEXT,
    user_name VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE CASCADE
);
```
