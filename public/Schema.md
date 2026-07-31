# DB Schema Documentation - KBEC Admin System

Dokumentasi resmi struktur tabel dan skema database MySQL (`kbec_db`) untuk KBEC Admin Management System.

---

## 📋 Ringkasan Tabel Utama

| Nama Tabel | Primary Key | Deskripsi & Format ID / NIS |
| :--- | :--- | :--- |
| `users` | `id` (VARCHAR) | Akun Pengguna System / Admin / Pengajar (NIS: `[YY][MM][SEQ][SUFFIX]` misal `2607000001-SA`, `2607000001-ADM`, `2607000001-TCH`) |
| `students` | `id` (VARCHAR) | Data Siswa Terdaftar (NIS: `[YY][MM][SEQ][SUFFIX]` misal `2607000001`, `2607000001-C`, `2607000001-B`, `2607000001-A`, `2607000001-TK`) |
| `teachers` | `id` (VARCHAR) | Data Pengajar & Guru (Format: `KBEC-T001`) |
| `programs` | `id` (INT AUTO) | Program Kursus & Unit Yayasan (KBEC, TK, Bimbel, Calistung, Arabin) |
| `classes` | `id` (INT AUTO) | Data Kelas & Jadwal Belajar |
| `class_students` | `(class_id, student_id)` | Relasi Mapping Siswa dalam Kelas |
| `payments` | `id` (VARCHAR) | Transaksi Pembayaran / Invoice (`INV-26011`) |
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
       - `Arabin` (Beasiswa Kurang Mampu): `-A` (contoh: `2607000001-A`)
       - `TK`: `-TK` (contoh: `2607000001-TK`)
     - **User System**:
       - `Super Admin`: `-SA` (contoh: `2607000001-SA`)
       - `Admin`: `-ADM` (contoh: `2607000001-ADM`)
       - `Pengajar`: `-TCH` (contoh: `2607000001-TCH`)
       - `User`: `-USR` (contoh: `2607000001-USR`)

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

-- 2. Tabel Students
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(50) PRIMARY KEY,
    nama VARCHAR(100) UNIQUE NOT NULL,
    alamat TEXT,
    kontak VARCHAR(30),
    program VARCHAR(100),
    level VARCHAR(50),
    status VARCHAR(30),
    initial VARCHAR(10),
    color VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL
);
```
