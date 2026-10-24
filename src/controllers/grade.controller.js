const db = require('../config/db');
const { escapeHTML } = require('../utils/helpers');

// KBEC Official Classification of Score
// A: 86 - 100 (Very good)
// B: 70 - 85 (Good)
// C: 60 - 69 (Enough)
// D: < 60 (Needs Improvement)
function calculateScoreClassification(score) {
    if (score === null || score === undefined || score === '' || isNaN(score)) {
        return { letter_grade: null, label: null };
    }
    const val = parseFloat(score);
    if (val >= 86) return { letter_grade: 'A', label: 'Very good' };
    if (val >= 70) return { letter_grade: 'B', label: 'Good' };
    if (val >= 60) return { letter_grade: 'C', label: 'Enough' };
    return { letter_grade: 'D', label: 'Needs Improvement' };
}

/**
 * Menghitung badge peringkat berbasis predikat (A1, A2, B1, B2, dst.) untuk seluruh siswa dalam suatu kelas.
 * Siswa dikelompokkan berdasarkan predikat nilai final (A, B, C, D).
 * Di dalam masing-masing kelompok, siswa diurutkan berdasarkan final_score DESC dan nama ASC (tie-breaker stabil).
 */
function computeClassGradeBadges(studentsList) {
    const gradeGroups = { A: [], B: [], C: [], D: [] };

    (studentsList || []).forEach(s => {
        let rawScore = null;
        if (s.final_score !== null && s.final_score !== undefined && s.final_score !== '') {
            rawScore = parseFloat(s.final_score);
        } else if (s.final_exam !== null && s.final_exam !== undefined && s.final_exam !== '') {
            rawScore = parseFloat(s.final_exam);
        }

        if (rawScore !== null && !isNaN(rawScore)) {
            const cls = calculateScoreClassification(rawScore);
            const letter = cls.letter_grade || 'B';
            if (!gradeGroups[letter]) gradeGroups[letter] = [];
            gradeGroups[letter].push({
                student_id: String(s.student_id || s.id),
                name: s.student_name || s.nama || s.name || '',
                nis: s.nis || s.student_id || s.id || '',
                final_score: rawScore,
                letter_grade: letter,
                classification_label: cls.label
            });
        }
    });

    const badgeMap = {};
    const rankedSummary = [];

    ['A', 'B', 'C', 'D'].forEach(letter => {
        const group = gradeGroups[letter] || [];
        // Sortir: skor tertinggi lebih dulu, jika skor persis sama urutkan berdasarkan abjad nama siswa
        group.sort((a, b) => {
            if (b.final_score !== a.final_score) {
                return b.final_score - a.final_score;
            }
            return (a.name || '').localeCompare(b.name || '');
        });

        const totalInGrade = group.length;
        group.forEach((item, idx) => {
            const rank = idx + 1;
            const badge = `${letter}${rank}`;
            badgeMap[item.student_id] = {
                badge,
                letter_grade: letter,
                rank_in_grade: rank,
                total_in_grade: totalInGrade
            };
            rankedSummary.push({
                student_id: item.student_id,
                name: item.name,
                nis: item.nis,
                final_score: item.final_score,
                letter_grade: letter,
                classification_label: item.classification_label,
                badge,
                rank_in_grade: rank,
                total_in_grade: totalInGrade
            });
        });
    });

    return { badgeMap, rankedSummary };
}

/**
 * Mendapatkan 6 subjek aktif untuk kelas & periode tertentu secara dinamis.
 * Urutan prioritas:
 * 1. Tersimpan di tabel class_term_subjects (kustomisasi tersimpan)
 * 2. Diambil dari nama materi/lesson riil di student_grades (kinerja siswa)
 * 3. Template kurikulum bawaan sesuai program/level kelas
 */
async function getEffectiveClassSubjects(classId, term, year, classProgram) {
    try {
        const [saved] = await db.query(
            'SELECT subjects FROM class_term_subjects WHERE class_id = ? AND term_or_period = ? AND academic_year = ?',
            [classId, term, year]
        );
        if (saved.length > 0 && Array.isArray(saved[0].subjects) && saved[0].subjects.length === 6) {
            return saved[0].subjects;
        }

        // Cek materi ajar yang pernah dicatat guru di student_grades
        const [lessons] = await db.query(`
            SELECT DISTINCT TRIM(lesson) AS lesson 
            FROM student_grades 
            WHERE class_id = ? AND lesson IS NOT NULL AND lesson != '' AND lesson != '-'
            ORDER BY lesson ASC
        `, [classId]);
        const validLessons = lessons
            .map(l => l.lesson)
            .filter(l => l && !l.toLowerCase().includes('speaking, reading'));

        const prog = (classProgram || '').toUpperCase();
        let defaultSubs = [
            'Alphabets',
            'Numbers (1-10)',
            'Colours',
            "It's Me & Parts of My Body",
            'Animals 1 : Pets & Farms',
            'Greeting, Day, and Night'
        ];

        if (prog.includes('ELEMENTARY')) {
            defaultSubs = [
                'Daily Activities',
                'Telling Time',
                'Food and Drinks',
                'Clothes & Seasons',
                'My Family & Hobbies',
                'Places in Town'
            ];
        } else if (prog.includes('BEGINNER 2')) {
            defaultSubs = [
                'My Classroom & Stationery',
                'Numbers (11-50)',
                'Shapes and Sizes',
                'My Home & Rooms',
                'Actions & Verbs',
                'Feelings and Emotions'
            ];
        } else if (prog.includes('BTP') || prog.includes('CALISTUNG')) {
            defaultSubs = [
                'Mengenal Huruf Vokal & Konsonan',
                'Membaca Suku Kata Terbuka',
                'Membaca Kata Sederhana',
                'Menulis Huruf Tegak Bersambung',
                'Mengenal Angka 1-20',
                'Operasi Hitung Penjumlahan Sederhana'
            ];
        }

        if (validLessons.length >= 6) {
            return validLessons.slice(0, 6);
        }
        return defaultSubs;
    } catch (e) {
        console.error('Error getting effective subjects:', e);
        return [
            'Alphabets',
            'Numbers (1-10)',
            'Colours',
            "It's Me & Parts of My Body",
            'Animals 1 : Pets & Farms',
            'Greeting, Day, and Night'
        ];
    }
}

/**
 * Menghitung skor kehadiran dan aktivitas kelas otomatis dari kinerja siswa & absensi.
 */
async function getStudentAutoPerformance(studentId, classId, className) {
    try {
        const [sg] = await db.query(`
            SELECT presensi, speaking, wb, sb, extra 
            FROM student_grades 
            WHERE student_id::text = ? AND class_id = ?
        `, [studentId, classId]);

        let tot = 0, had = 0, acts = [];
        for (const row of sg) {
            const pres = (row.presensi || '').trim().toLowerCase();
            if (pres && pres !== '-' && pres !== 'kosong') {
                tot++;
                if (pres === 'hadir') {
                    had++;
                    const s = [row.speaking, row.wb, row.sb, row.extra]
                        .map(v => (v !== null && v !== undefined && v !== '' && !isNaN(v)) ? parseFloat(v) : null)
                        .filter(v => v !== null);
                    if (s.length > 0) acts.push(s.reduce((a, b) => a + b, 0) / s.length);
                }
            }
        }

        if (tot === 0 && className) {
            const [att] = await db.query(`
                SELECT status FROM attendance WHERE student_id::text = ? AND kelas = ?
            `, [studentId, className]);
            att.forEach(a => {
                tot++;
                if ((a.status || '').toLowerCase() === 'hadir') had++;
            });
        }

        const autoAtt = tot > 0 ? Math.round((had / tot) * 100 * 10) / 10 : 100.0;
        const autoAct = acts.length > 0 ? Math.round((acts.reduce((a, b) => a + b, 0) / acts.length) * 10) / 10 : 80.0;

        return { attendance_score: autoAtt, class_activity: autoAct };
    } catch (e) {
        console.error('Error calculating auto performance:', e);
        return { attendance_score: 90.0, class_activity: 80.0 };
    }
}

/**
 * Mengambil 6 nama subjek kelas dan saran materi dari riwayat kinerja.
 */
async function getClassSubjects(req, res, next) {
    const { class_id, term_or_period, academic_year } = req.query;
    if (!class_id) {
        return res.status(400).json({ success: false, message: 'ID Kelas (class_id) wajib disertakan.' });
    }
    const term = term_or_period || 'Term 1';
    const year = academic_year || '2025/2026';

    try {
        const [[classObj]] = await db.query('SELECT * FROM classes WHERE id = ?', [class_id]);
        if (!classObj) {
            return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan.' });
        }

        const subjects = await getEffectiveClassSubjects(class_id, term, year, classObj.program);

        const [lessons] = await db.query(`
            SELECT DISTINCT TRIM(lesson) AS lesson 
            FROM student_grades 
            WHERE class_id = ? AND lesson IS NOT NULL AND lesson != '' AND lesson != '-'
            ORDER BY lesson ASC
        `, [class_id]);

        res.json({
            success: true,
            class_id,
            term_or_period: term,
            academic_year: year,
            subjects,
            lessons_from_kinerja: lessons.map(l => l.lesson)
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Menyimpan konfigurasi 6 subjek pembelajaran untuk kelas & periode tertentu.
 */
async function saveClassSubjects(req, res, next) {
    const { class_id, term_or_period, academic_year, subjects } = req.body;
    if (!class_id || !Array.isArray(subjects) || subjects.length !== 6) {
        return res.status(400).json({ success: false, message: 'class_id dan 6 nama subjects wajib disertakan.' });
    }

    const term = term_or_period || 'Term 1';
    const year = academic_year || '2025/2026';
    const cleanSubjects = subjects.map(s => escapeHTML(String(s || '').trim()) || 'Subject');

    try {
        await db.query(`
            INSERT INTO class_term_subjects (class_id, term_or_period, academic_year, subjects, updated_at)
            VALUES (?, ?, ?, ?::jsonb, NOW())
            ON CONFLICT (class_id, term_or_period, academic_year)
            DO UPDATE SET subjects = EXCLUDED.subjects, updated_at = NOW()
        `, [class_id, term, year, JSON.stringify(cleanSubjects)]);

        res.json({
            success: true,
            message: 'Berhasil menyimpan 6 subjek pembelajaran kelas.',
            subjects: cleanSubjects
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Mendapatkan daftar kelas yang bisa diakses untuk pengisian form nilai.
 */
async function getClasses(req, res, next) {
    try {
        const userRole = (req.user && req.user.role ? req.user.role : '').toLowerCase();
        const isTeacher = userRole.includes('pengajar') || userRole.includes('teacher') || userRole.includes('guru');

        let sql = `
            SELECT c.id, c.nama, c.program, c.unit, c.pengajar, c.hari, c.jam, c.mulai, c.selesai,
                   COALESCE(COUNT(cs.student_id), 0) AS students_count
            FROM classes c
            LEFT JOIN class_students cs ON c.id = cs.class_id
        `;
        let params = [];

        if (isTeacher && req.user) {
            const uId = req.user.id || '';
            const tId = req.user.teacher_id || '';
            const tEmail = (req.user.email || '').trim().toLowerCase();
            const tName = (req.user.name || '').trim();

            sql += `
                WHERE (c.teacher_id IS NOT NULL AND c.teacher_id = (SELECT teacher_id FROM users WHERE id = ? OR nis = ? LIMIT 1))
                   OR (c.teacher_id IS NOT NULL AND c.teacher_id = ?)
                   OR (c.teacher_id IS NOT NULL AND c.teacher_id IN (SELECT id FROM teachers WHERE LOWER(email) = LOWER(?)))
                   OR (LOWER(c.pengajar) = LOWER(?))
                   OR (c.pengajar ILIKE ?)
            `;
            params.push(uId, uId, tId, tEmail, tName, `%${tName}%`);
        }

        sql += ` GROUP BY c.id, c.nama, c.program, c.unit, c.pengajar, c.hari, c.jam, c.mulai, c.selesai ORDER BY c.nama ASC`;

        const [classes] = await db.query(sql, params);
        res.json({ success: true, classes });
    } catch (err) {
        next(err);
    }
}

/**
 * Mengambil lembar nilai siswa untuk kelas, term, dan tahun ajaran tertentu.
 * Menghitung otomatis kehadiran & class activity dari kinerja siswa riil dan menyajikan subjek dinamis.
 */
async function getClassGrades(req, res, next) {
    const { class_id, term_or_period, academic_year } = req.query;
    if (!class_id) {
        return res.status(400).json({ success: false, message: 'ID Kelas (class_id) wajib disertakan.' });
    }

    const term = term_or_period || 'Term 1';
    const year = academic_year || '2025/2026';

    try {
        const [[classObj]] = await db.query('SELECT * FROM classes WHERE id = ?', [class_id]);
        if (!classObj) {
            return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan.' });
        }

        // Cek otorisasi pengajar
        const userRole = (req.user && req.user.role ? req.user.role : '').toLowerCase();
        const isTeacher = userRole.includes('pengajar') || userRole.includes('teacher') || userRole.includes('guru');
        if (isTeacher && req.user) {
            const tName = (req.user.name || '').trim().toLowerCase();
            const classTeacher = (classObj.pengajar || '').trim().toLowerCase();
            if (classObj.teacher_id && classObj.teacher_id !== req.user.teacher_id && classTeacher !== tName) {
                const [allowed] = await db.query(
                    'SELECT id FROM classes WHERE id = ? AND (LOWER(pengajar) = ? OR teacher_id = ?)',
                    [class_id, tName, req.user.teacher_id || '']
                );
                if (allowed.length === 0) {
                    return res.status(403).json({ success: false, message: 'Akses dilarang. Anda bukan pengajar kelas ini.' });
                }
            }
        }

        // 1. Ambil data kinerja siswa riil dari tabel student_grades untuk kelas ini
        const [sgRows] = await db.query(`
            SELECT 
                student_id::text AS student_id,
                presensi,
                speaking,
                wb,
                sb,
                extra
            FROM student_grades
            WHERE class_id = ?
        `, [class_id]);

        // 2. Ambil data presensi dari tabel attendance sebagai pelengkap
        const [attSummary] = await db.query(`
            SELECT 
                student_id::text AS student_id,
                COUNT(*) AS total_sessions,
                SUM(CASE WHEN LOWER(status) = 'hadir' THEN 1 ELSE 0 END) AS hadir_count
            FROM attendance
            WHERE kelas = ? OR student_id::text IN (SELECT student_id::text FROM class_students WHERE class_id = ?)
            GROUP BY student_id
        `, [classObj.nama, class_id]);

        const attTableMap = {};
        attSummary.forEach(a => {
            const tot = parseInt(a.total_sessions, 10) || 0;
            const had = parseInt(a.hadir_count, 10) || 0;
            attTableMap[a.student_id] = { total: tot, hadir: had };
        });

        // Agregasi dari student_grades per murid
        const studentKinerjaMap = {};
        sgRows.forEach(row => {
            const sid = String(row.student_id);
            if (!studentKinerjaMap[sid]) {
                studentKinerjaMap[sid] = { total: 0, hadir: 0, activity_scores: [] };
            }
            const pres = (row.presensi || '').trim().toLowerCase();
            if (pres && pres !== '-' && pres !== 'kosong') {
                studentKinerjaMap[sid].total++;
                if (pres === 'hadir') {
                    studentKinerjaMap[sid].hadir++;
                    const sc = [row.speaking, row.wb, row.sb, row.extra]
                        .map(v => (v !== null && v !== undefined && v !== '' && !isNaN(v)) ? parseFloat(v) : null)
                        .filter(v => v !== null);
                    if (sc.length > 0) {
                        studentKinerjaMap[sid].activity_scores.push(sc.reduce((a, b) => a + b, 0) / sc.length);
                    }
                }
            }
        });

        // 3. Ambil 6 subjek dinamis aktif untuk kelas ini
        const effectiveSubjects = await getEffectiveClassSubjects(class_id, term, year, classObj.program);

        // 4. Ambil distinct lesson dari student_grades untuk saran pemilihan subjek
        const [lessons] = await db.query(`
            SELECT DISTINCT TRIM(lesson) AS lesson 
            FROM student_grades 
            WHERE class_id = ? AND lesson IS NOT NULL AND lesson != '' AND lesson != '-'
            ORDER BY lesson ASC
        `, [class_id]);

        // 5. Query seluruh siswa di kelas beserta nilai dari student_term_grades
        const [rows] = await db.query(`
            SELECT 
                s.id AS student_id,
                s.nama AS student_name,
                s.id AS nis,
                s.program,
                s.level,
                s.nama_ayah,
                s.nama_ibu,
                s.tempat_tanggal_lahir,
                s.agama,
                s.alamat,
                stg.id AS grade_id,
                stg.exercise_1, stg.exercise_2, stg.exercise_3, stg.exercise_4, stg.exercise_5, stg.exercise_6,
                stg.middle_exam,
                stg.exercise_7, stg.exercise_8, stg.exercise_9, stg.exercise_10, stg.exercise_11, stg.exercise_12,
                stg.final_exam,
                stg.avg_exercise,
                stg.final_score,
                stg.letter_grade,
                stg.attendance_score,
                stg.class_activity,
                stg.progress_score,
                stg.cert_issue_date,
                stg.custom_subjects,
                stg.notes,
                stg.updated_at
            FROM class_students cs
            JOIN students s ON cs.student_id::text = s.id::text
            LEFT JOIN student_term_grades stg ON stg.student_id::text = s.id::text 
                 AND stg.class_id = cs.class_id 
                 AND stg.term_or_period = ? 
                 AND stg.academic_year = ?
            WHERE cs.class_id = ?
            ORDER BY s.nama ASC
        `, [term, year, class_id]);

        const students = rows.map((r, index) => {
            const cls = calculateScoreClassification(r.final_score);
            const midCls = calculateScoreClassification(r.middle_exam);
            const finCls = calculateScoreClassification(r.final_exam);

            // Perhitungan bobot Progress Report
            // Average Ex 1-6 (40%) + Mid Exam (40%) + Attendance (10%) + Class Activity (10%)
            const ex1_6 = [r.exercise_1, r.exercise_2, r.exercise_3, r.exercise_4, r.exercise_5, r.exercise_6]
                .map(v => v !== null && v !== undefined && !isNaN(v) ? parseFloat(v) : null)
                .filter(v => v !== null);

            let avg1_6 = null;
            if (ex1_6.length > 0) {
                avg1_6 = Math.round((ex1_6.reduce((a, b) => a + b, 0) / ex1_6.length) * 10) / 10;
            }

            const midScore = r.middle_exam !== null && !isNaN(r.middle_exam) ? parseFloat(r.middle_exam) : null;
            const finalScoreVal = r.final_exam !== null && !isNaN(r.final_exam) ? parseFloat(r.final_exam) : null;

            // Hitung nilai otomatis presensi & class activity dari riwayat Kinerja Siswa
            const kData = studentKinerjaMap[String(r.student_id)];
            let autoAtt = 100.0;
            let autoAct = 80.0;

            if (kData && kData.total > 0) {
                autoAtt = Math.round((kData.hadir / kData.total) * 100 * 10) / 10;
                if (kData.activity_scores.length > 0) {
                    autoAct = Math.round((kData.activity_scores.reduce((a, b) => a + b, 0) / kData.activity_scores.length) * 10) / 10;
                }
            } else if (attTableMap[String(r.student_id)] && attTableMap[String(r.student_id)].total > 0) {
                const aTot = attTableMap[String(r.student_id)].total;
                const aHad = attTableMap[String(r.student_id)].hadir;
                autoAtt = Math.round((aHad / aTot) * 100 * 10) / 10;
            }

            // Attendance score: jika guru sudah mengisi/menyimpan manual gunakan itu, jika belum gunakan autoAtt
            const isAttManual = r.attendance_score !== null && !isNaN(r.attendance_score);
            const attScore = isAttManual ? parseFloat(r.attendance_score) : autoAtt;

            // Class Activity score: jika guru sudah mengisi/menyimpan manual gunakan itu, jika belum gunakan autoAct
            const isActManual = r.class_activity !== null && !isNaN(r.class_activity);
            const actScore = isActManual ? parseFloat(r.class_activity) : autoAct;

            let calcProgressScore = null;
            if (avg1_6 !== null && midScore !== null) {
                calcProgressScore = Math.round((avg1_6 * 0.40 + midScore * 0.40 + attScore * 0.10 + actScore * 0.10) * 10) / 10;
            }
            const progressCls = calculateScoreClassification(calcProgressScore);

            return {
                no: index + 1,
                student_id: r.student_id,
                student_name: r.student_name,
                nis: r.nis || r.student_id,
                program: r.program || classObj.program || '-',
                level: r.level || '-',
                nama_ayah: r.nama_ayah || '',
                nama_ibu: r.nama_ibu || '',
                parents: r.nama_ayah || r.nama_ibu || 'Orang Tua Siswa',
                tempat_tanggal_lahir: r.tempat_tanggal_lahir || '',
                agama: r.agama || 'Islam',
                alamat: r.alamat || '',
                grade_id: r.grade_id || null,
                exercise_1: r.exercise_1 !== null ? Number(r.exercise_1) : null,
                exercise_2: r.exercise_2 !== null ? Number(r.exercise_2) : null,
                exercise_3: r.exercise_3 !== null ? Number(r.exercise_3) : null,
                exercise_4: r.exercise_4 !== null ? Number(r.exercise_4) : null,
                exercise_5: r.exercise_5 !== null ? Number(r.exercise_5) : null,
                exercise_6: r.exercise_6 !== null ? Number(r.exercise_6) : null,
                middle_exam: midScore,
                exercise_7: r.exercise_7 !== null ? Number(r.exercise_7) : null,
                exercise_8: r.exercise_8 !== null ? Number(r.exercise_8) : null,
                exercise_9: r.exercise_9 !== null ? Number(r.exercise_9) : null,
                exercise_10: r.exercise_10 !== null ? Number(r.exercise_10) : null,
                exercise_11: r.exercise_11 !== null ? Number(r.exercise_11) : null,
                exercise_12: r.exercise_12 !== null ? Number(r.exercise_12) : null,
                final_exam: finalScoreVal,
                avg_exercise: r.avg_exercise !== null ? Number(r.avg_exercise) : null,
                final_score: r.final_score !== null ? Number(r.final_score) : null,
                letter_grade: r.letter_grade || cls.letter_grade || null,
                classification_label: cls.label,
                middle_exam_label: midCls.label,
                final_exam_label: finCls.label,
                
                // Progress Report specific fields & Kinerja metrics
                avg_ex_1_6: avg1_6,
                attendance_score: attScore,
                class_activity: actScore,
                auto_attendance_score: autoAtt,
                auto_class_activity: autoAct,
                is_att_manual: isAttManual,
                is_act_manual: isActManual,
                progress_score: r.progress_score !== null ? Number(r.progress_score) : calcProgressScore,
                progress_grade: progressCls.letter_grade,
                progress_label: progressCls.label,

                // Certificate status
                can_print_progress: midScore !== null,
                can_print_certificate: finalScoreVal !== null,
                cert_issue_date: r.cert_issue_date || null,
                custom_subjects: r.custom_subjects || null,

                notes: r.notes || '',
                updated_at: r.updated_at || null
            };
        });

        // Hitung peringkat badge (A1, A2, B1, B2...) untuk seluruh siswa di kelas
        const { badgeMap, rankedSummary } = computeClassGradeBadges(students);
        students.forEach(s => {
            const bInfo = badgeMap[String(s.student_id)];
            s.level_badge = bInfo ? bInfo.badge : null;
            s.rank_in_grade = bInfo ? bInfo.rank_in_grade : null;
            s.total_in_grade = bInfo ? bInfo.total_in_grade : null;
        });

        res.json({
            success: true,
            class: {
                id: classObj.id,
                nama: classObj.nama,
                program: classObj.program,
                unit: classObj.unit,
                pengajar: classObj.pengajar,
                hari: classObj.hari,
                jam: classObj.jam || (classObj.mulai && classObj.selesai ? `${classObj.mulai} - ${classObj.selesai}` : '-')
            },
            term_or_period: term,
            academic_year: year,
            subjects: effectiveSubjects,
            lessons_from_kinerja: lessons.map(l => l.lesson),
            scoring_classification: [
                { grade: 'A', label: 'Very good', range: '86 - 100' },
                { grade: 'B', label: 'Good', range: '70 - 85' },
                { grade: 'C', label: 'Enough', range: '60 - 69' },
                { grade: 'D', label: 'Needs Improvement', range: '< 60' }
            ],
            ranked_summary: rankedSummary,
            students
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Menyimpan nilai siswa secara massal per kelas dengan transaksi atomik.
 */
async function saveBatchGrades(req, res, next) {
    const { class_id, term_or_period, academic_year, grades, subjects } = req.body;

    if (!class_id) {
        return res.status(400).json({ success: false, message: 'ID Kelas (class_id) wajib disertakan.' });
    }
    if (!Array.isArray(grades) || grades.length === 0) {
        return res.status(400).json({ success: false, message: 'Daftar nilai (grades) harus berupa array dan tidak boleh kosong.' });
    }

    const term = term_or_period || 'Term 1';
    const year = academic_year || '2025/2026';
    const creator = req.user ? (req.user.name || req.user.email || 'Admin') : 'System';

    try {
        const [[classObj]] = await db.query('SELECT * FROM classes WHERE id = ?', [class_id]);
        if (!classObj) {
            return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan.' });
        }

        // Cek hak akses pengajar
        const userRole = (req.user && req.user.role ? req.user.role : '').toLowerCase();
        const isTeacher = userRole.includes('pengajar') || userRole.includes('teacher') || userRole.includes('guru');
        if (isTeacher && req.user) {
            const tName = (req.user.name || '').trim().toLowerCase();
            const classTeacher = (classObj.pengajar || '').trim().toLowerCase();
            if (classObj.teacher_id && classObj.teacher_id !== req.user.teacher_id && classTeacher !== tName) {
                const [allowed] = await db.query(
                    'SELECT id FROM classes WHERE id = ? AND (LOWER(pengajar) = ? OR teacher_id = ?)',
                    [class_id, tName, req.user.teacher_id || '']
                );
                if (allowed.length === 0) {
                    return res.status(403).json({ success: false, message: 'Akses dilarang. Anda bukan pengajar kelas ini.' });
                }
            }
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Jika ada payload subjects (6 nama subjek), simpan ke class_term_subjects
            if (Array.isArray(subjects) && subjects.length === 6) {
                const cleanSubs = subjects.map(s => escapeHTML(String(s || '').trim()) || 'Subject');
                await conn.query(`
                    INSERT INTO class_term_subjects (class_id, term_or_period, academic_year, subjects, updated_at)
                    VALUES (?, ?, ?, ?::jsonb, NOW())
                    ON CONFLICT (class_id, term_or_period, academic_year)
                    DO UPDATE SET subjects = EXCLUDED.subjects, updated_at = NOW()
                `, [class_id, term, year, JSON.stringify(cleanSubs)]);
            }

            for (const item of grades) {
                const sId = String(item.student_id || '').trim();
                if (!sId) continue;

                const studentName = item.student_name || 'Siswa KBEC';

                const parseScore = (val) => {
                    if (val === null || val === undefined || val === '' || isNaN(val)) return null;
                    const num = parseFloat(val);
                    if (num < 0) return 0;
                    if (num > 100) return 100;
                    return Math.round(num * 100) / 100;
                };

                const ex1 = parseScore(item.exercise_1);
                const ex2 = parseScore(item.exercise_2);
                const ex3 = parseScore(item.exercise_3);
                const ex4 = parseScore(item.exercise_4);
                const ex5 = parseScore(item.exercise_5);
                const ex6 = parseScore(item.exercise_6);
                const midExam = parseScore(item.middle_exam);
                const ex7 = parseScore(item.exercise_7);
                const ex8 = parseScore(item.exercise_8);
                const ex9 = parseScore(item.exercise_9);
                const ex10 = parseScore(item.exercise_10);
                const ex11 = parseScore(item.exercise_11);
                const ex12 = parseScore(item.exercise_12);
                const finalExam = parseScore(item.final_exam);

                // Hitung rata-rata latihan
                const exercises = [ex1, ex2, ex3, ex4, ex5, ex6, ex7, ex8, ex9, ex10, ex11, ex12].filter(v => v !== null);
                let avgExercise = null;
                if (exercises.length > 0) {
                    avgExercise = Math.round((exercises.reduce((a, b) => a + b, 0) / exercises.length) * 100) / 100;
                }

                // Hitung Nilai Akhir Kursus (Weighted)
                let finalScore = null;
                if (avgExercise !== null && midExam !== null && finalExam !== null) {
                    finalScore = Math.round((avgExercise * 0.40 + midExam * 0.30 + finalExam * 0.30) * 100) / 100;
                } else if (avgExercise !== null && midExam !== null && finalExam === null) {
                    finalScore = Math.round((avgExercise * 0.50 + midExam * 0.50) * 100) / 100;
                } else if (avgExercise !== null && midExam === null && finalExam === null) {
                    finalScore = avgExercise;
                } else if (exercises.length === 0 && (midExam !== null || finalExam !== null)) {
                    const examArr = [midExam, finalExam].filter(v => v !== null);
                    finalScore = Math.round((examArr.reduce((a, b) => a + b, 0) / examArr.length) * 100) / 100;
                }

                const cls = calculateScoreClassification(finalScore);
                const letterGrade = cls.letter_grade;

                // Hitung Nilai Progress Report (Mid-Term)
                const ex1_6 = [ex1, ex2, ex3, ex4, ex5, ex6].filter(v => v !== null);
                let avg1_6 = null;
                if (ex1_6.length > 0) {
                    avg1_6 = Math.round((ex1_6.reduce((a, b) => a + b, 0) / ex1_6.length) * 10) / 10;
                }

                const attScore = parseScore(item.attendance_score) !== null ? parseScore(item.attendance_score) : 90.0;
                const actScore = parseScore(item.class_activity) !== null ? parseScore(item.class_activity) : 80.0;

                let progressScore = null;
                if (avg1_6 !== null && midExam !== null) {
                    progressScore = Math.round((avg1_6 * 0.40 + midExam * 0.40 + attScore * 0.10 + actScore * 0.10) * 10) / 10;
                }

                const certDate = item.cert_issue_date || null;
                const notes = item.notes ? escapeHTML(String(item.notes).trim()) : null;
                const customSubsJson = Array.isArray(item.custom_subjects) ? JSON.stringify(item.custom_subjects) : null;

                await conn.query(`
                    INSERT INTO student_term_grades (
                        student_id, student_name, class_id, class_name, term_or_period, academic_year,
                        exercise_1, exercise_2, exercise_3, exercise_4, exercise_5, exercise_6,
                        middle_exam,
                        exercise_7, exercise_8, exercise_9, exercise_10, exercise_11, exercise_12,
                        final_exam,
                        avg_exercise, final_score, letter_grade, notes, created_by, updated_at,
                        attendance_score, class_activity, progress_score, cert_issue_date, custom_subjects
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?,
                        ?,
                        ?, ?, ?, ?, ?, ?,
                        ?,
                        ?, ?, ?, ?, ?, NOW(),
                        ?, ?, ?, ?, ?::jsonb
                    )
                    ON CONFLICT (student_id, class_id, term_or_period, academic_year)
                    DO UPDATE SET
                        student_name = EXCLUDED.student_name,
                        class_name = EXCLUDED.class_name,
                        exercise_1 = EXCLUDED.exercise_1,
                        exercise_2 = EXCLUDED.exercise_2,
                        exercise_3 = EXCLUDED.exercise_3,
                        exercise_4 = EXCLUDED.exercise_4,
                        exercise_5 = EXCLUDED.exercise_5,
                        exercise_6 = EXCLUDED.exercise_6,
                        middle_exam = EXCLUDED.middle_exam,
                        exercise_7 = EXCLUDED.exercise_7,
                        exercise_8 = EXCLUDED.exercise_8,
                        exercise_9 = EXCLUDED.exercise_9,
                        exercise_10 = EXCLUDED.exercise_10,
                        exercise_11 = EXCLUDED.exercise_11,
                        exercise_12 = EXCLUDED.exercise_12,
                        final_exam = EXCLUDED.final_exam,
                        avg_exercise = EXCLUDED.avg_exercise,
                        final_score = EXCLUDED.final_score,
                        letter_grade = EXCLUDED.letter_grade,
                        notes = EXCLUDED.notes,
                        attendance_score = EXCLUDED.attendance_score,
                        class_activity = EXCLUDED.class_activity,
                        progress_score = EXCLUDED.progress_score,
                        cert_issue_date = EXCLUDED.cert_issue_date,
                        custom_subjects = COALESCE(EXCLUDED.custom_subjects, student_term_grades.custom_subjects),
                        updated_at = NOW()
                `, [
                    sId, studentName, class_id, classObj.nama, term, year,
                    ex1, ex2, ex3, ex4, ex5, ex6,
                    midExam,
                    ex7, ex8, ex9, ex10, ex11, ex12,
                    finalExam,
                    avgExercise, finalScore, letterGrade, notes, creator,
                    attScore, actScore, progressScore, certDate, customSubsJson
                ]);
            }

            await conn.commit();
            res.json({
                success: true,
                message: `Berhasil menyimpan nilai untuk ${grades.length} siswa di kelas ${classObj.nama} (${term} - ${year}).`
            });
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    } catch (err) {
        next(err);
    }
}

/**
 * Mengambil data detail The Progress Report untuk siswa tertentu dengan subjek dinamis & presensi riil.
 */
async function getProgressReportData(req, res, next) {
    const { student_id, class_id, term_or_period, academic_year } = req.query;

    if (!student_id || !class_id) {
        return res.status(400).json({ success: false, message: 'student_id dan class_id wajib disertakan.' });
    }

    const term = term_or_period || 'Term 1';
    const year = academic_year || '2025/2026';

    try {
        const [[classObj]] = await db.query('SELECT * FROM classes WHERE id = ?', [class_id]);
        const [[studentObj]] = await db.query('SELECT * FROM students WHERE id = ?', [student_id]);
        if (!studentObj) {
            return res.status(404).json({ success: false, message: 'Data siswa tidak ditemukan.' });
        }

        const [[gradeRow]] = await db.query(`
            SELECT * FROM student_term_grades 
            WHERE student_id::text = ? AND class_id = ? AND term_or_period = ? AND academic_year = ?
        `, [student_id, class_id, term, year]);

        // Ambil 6 subjek dinamis: cek kustom siswa -> cek kelas -> cek kurikulum
        let activeSubjects = [];
        if (gradeRow && Array.isArray(gradeRow.custom_subjects) && gradeRow.custom_subjects.length === 6) {
            activeSubjects = gradeRow.custom_subjects;
        } else {
            activeSubjects = await getEffectiveClassSubjects(class_id, term, year, classObj?.program);
        }

        const exScores = [
            gradeRow && gradeRow.exercise_1 !== null ? parseFloat(gradeRow.exercise_1) : 100.0,
            gradeRow && gradeRow.exercise_2 !== null ? parseFloat(gradeRow.exercise_2) : 100.0,
            gradeRow && gradeRow.exercise_3 !== null ? parseFloat(gradeRow.exercise_3) : 100.0,
            gradeRow && gradeRow.exercise_4 !== null ? parseFloat(gradeRow.exercise_4) : 96.0,
            gradeRow && gradeRow.exercise_5 !== null ? parseFloat(gradeRow.exercise_5) : 92.0,
            gradeRow && gradeRow.exercise_6 !== null ? parseFloat(gradeRow.exercise_6) : 90.0,
        ];

        const avgSemester1 = Math.round((exScores.reduce((a, b) => a + b, 0) / exScores.length) * 10) / 10;
        const midExam = gradeRow && gradeRow.middle_exam !== null ? parseFloat(gradeRow.middle_exam) : 85.0;

        // Ambil kehadiran & class activity (prioritas: nilai manual tersimpan, jika belum ada hitung otomatis dari kinerja)
        let attendance = gradeRow && gradeRow.attendance_score !== null && !isNaN(gradeRow.attendance_score)
            ? parseFloat(gradeRow.attendance_score)
            : null;
        let classActivity = gradeRow && gradeRow.class_activity !== null && !isNaN(gradeRow.class_activity)
            ? parseFloat(gradeRow.class_activity)
            : null;

        if (attendance === null || classActivity === null) {
            const autoPerf = await getStudentAutoPerformance(student_id, class_id, classObj?.nama);
            if (attendance === null) attendance = autoPerf.attendance_score;
            if (classActivity === null) classActivity = autoPerf.class_activity;
        }

        const weightedAvg = Math.round(avgSemester1 * 0.40 * 10) / 10;
        const weightedMid = Math.round(midExam * 0.40 * 10) / 10;
        const weightedAtt = Math.round(attendance * 0.10 * 10) / 10;
        const weightedAct = Math.round(classActivity * 0.10 * 10) / 10;
        const totalProgressScore = Math.round((weightedAvg + weightedMid + weightedAtt + weightedAct) * 10) / 10;

        const cls = calculateScoreClassification(totalProgressScore);

        res.json({
            success: true,
            report_title: `THE PROGRESS REPORT 1st SEMESTER OF ${String(classObj?.program || studentObj.level || 'BEGINNER 1').toUpperCase()}`,
            student: {
                id: studentObj.id,
                name: studentObj.nama,
                program: classObj?.program || studentObj.program || 'BEGINNER 1',
                level: studentObj.level || classObj?.nama || 'Beginner 1'
            },
            subjects: activeSubjects.map((sub, idx) => ({
                no: idx + 1,
                subject: sub,
                score: exScores[idx] !== undefined ? exScores[idx].toFixed(1) : '100.0'
            })),
            average_1st_semester: avgSemester1.toFixed(1),
            subjects_to_count: [
                { name: 'Average the 1st semester', score: avgSemester1.toFixed(1), weight: '40', weighted_score: weightedAvg.toFixed(1) },
                { name: 'Score of 1st semester exam', score: midExam.toFixed(1), weight: '40', weighted_score: weightedMid.toFixed(1) },
                { name: 'Attendance', score: attendance.toFixed(1), weight: '10', weighted_score: weightedAtt.toFixed(1) },
                { name: 'Class Activity', score: classActivity.toFixed(1), weight: '10', weighted_score: weightedAct.toFixed(1) }
            ],
            attendance_raw: attendance,
            class_activity_raw: classActivity,
            total_progress_score: totalProgressScore.toFixed(1),
            letter_grade: cls.letter_grade || 'A',
            classification_label: cls.label || 'Very good',
            director_name: 'Drs. Suharmadi, Ak. MM. MSi. CA.',
            director_title: 'Director',
            place: 'Tangerang Selatan',
            issue_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Mengambil data detail Certificate of Completion untuk siswa tertentu
 */
async function getCertificateData(req, res, next) {
    const { student_id, class_id, term_or_period, academic_year } = req.query;

    if (!student_id || !class_id) {
        return res.status(400).json({ success: false, message: 'student_id dan class_id wajib disertakan.' });
    }

    const term = term_or_period || 'Term 1';
    const year = academic_year || '2025/2026';

    try {
        const [[classObj]] = await db.query('SELECT * FROM classes WHERE id = ?', [class_id]);
        const [[studentObj]] = await db.query('SELECT * FROM students WHERE id = ?', [student_id]);
        if (!studentObj) {
            return res.status(404).json({ success: false, message: 'Data siswa tidak ditemukan.' });
        }

        const [[gradeRow]] = await db.query(`
            SELECT * FROM student_term_grades 
            WHERE student_id::text = ? AND class_id = ? AND term_or_period = ? AND academic_year = ?
        `, [student_id, class_id, term, year]);

        const finalScore = gradeRow && gradeRow.final_score !== null ? parseFloat(gradeRow.final_score) : 82.5;
        const cls = calculateScoreClassification(finalScore);
        const progName = (classObj?.program || studentObj.level || 'Beginner 1').toUpperCase();

        // Ambil nilai seluruh siswa di kelas untuk menghitung peringkat badge kelas (A1, A2, B1, B2...)
        const [classStudentRows] = await db.query(`
            SELECT cs.student_id, s.nama, stg.final_score, stg.final_exam
            FROM class_students cs
            JOIN students s ON cs.student_id::text = s.id::text
            LEFT JOIN student_term_grades stg ON stg.student_id::text = s.id::text 
                 AND stg.class_id = cs.class_id 
                 AND stg.term_or_period = ? 
                 AND stg.academic_year = ?
            WHERE cs.class_id = ?
        `, [term, year, class_id]);

        const { badgeMap, rankedSummary } = computeClassGradeBadges(classStudentRows);
        const bInfo = badgeMap[String(student_id)] || {
            badge: `${cls.letter_grade || 'B'}1`,
            rank_in_grade: 1,
            total_in_grade: 1
        };
        const levelBadge = bInfo.badge;

        res.json({
            success: true,
            student: {
                id: studentObj.id,
                name: studentObj.nama,
                parents: studentObj.nama_ayah || studentObj.nama_ibu || 'Wasril',
                birthday: studentObj.tempat_tanggal_lahir || 'Jakarta, 5th of October 2018',
                religion: studentObj.agama || 'Islam',
                address: studentObj.alamat || 'Jl. K.H. Wahid Hasyim, Jurang Mangu Timur, Pondok Aren, Tangerang Selatan',
                program: progName,
                level_badge: levelBadge,
                rank_in_grade: bInfo.rank_in_grade,
                total_in_grade: bInfo.total_in_grade,
                foto: studentObj.foto || null
            },
            badge_info: bInfo,
            class_ranks: rankedSummary,
            class: classObj,
            final_score: finalScore.toFixed(1),
            letter_grade: cls.letter_grade || 'B',
            classification_label: cls.label || 'Good',
            director_name: 'Drs. Suharmadi, Ak. MM. MSi. CA.',
            director_title: 'Director',
            place: 'Tangerang Selatan',
            issue_date: gradeRow?.cert_issue_date 
                ? new Date(gradeRow.cert_issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Mengambil data cetak massal (semua siswa di kelas) untuk Progress Report atau Certificate
 */
async function getBatchPrintData(req, res, next) {
    const { class_id, term_or_period, academic_year, document_type } = req.query;

    if (!class_id) {
        return res.status(400).json({ success: false, message: 'class_id wajib disertakan.' });
    }

    const term = term_or_period || 'Term 1';
    const year = academic_year || '2025/2026';
    const docType = document_type || 'progress'; // 'progress' | 'certificate'

    try {
        const [[classObj]] = await db.query('SELECT * FROM classes WHERE id = ?', [class_id]);
        if (!classObj) {
            return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan.' });
        }

        // Subjek dinamis kelas untuk cetak massal
        const effectiveSubjects = await getEffectiveClassSubjects(class_id, term, year, classObj.program);

        const [students] = await db.query(`
            SELECT 
                s.id, s.nama, s.nama_ayah, s.nama_ibu, s.tempat_tanggal_lahir, s.agama, s.alamat, s.program, s.level, s.foto,
                stg.exercise_1, stg.exercise_2, stg.exercise_3, stg.exercise_4, stg.exercise_5, stg.exercise_6,
                stg.middle_exam, stg.final_exam, stg.final_score, stg.letter_grade,
                stg.attendance_score, stg.class_activity, stg.progress_score, stg.cert_issue_date, stg.custom_subjects
            FROM class_students cs
            JOIN students s ON cs.student_id::text = s.id::text
            LEFT JOIN student_term_grades stg ON stg.student_id::text = s.id::text 
                 AND stg.class_id = cs.class_id 
                 AND stg.term_or_period = ? 
                 AND stg.academic_year = ?
            WHERE cs.class_id = ?
            ORDER BY s.nama ASC
        `, [term, year, class_id]);

        // Pre-fetch Kinerja Siswa untuk kelas ini jika ada siswa yang belum punya nilai attendance/activity
        const [sgRows] = await db.query(`
            SELECT student_id::text, presensi, speaking, wb, sb, extra FROM student_grades WHERE class_id = ?
        `, [class_id]);

        const sgMap = {};
        sgRows.forEach(r => {
            const sid = String(r.student_id);
            if (!sgMap[sid]) sgMap[sid] = { total: 0, hadir: 0, acts: [] };
            const p = (r.presensi || '').trim().toLowerCase();
            if (p && p !== '-' && p !== 'kosong') {
                sgMap[sid].total++;
                if (p === 'hadir') {
                    sgMap[sid].hadir++;
                    const sc = [r.speaking, r.wb, r.sb, r.extra]
                        .map(v => (v !== null && v !== undefined && v !== '' && !isNaN(v)) ? parseFloat(v) : null)
                        .filter(v => v !== null);
                    if (sc.length > 0) sgMap[sid].acts.push(sc.reduce((a, b) => a + b, 0) / sc.length);
                }
            }
        });

        // Hitung peringkat badge (A1, A2, B1, B2...) untuk seluruh siswa di kelas
        const { badgeMap, rankedSummary } = computeClassGradeBadges(students);

        const items = students.map(s => {
            const finalScore = s.final_score !== null ? parseFloat(s.final_score) : 80.0;
            const cls = calculateScoreClassification(finalScore);

            const exScores = [
                s.exercise_1 !== null ? parseFloat(s.exercise_1) : 100.0,
                s.exercise_2 !== null ? parseFloat(s.exercise_2) : 100.0,
                s.exercise_3 !== null ? parseFloat(s.exercise_3) : 100.0,
                s.exercise_4 !== null ? parseFloat(s.exercise_4) : 96.0,
                s.exercise_5 !== null ? parseFloat(s.exercise_5) : 92.0,
                s.exercise_6 !== null ? parseFloat(s.exercise_6) : 90.0,
            ];
            const avgSem1 = Math.round((exScores.reduce((a, b) => a + b, 0) / exScores.length) * 10) / 10;
            const mid = s.middle_exam !== null ? parseFloat(s.middle_exam) : 85.0;

            // Attendance & Class Activity
            const k = sgMap[String(s.id)];
            const autoAtt = k && k.total > 0 ? Math.round((k.hadir / k.total) * 100 * 10) / 10 : 100.0;
            const autoAct = k && k.acts.length > 0 ? Math.round((k.acts.reduce((a, b) => a + b, 0) / k.acts.length) * 10) / 10 : 80.0;

            const att = s.attendance_score !== null && !isNaN(s.attendance_score) ? parseFloat(s.attendance_score) : autoAtt;
            const act = s.class_activity !== null && !isNaN(s.class_activity) ? parseFloat(s.class_activity) : autoAct;
            const progScore = Math.round((avgSem1 * 0.40 + mid * 0.40 + att * 0.10 + act * 0.10) * 10) / 10;
            const progCls = calculateScoreClassification(progScore);

            const progName = (classObj.program || s.level || 'Beginner 1').toUpperCase();
            const bInfo = badgeMap[String(s.id)];
            const levelBadge = bInfo ? bInfo.badge : `${cls.letter_grade || 'B'}1`;

            const studentSubs = Array.isArray(s.custom_subjects) && s.custom_subjects.length === 6
                ? s.custom_subjects
                : effectiveSubjects;

            return {
                id: s.id,
                name: s.nama,
                parents: s.nama_ayah || s.nama_ibu || 'Orang Tua Siswa',
                birthday: s.tempat_tanggal_lahir || 'Jakarta, 5th of October 2018',
                religion: s.agama || 'Islam',
                address: s.alamat || '-',
                program: progName,
                level_badge: levelBadge,
                rank_in_grade: bInfo ? bInfo.rank_in_grade : 1,
                total_in_grade: bInfo ? bInfo.total_in_grade : 1,
                foto: s.foto || null,
                subjects: studentSubs,
                ex_scores: exScores,
                average_1st_semester: avgSem1.toFixed(1),
                mid_exam: mid.toFixed(1),
                attendance: att.toFixed(1),
                class_activity: act.toFixed(1),
                progress_score: progScore.toFixed(1),
                progress_grade: progCls.letter_grade || 'A',
                final_score: finalScore.toFixed(1),
                final_grade: cls.letter_grade || 'B'
            };
        });

        res.json({
            success: true,
            class: classObj,
            document_type: docType,
            term_or_period: term,
            academic_year: year,
            subjects: effectiveSubjects,
            director_name: 'Drs. Suharmadi, Ak. MM. MSi. CA.',
            director_title: 'Director',
            place: 'Tangerang Selatan',
            issue_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            ranked_summary: rankedSummary,
            items
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Menyimpan / memperbarui pas foto siswa untuk sertifikat
 */
async function updateStudentCertificatePhoto(req, res, next) {
    const { student_id, foto } = req.body;
    if (!student_id) {
        return res.status(400).json({ success: false, message: 'student_id wajib disertakan.' });
    }
    try {
        await db.query('UPDATE students SET foto = ? WHERE id::text = ?::text', [foto || null, String(student_id)]);
        res.json({ success: true, message: 'Pas foto siswa berhasil diperbarui.' });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getClasses,
    getClassGrades,
    getClassSubjects,
    saveClassSubjects,
    saveBatchGrades,
    getProgressReportData,
    getCertificateData,
    getBatchPrintData,
    updateStudentCertificatePhoto,
    computeClassGradeBadges,
    calculateScoreClassification
};
