const db = require('../config/db');
const supabase = require('../config/supabase');
const { resolveStudentUnit } = require('../utils/helpers');

/**
 * Standardisasi unit ke kunci group matrix
 */
function mapToGroupKey(unitName = '') {
    const u = (unitName || '').toLowerCase();
    if (u.includes('tk')) return 'TK Ar-Rasyiid';
    if (u.includes('bimbel')) return 'Bimbel';
    if (u.includes('calistung')) return 'Calistung';
    if (u.includes('arabin')) return 'Arabin';
    return 'KBEC Reguler';
}

/**
 * 1. GET /api/reports/attendance-recap
 */
async function getAttendanceRecap(req, res, next) {
    try {
        let { bulan, minggu, unit } = req.query;

        if (!bulan || !/^\d{4}-\d{2}$/.test(bulan.trim())) {
            bulan = new Date().toISOString().slice(0, 7);
        } else {
            bulan = bulan.trim();
        }

        const weekNum = parseInt(minggu, 10) || 1;
        const validWeek = (weekNum >= 1 && weekNum <= 4) ? weekNum : 1;
        const filterUnit = (unit && unit.trim() !== '' && unit.trim() !== 'Semua') ? unit.trim().toLowerCase() : null;

        const [yearStr, monthStr] = bulan.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const daysInMonth = new Date(year, month, 0).getDate();

        const cutoffM1 = `${bulan}-07`;
        const cutoffM2 = `${bulan}-14`;
        const cutoffM3 = `${bulan}-21`;
        const cutoffM4 = `${bulan}-${String(daysInMonth).padStart(2, '0')}`;

        let weekStartDay = 1;
        let weekEndDay = 7;
        if (validWeek === 2) { weekStartDay = 8; weekEndDay = 14; }
        else if (validWeek === 3) { weekStartDay = 15; weekEndDay = 21; }
        else if (validWeek === 4) { weekStartDay = 22; weekEndDay = daysInMonth; }

        const weekStartDateStr = `${bulan}-${String(weekStartDay).padStart(2, '0')}`;
        const weekEndDateStr = `${bulan}-${String(weekEndDay).padStart(2, '0')}`;

        let students = [];
        try {
            const [rows] = await db.query(`
                SELECT id, nama, program, level, unit, status, created_at
                FROM students
                WHERE (status IS NULL OR status ILIKE 'Aktif' OR status = '')
                ORDER BY nama ASC
            `);
            students = rows || [];
        } catch (e) {
            console.error('Error fetching students:', e.message);
        }

        let classes = [];
        try {
            const [cRows] = await db.query(`
                SELECT c.id, c.nama, c.program, c.pengajar, c.teacher_id, t.nama AS teacher_name_ref
                FROM classes c
                LEFT JOIN teachers t ON c.teacher_id = t.id
                ORDER BY c.nama ASC
            `);
            classes = cRows || [];
        } catch (e) {
            console.error('Error fetching classes:', e.message);
        }

        let classStudentRows = [];
        try {
            const [csRows] = await db.query(`
                SELECT cs.class_id, cs.student_id, s.nama AS student_name, s.program, s.level, s.unit, s.status
                FROM class_students cs
                JOIN students s ON cs.student_id = s.id
                WHERE (s.status IS NULL OR s.status ILIKE 'Aktif' OR s.status = '')
            `);
            classStudentRows = csRows || [];
        } catch (e) {
            console.error('Error fetching class_students:', e.message);
        }

        let filteredStudents = students;
        if (filterUnit) {
            filteredStudents = students.filter(s => {
                const u = (s.unit || resolveStudentUnit(s.id, s.program, s.level)).toLowerCase();
                const p = (s.program || '').toLowerCase();
                const l = (s.level || '').toLowerCase();
                return u.includes(filterUnit) || p.includes(filterUnit) || l.includes(filterUnit);
            });
        }

        const studentMap = {};
        filteredStudents.forEach(s => {
            const sid = String(s.id).toLowerCase();
            const resolvedUnit = s.unit || resolveStudentUnit(s.id, s.program, s.level);
            
            let createdDate = null;
            if (s.created_at) {
                try {
                    createdDate = new Date(s.created_at).toISOString().slice(0, 10);
                } catch (e) {
                    createdDate = null;
                }
            }

            studentMap[sid] = {
                id: s.id,
                nama: s.nama,
                unit: resolvedUnit,
                program: s.program || s.level || 'KBEC',
                createdDate: createdDate,
                recordsWeek: []
            };
        });

        let attRows = [];
        try {
            const [aRows] = await db.query(`
                SELECT student_id, LOWER(TRIM(status)) AS status, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl, kelas
                FROM attendance
                WHERE TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') >= ? AND TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') <= ?
            `, [weekStartDateStr, weekEndDateStr]);
            attRows = aRows || [];
        } catch (e) {
            console.error('Error fetching attendance:', e.message);
        }

        attRows.forEach(r => {
            const sid = String(r.student_id || '').toLowerCase();
            if (studentMap[sid]) {
                studentMap[sid].recordsWeek.push(r);
            }
        });

        let gradeRows = [];
        try {
            const [gRows] = await db.query(`
                SELECT student_id, LOWER(TRIM(presensi)) AS status, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl, class_name AS kelas
                FROM student_grades
                WHERE TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') >= ? AND TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') <= ?
            `, [weekStartDateStr, weekEndDateStr]);
            gradeRows = gRows || [];
        } catch (e) {
            console.error('Error fetching student_grades:', e.message);
        }

        gradeRows.forEach(r => {
            const sid = String(r.student_id || '').toLowerCase();
            if (studentMap[sid]) {
                studentMap[sid].recordsWeek.push({ student_id: r.student_id, status: r.status, tgl: r.tgl, kelas: r.kelas });
            }
        });

        const unitGroups = {
            'TK Ar-Rasyiid': { unit: 'TK Ar-Rasyiid', total_siswa: 0, m1: 0, m2: 0, m3: 0, m4: 0, total_keseluruhan: 0 },
            'KBEC Reguler': { unit: 'KBEC Reguler', total_siswa: 0, m1: 0, m2: 0, m3: 0, m4: 0, total_keseluruhan: 0 },
            'Bimbel': { unit: 'Bimbel', total_siswa: 0, m1: 0, m2: 0, m3: 0, m4: 0, total_keseluruhan: 0 },
            'Calistung': { unit: 'Calistung', total_siswa: 0, m1: 0, m2: 0, m3: 0, m4: 0, total_keseluruhan: 0 },
            'Arabin': { unit: 'Arabin (Beasiswa)', total_siswa: 0, m1: 0, m2: 0, m3: 0, m4: 0, total_keseluruhan: 0 }
        };

        let weekHadir = 0;
        let weekIjin = 0;
        let weekAlfa = 0;
        let weekSakit = 0;

        Object.values(studentMap).forEach(s => {
            const grpKey = mapToGroupKey(s.unit);
            if (!unitGroups[grpKey]) return;

            unitGroups[grpKey].total_siswa += 1;

            const cDate = s.createdDate;
            const isEnrolledM1 = !cDate || cDate <= cutoffM1;
            const isEnrolledM2 = !cDate || cDate <= cutoffM2;
            const isEnrolledM3 = !cDate || cDate <= cutoffM3;
            const isEnrolledM4 = !cDate || cDate <= cutoffM4;

            if (isEnrolledM1) unitGroups[grpKey].m1 += 1;
            if (isEnrolledM2) unitGroups[grpKey].m2 += 1;
            if (isEnrolledM3) unitGroups[grpKey].m3 += 1;
            if (isEnrolledM4) unitGroups[grpKey].m4 += 1;

            unitGroups[grpKey].total_keseluruhan = unitGroups[grpKey].m4;

            const dateMapWeek = {};
            s.recordsWeek.forEach(rec => {
                if (rec.tgl && !dateMapWeek[rec.tgl]) {
                    dateMapWeek[rec.tgl] = rec.status;
                }
            });

            Object.values(dateMapWeek).forEach(st => {
                if (st.includes('hadir') || st === 'h') {
                    weekHadir++;
                } else if (st.includes('ijin') || st.includes('izin') || st === 'i') {
                    weekIjin++;
                } else if (st.includes('alfa') || st.includes('alpha') || st === 'a') {
                    weekAlfa++;
                } else if (st.includes('sakit') || st === 's') {
                    weekSakit++;
                } else {
                    weekAlfa++;
                }
            });
        });

        const classMap = {};
        classes.forEach(c => {
            const cid = String(c.id);
            const teacherName = c.teacher_name_ref || c.pengajar || 'Pengajar KBEC';
            const unitName = resolveStudentUnit('', c.program, c.program, c.program);
            
            if (filterUnit) {
                const uLower = unitName.toLowerCase();
                const pLower = (c.program || '').toLowerCase();
                if (!uLower.includes(filterUnit) && !pLower.includes(filterUnit)) return;
            }

            classMap[cid] = {
                class_id: c.id,
                nama_kelas: c.nama || 'Kelas KBEC',
                nama_guru: teacherName,
                unit: unitName,
                program: c.program || 'KBEC',
                total_hadir: 0,
                total_ijin: 0,
                total_alfa: 0,
                total_sakit: 0,
                total_siswa: 0
            };
        });

        classStudentRows.forEach(cs => {
            const cid = String(cs.class_id);
            if (classMap[cid]) {
                classMap[cid].total_siswa += 1;
            }
        });

        Object.values(studentMap).forEach(s => {
            s.recordsWeek.forEach(rec => {
                let targetCid = Object.keys(classMap).find(cid => {
                    const cObj = classMap[cid];
                    return (rec.kelas && cObj.nama_kelas.toLowerCase() === rec.kelas.toLowerCase());
                });

                if (!targetCid) {
                    const csMatch = classStudentRows.find(cs => String(cs.student_id).toLowerCase() === s.id.toLowerCase());
                    if (csMatch && classMap[String(csMatch.class_id)]) {
                        targetCid = String(csMatch.class_id);
                    }
                }

                if (targetCid && classMap[targetCid]) {
                    const st = rec.status || '';
                    if (st.includes('hadir') || st === 'h') {
                        classMap[targetCid].total_hadir += 1;
                    } else if (st.includes('ijin') || st.includes('izin') || st === 'i') {
                        classMap[targetCid].total_ijin += 1;
                    } else if (st.includes('alfa') || st.includes('alpha') || st === 'a') {
                        classMap[targetCid].total_alfa += 1;
                    } else if (st.includes('sakit') || st === 's') {
                        classMap[targetCid].total_sakit += 1;
                    }
                }
            });
        });

        const classDetails = Object.values(classMap).map(c => {
            const totalSesiClass = c.total_hadir + c.total_ijin + c.total_alfa + c.total_sakit;
            const pct = totalSesiClass > 0 ? parseFloat(((c.total_hadir / totalSesiClass) * 100).toFixed(1)) : 0;
            return {
                ...c,
                total_sesi: totalSesiClass,
                persentase: pct
            };
        });

        const totalSiswa = filteredStudents.length;
        const totalTidakHadir = weekIjin + weekAlfa + weekSakit;
        const totalSesiWeek = weekHadir + totalTidakHadir;
        const avgPersentase = totalSesiWeek > 0 ? parseFloat(((weekHadir / totalSesiWeek) * 100).toFixed(1)) : 0;

        const chartData = {
            hadir: {
                count: weekHadir,
                percentage: totalSesiWeek > 0 ? parseFloat(((weekHadir / totalSesiWeek) * 100).toFixed(1)) : 0
            },
            ijin: {
                count: weekIjin,
                percentage: totalSesiWeek > 0 ? parseFloat(((weekIjin / totalSesiWeek) * 100).toFixed(1)) : 0
            },
            alfa: {
                count: weekAlfa,
                percentage: totalSesiWeek > 0 ? parseFloat(((weekAlfa / totalSesiWeek) * 100).toFixed(1)) : 0
            },
            sakit: {
                count: weekSakit,
                percentage: totalSesiWeek > 0 ? parseFloat(((weekSakit / totalSesiWeek) * 100).toFixed(1)) : 0
            }
        };

        res.json({
            success: true,
            filter: {
                bulan,
                minggu: validWeek,
                unit: unit || 'Semua',
                start_date: weekStartDateStr,
                end_date: weekEndDateStr
            },
            summary: {
                total_siswa: totalSiswa,
                total_kehadiran: weekHadir,
                avg_persentase: avgPersentase,
                total_tidak_hadir: totalTidakHadir
            },
            unit_recap: Object.values(unitGroups),
            chart_data: chartData,
            class_details: classDetails
        });

    } catch (err) {
        next(err);
    }
}

/**
 * 2. GET /api/reports/student-performance (FAIL-SAFE & ISOLATED QUERY)
 * Queries performance_reports & student_grades safely.
 */
async function getStudentPerformanceReport(req, res, next) {
    try {
        console.log("FETCHING STUDENT PERFORMANCE REPORT...");
        const { startDate, endDate, unit, grade, search } = req.query;

        // 1. Ambil daftar siswa
        let students = [];
        try {
            let studentSql = `
                SELECT s.id, s.nama, s.program, s.level, s.unit, s.status, s.initial 
                FROM students s
            `;
            let studentWhere = [];
            let studentParams = [];

            studentWhere.push(`(s.status IS NULL OR s.status ILIKE 'Aktif' OR s.status = '')`);

            if (unit && unit !== 'Semua') {
                studentWhere.push(`(s.unit ILIKE ? OR s.program ILIKE ? OR s.level ILIKE ?)`);
                const uTerm = `%${unit.trim()}%`;
                studentParams.push(uTerm, uTerm, uTerm);
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

            const [sRows] = await db.query(studentSql, studentParams);
            students = sRows || [];
        } catch (e) {
            console.warn('Fallback query students via Supabase client:', e.message);
            if (supabase) {
                try {
                    const { data: sData } = await supabase.from('students').select('*');
                    if (sData) students = sData;
                } catch (sbErr) {
                    console.error('Supabase students query error:', sbErr.message);
                }
            }
        }

        // 2. Ambil data dari performance_reports
        let perfReports = [];
        try {
            const [pRows] = await db.query(`SELECT * FROM performance_reports`);
            perfReports = pRows || [];
        } catch (e) {
            if (supabase) {
                try {
                    const { data: pData } = await supabase.from('performance_reports').select('*');
                    if (pData) perfReports = pData;
                } catch (sbErr) {
                    console.warn('performance_reports table not found or empty:', sbErr.message);
                }
            }
        }

        // 3. Ambil data dari student_grades
        let gradeRows = [];
        try {
            let gradeSql = `
                SELECT student_id, grade, lesson, material_tambahan, notes, keterangan, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl, presensi
                FROM student_grades
            `;
            let gradeWhere = [];
            let gradeParams = [];

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
            gradeSql += ` ORDER BY tanggal DESC`;

            const [gRows] = await db.query(gradeSql, gradeParams);
            gradeRows = gRows || [];
        } catch (e) {
            console.warn('student_grades fallback:', e.message);
        }

        // 4. Ambil data absensi harian dari attendance
        let attRows = [];
        try {
            let attSql = `SELECT student_id, LOWER(TRIM(status)) AS status, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl FROM attendance`;
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
            const [aRows] = await db.query(attSql, attParams);
            attRows = aRows || [];
        } catch (e) {
            console.warn('attendance fallback:', e.message);
        }

        // 5. Mapping data laporan kinerja per siswa (FAIL-SAFE)
        const report = students.map((std, idx) => {
            const sidStr = String(std.id || '').toLowerCase();

            const stdPerf = perfReports.find(p => String(p.student_id || p.nis || p.id || '').toLowerCase() === sidStr) || {};
            const stdGrades = gradeRows.filter(g => String(g.student_id || '').toLowerCase() === sidStr);
            const stdAtts = attRows.filter(a => String(a.student_id || '').toLowerCase() === sidStr);

            const latestGrade = stdGrades.length > 0 ? stdGrades[0] : {};

            const dateMap = {};
            stdAtts.forEach(a => { if (a.tgl) dateMap[a.tgl] = a.status; });
            stdGrades.forEach(g => { if (g.tgl && !dateMap[g.tgl]) dateMap[g.tgl] = (g.presensi || '').toLowerCase(); });

            let hadirCount = 0;
            const totalSesi = Object.keys(dateMap).length;
            Object.values(dateMap).forEach(st => {
                if (st.includes('hadir') || st === 'h') hadirCount++;
            });

            const pct = totalSesi > 0 ? parseFloat(((hadirCount / totalSesi) * 100).toFixed(1)) : 0;
            const unitName = std.unit || resolveStudentUnit(std.id, std.program, std.level);

            const gradeVal = stdPerf.grade || latestGrade.grade || std.level || std.program || '-';
            const lessonVal = stdPerf.lesson || stdPerf.materi || latestGrade.lesson || '-';
            const materiTambahanVal = stdPerf.materi_tambahan || stdPerf.material_tambahan || latestGrade.material_tambahan || '-';
            const catatanVal = stdPerf.catatan || stdPerf.keterangan || latestGrade.keterangan || latestGrade.notes || '-';
            const keteranganVal = stdPerf.keterangan || latestGrade.keterangan || 'Aktif';

            return {
                no: idx + 1,
                id: std.id,
                nis: std.id,
                nama: std.nama || 'Siswa KBEC',
                unit: unitName,
                program: std.program || std.level || 'KBEC',
                grade: gradeVal,
                lesson: lessonVal,
                total_hadir: hadirCount,
                total_sesi: totalSesi,
                kehadiran: `${pct}%`,
                persentase: pct,
                materi_tambahan: materiTambahanVal,
                catatan: catatanVal,
                keterangan: keteranganVal
            };
        });

        let finalReport = report;
        if (grade && grade.trim() !== '' && grade.trim() !== 'Semua') {
            const gTerm = grade.trim().toLowerCase();
            finalReport = report.filter(r => 
                (r.grade && r.grade.toLowerCase().includes(gTerm)) ||
                (r.program && r.program.toLowerCase().includes(gTerm))
            );
        }

        // Kembalikan struktur JSON serba-kompatibel (data & report)
        res.json({
            success: true,
            data: finalReport,
            report: finalReport
        });

    } catch (err) {
        console.error('Critical Error in getStudentPerformanceReport:', err);
        // Fail-safe response tanpa melempar HTTP 500 jika terjadi kesalahan tak terduga
        res.json({
            success: true,
            data: [],
            report: [],
            message: 'Data kinerja siswa belum tersedia.'
        });
    }
}

module.exports = {
    getAttendanceRecap,
    getStudentPerformanceReport
};
