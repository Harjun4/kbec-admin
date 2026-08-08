const db = require('../config/db');

/**
 * Non-blocking Helper untuk mencatat activity log ke database.
 * Diisolasi dalam try...catch agar TIDAK PERNAH menghentikan atau melempar error ke proses bisnis utama.
 */
async function createActivityLog({
    user_id = null,
    user_name = 'System',
    action = '',
    program = '-',
    status = 'Berhasil',
    details = null,
    siswa = null,
    aktivitas = null,
    status_color = null
} = {}) {
    try {
        const finalPelaku = user_name || siswa || 'System';
        const finalAktivitas = action || aktivitas || 'Aktivitas System';
        const finalDetail = details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : null;

        // Penentuan warna badge status default
        let defaultColor = 'text-emerald-600 bg-emerald-50';
        if (status === 'Gagal' || status === 'Error' || status === 'Ditolak') {
            defaultColor = 'text-rose-600 bg-rose-50';
        } else if (status === 'Tertunda' || status === 'Pending') {
            defaultColor = 'text-amber-700 bg-amber-50';
        } else if (status === 'Terverifikasi' || status === 'Proses') {
            defaultColor = 'text-blue-600 bg-blue-50';
        }
        const finalColor = status_color || defaultColor;

        const sql = `
            INSERT INTO activity_logs (
                user_name, action, detail, status, siswa, aktivitas, program, status_color, created_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, NOW()
            )
        `;

        await db.query(sql, [
            finalPelaku,
            finalAktivitas,
            finalDetail,
            status,
            finalPelaku,
            finalAktivitas,
            program || '-',
            finalColor
        ]);
    } catch (err) {
        // Safe fail-catch: Hanya log ke console, jangan re-throw error
        console.error('[ACTIVITY_LOGGER WARNING] Gagal menyimpan log aktivitas:', err.message || err);
    }
}

module.exports = {
    createActivityLog,
    logActivity: createActivityLog
};
