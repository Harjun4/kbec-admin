const db = require('../config/db');
const { resolveStudentUnit, generateUniqueStudentId } = require('../utils/helpers');

function generateNonSppPeriod() {
    return generateCleanBillId('NONSPP');
}

async function getBills(req, res, next) {
    try {
        const { bulan, unit, status, search, type, kategori } = req.query;
        let whereClauses = [];
        let params = [];

        if (type === 'spp' || kategori === 'SPP') {
            whereClauses.push("(b.kategori = 'SPP' OR b.kategori IS NULL) AND (b.bulan_tagihan NOT LIKE 'NONSPP%' OR b.bulan_tagihan IS NULL)");
        } else if (type === 'non-spp' || (kategori && kategori !== 'Semua' && kategori !== 'SPP') || bulan === 'NONSPP' || (bulan && bulan.startsWith('NONSPP'))) {
            whereClauses.push("(b.kategori IN ('Biaya Pendaftaran', 'Biaya Modul/Buku', 'Biaya Modul / Buku', 'Biaya Seragam & Pin') OR b.bulan_tagihan LIKE 'NONSPP%')");
        }

        if (bulan && bulan !== 'Semua' && bulan !== 'NONSPP' && !bulan.startsWith('NONSPP') && bulan.trim() !== '') {
            whereClauses.push('b.bulan_tagihan = ?');
            params.push(bulan);
        }
        if (status && status !== 'Semua') {
            whereClauses.push('b.status = ?');
            params.push(status);
        }
        if (search && search.trim()) {
            whereClauses.push('(b.id ILIKE ? OR b.nama ILIKE ? OR b.student_id ILIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const [rows] = await db.query(
            `SELECT b.id, 
                    COALESCE(b.student_id, s.id) AS student_id, 
                    COALESCE(s.nama, b.nama) AS nama, 
                    COALESCE(s.level, b.program, s.program) AS program, 
                    s.level AS level, 
                    COALESCE(b.unit, s.program, 'KBEC') AS unit, 
                    b.bulan_tagihan, b.kategori, b.nominal, b.terbayar, b.status, b.catatan,
                    TO_CHAR(b.jatuh_tempo::timestamp, 'YYYY-MM-DD') AS jatuh_tempo, 
                    TO_CHAR(b.created_at::timestamp, 'YYYY-MM-DD') AS created_at 
             FROM bills b 
             LEFT JOIN students s ON (b.student_id = s.id OR (b.student_id IS NULL AND LOWER(TRIM(b.nama)) = LOWER(TRIM(s.nama)))) 
             ${whereSql} 
             ORDER BY b.created_at DESC`,
            params
        );

        let filteredRows = rows;
        if (unit && unit !== 'Semua' && unit.trim() !== '') {
            filteredRows = rows.filter(b => {
                const uName = resolveStudentUnit(b.student_id, b.program, b.level, b.unit);
                if (unit.toUpperCase() === 'KBEC' && uName === 'KBEC') return true;
                if (unit.toUpperCase() === 'CALISTUNG' && uName === 'Calistung') return true;
                if (unit.toUpperCase() === 'BIMBEL' && uName === 'Bimbel') return true;
                if (unit.toUpperCase() === 'TK' && uName === 'TK') return true;
                if (unit.toUpperCase() === 'ARABIN' && uName === 'Arabin') return true;
                return uName.toLowerCase().includes(unit.toLowerCase());
            });
        }

        res.json(filteredRows);
    } catch (err) {
        next(err);
    }
}

async function generateSppBills(req, res, next) {
    const { bulan } = req.body;
    const targetBulan = bulan || new Date().toISOString().slice(0, 7);

    try {
        const [students] = await db.query("SELECT id, nama, program, level, status FROM students WHERE (status IS NULL OR status ILIKE 'Aktif' OR status = '')");
        const [programs] = await db.query('SELECT nama, cat, biaya FROM programs');

        let generatedCount = 0;
        const defaultDueDate = `${targetBulan}-10`;

        for (const std of students) {
            const unitName = resolveStudentUnit(std.id, std.program, std.level);

            if (unitName === 'Arabin') {
                continue; // Beasiswa gratis
            }

            const cleanId = String(std.id).split('-')[0].trim();
            const cleanNama = String(std.nama || '').toLowerCase().trim();

            const [existing] = await db.query(
                "SELECT id FROM bills WHERE (student_id = ? OR LOWER(TRIM(nama)) = ?) AND bulan_tagihan = ? AND (kategori = 'SPP' OR kategori IS NULL)",
                [std.id, cleanNama, targetBulan]
            );
            if (existing.length === 0) {
                let progName = (std.level && std.level.trim()) ? std.level.trim() : (std.program || 'Beginner 1');
                let matchedProg = programs.find(p => p.nama.toLowerCase() === progName.toLowerCase());

                if (!matchedProg && std.level) {
                    matchedProg = programs.find(p => p.nama.toLowerCase() === std.level.trim().toLowerCase());
                }
                if (!matchedProg && std.program) {
                    matchedProg = programs.find(p => p.nama.toLowerCase() === std.program.trim().toLowerCase());
                }
                if (!matchedProg) {
                    matchedProg = programs.find(p => p.cat && p.cat.toLowerCase() === unitName.toLowerCase());
                }

                let nominal = 0;
                if (matchedProg) {
                    progName = matchedProg.nama;
                    nominal = parseInt(matchedProg.biaya || 0, 10);
                } else {
                    nominal = 175000;
                }

                let billId = generateCleanBillId('SPP', targetBulan, std.id);
                const [existingBillId] = await db.query('SELECT id FROM bills WHERE id = ?', [billId]);
                if (existingBillId.length > 0) {
                    billId = `${billId}-${Math.floor(100 + Math.random() * 900)}`;
                }

                try {
                    await db.query(
                        'INSERT INTO bills (id, student_id, nama, program, unit, bulan_tagihan, kategori, nominal, terbayar, status, jatuh_tempo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
                        [billId, std.id, std.nama, progName, unitName, targetBulan, 'SPP', nominal, 0, 'Tertagih', defaultDueDate]
                    );
                    generatedCount++;
                } catch (bErr) {
                    console.warn('Skip duplicate bill generation:', bErr.message);
                }
            }
        }

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'System',
                action: `Auto-Generate Tagihan SPP (${targetBulan})`,
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.json({ success: true, message: `Berhasil men-generate ${generatedCount} tagihan SPP baru untuk bulan ${targetBulan}.`, count: generatedCount });
    } catch (err) {
        next(err);
    }
}

function generateCleanBillId(kategori, bulanTagihan, studentId = null) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    if (kategori === 'SPP' || !kategori) {
        // Format: TAG-202608-26070000115C
        const periodStr = bulanTagihan ? String(bulanTagihan).replace(/[^0-9]/g, '').slice(0, 6) : `${year}${month}`;
        const cleanPeriod = periodStr.length === 6 ? periodStr : `${year}${month}`;
        const cleanStudentId = studentId 
            ? String(studentId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() 
            : String(Math.floor(1000 + Math.random() * 9000));
        return `TAG-${cleanPeriod}-${cleanStudentId}`;
    } else {
        // Format: NONSPP-20260813-0912
        const uniqueNum = String(Math.floor(1000 + Math.random() * 9000));
        return `NONSPP-${year}${month}${day}-${uniqueNum}`;
    }
}

const generateBillId = generateCleanBillId;

async function createBill(req, res, next) {
    const { student_id, studentId, nama, program, unit, bulan_tagihan, kategori, nominal, jatuh_tempo, notes, catatan } = req.body;
    let targetStudentId = student_id || studentId;
    let targetNama = nama;

    if (!targetStudentId && targetNama && targetNama.includes(' (')) {
        const parts = targetNama.split(' (');
        targetNama = parts[0].trim();
        targetStudentId = parts[1].replace(')', '').trim();
    }

    const isNonSpp = (kategori && kategori !== 'SPP') || (bulan_tagihan && String(bulan_tagihan).startsWith('NONSPP'));
    const targetBulan = isNonSpp ? (bulan_tagihan || generateCleanBillId('NONSPP')) : (bulan_tagihan || new Date().toISOString().slice(0, 7));
    const cleanCatatan = notes || catatan || '';

    try {
        let finalStudentId = targetStudentId;
        let finalNama = targetNama;

        // FASE 1: Strict Exact Match Student Lookup
        if (targetStudentId) {
            const [[sRow]] = await db.query(
                'SELECT id, nama, program, unit FROM students WHERE id = ? OR id::text = ? LIMIT 1',
                [targetStudentId, String(targetStudentId)]
            );
            if (sRow) {
                finalStudentId = sRow.id;
                finalNama = sRow.nama;
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'Data siswa tidak ditemukan.'
                });
            }
        } else if (targetNama) {
            const cleanNamaStr = String(targetNama).trim();
            const [[sRow]] = await db.query(
                'SELECT id, nama, program, unit FROM students WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?)) LIMIT 1',
                [cleanNamaStr]
            );
            if (sRow) {
                finalStudentId = sRow.id;
                finalNama = sRow.nama;
            }
        }

        let validProgName = program || 'Beginner 1';
        const [[progCheck]] = await db.query('SELECT nama, cat FROM programs WHERE nama = ? OR cat = ? LIMIT 1', [program, program]);
        if (progCheck) {
            validProgName = progCheck.nama;
        }

        const finalUnit = unit || (progCheck ? progCheck.cat : resolveStudentUnit(finalStudentId, validProgName));
        const billId = generateCleanBillId(kategori || 'SPP', targetBulan, finalStudentId || targetStudentId);

        // Insert TUNGGAL untuk 1 siswa yang dipilih
        await db.query(
            'INSERT INTO bills (id, student_id, nama, program, unit, bulan_tagihan, kategori, nominal, terbayar, status, jatuh_tempo, catatan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (student_id, bulan_tagihan, kategori) DO UPDATE SET nominal = EXCLUDED.nominal, catatan = EXCLUDED.catatan',
            [billId, finalStudentId || 'STD-MANUAL', finalNama || 'Siswa', validProgName, finalUnit, targetBulan, kategori || 'SPP', Number(nominal) || 0, 0, 'Tertagih', jatuh_tempo || `${targetBulan.slice(0, 7)}-10`, cleanCatatan]
        );

        res.status(201).json({ success: true, id: billId, bulan_tagihan: targetBulan });
    } catch (err) {
        next(err);
    }
}

async function updateBill(req, res, next) {
    const { id } = req.params;
    const { student_id, nama, program, unit, bulan_tagihan, kategori, nominal, jatuh_tempo, status, notes, catatan, voucher_id, discount_amount } = req.body;
    const cleanCatatan = notes !== undefined ? notes : (catatan !== undefined ? catatan : null);
    const cleanDiscount = Number(discount_amount) || 0;

    try {
        let finalStudentId = student_id;
        let finalNama = nama;

        if (!finalStudentId && nama) {
            const cleanNama = String(nama).split(' (')[0].trim();
            const [[sRow]] = await db.query('SELECT id, nama FROM students WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?)) LIMIT 1', [cleanNama]);
            if (sRow) {
                finalStudentId = sRow.id;
                finalNama = sRow.nama;
            }
        } else if (finalStudentId) {
            const [[sRow]] = await db.query('SELECT id, nama FROM students WHERE id = ?', [finalStudentId]);
            if (sRow) {
                finalNama = sRow.nama;
            }
        }

        const cleanNominal = Number(nominal) || 0;
        const targetBulan = bulan_tagihan || new Date().toISOString().slice(0, 7);
        const targetDueDate = jatuh_tempo || `${targetBulan}-10`;

        // 1. Hitung total terbayar riil dari tabel payments & check overpayment guardrail
        const [[bExisting]] = await db.query('SELECT nominal, terbayar, catatan, voucher_id, discount_amount FROM bills WHERE id = ?', [id]);
        const [[payResult]] = await db.query("SELECT SUM(jumlah) AS total_terbayar FROM payments WHERE bill_id = ? AND status = 'Lunas'", [id]);
        const totalTerbayar = Math.max(Number(bExisting?.terbayar || 0), Number(payResult?.total_terbayar || 0));

        if (bExisting && cleanNominal < totalTerbayar) {
            return res.status(400).json({
                success: false,
                message: `Nominal baru (Rp ${cleanNominal.toLocaleString('id-ID')}) tidak boleh lebih kecil dari jumlah yang sudah dibayarkan (Rp ${totalTerbayar.toLocaleString('id-ID')}).`
            });
        }

        // 2. Tentukan status & terbayar baru
        let newStatus = 'Tertagih';
        let newTerbayar = 0;
        if (totalTerbayar >= cleanNominal && cleanNominal > 0) {
            newStatus = 'Lunas';
            newTerbayar = cleanNominal;
        } else if (totalTerbayar > 0 && totalTerbayar < cleanNominal) {
            newStatus = 'Partial';
            newTerbayar = totalTerbayar;
        } else {
            newStatus = 'Tertagih';
            newTerbayar = 0;
        }

        const finalCatatan = cleanCatatan !== null ? cleanCatatan : (bExisting ? bExisting.catatan : '');
        const finalVoucherId = voucher_id !== undefined ? voucher_id : (bExisting ? bExisting.voucher_id : null);
        const finalDiscountAmount = cleanDiscount > 0 ? cleanDiscount : (bExisting ? Number(bExisting.discount_amount || 0) : 0);

        const [result] = await db.query(
            'UPDATE bills SET student_id = ?, nama = ?, program = ?, unit = ?, bulan_tagihan = ?, kategori = ?, nominal = ?, jatuh_tempo = ?, status = ?, terbayar = ?, catatan = ?, voucher_id = ?, discount_amount = ? WHERE id = ?',
            [finalStudentId || null, finalNama || 'Siswa', program || 'KBEC', unit || 'KBEC', targetBulan, kategori || 'SPP', cleanNominal, targetDueDate, newStatus, newTerbayar, finalCatatan, finalVoucherId, finalDiscountAmount, id]
        );

        if (result && result.affectedRows === 0) {
            const cleanId = finalStudentId ? String(finalStudentId).split('-')[0].trim() : '';
            const [existing] = await db.query(
                "SELECT id FROM bills WHERE (student_id = ? OR (student_id IS NOT NULL AND student_id ILIKE ?) OR LOWER(TRIM(nama)) = LOWER(TRIM(?))) AND bulan_tagihan = ?",
                [finalStudentId || id, `%${cleanId}%`, finalNama || '', targetBulan]
            );

            if (existing.length > 0) {
                const existingId = existing[0].id;
                const [[existPay]] = await db.query("SELECT SUM(jumlah) AS total_terbayar FROM payments WHERE bill_id = ? AND status = 'Lunas'", [existingId]);
                const existTerbayar = Number(existPay?.total_terbayar || 0);
                
                let existNewStatus = 'Tertagih';
                let existNewTerbayar = 0;
                if (existTerbayar >= cleanNominal && cleanNominal > 0) {
                    existNewStatus = 'Lunas';
                    existNewTerbayar = cleanNominal;
                } else if (existTerbayar > 0 && existTerbayar < cleanNominal) {
                    existNewStatus = 'Partial';
                    existNewTerbayar = existTerbayar;
                }

                await db.query(
                    'UPDATE bills SET student_id = ?, nama = ?, program = ?, unit = ?, bulan_tagihan = ?, kategori = ?, nominal = ?, jatuh_tempo = ?, status = ?, terbayar = ?, catatan = ? WHERE id = ?',
                    [finalStudentId || null, finalNama || 'Siswa', program || 'KBEC', unit || 'KBEC', targetBulan, kategori || 'SPP', cleanNominal, targetDueDate, existNewStatus, existNewTerbayar, finalCatatan, existingId]
                );
            } else {
                await db.query(
                    'INSERT INTO bills (id, student_id, nama, program, unit, bulan_tagihan, kategori, nominal, terbayar, status, jatuh_tempo, catatan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (student_id, bulan_tagihan, kategori) DO UPDATE SET nominal = EXCLUDED.nominal, catatan = EXCLUDED.catatan',
                    [id, finalStudentId || null, finalNama || 'Siswa', program || 'KBEC', unit || 'KBEC', targetBulan, kategori || 'SPP', cleanNominal, 0, 'Tertagih', targetDueDate, finalCatatan]
                );
            }
        }

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Update Tagihan (${id}) — Rp ${cleanNominal.toLocaleString('id-ID')}`,
                siswa: finalNama,
                program: program || unit || 'KBEC',
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.json({ success: true, message: 'Tagihan berhasil diperbarui.', status: newStatus, terbayar: newTerbayar });
    } catch (err) {
        next(err);
    }
}

async function deleteBill(req, res, next) {
    const { id } = req.params;
    try {
        // AUDIT FIX #3 (TINGGI): Tolak penghapusan tagihan yang sudah memiliki riwayat pembayaran
        const [[payCheck]] = await db.query(
            'SELECT COUNT(*) AS cnt FROM payments WHERE bill_id = ? OR bill_id::text = ?',
            [id, String(id)]
        );
        if (payCheck && Number(payCheck.cnt) > 0) {
            return res.status(400).json({
                success: false,
                message: `Tagihan tidak dapat dihapus karena memiliki ${payCheck.cnt} riwayat pembayaran. Batalkan atau hapus kuitansi pembayaran terlebih dahulu.`
            });
        }

        await db.query('DELETE FROM bills WHERE id = ? OR id::text = ?', [id, String(id)]);
        res.json({ success: true, message: 'Tagihan berhasil dihapus.' });
    } catch (err) {
        next(err);
    }
}

async function getStudentBillsSummary(req, res, next) {
    try {
        const { bulan, unit, program, status, search } = req.query;
        const targetBulan = (bulan && bulan !== 'Semua' && bulan.trim()) ? bulan.trim() : null;

        let whereClauses = ["(s.status IS NULL OR s.status ILIKE 'Aktif' OR s.status = '')"];
        let params = [];

        if (search && search.trim()) {
            whereClauses.push('(s.id ILIKE ? OR s.nama ILIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const [students] = await db.query(
            `SELECT s.id, s.nama, s.program, s.level, s.status FROM students s ${whereSql} ORDER BY s.nama ASC`,
            params
        );

        const [programs] = await db.query('SELECT nama, cat, biaya FROM programs');

        // Fetch exclusively SPP bills from bills table (excluding Non-SPP bills)
        const [allBills] = await db.query(
            "SELECT b.id, b.student_id, b.nama, b.program, b.unit, b.bulan_tagihan, b.nominal, b.terbayar, b.status FROM bills b WHERE (b.kategori = 'SPP' OR b.kategori IS NULL) AND (b.bulan_tagihan NOT LIKE 'NONSPP%' OR b.bulan_tagihan IS NULL) ORDER BY b.bulan_tagihan ASC"
        );

        // Include virtual student records for any bills whose student_id is not in students table
        const knownStudentIds = new Set(students.map(s => String(s.id).toLowerCase()));
        const knownStudentNames = new Set(students.map(s => String(s.nama).toLowerCase().trim()));

        for (const b of allBills) {
            const bIdClean = String(b.student_id || '').toLowerCase();
            const bNamaClean = String(b.nama || '').toLowerCase().trim();

            if (b.student_id && !knownStudentIds.has(bIdClean) && !knownStudentNames.has(bNamaClean)) {
                if (search && search.trim()) {
                    const sTerm = search.trim().toLowerCase();
                    const matchesSearch = bIdClean.includes(sTerm) || bNamaClean.includes(sTerm);
                    if (!matchesSearch) continue;
                }

                knownStudentIds.add(bIdClean);
                knownStudentNames.add(bNamaClean);
                students.push({
                    id: b.student_id,
                    nama: b.nama || 'Siswa',
                    initial: b.nama ? b.nama.slice(0, 2).toUpperCase() : 'S',
                    program: b.program || b.unit || 'KBEC',
                    level: b.program || b.unit || '-',
                    status: 'Aktif',
                    kontak: '-'
                });
            }
        }

        let studentSummaries = [];
        let totalNominalSPP = 0;
        let totalTunggakanSummary = 0;
        let totalLunasCount = 0;
        let totalTunggakanCount = 0;

        const processedStudentKeys = new Set();

        for (const std of students) {
            const studentKey = String(std.id || '').toLowerCase().trim();

            if (processedStudentKeys.has(studentKey)) continue;
            processedStudentKeys.add(studentKey);
            const unitName = resolveStudentUnit(std.id, std.program, std.level, std.unit);

            // Filter unit if specified
            if (unit && unit !== 'Semua') {
                const uUpper = unit.toUpperCase();
                let matchUnit = false;
                if (uUpper === 'KBEC' && unitName === 'KBEC') matchUnit = true;
                else if (uUpper === 'CALISTUNG' && unitName === 'Calistung') matchUnit = true;
                else if (uUpper === 'BIMBEL' && unitName === 'Bimbel') matchUnit = true;
                else if (uUpper === 'TK' && unitName === 'TK') matchUnit = true;
                else if (uUpper === 'ARABIN' && unitName === 'Arabin') matchUnit = true;
                else if (unitName.toLowerCase().includes(unit.toLowerCase())) matchUnit = true;

                if (!matchUnit) continue;
            }

            // Match student's bills reliably
            const stdIdClean = String(std.id || '').toLowerCase();
            const stdNamaClean = String(std.nama || '').toLowerCase().trim();

            const stdBills = allBills.filter(b => {
                const bIdClean = String(b.student_id || '').toLowerCase();
                const bNamaClean = String(b.nama || '').toLowerCase().trim();
                return bIdClean === stdIdClean || (bNamaClean && bNamaClean === stdNamaClean);
            });

            const monthBill = targetBulan 
                ? stdBills.find(b => b.bulan_tagihan === targetBulan)
                : (stdBills.length > 0 ? stdBills[stdBills.length - 1] : null);

            // Find matching program fee
            let progName = (std.level && std.level.trim()) ? std.level.trim() : (std.program || 'Beginner 1');
            let matchedProg = programs.find(p => p.nama.toLowerCase() === progName.toLowerCase());
            if (!matchedProg && std.level) matchedProg = programs.find(p => p.nama.toLowerCase() === std.level.trim().toLowerCase());
            if (!matchedProg && std.program) matchedProg = programs.find(p => p.nama.toLowerCase() === std.program.trim().toLowerCase());

            // Filter program if specified
            if (program && program !== 'Semua') {
                const pLow = program.toLowerCase().trim();
                const stdProgLow = (std.program || '').toLowerCase().trim();
                const stdLevelLow = (std.level || '').toLowerCase().trim();
                const billProgLow = monthBill ? (monthBill.program || '').toLowerCase().trim() : '';
                const matchedCatLow = matchedProg && matchedProg.cat ? matchedProg.cat.toLowerCase().trim() : '';
                const matchedNameLow = matchedProg && matchedProg.nama ? matchedProg.nama.toLowerCase().trim() : '';

                const matchesProg = (stdProgLow === pLow) ||
                                    (stdLevelLow === pLow) ||
                                    (billProgLow === pLow) ||
                                    (matchedCatLow === pLow) ||
                                    (matchedNameLow === pLow) ||
                                    stdProgLow.includes(pLow) ||
                                    stdLevelLow.includes(pLow) ||
                                    billProgLow.includes(pLow);
                if (!matchesProg) continue;
            }

            // Total unpaid arrears across all months for this student
            let totalTunggakanStudent = 0;
            stdBills.forEach(b => {
                const sisa = Math.max(0, Number(b.nominal || 0) - Number(b.terbayar || 0));
                totalTunggakanStudent += sisa;
            });

            let monthStatus = 'Belum Ada Tagihan';
            let sppNominal = matchedProg ? parseInt(matchedProg.biaya || 0, 10) : 175000;
            let monthTunggakanNominal = 0;

            if (monthBill) {
                const nom = Number(monthBill.nominal || 0);
                const terb = Number(monthBill.terbayar || 0);
                if (terb >= nom && nom > 0) {
                    monthStatus = 'Lunas';
                } else if (terb > 0) {
                    monthStatus = 'Partial';
                } else {
                    monthStatus = monthBill.status || 'Tertagih';
                }
                monthTunggakanNominal = Math.max(0, nom - terb);
            } else if (unitName === 'Arabin') {
                sppNominal = 0;
                monthStatus = 'Beasiswa';
                monthTunggakanNominal = 0;
            }

            // Status filter if specified
            if (status && status !== 'Semua') {
                const sUpper = status.toUpperCase();
                if (sUpper === 'LUNAS' && monthStatus !== 'Lunas' && monthStatus !== 'Beasiswa') continue;
                if (sUpper === 'PARTIAL' && monthStatus !== 'Partial') continue;
                if ((sUpper === 'TUNGGAKAN' || sUpper === 'TERTAGIH') && (monthStatus !== 'Tertagih' && monthStatus !== 'Tunggakan' && monthStatus !== 'Partial')) continue;
                if (sUpper === 'BELUM ADA TAGIHAN' && monthStatus !== 'Belum Ada Tagihan') continue;
            }

            totalNominalSPP += sppNominal;

            if (monthStatus === 'Lunas' || monthStatus === 'Beasiswa') {
                totalLunasCount++;
            } else if (monthStatus === 'Tertagih' || monthStatus === 'Tunggakan' || monthStatus === 'Partial') {
                totalTunggakanCount++;
            }

            totalTunggakanSummary += monthTunggakanNominal;

            studentSummaries.push({
                nis: std.id,
                nama_siswa: std.nama,
                nama_panggilan: std.initial || std.nama.split(' ')[0],
                grade: std.level || std.program || 'Beginner 1',
                unit: unitName,
                program: std.program || 'KBEC',
                guru: matchedProg ? matchedProg.cat : (std.unit || unitName),
                spp_nominal: unitName === 'Arabin' ? 0 : sppNominal,
                tagihan_bulan_ini: monthTunggakanNominal,
                total_tunggakan: totalTunggakanStudent,
                status: monthStatus,
                bill_id: monthBill ? monthBill.id : null,
                bulan_tagihan: targetBulan
            });
        }

        let totalAkumulasiTunggakan = 0;
        for (const s of studentSummaries) {
            totalAkumulasiTunggakan += Number(s.total_tunggakan || 0);
        }

        res.json({
            bulan: targetBulan,
            summary: {
                total_siswa: studentSummaries.length,
                total_lunas: totalLunasCount,
                total_tunggakan_count: totalTunggakanCount,
                total_nominal_spp: totalNominalSPP,
                total_nominal_tunggakan: totalTunggakanSummary,
                total_akumulasi_tunggakan: totalAkumulasiTunggakan
            },
            data: studentSummaries
        });
    } catch (err) {
        console.error('❌ Error fetching student bills summary:', err.message);
        next(err);
    }
}

async function getPayments(req, res, next) {
    try {
        const { unit, program, bulan, status, metode, kategori, period_type, start_date, end_date, search } = req.query;
        let whereClauses = [];
        let params = [];

        if (unit && unit !== 'Semua' && unit.trim() !== '') {
            const uTerm = `%${unit.trim()}%`;
            whereClauses.push('(p.unit ILIKE ? OR p.program ILIKE ? OR s.program ILIKE ? OR s.level ILIKE ?)');
            params.push(uTerm, uTerm, uTerm, uTerm);
        }
        if (program && program !== 'Semua' && program.trim() !== '') {
            const progTerm = `%${program.trim()}%`;
            whereClauses.push('(p.program ILIKE ? OR s.program ILIKE ? OR s.level ILIKE ?)');
            params.push(progTerm, progTerm, progTerm);
        }
        if (kategori && kategori !== 'Semua' && kategori.trim() !== '') {
            const kUpper = kategori.toUpperCase();
            if (kUpper.includes('SPP')) {
                whereClauses.push("(p.kategori ILIKE '%SPP%' OR p.kategori IS NULL)");
            } else if (kUpper.includes('PENDAFTARAN')) {
                whereClauses.push("p.kategori ILIKE '%Pendaftaran%'");
            } else if (kUpper.includes('MODUL') || kUpper.includes('BUKU')) {
                whereClauses.push("(p.kategori ILIKE '%Modul%' OR p.kategori ILIKE '%Buku%')");
            } else if (kUpper.includes('SERAGAM') || kUpper.includes('PIN')) {
                whereClauses.push("(p.kategori ILIKE '%Seragam%' OR p.kategori ILIKE '%Pin%')");
            } else {
                whereClauses.push('p.kategori ILIKE ?');
                params.push(`%${kategori.trim()}%`);
            }
        }
        if (period_type === 'harian') {
            whereClauses.push('p.tanggal::date = CURRENT_DATE');
        } else if (period_type === 'bulanan') {
            whereClauses.push("TO_CHAR(p.tanggal::timestamp, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')");
        } else if (period_type === 'custom' && start_date && end_date) {
            whereClauses.push('p.tanggal::date BETWEEN ?::date AND ?::date');
            params.push(start_date, end_date);
        } else if (bulan && bulan !== 'Semua' && bulan.trim() !== '') {
            const bStr = bulan.trim();
            if (bStr.includes('-')) {
                whereClauses.push("TO_CHAR(p.tanggal::timestamp, 'YYYY-MM') = ?");
                params.push(bStr);
            } else {
                const mNum = parseInt(bStr, 10);
                if (!isNaN(mNum)) {
                    whereClauses.push('EXTRACT(MONTH FROM p.tanggal) = ?');
                    params.push(mNum);
                }
            }
        }
        if (status && status !== 'Semua') {
            whereClauses.push('p.status ILIKE ?');
            params.push(status);
        }
        if (metode && metode !== 'Semua') {
            const mUpper = metode.toUpperCase();
            if (mUpper === 'TUNAI') {
                whereClauses.push("(p.metode ILIKE '%Tunai%' OR p.metode IS NULL)");
            } else if (mUpper === 'NON-TUNAI' || mUpper === 'NON TUNAI') {
                whereClauses.push("(p.metode ILIKE '%Transfer%' OR p.metode ILIKE '%QRIS%' OR p.metode ILIKE '%Bank%' OR (p.metode NOT ILIKE '%Tunai%' AND p.metode IS NOT NULL))");
            } else if (mUpper === 'TRANSFER' || mUpper === 'TRANSFER BANK') {
                whereClauses.push("(p.metode ILIKE '%Transfer%' OR p.metode ILIKE '%Bank%')");
            } else if (mUpper === 'QRIS') {
                whereClauses.push("p.metode ILIKE '%QRIS%'");
            } else {
                whereClauses.push('p.metode ILIKE ?');
                params.push(`%${metode}%`);
            }
        }
        if (search && search.trim()) {
            whereClauses.push('(p.id ILIKE ? OR p.nama ILIKE ? OR p.student_id ILIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const [rows] = await db.query(
            `SELECT p.id, 
                    COALESCE(p.student_id, s.id) AS student_id, 
                    COALESCE(s.nama, p.nama) AS nama, 
                    COALESCE(p.program, s.level, s.program) AS program, 
                    COALESCE(p.unit, s.program, 'KBEC') AS unit, 
                    p.kategori, p.bill_id, p.jumlah, p.metode, p.status, 
                    p.discount_amount, p.voucher_id,
                    TO_CHAR(p.tanggal::timestamp, 'YYYY-MM-DD') AS tanggal, p.notes 
             FROM payments p 
             LEFT JOIN students s ON (p.student_id = s.id OR (p.student_id IS NULL AND LOWER(TRIM(p.nama)) = LOWER(TRIM(s.nama)))) 
             ${whereSql} 
             ORDER BY p.tanggal DESC, p.created_at DESC`,
            params
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

async function getReceipt(req, res, next) {
    const { id } = req.params;
    try {
        const [[pay]] = await db.query(
            `SELECT p.id, p.student_id, p.nama, p.program, p.unit, p.kategori, p.jumlah, p.metode, p.status, 
                    TO_CHAR(p.tanggal::timestamp, 'DD Month YYYY') AS tanggal_formatted, p.notes, 
                    p.voucher_id, p.discount_amount, v.code AS voucher_code 
             FROM payments p 
             LEFT JOIN vouchers v ON p.voucher_id = v.id 
             WHERE p.id = ?`,
            [id]
        );
        if (!pay) {
            return res.status(404).json({ success: false, message: 'Transaksi pembayaran tidak ditemukan.' });
        }

        const discountAmt = Number(pay.discount_amount || 0);
        const netAmt = Number(pay.jumlah || 0);
        const subtotalAmt = netAmt + discountAmt;

        res.json({
            receipt_no: pay.id,
            kasir: 'Admin Kasir KBEC',
            lembaga: 'Kampung Bahasa English Course (KBEC)',
            alamat: 'Jl. Kebon Agung No. 45, Malang, Jawa Timur',
            kontak: '0812-3456-7890 | info@kbec.id',
            siswa: {
                id: pay.student_id || '-',
                nama: pay.nama,
                program: pay.program || 'KBEC'
            },
            transaksi: {
                kategori: pay.kategori || 'SPP / Modul',
                subtotal: subtotalAmt,
                discount_amount: discountAmt,
                voucher_code: pay.voucher_code || (pay.voucher_id ? String(pay.voucher_id) : null),
                jumlah: netAmt,
                total_dibayar: netAmt,
                metode: pay.metode || 'Tunai',
                status: pay.status || 'Lunas',
                tanggal: pay.tanggal_formatted,
                catatan: pay.notes || 'Pembayaran telah diverifikasi kasir'
            }
        });
    } catch (err) {
        next(err);
    }
}

async function createPayment(req, res, next) {
    const { student_id, nama, program, unit, kategori, bill_id, jumlah, metode, status, tanggal, notes, pay_all, voucher_id, voucher_code, discount_amount } = req.body;
    const cleanJumlah = Number(jumlah) || 0;
    const cleanDiscount = Number(discount_amount) || 0;

    if (cleanJumlah <= 0) {
        return res.status(400).json({ success: false, message: 'Nominal pembayaran harus lebih dari 0.' });
    }

    const finalDate = tanggal || new Date().toISOString().slice(0, 10);

    let invoiceId = req.body.id;
    if (!invoiceId) {
        let unique = false;
        let attempts = 0;
        while (!unique && attempts < 50) {
            const rand = Math.floor(1000 + Math.random() * 9000);
            invoiceId = `INV-${finalDate.slice(2, 7).replace('-', '')}-${rand}`;
            const [existingPay] = await db.query('SELECT id FROM payments WHERE id = ?', [invoiceId]);
            if (existingPay.length === 0) unique = true;
            attempts++;
        }
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        let finalStudentId = student_id;
        let finalNama = nama;

        if (student_id) {
            const [[sRow]] = await conn.query('SELECT id, nama FROM students WHERE id = ?', [student_id]);
            if (sRow) {
                finalStudentId = sRow.id;
                finalNama = sRow.nama;
            }
        }

        let validProgName = program || 'KBEC';
        const [[progCheck]] = await conn.query('SELECT nama FROM programs WHERE nama = ? OR cat = ? LIMIT 1', [program, program]);
        if (progCheck) {
            validProgName = progCheck.nama;
        }

        // AUDIT FIX #4 (TINGGI): Overpayment guardrail komprehensif (Spesifik Bill & General Student)
        const targetBillId = bill_id || req.body.billId;

        if (targetBillId && targetBillId !== 'ALL' && String(targetBillId).trim() !== '') {
            const [bRows] = await conn.query(
                'SELECT nominal, terbayar, status FROM bills WHERE id = ? OR id::text = ?',
                [targetBillId, String(targetBillId)]
            );
            const bCheck = (bRows && bRows.length > 0) ? bRows[0] : null;

            if (bCheck) {
                const nominal = Number(bCheck.nominal || 0);
                const terbayar = Number(bCheck.terbayar || 0);
                const sisa = Math.max(0, nominal - terbayar);

                if (bCheck.status === 'Lunas' || sisa <= 0) {
                    await conn.rollback();
                    return res.status(400).json({
                        success: false,
                        message: `Tagihan ini sudah Lunas! Tidak ada sisa tagihan yang harus dibayar.`
                    });
                }

                if (cleanJumlah > sisa) {
                    await conn.rollback();
                    return res.status(400).json({
                        success: false,
                        message: `Pembayaran melebihi sisa tagihan! Sisa tagihan saat ini: Rp ${sisa.toLocaleString('id-ID')}. Masukkan nominal maksimal Rp ${sisa.toLocaleString('id-ID')}.`
                    });
                }
            }
        } else if (finalStudentId || finalNama) {
            // Jika pembayaran tanpa bill_id spesifik (Input Pembayaran Baru per Siswa)
            const [pendingBills] = await conn.query(
                "SELECT id, nominal, terbayar FROM bills WHERE (student_id = ? OR LOWER(TRIM(nama)) = LOWER(TRIM(?))) AND status != 'Lunas' ORDER BY bulan_tagihan ASC",
                [finalStudentId || '', finalNama || '']
            );

            const totalSisa = pendingBills.reduce((acc, b) => acc + Math.max(0, Number(b.nominal || 0) - Number(b.terbayar || 0)), 0);

            if (pendingBills.length > 0 && cleanJumlah > totalSisa) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Pembayaran (Rp ${cleanJumlah.toLocaleString('id-ID')}) melebihi total sisa seluruh tagihan siswa saat ini (Rp ${totalSisa.toLocaleString('id-ID')}).`
                });
            }
        }

        await conn.query(
            'INSERT INTO payments (id, student_id, nama, program, unit, kategori, bill_id, jumlah, metode, status, tanggal, notes, voucher_id, discount_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [invoiceId, finalStudentId || null, finalNama || 'Siswa', validProgName, unit || program || 'KBEC', kategori || 'SPP', bill_id || null, cleanJumlah, metode || 'Tunai', status || 'Lunas', finalDate, notes || '', voucher_id || null, cleanDiscount]
        );

        // Update voucher usage count if applied
        if (voucher_id || voucher_code) {
            await conn.query(
                'UPDATE vouchers SET usage_count = usage_count + 1 WHERE id = ? OR UPPER(code) = UPPER(?)',
                [voucher_id || '', String(voucher_code || '').toUpperCase()]
            );
        }

        // Handle bill settlement logic
        if (targetBillId && targetBillId !== 'ALL' && String(targetBillId).trim() !== '') {
            const [[bRow]] = await conn.query('SELECT nominal, terbayar FROM bills WHERE id = ? OR id::text = ?', [targetBillId, String(targetBillId)]);
            if (bRow) {
                const newTerbayar = Number(bRow.terbayar || 0) + cleanJumlah;
                const newStatus = newTerbayar >= Number(bRow.nominal || 0) ? 'Lunas' : (newTerbayar > 0 ? 'Partial' : 'Tertagih');
                await conn.query('UPDATE bills SET terbayar = ?, status = ? WHERE id = ? OR id::text = ?', [newTerbayar, newStatus, targetBillId, String(targetBillId)]);
            } else {
                await conn.query('UPDATE bills SET terbayar = terbayar + ?, status = CASE WHEN terbayar + ? >= nominal THEN ? ELSE ? END WHERE id = ? OR id::text = ?', [cleanJumlah, cleanJumlah, 'Lunas', 'Partial', targetBillId, String(targetBillId)]);
            }
        } else if (finalStudentId || finalNama) {
            // Settle all unpaid/partially-paid bills for this student starting from oldest month (FIFO)
            const [pendingBills] = await conn.query(
                "SELECT id, nominal, terbayar FROM bills WHERE (student_id = ? OR LOWER(TRIM(nama)) = LOWER(TRIM(?))) AND status != 'Lunas' ORDER BY bulan_tagihan ASC",
                [finalStudentId || '', finalNama || '']
            );

            let remainingPayment = cleanJumlah;
            for (const b of pendingBills) {
                if (remainingPayment <= 0) break;
                const needed = Math.max(0, Number(b.nominal || 0) - Number(b.terbayar || 0));
                if (needed <= 0) continue;

                const addPay = Math.min(needed, remainingPayment);
                const newTerbayar = Number(b.terbayar || 0) + addPay;
                const isFullyPaid = newTerbayar >= Number(b.nominal || 0);
                const newStatus = isFullyPaid ? 'Lunas' : (newTerbayar > 0 ? 'Partial' : 'Tertagih');

                await conn.query(
                    'UPDATE bills SET terbayar = ?, status = ? WHERE id = ?',
                    [newTerbayar, newStatus, b.id]
                );
                remainingPayment -= addPay;
            }

            // Fallback: If no specific pending bills were matched, update current month's bill
            if (pendingBills.length === 0) {
                const currentMonth = finalDate.slice(0, 7);
                await conn.query('UPDATE bills SET terbayar = terbayar + ?, status = CASE WHEN terbayar + ? >= nominal THEN ? ELSE status END WHERE student_id = ? AND bulan_tagihan = ?', [cleanJumlah, cleanJumlah, 'Lunas', finalStudentId, currentMonth]);
            }
        }

        await conn.commit();

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin Kasir',
                action: `Pembayaran (${invoiceId}) — Rp ${cleanJumlah.toLocaleString('id-ID')}`,
                siswa: finalNama,
                program: validProgName,
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.status(201).json({ success: true, id: invoiceId, student_id: finalStudentId, nama: finalNama });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
}

async function updatePayment(req, res, next) {
    const { id } = req.params;
    const { student_id, nama, program, unit, jumlah, metode, status, tanggal, notes } = req.body;
    const finalDate = tanggal || new Date().toISOString().slice(0, 10);
    try {
        let finalStudentId = student_id;
        let finalNama = nama;

        if (!finalStudentId && nama) {
            const cleanNama = String(nama).split(' (')[0].trim();
            const [[sRow]] = await db.query('SELECT id, nama FROM students WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?)) LIMIT 1', [cleanNama]);
            if (sRow) {
                finalStudentId = sRow.id;
                finalNama = sRow.nama;
            }
        } else if (finalStudentId) {
            const [[sRow]] = await db.query('SELECT id, nama FROM students WHERE id = ?', [finalStudentId]);
            if (sRow) {
                finalNama = sRow.nama;
            }
        }

        const [[oldPay]] = await db.query('SELECT bill_id, student_id FROM payments WHERE id = ?', [id]);
        await db.query(
            'UPDATE payments SET student_id = ?, nama = ?, program = ?, unit = ?, jumlah = ?, metode = ?, status = ?, tanggal = ?, notes = ? WHERE id = ?',
            [finalStudentId || (oldPay ? oldPay.student_id : null), finalNama, program, unit || program, jumlah, metode, status, finalDate, notes, id]
        );

        if (oldPay && oldPay.bill_id) {
            const newTerbayar = status === 'Lunas' ? jumlah : 0;
            const newStatus = status === 'Lunas' ? 'Lunas' : status;
            await db.query('UPDATE bills SET terbayar = ?, status = ? WHERE id = ?', [newTerbayar, newStatus, oldPay.bill_id]);
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function deletePayment(req, res, next) {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM payments WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function getDeposits(req, res, next) {
    try {
        const [rows] = await db.query(
            "SELECT id, kode_setoran, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tanggal, disetorkan_oleh, diverifikasi_oleh, jumlah, metode, catatan, status, TO_CHAR(created_at::timestamp, 'YYYY-MM-DD HH24:MI') AS created_at FROM deposits ORDER BY id DESC"
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

async function createDeposit(req, res, next) {
    const { tanggal, disetorkan_oleh, jumlah, metode, catatan } = req.body;
    const finalDate = tanggal || new Date().toISOString().slice(0, 10);
    const kodeSetoran = `SET-${finalDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    try {
        await db.query(
            'INSERT INTO deposits (kode_setoran, tanggal, disetorkan_oleh, jumlah, metode, catatan, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [kodeSetoran, finalDate, disetorkan_oleh || 'Admin Kasir', Number(jumlah) || 0, metode || 'Tunai', catatan || '', 'Disetorkan']
        );
        res.status(201).json({ success: true, kode_setoran: kodeSetoran });
    } catch (err) {
        next(err);
    }
}

async function updateDeposit(req, res, next) {
    const { id } = req.params;
    const { tanggal, disetorkan_oleh, jumlah, metode, catatan } = req.body;
    try {
        const [[existing]] = await db.query('SELECT status FROM deposits WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Data setoran tidak ditemukan.' });
        }
        if (existing.status === 'Diterima' && req.user && req.user.role !== 'Super Admin') {
            return res.status(403).json({ success: false, message: 'Setoran yang sudah terverifikasi tidak dapat diubah oleh Admin Kasir.' });
        }

        await db.query(
            'UPDATE deposits SET tanggal = ?, disetorkan_oleh = ?, jumlah = ?, metode = ?, catatan = ? WHERE id = ?',
            [tanggal, disetorkan_oleh, Number(jumlah) || 0, metode || 'Tunai', catatan || '', id]
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function verifyDeposit(req, res, next) {
    const { id } = req.params;
    const { diverifikasi_oleh } = req.body;
    try {
        await db.query(
            'UPDATE deposits SET status = \'Diterima\', diverifikasi_oleh = ? WHERE id = ?',
            [diverifikasi_oleh || 'Super Admin / Direktur KBEC', id]
        );

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || diverifikasi_oleh || 'Super Admin',
                action: `Verifikasi Setoran Kasir (ID: ${id})`,
                status: 'Terverifikasi'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function unverifyDeposit(req, res, next) {
    const { id } = req.params;
    try {
        await db.query(
            'UPDATE deposits SET status = \'Disetorkan\', diverifikasi_oleh = NULL WHERE id = ?',
            [id]
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function deleteDeposit(req, res, next) {
    const { id } = req.params;
    try {
        const [[existing]] = await db.query('SELECT status FROM deposits WHERE id = ?', [id]);
        if (existing && existing.status === 'Diterima' && req.user && req.user.role !== 'Super Admin') {
            return res.status(403).json({ success: false, message: 'Setoran terverifikasi hanya dapat dihapus oleh Super Admin.' });
        }

        await db.query('DELETE FROM deposits WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function getPettyCash(req, res, next) {
    try {
        const [rows] = await db.query(
            "SELECT id, kode_transaksi, TO_CHAR(tanggal::timestamp, 'YYYY-MM-DD') AS tanggal, tipe, kategori, jumlah, keterangan, dicatat_oleh, TO_CHAR(created_at::timestamp, 'YYYY-MM-DD HH24:MI') AS created_at FROM petty_cash ORDER BY id DESC"
        );

        let totalPemasukan = 0;
        let totalPengeluaran = 0;
        rows.forEach(r => {
            if (r.tipe === 'Pemasukan') totalPemasukan += Number(r.jumlah || 0);
            else if (r.tipe === 'Pengeluaran') totalPengeluaran += Number(r.jumlah || 0);
        });

        res.json({
            data: rows,
            summary: {
                totalPemasukan,
                totalPengeluaran,
                saldoBersih: totalPemasukan - totalPengeluaran
            }
        });
    } catch (err) {
        next(err);
    }
}

async function createPettyCash(req, res, next) {
    const { tanggal, tipe, kategori, jumlah, keterangan, dicatat_oleh } = req.body;
    const finalDate = tanggal || new Date().toISOString().slice(0, 10);
    const kodeTx = `KAS-${finalDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    try {
        await db.query(
            'INSERT INTO petty_cash (kode_transaksi, tanggal, tipe, kategori, jumlah, keterangan, dicatat_oleh) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [kodeTx, finalDate, tipe || 'Pengeluaran', kategori || 'Operasional', Number(jumlah) || 0, keterangan || '', dicatat_oleh || 'Super Admin']
        );

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || dicatat_oleh || 'Admin',
                action: `Transaksi Kas Kecil (${kategori || 'Operasional'}) — Rp ${Number(jumlah || 0).toLocaleString('id-ID')}`,
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.status(201).json({ success: true, kode_transaksi: kodeTx });
    } catch (err) {
        next(err);
    }
}

async function deletePettyCash(req, res, next) {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM petty_cash WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function getFinanceSummary(req, res, next) {
    try {
        const [[{ sum: totalRevenueLunas }]] = await db.query('SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments WHERE status = \'Lunas\'');
        const [[{ sum: totalPending }]] = await db.query('SELECT COALESCE(SUM(GREATEST(0, nominal - COALESCE(terbayar, 0))), 0) AS sum FROM bills WHERE status != \'Lunas\'');
        const [[{ sum: todayRevenue }]] = await db.query('SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments WHERE status = \'Lunas\' AND tanggal = CURRENT_DATE');
        
        // Breakdown Tunai vs Non-Tunai payments
        const [[{ sum: totalTunai }]] = await db.query("SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments WHERE status = 'Lunas' AND (metode ILIKE '%Tunai%' OR metode IS NULL)");
        const [[{ sum: totalNonTunai }]] = await db.query("SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments WHERE status = 'Lunas' AND (metode ILIKE '%Transfer%' OR metode ILIKE '%QRIS%' OR metode ILIKE '%Bank%' OR (metode NOT ILIKE '%Tunai%' AND metode IS NOT NULL))");
        const [[{ sum: totalTransfer }]] = await db.query("SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments WHERE status = 'Lunas' AND (metode ILIKE '%Transfer%' OR metode ILIKE '%Bank%')");
        const [[{ sum: totalQris }]] = await db.query("SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments WHERE status = 'Lunas' AND metode ILIKE '%QRIS%'");

        // Cashier deposits breakdown
        const [[{ sum: totalDepositsVerified }]] = await db.query("SELECT COALESCE(SUM(jumlah), 0) AS sum FROM deposits WHERE status = 'Diterima'");
        const [[{ sum: totalDepositsAll }]] = await db.query("SELECT COALESCE(SUM(jumlah), 0) AS sum FROM deposits WHERE status IN ('Disetorkan', 'Diterima')");

        // Saldo Realtime Kasir (Tunai Payments collected minus Cash Deposited)
        const saldoRealtimeKasir = Math.max(0, Number(totalTunai || 0) - Number(totalDepositsAll || 0));

        const [pettyRows] = await db.query('SELECT tipe, SUM(jumlah) AS total FROM petty_cash GROUP BY tipe');
        let pettyIn = 0, pettyOut = 0;
        pettyRows.forEach(r => {
            if (r.tipe === 'Pemasukan') pettyIn = Number(r.total || 0);
            if (r.tipe === 'Pengeluaran') pettyOut = Number(r.total || 0);
        });

        res.json({
            totalRevenueLunas: Number(totalRevenueLunas || 0),
            totalPending: Number(totalPending || 0),
            todayRevenue: Number(todayRevenue || 0),
            totalTunai: Number(totalTunai || 0),
            totalNonTunai: Number(totalNonTunai || 0),
            totalTransfer: Number(totalTransfer || 0),
            totalQris: Number(totalQris || 0),
            totalDepositsVerified: Number(totalDepositsVerified || 0),
            totalDepositsAll: Number(totalDepositsAll || 0),
            saldoRealtimeKasir,
            pettyCashBalance: pettyIn - pettyOut,
            pettyIn,
            pettyOut
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getBills,
    getStudentBillsSummary,
    generateSppBills,
    createBill,
    updateBill,
    deleteBill,
    getPayments,
    getReceipt,
    createPayment,
    updatePayment,
    deletePayment,
    getDeposits,
    createDeposit,
    updateDeposit,
    verifyDeposit,
    unverifyDeposit,
    deleteDeposit,
    getPettyCash,
    createPettyCash,
    deletePettyCash,
    getFinanceSummary
};
