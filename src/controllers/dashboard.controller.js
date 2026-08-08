const db = require('../config/db');

async function getStats(req, res, next) {
    try {
        const { growthPeriod, month, year } = req.query;

        const [[counts]] = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM students) AS total_students,
                (SELECT COUNT(*) FROM students WHERE status = 'Aktif') AS active_students,
                (SELECT COUNT(*) FROM teachers) AS total_teachers,
                (SELECT COUNT(*) FROM classes) AS total_classes,
                (SELECT COUNT(*) FROM programs) AS total_programs,
                (SELECT COUNT(*) FROM class_students) AS class_students_count,
                (SELECT COUNT(*) FROM payments) AS total_transactions
        `);
        const totalStudents = counts.total_students;
        const activeStudents = counts.active_students;
        const totalTeachers = counts.total_teachers;
        const totalClasses = counts.total_classes;
        const totalPrograms = counts.total_programs;

        const reqMonth = req.query.month || req.query.bulan || req.query.filterMonth;
        const reqYear = req.query.year || req.query.tahun || new Date().getFullYear();

        const now = new Date();
        const currentYear = parseInt(reqYear, 10) || now.getFullYear();
        const fullMonthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

        let filterMonth = null; // null means 'semua'
        if (reqMonth === 'current' || (!reqMonth && growthPeriod !== 'semua' && growthPeriod !== '3bulan' && growthPeriod !== '6bulan')) {
            filterMonth = now.getMonth() + 1;
        } else if (reqMonth && reqMonth !== 'semua' && reqMonth !== 'all' && reqMonth !== 'null' && reqMonth !== 'undefined') {
            const parsedM = parseInt(reqMonth, 10);
            if (!isNaN(parsedM) && parsedM >= 1 && parsedM <= 12) {
                filterMonth = parsedM;
            }
        }

        let totalRevenue = 0;
        let todayPayments = 0;
        let pendingPaymentsCount = 0;
        let revenueByProgram = [];

        const todayStr = now.toISOString().split('T')[0];

        if (filterMonth !== null) {
            const mStr = String(filterMonth).padStart(2, '0');
            const mName = fullMonthNames[filterMonth - 1];
            const targetYM = `${currentYear}-${mStr}`;

            const [[{ sum: revSum }]] = await db.query(
                `SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments 
                 WHERE status = 'Lunas' 
                   AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM') = ?`,
                [targetYM]
            );
            totalRevenue = revSum;

            const [[{ sum: todaySum }]] = await db.query(
                `SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments 
                 WHERE status = 'Lunas' 
                   AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM-DD') = ?`,
                [todayStr]
            );
            todayPayments = todaySum;

            const [revProg] = await db.query(
                `SELECT program, SUM(jumlah) AS total FROM payments 
                 WHERE status = 'Lunas' 
                   AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM') = ?
                 GROUP BY program`,
                [targetYM]
            );
            revenueByProgram = revProg;
        } else {
            const [[{ sum: revSum }]] = await db.query('SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments WHERE status = \'Lunas\'');
            totalRevenue = revSum;

            const [[{ sum: todaySum }]] = await db.query(
                `SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments 
                 WHERE status = 'Lunas' 
                   AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM-DD') = ?`,
                [todayStr]
            );
            todayPayments = todaySum;

            const [revProg] = await db.query('SELECT program, SUM(jumlah) AS total FROM payments WHERE status = \'Lunas\' GROUP BY program');
            revenueByProgram = revProg;
        }

        if (filterMonth === null) {
            const [[{ count: pendingCount }]] = await db.query(`
                SELECT COUNT(*) AS count 
                FROM bills b
                WHERE (b.status = 'Tertagih' OR b.status = 'Tunggakan' OR b.status = 'Partial' OR b.status = 'Ada Tunggakan' OR b.status != 'Lunas')
                  AND (b.nominal - COALESCE(b.terbayar, 0)) > 0
            `);
            pendingPaymentsCount = parseInt(pendingCount || 0, 10);
        } else {
            const mStr = String(filterMonth).padStart(2, '0');
            const targetYM = `${currentYear}-${mStr}`;
            const [[{ count: pendingCount }]] = await db.query(`
                SELECT COUNT(DISTINCT COALESCE(s.id, b.student_id, b.nama)) AS count 
                FROM students s
                JOIN bills b ON (b.student_id = s.id OR (b.nama IS NOT NULL AND LOWER(TRIM(b.nama)) = LOWER(TRIM(s.nama))))
                WHERE (s.status IS NULL OR s.status ILIKE 'Aktif' OR s.status = '')
                  AND (b.status = 'Tertagih' OR b.status = 'Tunggakan' OR b.status = 'Partial' OR b.status = 'Ada Tunggakan' OR b.status != 'Lunas')
                  AND (b.nominal - COALESCE(b.terbayar, 0)) > 0
                  AND (
                      b.bulan_tagihan <= ? 
                      OR (
                          (b.bulan_tagihan IS NULL OR b.bulan_tagihan = '') 
                          AND TO_CHAR(COALESCE(b.created_at::timestamp, b.jatuh_tempo::timestamp), 'YYYY-MM') <= ?
                      )
                  )
            `, [targetYM, targetYM]);
            pendingPaymentsCount = parseInt(pendingCount || 0, 10);
        }

        const classStudentsCount = counts.class_students_count;
        let attendanceRate = 0;
        let todayHadir = 0;
        let todayTotal = parseInt(classStudentsCount || 0, 10);
        
        const [[{ count: hadirCount }]] = await db.query(
            "SELECT COUNT(*) AS count FROM attendance WHERE LOWER(status) = 'hadir' AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM-DD') = ?",
            [todayStr]
        );
        todayHadir = parseInt(hadirCount || 0, 10);
        if (todayTotal > 0) {
            attendanceRate = Math.round((todayHadir / todayTotal) * 100);
        }

        let monthlyGrowth = { labels: [], data: [], title: 'Data Pertumbuhan Siswa' };
        
        let effectiveGrowthMonth = filterMonth;
        if (growthPeriod && growthPeriod !== 'semua' && growthPeriod !== '3bulan' && growthPeriod !== '6bulan') {
            effectiveGrowthMonth = now.getMonth() + 1;
        }

        if (!isNaN(effectiveGrowthMonth) && effectiveGrowthMonth >= 1 && effectiveGrowthMonth <= 12) {
            const [weeklyCounts] = await db.query(`
                SELECT 
                    EXTRACT(DAY FROM COALESCE(created_at, CURRENT_TIMESTAMP)) AS d,
                    COUNT(*) AS cnt
                FROM students
                WHERE EXTRACT(MONTH FROM COALESCE(created_at, CURRENT_TIMESTAMP)) = ?
                GROUP BY d
            `, [effectiveGrowthMonth]);

            let w1 = 0, w2 = 0, w3 = 0, w4 = 0;
            weeklyCounts.forEach(r => {
                const day = parseInt(r.d, 10);
                const count = parseInt(r.cnt, 10);
                if (day >= 1 && day <= 7) w1 += count;
                else if (day >= 8 && day <= 14) w2 += count;
                else if (day >= 15 && day <= 21) w3 += count;
                else if (day >= 22 && day <= 31) w4 += count;
            });

            monthlyGrowth = {
                labels: ['Minggu 1 (Tgl 1-7)', 'Minggu 2 (Tgl 8-14)', 'Minggu 3 (Tgl 15-21)', 'Minggu 4 (Tgl 22-31)'],
                data: [w1, w2, w3, w4],
                title: `Pendaftaran Siswa (${fullMonthNames[effectiveGrowthMonth - 1]})`
            };
        } else {
            const [monthlyCounts] = await db.query(`
                SELECT 
                    EXTRACT(MONTH FROM COALESCE(created_at, CURRENT_TIMESTAMP)) AS m, 
                    COUNT(*) AS cnt 
                FROM students 
                GROUP BY m
            `);

            const countByMonth = {};
            monthlyCounts.forEach(r => {
                countByMonth[parseInt(r.m, 10)] = parseInt(r.cnt, 10);
            });

            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            const currentMonth = now.getMonth() + 1;

            let growthLabels = [];
            let growthData = [];
            let runningTotal = 0;

            const maxMonth = Math.max(currentMonth, 6);
            for (let m = 1; m <= maxMonth; m++) {
                growthLabels.push(monthNames[m - 1]);
                runningTotal += (countByMonth[m] || 0);
                growthData.push(runningTotal);
            }

            if (growthPeriod === '6bulan') {
                growthLabels = growthLabels.slice(-6);
                growthData = growthData.slice(-6);
            } else if (growthPeriod === '3bulan') {
                growthLabels = growthLabels.slice(-3);
                growthData = growthData.slice(-3);
            }

            monthlyGrowth = {
                labels: growthLabels,
                data: growthData,
                title: 'Data Pendaftaran Siswa'
            };
        }

        const totalTransactions = counts.total_transactions;

        res.json({
            selectedMonth: filterMonth,
            monthName: filterMonth ? fullMonthNames[filterMonth - 1] : 'Semua Bulan',
            totalStudents: Number(totalStudents || 0),
            activeStudents: Number(activeStudents || 0),
            totalTeachers: Number(totalTeachers || 0),
            totalClasses: Number(totalClasses || 0),
            totalPrograms: Number(totalPrograms || 0),
            totalRevenue: Number(totalRevenue || 0),
            todayPayments: Number(todayPayments || 0),
            pendingPaymentsCount: Number(pendingPaymentsCount || 0),
            totalTransactions: Number(totalTransactions || 0),
            attendanceRate,
            todayHadir: Number(todayHadir || 0),
            todayTotal: Number(todayTotal || 0),
            revenueByProgram,
            monthlyGrowth
        });
    } catch (err) {
        next(err);
    }
}

async function getActivities(req, res, next) {
    try {
        const [rows] = await db.query(`
            SELECT 
                id,
                COALESCE(siswa, user_name, 'System') AS pelaku,
                COALESCE(siswa, user_name, 'System') AS siswa,
                COALESCE(aktivitas, action, 'Aktivitas System') AS aktivitas,
                COALESCE(program, '-') AS program,
                COALESCE(status, 'Berhasil') AS status,
                COALESCE(status_color, 'text-emerald-600 bg-emerald-50') AS "statusColor",
                COALESCE(TO_CHAR(created_at::timestamp, 'DD Mon HH24:MI'), '-') AS waktu,
                created_at
            FROM activity_logs
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 50
        `);
        res.json(rows || []);
    } catch (err) {
        console.error('[ACTIVITIES ALIAS ERROR]:', err.message || err);
        res.json([]);
    }
}

module.exports = {
    getStats,
    getActivities
};
