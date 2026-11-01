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

function normalizeClassName(str) {
    return String(str || '').replace(/&amp;amp;/gi, '&').replace(/&amp;/gi, '&').trim().toLowerCase();
}

function cleanClassDisplay(str) {
    return String(str || '').replace(/&amp;amp;/gi, '&').replace(/&amp;/gi, '&').trim();
}

/**
 * Helper terpadu: Menggabungkan dan mendeduplikasi presensi harian dari attendance dan student_grades
 * Kunci deduplikasi: student_id | tanggal (YYYY-MM-DD)
 */
function buildUnifiedStudentDateMap(attRows = [], gradeRows = []) {
    const studentAttMap = {};
    (attRows || []).forEach(a => {
        const sid = String(a.student_id || '').trim();
        const tgl = a.tgl || a.tanggal;
        if (!sid || !tgl) return;
        if (!studentAttMap[sid]) studentAttMap[sid] = {};
        studentAttMap[sid][tgl] = {
            status: String(a.status || '').toLowerCase().trim(),
            class: cleanClassDisplay(a.kelas || a.class_name || '')
        };
    });

    (gradeRows || []).forEach(g => {
        const sid = String(g.student_id || '').trim();
        const tgl = g.tgl || g.tanggal;
        if (!sid || !tgl) return;
        if (!studentAttMap[sid]) studentAttMap[sid] = {};
        if (!studentAttMap[sid][tgl]) {
            studentAttMap[sid][tgl] = {
                status: String(g.presensi || g.status || 'hadir').toLowerCase().trim(),
                class: cleanClassDisplay(g.class_name || g.kelas || '')
            };
        }
    });

    return studentAttMap;
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

        const isAllWeeks = String(minggu || '').toLowerCase() === 'all' || String(minggu || '').toLowerCase() === 'semua';
        const weekNum = parseInt(minggu, 10) || 1;
        const validWeek = isAllWeeks ? 'all' : ((weekNum >= 1 && weekNum <= 4) ? weekNum : 1);
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
        if (validWeek === 'all') { weekStartDay = 1; weekEndDay = daysInMonth; }
        else if (validWeek === 2) { weekStartDay = 8; weekEndDay = 14; }
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
                SELECT c.id, c.nama, c.program, c.unit, c.pengajar, c.teacher_id, t.nama AS teacher_name_ref
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
                const u = resolveStudentUnit(s.id, s.program, s.level, s.unit).toLowerCase();
                const p = (s.program || '').toLowerCase();
                const l = (s.level || '').toLowerCase();
                return u.includes(filterUnit) || p.includes(filterUnit) || l.includes(filterUnit);
            });
        }

        const studentMap = {};
        filteredStudents.forEach(s => {
            const sid = String(s.id).toLowerCase();
            const resolvedUnit = resolveStudentUnit(s.id, s.program, s.level, s.unit);
            
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
                program: cleanClassDisplay(s.program || s.level || 'KBEC'),
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

        // Deduplikasi presensi harian per sesi agar attendance dan student_grades tidak terhitung ganda
        const studentSessionMap = new Map();
        attRows.forEach(r => {
            const sid = String(r.student_id || '').toLowerCase();
            const key = `${sid}|${r.tgl}|${normalizeClassName(r.kelas)}`;
            if (!studentSessionMap.has(key)) {
                studentSessionMap.set(key, { student_id: sid, status: r.status, tgl: r.tgl, kelas: r.kelas });
            }
        });
        gradeRows.forEach(r => {
            const sid = String(r.student_id || '').toLowerCase();
            const key = `${sid}|${r.tgl}|${normalizeClassName(r.kelas)}`;
            if (!studentSessionMap.has(key)) {
                studentSessionMap.set(key, { student_id: sid, status: r.status, tgl: r.tgl, kelas: r.kelas });
            }
        });

        studentSessionMap.forEach(r => {
            if (studentMap[r.student_id]) {
                studentMap[r.student_id].recordsWeek.push(r);
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

        // Cari tanggal baseline data awal siswa (data hasil import/migrasi awal sistem)
        let minBaselineDate = '9999-99-99';
        filteredStudents.forEach(s => {
            if (s.created_at) {
                const d = new Date(s.created_at).toISOString().slice(0, 10);
                if (d < minBaselineDate) minBaselineDate = d;
            }
        });

        Object.values(studentMap).forEach(s => {
            const grpKey = mapToGroupKey(s.unit);
            if (!unitGroups[grpKey]) return;

            unitGroups[grpKey].total_siswa += 1;

            const cDate = s.createdDate;
            const isBaseline = !cDate || cDate <= minBaselineDate;
            const isEnrolledM1 = isBaseline || cDate <= cutoffM1;
            const isEnrolledM2 = isBaseline || cDate <= cutoffM2;
            const isEnrolledM3 = isBaseline || cDate <= cutoffM3;
            const isEnrolledM4 = isBaseline || cDate <= cutoffM4;

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

        // Pemetaan kelas resmi siswa dari class_students untuk menghindari bentrok nama kelas identik
        const studentEnrolledClassMap = new Map();
        classStudentRows.forEach(cs => {
            const sid = String(cs.student_id).toLowerCase();
            if (!studentEnrolledClassMap.has(sid)) studentEnrolledClassMap.set(sid, []);
            const cls = classes.find(c => String(c.id) === String(cs.class_id));
            if (cls) {
                studentEnrolledClassMap.get(sid).push({
                    class_id: String(cls.id),
                    class_name: normalizeClassName(cls.nama)
                });
            }
        });

        const classMap = {};
        classes.forEach(c => {
            const cid = String(c.id);
            const teacherName = c.teacher_name_ref || c.pengajar || 'Pengajar KBEC';
            const unitName = resolveStudentUnit('', c.program || c.nama, c.nama, c.unit);
            
            if (filterUnit) {
                const uLower = unitName.toLowerCase();
                const pLower = (c.program || '').toLowerCase();
                if (!uLower.includes(filterUnit) && !pLower.includes(filterUnit)) return;
            }

            classMap[cid] = {
                class_id: c.id,
                nama_kelas: cleanClassDisplay(c.nama) || 'Kelas KBEC',
                nama_guru: teacherName,
                unit: unitName,
                program: cleanClassDisplay(c.program || c.nama) || 'KBEC',
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
                const sid = s.id ? String(s.id).toLowerCase() : '';
                const enrolled = studentEnrolledClassMap.get(sid) || [];
                let targetCid = null;
                const recNormName = normalizeClassName(rec.kelas);

                // 1. Cek dari kelas resmi yang diikuti siswa di tabel class_students
                if (enrolled.length > 0) {
                    const match = enrolled.find(e => recNormName && e.class_name === recNormName);
                    if (match) {
                        targetCid = match.class_id;
                    } else if (enrolled.length === 1) {
                        targetCid = enrolled[0].class_id;
                    }
                }

                // 2. Fallback: jika tidak terdaftar di class_students, cocokkan via nama kelas
                if (!targetCid && recNormName) {
                    const matchCls = classes.find(c => normalizeClassName(c.nama) === recNormName);
                    if (matchCls) {
                        targetCid = String(matchCls.id);
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
        }).sort((a, b) => {
            // Prioritaskan kelas yang memiliki sesi aktif di minggu terpilih di bagian atas
            const aActive = a.total_sesi > 0 ? 1 : 0;
            const bActive = b.total_sesi > 0 ? 1 : 0;
            if (bActive !== aActive) return bActive - aActive;
            return String(a.nama_kelas || '').localeCompare(String(b.nama_kelas || ''));
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
            const unitName = resolveStudentUnit(std.id, std.program, std.level, std.unit);

            const gradeVal = cleanClassDisplay(stdPerf.grade || latestGrade.grade || std.level || std.program || '-');
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
                program: cleanClassDisplay(std.program || std.level || 'KBEC'),
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

/**
 * 3. GET /api/reports/problematic-students
 * Laporan rekap siswa bermasalah (Alpha >= 3 atau kehadiran < 75%)
 */
async function getProblematicStudentsReport(req, res, next) {
    try {
        let { startDate, endDate, unit, severity, search } = req.query;

        const today = new Date();
        if (!startDate) {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        }
        if (!endDate) {
            endDate = today.toISOString().split('T')[0];
        }

        // 1. Ambil data siswa aktif
        const [students] = await db.query(`
            SELECT id, nama, kontak, unit, program, level, nama_ibu, nama_ayah, status
            FROM students
            WHERE (status IS NULL OR status ILIKE 'Aktif' OR status = '')
            ORDER BY nama ASC
        `);

        // 2. Ambil relasi kelas & pengajar (mendukung siswa yang terdaftar di beberapa kelas)
        const [classStudentRows] = await db.query(`
            SELECT cs.student_id, cs.class_id, c.nama AS class_name, c.program AS class_program, c.unit AS class_unit,
                   c.pengajar, c.teacher_id, t.nama AS teacher_name, t.kontak AS teacher_phone
            FROM class_students cs
            JOIN classes c ON cs.class_id = c.id
            LEFT JOIN teachers t ON c.teacher_id = t.id
        `);

        const studentClassListMap = {};
        (classStudentRows || []).forEach(row => {
            const sid = String(row.student_id);
            if (!studentClassListMap[sid]) studentClassListMap[sid] = [];
            studentClassListMap[sid].push({
                class_id: row.class_id,
                class_name: cleanClassDisplay(row.class_name),
                norm_class_name: normalizeClassName(row.class_name),
                unit: resolveStudentUnit(sid, row.class_program || row.class_name, row.class_name, row.class_unit),
                pengajar: row.teacher_name || row.pengajar || 'Belum Ditugaskan',
                teacher_phone: row.teacher_phone || '-'
            });
        });

        // 3. Ambil absensi harian dan grade dalam rentang tanggal
        const [attRows] = await db.query(`
            SELECT student_id, LOWER(TRIM(status)) AS status, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl, kelas
            FROM attendance
            WHERE TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') >= ? AND TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') <= ?
            ORDER BY tanggal ASC
        `, [startDate, endDate]);

        const [gradeRows] = await db.query(`
            SELECT student_id, LOWER(TRIM(presensi)) AS presensi, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tgl, class_name
            FROM student_grades
            WHERE TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') >= ? AND TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') <= ?
            ORDER BY tanggal ASC
        `, [startDate, endDate]);

        // Gabungkan catatan kehadiran per siswa dengan helper terpadu
        const studentAttMap = buildUnifiedStudentDateMap(attRows, gradeRows);

        // 4. Hitung statistik dan evaluasi kriteria bermasalah
        const problematicList = [];
        let totalCritical = 0;
        let totalWarning = 0;

        (students || []).forEach(s => {
            const sid = String(s.id);
            const enrolledClasses = studentClassListMap[sid] || [];
            const allowedClassNames = new Set(enrolledClasses.map(c => c.norm_class_name).filter(Boolean));
            const rawDateMap = studentAttMap[sid] || {};
            const allDates = Object.keys(rawDateMap).sort();
            // Saring hanya pertemuan yang sesuai dengan kelas resmi siswa (jika siswa sudah terdaftar di class_students)
            const dates = allowedClassNames.size > 0
                ? allDates.filter(d => {
                    const recClass = normalizeClassName(rawDateMap[d].class);
                    return !recClass || allowedClassNames.has(recClass);
                })
                : allDates;
            const dateMap = rawDateMap;
            const totalSesi = dates.length;

            let hadirCount = 0;
            let izinCount = 0;
            let sakitCount = 0;
            let alphaCount = 0;

            dates.forEach(d => {
                const st = String(dateMap[d].status || '').toLowerCase().trim();
                if (st.includes('hadir') || st === 'h') hadirCount++;
                else if (st.includes('izin') || st.includes('ijin') || st === 'i') izinCount++;
                else if (st.includes('sakit') || st === 's') sakitCount++;
                else if (st.includes('alpha') || st.includes('alfa') || st === 'a') alphaCount++;
            });

            const rate = totalSesi > 0 ? Math.round((hadirCount / totalSesi) * 100) : 100;

            let isProblematic = false;
            let severityLevel = 'normal'; // 'critical' | 'warning' | 'info'
            let reasons = [];

            // 1. Kriteria Kritis (Merah): Alpha >= 3x (Tanpa Keterangan)
            if (alphaCount >= 3) {
                isProblematic = true;
                severityLevel = 'critical';
                reasons.push(`${alphaCount}x Alpha Tanpa Keterangan`);
                if (totalSesi >= 3 && rate < 75) {
                    reasons.push(`Kehadiran Rendah (${rate}%)`);
                }
            } else if (alphaCount >= 1 && totalSesi >= 3 && rate < 75) {
                // 2. Kriteria Peringatan (Kuning/Amber): Ada 1-2x Alpha DAN Kehadiran Rendah
                isProblematic = true;
                severityLevel = 'warning';
                reasons.push(`${alphaCount}x Alpha (Perlu Diingatkan)`);
                reasons.push(`Kehadiran Rendah (${rate}%)`);
            } else if (alphaCount === 0 && totalSesi >= 3 && rate < 75 && (izinCount > 0 || sakitCount > 0)) {
                // 3. Kriteria Izin & Sakit (Biru): Kehadiran rendah murni Izin/Sakit resmi
                isProblematic = true;
                severityLevel = 'info';
                const detailKetidakhadiran = [];
                if (izinCount > 0) detailKetidakhadiran.push(`${izinCount}x Izin`);
                if (sakitCount > 0) detailKetidakhadiran.push(`${sakitCount}x Sakit`);
                reasons.push(`Kehadiran Rendah Berizin (${rate}%)`);
                reasons.push(`${detailKetidakhadiran.join(', ')} • 0 Alpha`);
            }

            if (isProblematic) {
                if (severityLevel === 'critical') totalCritical++;
                if (severityLevel === 'warning') totalWarning++;

                const enrolledClasses = studentClassListMap[sid] || [];
                const lastRecordedClass = (dates.length > 0 && dateMap[dates[dates.length - 1]].class) ? cleanClassDisplay(dateMap[dates[dates.length - 1]].class) : '';
                const matchedEnrollment = enrolledClasses.find(c => lastRecordedClass && c.norm_class_name === normalizeClassName(lastRecordedClass)) || enrolledClasses[0];

                const resolvedStudentUnit = resolveStudentUnit(s.id, s.program, s.level, s.unit);
                const clsInfo = matchedEnrollment || {
                    class_name: lastRecordedClass || 'Reguler',
                    unit: resolvedStudentUnit,
                    pengajar: 'Belum Ditugaskan'
                };

                const cleanKontak = String(s.kontak || '').replace(/[^0-9]/g, '');
                let formattedWa = '';
                if (cleanKontak) {
                    if (cleanKontak.startsWith('0')) formattedWa = '62' + cleanKontak.slice(1);
                    else if (cleanKontak.startsWith('62')) formattedWa = cleanKontak;
                    else formattedWa = '62' + cleanKontak;
                }

                let severityLabel = 'Izin & Sakit';
                let badgeColor = 'blue';
                if (severityLevel === 'critical') {
                    severityLabel = 'Kritis (Alpha)';
                    badgeColor = 'rose';
                } else if (severityLevel === 'warning') {
                    severityLabel = 'Peringatan';
                    badgeColor = 'amber';
                }

                problematicList.push({
                    id: s.id,
                    nis: s.id,
                    nama: s.nama || 'Siswa KBEC',
                    nama_ortu: s.nama_ibu || s.nama_ayah || 'Wali Murid',
                    kontak: s.kontak || '',
                    wa_number: formattedWa,
                    unit: resolvedStudentUnit || clsInfo.unit,
                    program: cleanClassDisplay(s.program || s.level || 'KBEC'),
                    kelas: cleanClassDisplay(clsInfo.class_name || '-'),
                    pengajar: clsInfo.pengajar || 'Belum Ditugaskan',
                    hadir: hadirCount,
                    izin: izinCount,
                    sakit: sakitCount,
                    alpha: alphaCount,
                    total_sesi: totalSesi,
                    rate: rate,
                    severity: severityLevel,
                    severity_label: severityLabel,
                    badge_color: badgeColor,
                    reasons: reasons,
                    reason_text: reasons.join(' • ')
                });
            }
        });

        // Filter unit & severity jika ada query param
        let filtered = problematicList;
        if (unit && unit !== 'Semua') {
            filtered = filtered.filter(p => (p.unit || '').toLowerCase().includes(unit.toLowerCase()));
        }
        if (severity && severity !== 'Semua') {
            filtered = filtered.filter(p => p.severity === severity.toLowerCase());
        }
        if (search) {
            const sTerm = search.toLowerCase();
            filtered = filtered.filter(p => 
                p.nama.toLowerCase().includes(sTerm) || 
                String(p.nis).toLowerCase().includes(sTerm) || 
                p.kelas.toLowerCase().includes(sTerm) ||
                p.pengajar.toLowerCase().includes(sTerm)
            );
        }

        const avgRate = filtered.length > 0
            ? Math.round(filtered.reduce((sum, item) => sum + item.rate, 0) / filtered.length)
            : 0;

        res.json({
            success: true,
            filter: {
                start_date: startDate,
                end_date: endDate,
                unit: unit || 'Semua',
                severity: severity || 'Semua'
            },
            summary: {
                total_problematic: filtered.filter(f => f.severity === 'critical').length,
                total_flagged: filtered.length,
                critical_count: filtered.filter(f => f.severity === 'critical').length,
                warning_count: filtered.filter(f => f.severity === 'warning').length,
                info_count: filtered.filter(f => f.severity === 'info').length,
                avg_rate: avgRate
            },
            data: filtered,
            report: filtered
        });
    } catch (err) {
        console.error('Error in getProblematicStudentsReport:', err);
        res.json({
            success: true,
            summary: { total_problematic: 0, critical_count: 0, warning_count: 0, avg_rate: 0 },
            data: [],
            report: [],
            message: 'Data siswa bermasalah belum tersedia.'
        });
    }
}

/**
 * 4. GET /api/reports/teacher-monthly-performance
 * Laporan rekapitulasi kinerja bulanan pengajar (KPI, kedisiplinan, realisasi, kepatuhan administrasi)
 */
async function getTeacherMonthlyPerformanceReport(req, res, next) {
    try {
        let { bulan, unit, grade, search } = req.query;
        if (!bulan || !/^\d{4}-\d{2}$/.test(bulan.trim())) {
            bulan = new Date().toISOString().slice(0, 7);
        } else {
            bulan = bulan.trim();
        }

        // 1. Ambil daftar guru
        const [teachers] = await db.query(`
            SELECT id, nama, email, kontak, status, unit
            FROM teachers
            WHERE (status IS NULL OR status ILIKE 'Aktif' OR status = '')
            ORDER BY nama ASC
        `);

        // 2. Ambil daftar kelas
        const [classes] = await db.query(`
            SELECT id, nama, program, unit, hari, mulai, selesai, teacher_id, pengajar
            FROM classes
        `);

        // 3. Ambil checkin pengajar dalam bulan terkait
        const [checkinRows] = await db.query(`
            SELECT id, teacher_id, teacher_name, class_id, class_name, attendance_type,
                   status, notes, duration_minutes,
                   TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS tanggal,
                   TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'HH24:MI') AS jam
            FROM teacher_checkins
            WHERE TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM') = ?
        `, [bulan]);

        // 4. Ambil absensi siswa bulan ini untuk hitung siswa bermasalah per kelas
        const [attRows] = await db.query(`
            SELECT a.student_id, a.kelas, LOWER(TRIM(a.status)) AS status, TO_CHAR(a.tanggal::timestamp, 'YYYY-MM-DD') AS tanggal
            FROM attendance a
            WHERE a.tanggal::text LIKE ?
        `, [`${bulan}-%`]);

        // 5. Ambil data pengisian grade/nilai siswa
        const [gradeRows] = await db.query(`
            SELECT class_name, student_id, LOWER(TRIM(presensi)) AS presensi, sb_page, wb_page, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tanggal
            FROM student_grades
            WHERE tanggal::text LIKE ?
        `, [`${bulan}-%`]);

        // 6. Ambil relasi murid aktif per kelas untuk isolasi data guru yang konsisten dengan Laporan Siswa Bermasalah
        const [classStudentRows] = await db.query(`
            SELECT cs.class_id, cs.student_id
            FROM class_students cs
            JOIN students s ON cs.student_id = s.id
            WHERE (s.status IS NULL OR s.status ILIKE 'Aktif' OR s.status = '')
        `);

        // Gabungkan attendance + student_grades secara konsisten (identik dengan getProblematicStudentsReport)
        const unifiedStudentAttMap = buildUnifiedStudentDateMap(attRows, gradeRows);

        const reportList = (teachers || []).map((t, idx) => {
            const tId = t.id;
            const tNameLower = (t.nama || '').toLowerCase();

            // Saring kelas yang diampu
            const myClasses = (classes || []).filter(c => 
                (c.teacher_id && c.teacher_id === tId) ||
                (c.pengajar && c.pengajar.toLowerCase().includes(tNameLower))
            );
            const myClassIds = myClasses.map(c => String(c.id));

            // Saring checkin pengajar ini
            const myCheckins = (checkinRows || []).filter(c => 
                c.teacher_id === tId || 
                (c.teacher_name && c.teacher_name.toLowerCase().includes(tNameLower))
            );

            const teachingSessions = myCheckins.filter(c => c.attendance_type === 'sesi_mengajar');
            const totalTeachingSessions = teachingSessions.length;

            // Hitung ketepatan waktu
            let punctualCount = 0;
            let lateCount = 0;
            teachingSessions.forEach(s => {
                const cls = myClasses.find(c => String(c.id) === String(s.class_id) || (c.nama && normalizeClassName(c.nama) === normalizeClassName(s.class_name)));
                if (cls && cls.mulai && s.jam) {
                    const [cHour, cMin] = cls.mulai.split(':').map(Number);
                    const [sHour, sMin] = s.jam.split(':').map(Number);
                    const diff = (sHour * 60 + sMin) - (cHour * 60 + cMin);
                    if (diff > 15) lateCount++;
                    else punctualCount++;
                } else {
                    punctualCount++;
                }
            });

            const punctualityRate = (punctualCount + lateCount) > 0 
                ? Math.round((punctualCount / (punctualCount + lateCount)) * 100) 
                : 100;

            // Kepatuhan input nilai/evaluasi
            let totalGradeRecords = 0;
            myClasses.forEach(c => {
                const cName = normalizeClassName(c.nama);
                const count = (gradeRows || []).filter(g => normalizeClassName(g.class_name) === cName).length;
                totalGradeRecords += count;
            });

            // Pemetaan murid kelas guru ini (Isolasi ketat agar konsisten dengan Laporan Siswa Bermasalah)
            const teacherStudentClassMap = new Map();
            (classStudentRows || []).forEach(cs => {
                if (myClassIds.includes(String(cs.class_id))) {
                    const sid = String(cs.student_id);
                    const matchingClass = myClasses.find(c => String(c.id) === String(cs.class_id));
                    const cName = matchingClass ? normalizeClassName(matchingClass.nama) : '';
                    if (!teacherStudentClassMap.has(sid)) {
                        teacherStudentClassMap.set(sid, new Set());
                    }
                    if (cName) teacherStudentClassMap.get(sid).add(cName);
                }
            });

            let criticalCount = 0;
            let warningCount = 0;
            let infoCount = 0;

            teacherStudentClassMap.forEach((allowedClasses, sid) => {
                const dateMap = unifiedStudentAttMap[sid] || {};
                const dates = Object.keys(dateMap).sort();
                let hadir = 0;
                let alpha = 0;
                let izin = 0;
                let total = 0;

                dates.forEach(d => {
                    const rec = dateMap[d];
                    const recClass = normalizeClassName(rec.class);
                    if (recClass && allowedClasses.size > 0 && !allowedClasses.has(recClass)) return;

                    total++;
                    const st = String(rec.status || '').toLowerCase().trim();
                    if (st.includes('hadir') || st === 'h') hadir++;
                    else if (st.includes('alpha') || st.includes('alfa') || st === 'a') alpha++;
                    else if (st.includes('izin') || st.includes('ijin') || st.includes('sakit') || st === 'i' || st === 's') izin++;
                });

                const rate = total > 0 ? Math.round((hadir / total) * 100) : 100;
                if (alpha >= 3) criticalCount++;
                else if (alpha >= 1 && total >= 3 && rate < 75) warningCount++;
                else if (alpha === 0 && total >= 3 && rate < 75 && izin > 0) infoCount++;
            });

            const problematicCount = criticalCount; // Hanya kritis alpha yang dihitung bermasalah
            const atRiskCount = criticalCount + warningCount + infoCount;

            // Hitung KPI Score (0 - 100) dengan Rubrik Sensitif:
            // 1. Ketepatan Waktu (40%): Persentase sesi tepat waktu (toleransi <= 15 menit)
            // 2. Kesehatan Kelas / Siswa Kritis (30%): Penalti -8 poin per siswa Kritis, -3 poin per siswa Peringatan (tanpa batas bawah 50)
            // 3. Keaktifan & Realisasi Sesi (15%): Proporsional terhadap realisasi sesi mengajar
            // 4. Kepatuhan Input Evaluasi Nilai (15%): Proporsional terhadap kelengkapan input nilai
            const sPunctuality = punctualityRate;
            const sHealth = Math.max(0, 100 - (criticalCount * 8) - (warningCount * 3));
            const sAttendance = totalTeachingSessions > 0 ? Math.min(100, totalTeachingSessions * 10) : 70;
            const sGrading = myClasses.length > 0
                ? (totalGradeRecords > 0 ? Math.min(100, 75 + Math.min(25, Math.round(totalGradeRecords / Math.max(1, totalTeachingSessions) * 3))) : 50)
                : 85;

            const overallScore = Math.round(
                (sPunctuality * 0.40) +
                (sHealth * 0.30) +
                (sAttendance * 0.15) +
                (sGrading * 0.15)
            );

            let kpiGrade = 'B';
            let kpiPredikat = 'Baik';
            let badgeClass = 'text-blue-700 bg-blue-50 border-blue-200';

            if (overallScore >= 85) {
                kpiGrade = 'A';
                kpiPredikat = 'Sangat Baik';
                badgeClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
            } else if (overallScore >= 70) {
                kpiGrade = 'B';
                kpiPredikat = 'Baik';
                badgeClass = 'text-blue-700 bg-blue-50 border-blue-200';
            } else if (overallScore >= 55) {
                kpiGrade = 'C';
                kpiPredikat = 'Cukup';
                badgeClass = 'text-amber-700 bg-amber-50 border-amber-200';
            } else {
                kpiGrade = 'D';
                kpiPredikat = 'Perlu Pembinaan';
                badgeClass = 'text-rose-700 bg-rose-50 border-rose-200';
            }

            const firstClass = myClasses.length > 0 ? myClasses[0] : null;
            const resolvedTeacherUnit = t.unit || (firstClass ? resolveStudentUnit('', firstClass.program || firstClass.nama, firstClass.nama, firstClass.unit) : 'KBEC Reguler');

            return {
                no: idx + 1,
                id: t.id,
                nama: t.nama || 'Pengajar KBEC',
                email: t.email || '-',
                phone: t.kontak || t.phone || '-',
                unit: resolvedTeacherUnit,
                total_classes: myClasses.length,
                total_sessions_taught: totalTeachingSessions,
                punctual_count: punctualCount,
                late_count: lateCount,
                punctuality_rate: punctualityRate,
                grading_records_count: totalGradeRecords,
                problematic_students_count: problematicCount,
                critical_students_count: criticalCount,
                warning_students_count: warningCount,
                info_students_count: infoCount,
                at_risk_students_count: atRiskCount,
                kpi_score: overallScore,
                kpi_grade: kpiGrade,
                kpi_predikat: kpiPredikat,
                kpi_breakdown: {
                    ketepatan_waktu: sPunctuality,
                    kesehatan_kelas: sHealth,
                    realisasi_sesi: sAttendance,
                    input_nilai: sGrading
                },
                badge_class: badgeClass
            };
        });

        // Filter unit & grade
        let filtered = reportList;
        if (unit && unit !== 'Semua') {
            filtered = filtered.filter(t => (t.unit || '').toLowerCase().includes(unit.toLowerCase()));
        }
        if (grade && grade !== 'Semua') {
            filtered = filtered.filter(t => t.kpi_grade === grade.toUpperCase().trim());
        }
        if (search) {
            const sTerm = search.toLowerCase();
            filtered = filtered.filter(t => 
                t.nama.toLowerCase().includes(sTerm) || 
                String(t.id).toLowerCase().includes(sTerm) || 
                t.email.toLowerCase().includes(sTerm)
            );
        }

        const avgKpi = filtered.length > 0 
            ? Math.round(filtered.reduce((sum, item) => sum + item.kpi_score, 0) / filtered.length) 
            : 0;
        const avgPunctual = filtered.length > 0
            ? Math.round(filtered.reduce((sum, item) => sum + item.punctuality_rate, 0) / filtered.length)
            : 0;

        res.json({
            success: true,
            bulan: bulan,
            kpi_rubric: {
                weights: {
                    ketepatan_waktu: '40%',
                    kesehatan_kelas: '30% (-8 poin/Kritis, -3 poin/Peringatan)',
                    realisasi_sesi: '15%',
                    input_nilai: '15%'
                },
                grades: {
                    A: '85 - 100 (Sangat Baik)',
                    B: '70 - 84 (Baik)',
                    C: '55 - 69 (Cukup / Perlu Pembinaan)',
                    D: '< 55 (Perlu Pembinaan Khusus)'
                }
            },
            summary: {
                total_teachers: filtered.length,
                avg_kpi: avgKpi,
                avg_punctuality: avgPunctual,
                grade_a_count: filtered.filter(f => f.kpi_grade === 'A').length
            },
            data: filtered,
            report: filtered
        });
    } catch (err) {
        console.error('Error in getTeacherMonthlyPerformanceReport:', err);
        res.json({
            success: true,
            summary: { total_teachers: 0, avg_kpi: 0, avg_punctuality: 0, grade_a_count: 0 },
            data: [],
            report: [],
            message: 'Data kinerja pengajar belum tersedia.'
        });
    }
}

module.exports = {
    getAttendanceRecap,
    getStudentPerformanceReport,
    getProblematicStudentsReport,
    getTeacherMonthlyPerformanceReport,
    buildUnifiedStudentDateMap
};
