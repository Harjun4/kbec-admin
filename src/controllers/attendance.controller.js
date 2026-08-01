const db = require('../config/db');
const { resolveStudentUnit } = require('../utils/helpers');

function getAllDaysInMonth(yearMonthStr) {
    const parts = (yearMonthStr || new Date().toISOString().slice(0, 7)).split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const totalDays = new Date(year, month, 0).getDate();
    const dates = [];
    for (let day = 1; day <= totalDays; day++) {
        const dayStr = String(day).padStart(2, '0');
        const monthStr = String(month).padStart(2, '0');
        dates.push(`${year}-${monthStr}-${dayStr}`);
    }
    return dates;
}

async function getAttendance(req, res, next) {
    const { tanggal, kelas, class_id } = req.query;
    const finalDate = tanggal || new Date().toISOString().slice(0, 10);
    
    try {
        let className = kelas;
        if (class_id && !className) {
            const [[cRow]] = await db.query('SELECT nama FROM classes WHERE id = ?', [class_id]);
            if (cRow) className = cRow.nama;
        }

        let studentQuery = 'SELECT s.id, s.nama, s.program, s.initial FROM students s';
        let studentParams = [];
        if (class_id) {
            studentQuery += ' JOIN class_students cs ON s.id = cs.student_id WHERE cs.class_id = ?';
            studentParams.push(class_id);
        } else if (className) {
            studentQuery += ' JOIN classes c ON c.nama = ? JOIN class_students cs ON c.id = cs.class_id WHERE s.id = cs.student_id';
            studentParams.push(className);
        }

        let [students] = await db.query(studentQuery, studentParams);

        if (students.length === 0 && !class_id && !className) {
            [students] = await db.query('SELECT id, nama, program, initial FROM students LIMIT 50');
        }

        let attQuery = "SELECT student_id, status FROM attendance WHERE tanggal::text = ?";
        let attParams = [finalDate];
        if (className) {
            attQuery += " AND kelas = ?";
            attParams.push(className);
        }
        const [attRows] = await db.query(attQuery, attParams);
        const attMap = {};
        attRows.forEach(a => attMap[String(a.student_id)] = a.status);

        const result = students.map(s => ({
            id: s.id,
            student_id: s.id,
            nama: s.nama,
            program: s.program || 'Reguler',
            kelas: className || 'Reguler',
            status: attMap[String(s.id)] || '-',
            inisial: s.initial || 'S',
            tanggal: finalDate
        }));

        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function getMonthlyAttendance(req, res, next) {
    const { kelas, class_id, bulan } = req.query;
    const targetBulan = bulan || new Date().toISOString().slice(0, 7);

    try {
        let className = kelas;
        if (class_id && !className) {
            const [[cRow]] = await db.query('SELECT nama FROM classes WHERE id = ?', [class_id]);
            if (cRow) className = cRow.nama;
        }

        let studentQuery = 'SELECT s.id, s.nama, s.program, s.initial FROM students s';
        let studentParams = [];
        if (class_id) {
            studentQuery += ' JOIN class_students cs ON s.id = cs.student_id WHERE cs.class_id = ?';
            studentParams.push(class_id);
        } else if (className) {
            studentQuery += ' JOIN classes c ON c.nama = ? JOIN class_students cs ON c.id = cs.class_id WHERE s.id = cs.student_id';
            studentParams.push(className);
        }
        let [students] = await db.query(studentQuery, studentParams);

        if (students.length === 0 && !class_id && !className) {
            [students] = await db.query('SELECT id, nama, program, initial FROM students LIMIT 50');
        }

        const dates = getAllDaysInMonth(targetBulan);

        const [attRows] = await db.query(
            "SELECT student_id, status, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl FROM attendance WHERE tanggal::text LIKE ?",
            [`${targetBulan}-%`]
        );

        const matrix = students.map(s => {
            const sAtts = attRows.filter(a => String(a.student_id) === String(s.id));
            const attMap = {};
            sAtts.forEach(a => attMap[a.tgl] = a.status);
            return {
                id: s.id,
                nama: s.nama,
                attendance: attMap
            };
        });

        res.json({ dates, matrix });
    } catch (err) {
        next(err);
    }
}

async function saveAttendance(req, res, next) {
    let items = [];
    let targetDate = new Date().toISOString().slice(0, 10);
    let targetClass = null;

    if (Array.isArray(req.body)) {
        items = req.body;
        if (items.length > 0) {
            targetDate = items[0].tanggal || targetDate;
            targetClass = items[0].kelas || targetClass;
        }
    } else if (req.body && Array.isArray(req.body.list)) {
        items = req.body.list;
        targetDate = req.body.tanggal || targetDate;
        targetClass = req.body.kelas || targetClass;
    }

    if (items.length === 0) {
        return res.status(400).json({ success: false, message: 'Tidak ada data presensi yang dikirim.' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [[maxRow]] = await conn.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM attendance');
        let currentId = parseInt(maxRow ? (maxRow.max_id || 0) : 0, 10);

        for (let item of items) {
            const sId = item.student_id || item.id;
            if (!sId) continue;

            const sStatus = item.status || '-';
            const sDate = item.tanggal || targetDate;
            const sClass = item.kelas || targetClass || 'Reguler';

            if (sStatus === '-' || sStatus === 'Kosong') {
                await conn.query('DELETE FROM attendance WHERE student_id = ? AND tanggal::text = ?', [String(sId), String(sDate)]);
                continue;
            }

            const [[stdRow]] = await conn.query('SELECT nama, program FROM students WHERE id = ?', [String(sId)]);
            const sName = stdRow ? stdRow.nama : (item.nama || 'Siswa');
            const sProgram = (stdRow && stdRow.program) ? stdRow.program : null;

            const [existing] = await conn.query('SELECT id FROM attendance WHERE student_id = ? AND tanggal::text = ?', [String(sId), String(sDate)]);
            if (existing.length > 0) {
                await conn.query('UPDATE attendance SET status = ?, kelas = ?, nama = ?, program = ? WHERE id = ?', [sStatus, sClass, sName, sProgram, existing[0].id]);
            } else {
                currentId++;
                await conn.query(
                    'INSERT INTO attendance (id, student_id, nama, program, kelas, status, inisial, tanggal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [currentId, String(sId), sName, sProgram, sClass, sStatus, 'S', sDate]
                );
            }

            // Sync presence status into student_grades if record exists for this date
            await conn.query('UPDATE student_grades SET presensi = ? WHERE student_id = ? AND tanggal::text = ?', [sStatus, String(sId), String(sDate)]);
        }

        await conn.commit();
        res.json({ success: true, message: 'Presensi berhasil disimpan.' });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
}

async function getStudentGrades(req, res, next) {
    const { student_id, class_id, tanggal } = req.query;
    try {
        let query = "SELECT id, student_id, student_name, nama_panggilan, class_id, class_name, grade, lesson, material_tambahan, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tanggal, presensi, sb_page, wb_page, notes, keterangan FROM student_grades";
        let params = [];
        if (student_id) {
            query += ' WHERE student_id = ?';
            params.push(student_id);
        } else if (class_id) {
            query += ' WHERE class_id = ?';
            params.push(class_id);
        }
        if (tanggal) {
            query += (params.length > 0 ? ' AND' : ' WHERE') + ' tanggal::text = ?';
            params.push(tanggal);
        }
        query += ' ORDER BY id DESC LIMIT 100';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

async function saveStudentGrade(req, res, next) {
    const { student_id, student_name, nama_panggilan, class_id, class_name, grade, lesson, material_tambahan, tanggal, presensi, sb_page, wb_page, notes, keterangan } = req.body;
    if (!student_id || !student_name) {
        return res.status(400).json({ success: false, message: 'ID dan Nama Siswa wajib diisi.' });
    }
    const finalDate = tanggal || new Date().toISOString().slice(0, 10);
    const finalNick = nama_panggilan || student_name.split(' ')[0];

    try {
        let finalPresensi = presensi;
        if (!finalPresensi) {
            const [attRows] = await db.query('SELECT status FROM attendance WHERE student_id = ? AND tanggal::text = ?', [student_id, finalDate]);
            if (attRows.length > 0 && attRows[0].status && attRows[0].status !== '-') {
                finalPresensi = attRows[0].status;
            } else {
                finalPresensi = 'HADIR';
            }
        }

        const [existing] = await db.query('SELECT id FROM student_grades WHERE student_id = ? AND tanggal::text = ?', [student_id, finalDate]);
        if (existing.length > 0) {
            await db.query(
                'UPDATE student_grades SET nama_panggilan = ?, class_id = ?, class_name = ?, grade = ?, lesson = ?, material_tambahan = ?, presensi = ?, sb_page = ?, wb_page = ?, notes = ?, keterangan = ? WHERE id = ?',
                [finalNick, class_id || null, class_name || '-', grade || '1A', lesson || '', material_tambahan || '', finalPresensi, sb_page || '', wb_page || '', notes || '', keterangan || '', existing[0].id]
            );
        } else {
            await db.query(
                'INSERT INTO student_grades (student_id, student_name, nama_panggilan, class_id, class_name, grade, lesson, material_tambahan, tanggal, presensi, sb_page, wb_page, notes, keterangan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [student_id, student_name, finalNick, class_id || null, class_name || '-', grade || '1A', lesson || '', material_tambahan || '', finalDate, finalPresensi, sb_page || '', wb_page || '', notes || '', keterangan || '']
            );
        }

        // Synchronize presensi to attendance table
        if (finalPresensi && finalPresensi !== '-') {
            const [existingAtt] = await db.query('SELECT id FROM attendance WHERE student_id = ? AND tanggal::text = ?', [student_id, finalDate]);
            if (existingAtt.length > 0) {
                await db.query('UPDATE attendance SET status = ?, kelas = ? WHERE id = ?', [finalPresensi, class_name || 'Reguler', existingAtt[0].id]);
            } else {
                const [[maxRow]] = await db.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM attendance');
                let newId = parseInt(maxRow ? (maxRow.max_id || 0) : 0, 10) + 1;
                await db.query(
                    'INSERT INTO attendance (id, student_id, nama, program, kelas, status, inisial, tanggal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [newId, student_id, student_name, null, class_name || 'Reguler', finalPresensi, 'S', finalDate]
                );
            }
        }

        res.json({ success: true, message: 'Evaluasi kinerja siswa berhasil disimpan.' });
    } catch (err) {
        next(err);
    }
}

async function getPerformanceReport(req, res, next) {
    const { class_id, bulan } = req.query;
    const targetBulan = bulan || new Date().toISOString().slice(0, 7);
    try {
        let classObj = null;
        if (class_id) {
            const [[cRow]] = await db.query('SELECT * FROM classes WHERE id = ?', [class_id]);
            classObj = cRow;
        }

        let studentQuery = 'SELECT s.id, s.nama, s.program, s.level, s.initial FROM students s';
        let studentParams = [];
        if (class_id) {
            studentQuery += ' JOIN class_students cs ON s.id = cs.student_id WHERE cs.class_id = ?';
            studentParams.push(class_id);
        }
        let [students] = await db.query(studentQuery, studentParams);

        if (!classObj) {
            const [[firstClass]] = await db.query('SELECT * FROM classes ORDER BY id ASC LIMIT 1');
            if (firstClass) {
                classObj = firstClass;
            } else {
                classObj = { nama: 'Kelas KBEC', pengajar: 'Pengajar KBEC' };
            }
        }
        if (!classObj.pengajar || classObj.pengajar.trim() === '' || classObj.pengajar === '-') {
            classObj.pengajar = 'Pengajar KBEC';
        }
        if (!classObj.nama || classObj.nama.trim() === '' || classObj.nama === '-') {
            classObj.nama = 'Kelas KBEC';
        }

        const dates = getAllDaysInMonth(targetBulan);

        const [gradeRows] = await db.query(
            "SELECT student_id, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl, presensi, sb_page, wb_page, grade, lesson, material_tambahan, notes, keterangan FROM student_grades WHERE tanggal::text LIKE ?",
            [`${targetBulan}-%`]
        );
        const [attRows] = await db.query(
            "SELECT student_id, status, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl FROM attendance WHERE tanggal::text LIKE ?",
            [`${targetBulan}-%`]
        );

        const report = students.map((std, idx) => {
            const stdGrades = gradeRows.filter(g => String(g.student_id) === String(std.id));
            const stdAtts = attRows.filter(a => String(a.student_id) === String(std.id));

            let latestGrade = stdGrades.length > 0 ? stdGrades[stdGrades.length - 1] : {};
            let stdName = std.nama || 'Siswa KBEC';
            let nickName = stdName.split(' ')[0];

            let w1 = { h: 0, i: 0, s: 0, a: 0 };
            let w2 = { h: 0, i: 0, s: 0, a: 0 };
            let w3 = { h: 0, i: 0, s: 0, a: 0 };
            let w4 = { h: 0, i: 0, s: 0, a: 0 };
            let totalHadir = 0, totalIzin = 0, totalSakit = 0, totalAlpha = 0;

            let sessionMap = {};
            dates.forEach(d => {
                const gRec = stdGrades.find(g => g.tgl === d) || {};
                const aRec = stdAtts.find(a => a.tgl === d) || {};

                // Prioritize attendance table status if present, otherwise grade presensi
                const presenceStatus = (aRec.status && aRec.status !== '-') ? aRec.status : (gRec.presensi || '-');
                
                sessionMap[d] = {
                    presence: presenceStatus,
                    sb: gRec.sb_page || '-',
                    wb: gRec.wb_page || '-'
                };

                const dayNum = parseInt(d.split('-')[2], 10);
                const st = (presenceStatus || '').toUpperCase();

                let targetWeek = null;
                if (dayNum >= 1 && dayNum <= 7) targetWeek = w1;
                else if (dayNum >= 8 && dayNum <= 14) targetWeek = w2;
                else if (dayNum >= 15 && dayNum <= 21) targetWeek = w3;
                else if (dayNum >= 22 && dayNum <= 31) targetWeek = w4;

                if (st === 'HADIR' || st === 'H') {
                    if (targetWeek) targetWeek.h++;
                    totalHadir++;
                } else if (st === 'IZIN' || st === 'IJIN' || st === 'I') {
                    if (targetWeek) targetWeek.i++;
                    totalIzin++;
                } else if (st === 'SAKIT' || st === 'S') {
                    if (targetWeek) targetWeek.s++;
                    totalSakit++;
                } else if (st === 'ALPHA' || st === 'ALFA' || st === 'A') {
                    if (targetWeek) targetWeek.a++;
                    totalAlpha++;
                }
            });

            const unit = resolveStudentUnit(std.id, std.program, std.level);

            return {
                no: idx + 1,
                nis: std.id,
                nama: stdName,
                nama_panggilan: nickName,
                program: std.program || '-',
                level: std.level || '-',
                unit: unit,
                grade: latestGrade.grade || std.level || std.program || 'Beginner 1',
                lesson: latestGrade.lesson || 'Speaking, Reading, Telling Story',
                material_tambahan: latestGrade.material_tambahan || '-',
                sessions: sessionMap,
                weekly: { w1, w2, w3, w4 },
                totals: { hadir: totalHadir, izin: totalIzin, sakit: totalSakit, alpha: totalAlpha },
                keterangan: latestGrade.keterangan || latestGrade.notes || '-'
            };
        });

        res.json({
            class: classObj,
            bulan: targetBulan,
            dates,
            report
        });
    } catch (err) {
        next(err);
    }
}

async function getAttendanceReport(req, res, next) {
    try {
        const { startDate, endDate, search, status } = req.query;

        // Filter status: By default active students only, or filtered by query status
        let studentSql = `
            SELECT s.id, s.nama, s.program, s.level, s.unit, s.status, s.initial 
            FROM students s 
        `;
        let studentWhere = [];
        let studentParams = [];

        if (status && status !== 'Semua') {
            studentWhere.push(`s.status ILIKE ?`);
            studentParams.push(status.trim());
        } else {
            studentWhere.push(`(s.status IS NULL OR s.status ILIKE 'Aktif' OR s.status = '')`);
        }

        if (search && search.trim()) {
            studentWhere.push(`(s.id ILIKE ? OR s.nama ILIKE ? OR s.program ILIKE ? OR s.level ILIKE ?)`);
            const sTerm = `%${search.trim()}%`;
            studentParams.push(sTerm, sTerm, sTerm, sTerm);
        }

        if (studentWhere.length > 0) {
            studentSql += ` WHERE ${studentWhere.join(' AND ')}`;
        }

        studentSql += ` ORDER BY s.nama ASC`;

        const [students] = await db.query(studentSql, studentParams);

        // Fetch attendance records within date filter range
        let attSql = `SELECT student_id, LOWER(TRIM(status)) AS status, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl, kelas FROM attendance`;
        let attParams = [];
        let attWhere = [];

        if (startDate) {
            attWhere.push(`TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') >= ?`);
            attParams.push(startDate);
        }
        if (endDate) {
            attWhere.push(`TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') <= ?`);
            attParams.push(endDate);
        }

        if (attWhere.length > 0) {
            attSql += ` WHERE ${attWhere.join(' AND ')}`;
        }

        const [attRows] = await db.query(attSql, attParams);

        // Map attendance per student
        const attByStudent = {};
        attRows.forEach(r => {
            const sid = String(r.student_id || '').toLowerCase();
            if (!attByStudent[sid]) attByStudent[sid] = [];
            attByStudent[sid].push(r);
        });

        // Also check student_grades table
        let gradeSql = `SELECT student_id, LOWER(TRIM(presensi)) AS status, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl, class_name FROM student_grades`;
        let gradeParams = [];
        let gradeWhere = [];
        if (startDate) {
            gradeWhere.push(`TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') >= ?`);
            gradeParams.push(startDate);
        }
        if (endDate) {
            gradeWhere.push(`TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') <= ?`);
            gradeParams.push(endDate);
        }
        if (gradeWhere.length > 0) {
            gradeSql += ` WHERE ${gradeWhere.join(' AND ')}`;
        }
        const [gradeRows] = await db.query(gradeSql, gradeParams);

        gradeRows.forEach(r => {
            const sid = String(r.student_id || '').toLowerCase();
            if (!attByStudent[sid]) attByStudent[sid] = [];
            attByStudent[sid].push({
                student_id: r.student_id,
                status: r.status,
                tgl: r.tgl,
                kelas: r.class_name
            });
        });

        // Calculate attendance ratio per student
        const report = students.map(s => {
            const sid = String(s.id).toLowerCase();
            const records = attByStudent[sid] || [];

            // Deduplicate by date
            const dateMap = {};
            records.forEach(rec => {
                if (rec.tgl && !dateMap[rec.tgl]) {
                    dateMap[rec.tgl] = rec.status;
                }
            });

            const uniqueDates = Object.keys(dateMap);
            const totalRecordedSessions = uniqueDates.length;
            let hadirCount = 0;

            uniqueDates.forEach(d => {
                const st = dateMap[d] || '';
                if (st.includes('hadir') || st === 'h') {
                    hadirCount++;
                }
            });

            let ratioPercentStr = '-';
            let ratioPercentVal = 0;

            if (totalRecordedSessions > 0) {
                ratioPercentVal = Math.round((hadirCount / totalRecordedSessions) * 100);
                ratioPercentStr = `${ratioPercentVal}%`;
            }

            return {
                id: s.id,
                nama: s.nama,
                unit: s.unit || resolveStudentUnit(s.id, s.program, s.level),
                program: s.program || s.level || 'KBEC',
                level: s.level || s.program || '-',
                status: s.status || 'Aktif',
                total_sesi: totalRecordedSessions,
                total_hadir: hadirCount,
                rasio_presensi: ratioPercentStr,
                rasio_val: ratioPercentVal
            };
        });

        res.json({ success: true, report });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getAttendance,
    getMonthlyAttendance,
    saveAttendance,
    getStudentGrades,
    saveStudentGrade,
    getPerformanceReport,
    getAttendanceReport
};
