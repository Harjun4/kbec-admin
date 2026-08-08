const db = require('../config/db');

/**
 * Controller log aktivitas (Audit Trail)
 */

// GET /api/logs/latest - Mengambil 5 log terbaru untuk widget dashboard
exports.getLatestLogs = async (req, res, next) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                id,
                COALESCE(siswa, user_name, 'System') AS pelaku,
                COALESCE(aktivitas, action, 'Aktivitas System') AS aktivitas,
                COALESCE(program, '-') AS program,
                COALESCE(status, 'Berhasil') AS status,
                COALESCE(status_color, 'text-emerald-600 bg-emerald-50') AS "statusColor",
                COALESCE(TO_CHAR(created_at::timestamp, 'DD Mon HH24:MI'), '-') AS waktu,
                created_at
            FROM activity_logs
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 5
        `);

        return res.json({
            success: true,
            data: rows || []
        });
    } catch (err) {
        console.error('[LOG_CONTROLLER ERROR] getLatestLogs:', err.message || err);
        return res.json({
            success: true,
            data: []
        });
    }
};

// GET /api/logs/all - Mengambil seluruh log (LIMIT 100) untuk modal pop-up
exports.getAllLogs = async (req, res, next) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                id,
                COALESCE(siswa, user_name, 'System') AS pelaku,
                COALESCE(aktivitas, action, 'Aktivitas System') AS aktivitas,
                COALESCE(program, '-') AS program,
                COALESCE(status, 'Berhasil') AS status,
                COALESCE(status_color, 'text-emerald-600 bg-emerald-50') AS "statusColor",
                COALESCE(TO_CHAR(created_at::timestamp, 'DD Mon HH24:MI'), '-') AS waktu,
                created_at
            FROM activity_logs
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 100
        `);

        return res.json({
            success: true,
            data: rows || []
        });
    } catch (err) {
        console.error('[LOG_CONTROLLER ERROR] getAllLogs:', err.message || err);
        return res.json({
            success: true,
            data: []
        });
    }
};
