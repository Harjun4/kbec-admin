const mysql = require('mysql2/promise');
require('dotenv').config();

const rawHost = (process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com').trim();
const rawUser = (process.env.DB_USER || '2RmYbMkU6a8GJqB.root').trim();
const rawPassword = (process.env.DB_PASSWORD || 'OQNvnJ6C2G90gtaI').trim();
const rawDatabase = (process.env.DB_NAME || 'kbec_db').trim();
const rawPort = parseInt(process.env.DB_PORT, 10) || 4000;

const dbConfig = {
    host: rawHost.includes('localhost') ? 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com' : rawHost,
    user: rawUser === 'root' ? '2RmYbMkU6a8GJqB.root' : rawUser,
    password: rawPassword === '' ? 'OQNvnJ6C2G90gtaI' : rawPassword,
    database: rawDatabase,
    port: rawPort === 3306 ? 4000 : rawPort,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// SSL selalu diaktifkan untuk koneksi TiDB Cloud
if (process.env.DB_SSL === 'true' || dbConfig.host.includes('tidbcloud.com') || (dbConfig.host !== 'localhost' && dbConfig.host !== '127.0.0.1')) {
    dbConfig.ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: false };
}

const pool = mysql.createPool(dbConfig);

module.exports = pool;
