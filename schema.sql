CREATE DATABASE IF NOT EXISTS kbec_db;
USE kbec_db;

-- 1. Tabel Users (untuk Login)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);

-- 2. Tabel Programs (Program Kursus)
CREATE TABLE IF NOT EXISTS programs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) UNIQUE NOT NULL,
    cat VARCHAR(50),
    level VARCHAR(50),
    deskripsi TEXT,
    biaya INT NOT NULL, -- Diubah menjadi integer agar lebih presisi dalam kalkulasi pembayaran
    durasi VARCHAR(50),
    sesi VARCHAR(50)
);

-- 3. Tabel Teachers (Pengajar)
CREATE TABLE IF NOT EXISTS teachers (
    id VARCHAR(50) PRIMARY KEY,
    nama VARCHAR(100) UNIQUE NOT NULL, -- Harus UNIQUE agar bisa dirujuk sebagai Foreign Key
    joined VARCHAR(50),
    expertise TEXT, -- Disimpan sebagai string JSON (misal: ["IELTS Prep", "Grammar"])
    email VARCHAR(100) UNIQUE,
    kontak VARCHAR(30),
    status VARCHAR(30),
    avatar VARCHAR(255)
);

-- 4. Tabel Students (Siswa)
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(50) PRIMARY KEY,
    nama VARCHAR(100) UNIQUE NOT NULL, -- Harus UNIQUE agar bisa dirujuk sebagai Foreign Key oleh Payments & Attendance
    alamat TEXT,
    kontak VARCHAR(30),
    program VARCHAR(100),
    level VARCHAR(50),
    status VARCHAR(30),
    initial VARCHAR(10),
    color VARCHAR(50),
    FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL
);

-- 5. Tabel Classes (Manajemen Kelas & Jadwal Terpadu)
CREATE TABLE IF NOT EXISTS classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) UNIQUE NOT NULL,
    program VARCHAR(100),
    pengajar VARCHAR(100),
    kapasitas INT DEFAULT 20,
    hari VARCHAR(50),
    mulai VARCHAR(10) DEFAULT '08:00',
    selesai VARCHAR(10) DEFAULT '09:30',
    tipe VARCHAR(50) DEFAULT 'Tatap Muka',
    ruang VARCHAR(100) DEFAULT 'Belum Diatur',
    FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (pengajar) REFERENCES teachers(nama) ON UPDATE CASCADE ON DELETE SET NULL
);

-- 6. Tabel class_students (Relasi Kelas dan Siswa)
CREATE TABLE IF NOT EXISTS class_students (
    class_id INT,
    student_id VARCHAR(50),
    PRIMARY KEY (class_id, student_id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- 7. Tabel Payments (Pembayaran)
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(50) PRIMARY KEY, -- Invoice ID (misal: INV-26011)
    nama VARCHAR(100),
    program VARCHAR(100),
    jumlah INT NOT NULL,
    metode VARCHAR(50),
    status VARCHAR(30),
    tanggal DATE DEFAULT (CURRENT_DATE),
    FOREIGN KEY (nama) REFERENCES students(nama) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL
);

-- 8. Tabel Attendance (Absensi)
CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    nama VARCHAR(100),
    program VARCHAR(100),
    kelas VARCHAR(100),
    status VARCHAR(30), -- Hadir, Izin, Sakit, Alpha
    inisial VARCHAR(10),
    tanggal DATE NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (nama) REFERENCES students(nama) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (kelas) REFERENCES classes(nama) ON UPDATE CASCADE ON DELETE CASCADE
);

-- 9. Tabel Activity Logs (Log Aktivitas Sistem)
CREATE TABLE IF NOT EXISTS activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    siswa VARCHAR(100),
    aktivitas VARCHAR(255),
    program VARCHAR(100),
    status VARCHAR(50),
    status_color VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

