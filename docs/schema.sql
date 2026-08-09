-- ==========================================
-- KBEC MANAGEMENT SYSTEM - OFFICIAL SUPABASE POSTGRES SCHEMA
-- Complete Primary Keys & Relational Foreign Key Annotations
-- ==========================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id INT PRIMARY KEY DEFAULT nextval('activity_logs_id_seq'::regclass),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    user_name VARCHAR(255),
    action TEXT,
    detail TEXT,
    status VARCHAR(255),
    badge VARCHAR(255),
    siswa TEXT,
    aktivitas TEXT,
    program TEXT,
    status_color TEXT,
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS attendance (
    id INT PRIMARY KEY DEFAULT nextval('attendance_id_seq'::regclass),
    tanggal DATE NOT NULL,
    student_id VARCHAR(255),
    nama VARCHAR(255),
    program VARCHAR(255),
    unit VARCHAR(255),
    status VARCHAR(255),
    catatan TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    kelas TEXT,
    inisial TEXT
);

CREATE TABLE IF NOT EXISTS bills (
    id VARCHAR(255) PRIMARY KEY,
    student_id VARCHAR(255),
    nama VARCHAR(255),
    program VARCHAR(255),
    unit VARCHAR(255),
    bulan_tagihan VARCHAR(255),
    kategori VARCHAR(255),
    nominal INT DEFAULT 0,
    terbayar INT DEFAULT 0,
    status VARCHAR(255) DEFAULT 'Tertagih'::character varying,
    jatuh_tempo DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_students (
    class_id BIGINT NOT NULL,
    student_id VARCHAR(255) NOT NULL,
    PRIMARY KEY (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS classes (
    id VARCHAR(255) PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    program VARCHAR(255),
    unit VARCHAR(255),
    pengajar VARCHAR(255),
    teacher_id VARCHAR(255),
    jadwal VARCHAR(255),
    jam VARCHAR(255),
    ruangan VARCHAR(255),
    ruang VARCHAR(255),
    kapasitas INT DEFAULT 20,
    terisi INT DEFAULT 0,
    status VARCHAR(255) DEFAULT 'Aktif'::character varying,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    hari TEXT,
    mulai TEXT,
    selesai TEXT,
    tipe TEXT
);

CREATE TABLE IF NOT EXISTS deposits (
    id INT PRIMARY KEY DEFAULT nextval('deposits_id_seq'::regclass),
    kode_setoran VARCHAR(255) NOT NULL,
    tanggal DATE NOT NULL,
    disetorkan_oleh VARCHAR(255) NOT NULL,
    diverifikasi_oleh VARCHAR(255),
    jumlah BIGINT NOT NULL,
    metode VARCHAR(255) DEFAULT 'Tunai'::character varying,
    catatan TEXT,
    status VARCHAR(255) DEFAULT 'Disetorkan'::character varying,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
    id INT PRIMARY KEY DEFAULT nextval('inventory_id_seq'::regclass),
    kode_barang VARCHAR(255) NOT NULL,
    nama_barang VARCHAR(255) NOT NULL,
    kategori VARCHAR(255) NOT NULL,
    stok BIGINT DEFAULT 0,
    stok_min BIGINT DEFAULT 10,
    satuan VARCHAR(255) DEFAULT 'Pcs'::character varying,
    harga_beli BIGINT DEFAULT 0,
    harga_jual BIGINT DEFAULT 0,
    lokasi VARCHAR(255),
    keterangan TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_mutations (
    id INT PRIMARY KEY DEFAULT nextval('inventory_mutations_id_seq'::regclass),
    item_id BIGINT NOT NULL,
    jenis VARCHAR(255) NOT NULL,
    jumlah BIGINT NOT NULL,
    keterangan TEXT,
    user_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(255) PRIMARY KEY,
    tanggal DATE,
    student_id VARCHAR(255),
    nama VARCHAR(255),
    program VARCHAR(255),
    unit VARCHAR(255),
    kategori VARCHAR(255),
    jumlah INT DEFAULT 0,
    metode VARCHAR(255),
    status VARCHAR(255) DEFAULT 'Lunas'::character varying,
    catatan TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    bill_id TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS performance_reports (
    id INT PRIMARY KEY DEFAULT nextval('performance_reports_id_seq'::regclass),
    student_id VARCHAR(255),
    nama VARCHAR(255),
    bulan VARCHAR(255),
    kehadiran VARCHAR(255),
    nilai VARCHAR(255),
    grade VARCHAR(255),
    catatan TEXT,
    catatan_instruktur TEXT,
    materi_tambahan TEXT,
    keterangan TEXT,
    status VARCHAR(255) DEFAULT 'Terbit'::character varying,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS petty_cash (
    id INT PRIMARY KEY DEFAULT nextval('petty_cash_id_seq'::regclass),
    kode_transaksi VARCHAR(255) NOT NULL,
    tanggal DATE NOT NULL,
    tipe VARCHAR(255) NOT NULL,
    kategori VARCHAR(255) NOT NULL,
    jumlah BIGINT NOT NULL,
    keterangan TEXT,
    dicatat_oleh VARCHAR(255) DEFAULT 'Super Admin'::character varying,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS programs (
    id INT PRIMARY KEY DEFAULT nextval('programs_id_seq'::regclass),
    nama VARCHAR(255) NOT NULL,
    cat VARCHAR(255),
    level VARCHAR(255),
    deskripsi TEXT,
    biaya INT DEFAULT 0,
    durasi VARCHAR(255),
    sesi VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reminders (
    id INT PRIMARY KEY DEFAULT nextval('reminders_id_seq'::regclass),
    title VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(255),
    location VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_grades (
    id INT PRIMARY KEY DEFAULT nextval('student_grades_id_seq'::regclass),
    student_id VARCHAR(255) NOT NULL,
    student_name VARCHAR(255),
    class_id BIGINT,
    class_name VARCHAR(255),
    tanggal DATE NOT NULL,
    presensi VARCHAR(255) DEFAULT 'HADIR'::character varying,
    lesson TEXT DEFAULT 80,
    speaking VARCHAR(255) DEFAULT 80,
    wb VARCHAR(255) DEFAULT 80,
    sb VARCHAR(255) DEFAULT 80,
    extra TEXT DEFAULT 80,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    nama_panggilan VARCHAR(255),
    grade VARCHAR(255),
    material_tambahan TEXT,
    sb_page VARCHAR(255),
    wb_page VARCHAR(255),
    keterangan TEXT
);

CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(255) PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    alamat TEXT,
    kontak VARCHAR(255),
    program VARCHAR(255),
    level VARCHAR(255),
    unit VARCHAR(255),
    status VARCHAR(255) DEFAULT 'Aktif'::character varying,
    initial VARCHAR(255),
    color VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS teacher_checkins (
    id INT PRIMARY KEY DEFAULT nextval('teacher_checkins_id_seq'::regclass),
    teacher_id VARCHAR(255),
    teacher_name VARCHAR(255),
    class_id BIGINT,
    class_name VARCHAR(255),
    lat NUMERIC,
    lng NUMERIC,
    distance_meters NUMERIC,
    is_online BIGINT DEFAULT 0,
    status VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teachers (
    id VARCHAR(255) PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    kontak VARCHAR(255),
    program VARCHAR(255),
    unit VARCHAR(255),
    pengalaman VARCHAR(255),
    lulusan VARCHAR(255),
    status VARCHAR(255) DEFAULT 'Aktif'::character varying,
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    joined TEXT,
    expertise TEXT,
    avatar TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    username VARCHAR(255),
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(255) DEFAULT 'Pending'::character varying,
    status VARCHAR(255) DEFAULT 'Pending'::character varying,
    teacher_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    email TEXT,
    nis TEXT,
    PRIMARY KEY (id)
);

-- Schema Migration Additions
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(255) DEFAULT 'Pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_id VARCHAR(255);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS teacher_id VARCHAR(255);
