const db = require('../src/config/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

async function seedDatabase() {
    try {
        console.log('🔄 Menjalankan migrasi & seeding database KBEC...');

        // Inisialisasi Tabel Utama jika belum ada
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                nis VARCHAR(50) UNIQUE,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('Super Admin', 'Admin', 'Pengajar') DEFAULT 'Admin',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS programs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nama VARCHAR(100) NOT NULL UNIQUE,
                cat VARCHAR(50) DEFAULT 'basic',
                level VARCHAR(50) DEFAULT 'Reguler',
                deskripsi TEXT,
                biaya INT DEFAULT 0,
                durasi VARCHAR(50) DEFAULT '3 Bulan',
                sesi VARCHAR(50) DEFAULT '24 Sesi'
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS students (
                id VARCHAR(50) PRIMARY KEY,
                nama VARCHAR(100) NOT NULL,
                alamat TEXT,
                kontak VARCHAR(50),
                program VARCHAR(100),
                level VARCHAR(50),
                status ENUM('Aktif', 'Alumni', 'Non-Aktif') DEFAULT 'Aktif',
                initial VARCHAR(5),
                color VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                notes TEXT,
                FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS inventory (
                id INT AUTO_INCREMENT PRIMARY KEY,
                kode_barang VARCHAR(50) NOT NULL UNIQUE,
                nama_barang VARCHAR(150) NOT NULL,
                kategori VARCHAR(50) NOT NULL,
                stok INT DEFAULT 0,
                stok_min INT DEFAULT 10,
                satuan VARCHAR(20) DEFAULT 'Pcs',
                harga_beli INT DEFAULT 0,
                harga_jual INT DEFAULT 0,
                lokasi VARCHAR(100) DEFAULT '-',
                keterangan TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS inventory_mutations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                item_id INT NOT NULL,
                jenis ENUM('Masuk', 'Keluar') NOT NULL,
                jumlah INT NOT NULL,
                keterangan TEXT,
                user_name VARCHAR(100) DEFAULT 'Admin',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE CASCADE
            )
        `);

        // Seed Admin user jika belum ada
        const [users] = await db.query('SELECT * FROM users');
        if (users.length === 0) {
            const passwordHashed = await bcrypt.hash('admin', 10);
            const adminNis = '2607000001-SA';
            await db.query(
                'INSERT INTO users (id, nis, name, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
                [adminNis, adminNis, 'Admin Utama', 'admin@kbec.com', passwordHashed, 'Super Admin']
            );
            console.log('✔ Admin user seeded successfully.');
        }

        console.log('🚀 Migrasi & Seeding Database berhasil diselesaikan!');
        if (require.main === module) {
            process.exit(0);
        }
    } catch (err) {
        console.error('❌ Gagal seeding database:', err);
        if (require.main === module) {
            process.exit(1);
        }
        throw err;
    }
}

if (require.main === module) {
    seedDatabase();
}

module.exports = { seedDatabase };

