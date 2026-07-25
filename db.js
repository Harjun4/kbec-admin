const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    user: process.env.DB_USER || '2RmYbMkU6a8GJqB.root',
    password: process.env.DB_PASSWORD || 'OQNvnJ6C2G90gtaI',
    database: process.env.DB_NAME || 'kbec_db',
    port: parseInt(process.env.DB_PORT, 10) || 4000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// SSL selalu diaktifkan untuk koneksi remote / TiDB Cloud
if (process.env.DB_SSL === 'true' || dbConfig.host.includes('tidbcloud.com') || (dbConfig.host !== 'localhost' && dbConfig.host !== '127.0.0.1')) {
    dbConfig.ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: false };
}

const pool = mysql.createPool(dbConfig);

module.exports = pool;
