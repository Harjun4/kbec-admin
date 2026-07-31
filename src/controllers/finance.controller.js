const db = require('../config/db');
const { resolveStudentUnit, generateUniqueStudentId } = require('../utils/helpers');

async function getBills(req, res, next) {
    try {
        const { bulan, unit, status, search } = req.query;
        let whereClauses = [];
        let params = [];

        if (bulan && bulan !== 'Semua' && bulan.trim() !== '') {
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
                    b.bulan_tagihan, b.kategori, b.nominal, b.terbayar, b.status, 
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
                "SELECT id FROM bills WHERE (student_id = ? OR student_id ILIKE ? OR LOWER(TRIM(nama)) = ?) AND bulan_tagihan = ? AND (kategori = 'SPP' OR kategori IS NULL)",
                [std.id, `%${cleanId}%`, cleanNama, targetBulan]
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

                let billId = `TAG-${targetBulan.replace('-', '')}-${std.id.replace(/[^a-zA-Z0-9]/g, '')}`;
                const [existingBillId] = await db.query('SELECT id FROM bills WHERE id = ?', [billId]);
                if (existingBillId.length > 0) {
                    billId = `TAG-${targetBulan.replace('-', '')}-${std.id.replace(/[^a-zA-Z0-9]/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
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
        res.json({ success: true, message: `Berhasil men-generate ${generatedCount} tagihan SPP baru untuk bulan ${targetBulan}.`, count: generatedCount });
    } catch (err) {
        next(err);
    }
}

async function createBill(req, res, next) {
    const { student_id, nama, program, unit, bulan_tagihan, kategori, nominal, jatuh_tempo } = req.body;
    const targetBulan = bulan_tagihan || new Date().toISOString().slice(0, 7);
    const billId = `TAG-${targetBulan.replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
        let finalStudentId = student_id;
        let finalNama = nama;

        if (student_id) {
            const [[sRow]] = await db.query('SELECT id, nama FROM students WHERE id = ?', [student_id]);
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

        await db.query(
            'INSERT INTO bills (id, student_id, nama, program, unit, bulan_tagihan, kategori, nominal, terbayar, status, jatuh_tempo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [billId, finalStudentId || 'STD-MANUAL', finalNama || 'Siswa', validProgName, finalUnit, targetBulan, kategori || 'SPP', Number(nominal) || 0, 0, 'Tertagih', jatuh_tempo || `${targetBulan}-10`]
        );

        res.status(201).json({ success: true, id: billId });
    } catch (err) {
        next(err);
    }
}

async function updateBill(req, res, next) {
    const { id } = req.params;
    const { student_id, nama, program, unit, bulan_tagihan, kategori, nominal, jatuh_tempo, status } = req.body;
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

        await db.query(
            'UPDATE bills SET student_id = ?, nama = ?, program = ?, unit = ?, bulan_tagihan = ?, kategori = ?, nominal = ?, jatuh_tempo = ?, status = ? WHERE id = ?',
            [finalStudentId || null, finalNama, program, unit, bulan_tagihan, kategori, Number(nominal) || 0, jatuh_tempo, status, id]
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function deleteBill(req, res, next) {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM bills WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function getStudentBillsSummary(req, res, next) {
    try {
        const { bulan, unit, program, status, search } = req.query;
        const targetBulan = (bulan && bulan !== 'Semua' && bulan.trim()) ? bulan.trim() : new Date().toISOString().slice(0, 7);

        let whereClauses = ["(s.status IS NULL OR s.status ILIKE 'Aktif' OR s.status = '')"];
        let params = [];

        if (search && search.trim()) {
            whereClauses.push('(s.id ILIKE ? OR s.nama ILIKE ? OR s.initial ILIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const [students] = await db.query(
            `SELECT s.id, s.nama, s.initial, s.program, s.level, s.status, s.kontak FROM students s ${whereSql} ORDER BY s.nama ASC`,
            params
        );

        const [programs] = await db.query('SELECT nama, cat, biaya FROM programs');

        // Fetch all bills from bills table
        const [allBills] = await db.query(
            'SELECT b.id, b.student_id, b.nama, b.program, b.unit, b.bulan_tagihan, b.nominal, b.terbayar, b.status FROM bills b ORDER BY b.bulan_tagihan ASC'
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
            const baseId = String(std.id).split('-')[0].toLowerCase().trim();
            const baseNama = String(std.nama || '').toLowerCase().trim();
            const studentKey = `${baseId}_${baseNama}`;

            if (processedStudentKeys.has(studentKey)) continue;
            processedStudentKeys.add(studentKey);
            const unitName = resolveStudentUnit(std.id, std.program, std.level);

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
            const stdIdClean = String(std.id).toLowerCase();
            const stdNamaClean = String(std.nama).toLowerCase().trim();

            const stdBills = allBills.filter(b => {
                const bIdClean = String(b.student_id || '').toLowerCase();
                const bNamaClean = String(b.nama || '').toLowerCase().trim();
                return bIdClean === stdIdClean || bNamaClean === stdNamaClean || (bIdClean && bIdClean.split('-')[0] === stdIdClean.split('-')[0]);
            });

            const monthBill = stdBills.find(b => b.bulan_tagihan === targetBulan);

            // Filter program if specified
            if (program && program !== 'Semua') {
                const pLow = program.toLowerCase().trim();
                const stdProgLow = (std.program || '').toLowerCase().trim();
                const stdLevelLow = (std.level || '').toLowerCase().trim();
                const billProgLow = monthBill ? (monthBill.program || '').toLowerCase().trim() : '';

                const matchesProg = (stdProgLow === pLow) ||
                                    (stdLevelLow === pLow) ||
                                    (billProgLow === pLow) ||
                                    (stdProgLow.includes(pLow) && !stdLevelLow.startsWith('tk') && !stdLevelLow.startsWith('paud')) ||
                                    (stdLevelLow.includes(pLow) && !stdLevelLow.startsWith('tk') && !stdLevelLow.startsWith('paud'));
                if (!matchesProg) continue;
            }

            // Find matching program fee
            let progName = (std.level && std.level.trim()) ? std.level.trim() : (std.program || 'Beginner 1');
            let matchedProg = programs.find(p => p.nama.toLowerCase() === progName.toLowerCase());
            if (!matchedProg && std.level) matchedProg = programs.find(p => p.nama.toLowerCase() === std.level.trim().toLowerCase());
            if (!matchedProg && std.program) matchedProg = programs.find(p => p.nama.toLowerCase() === std.program.trim().toLowerCase());

            const stdIdClean = String(std.id).toLowerCase();
            const stdNamaClean = String(std.nama).toLowerCase().trim();

            // Match student's bills reliably
            const stdBills = allBills.filter(b => {
                const bIdClean = String(b.student_id || '').toLowerCase();
                const bNamaClean = String(b.nama || '').toLowerCase().trim();
                return bIdClean === stdIdClean || bNamaClean === stdNamaClean || (bIdClean && bIdClean.split('-')[0] === stdIdClean.split('-')[0]);
            });

            const monthBill = stdBills.find(b => b.bulan_tagihan === targetBulan);

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

            totalNominalSPP += sppNominal;

            if (monthStatus === 'Lunas' || monthStatus === 'Beasiswa') {
                totalLunasCount++;
            } else if (monthStatus === 'Tertagih' || monthStatus === 'Tunggakan' || monthStatus === 'Partial') {
                totalTunggakanCount++;
            }

            // Status filter if specified
            if (status && status !== 'Semua') {
                const sUpper = status.toUpperCase();
                if (sUpper === 'LUNAS' && monthStatus !== 'Lunas' && monthStatus !== 'Beasiswa') continue;
                if (sUpper === 'PARTIAL' && monthStatus !== 'Partial') continue;
                if ((sUpper === 'TUNGGAKAN' || sUpper === 'TERTAGIH') && monthStatus !== 'Tertagih' && monthStatus !== 'Tunggakan') continue;
                if (sUpper === 'BELUM ADA TAGIHAN' && monthStatus !== 'Belum Ada Tagihan') continue;
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
        next(err);
    }
}

async function getPayments(req, res, next) {
    try {
        const { program, bulan, status, metode, search } = req.query;
        let whereClauses = [];
        let params = [];

        if (program && program !== 'Semua') {
            whereClauses.push('(program ILIKE ? OR unit ILIKE ?)');
            const progTerm = `%${program}%`;
            params.push(progTerm, progTerm);
        }
        if (bulan && bulan !== 'Semua') {
            whereClauses.push('EXTRACT(MONTH FROM tanggal) = ?');
            params.push(parseInt(bulan, 10));
        }
        if (status && status !== 'Semua') {
            whereClauses.push('status = ?');
            params.push(status);
        }
        if (metode && metode !== 'Semua') {
            const mUpper = metode.toUpperCase();
            if (mUpper === 'TUNAI') {
                whereClauses.push("(metode ILIKE '%Tunai%' OR metode IS NULL)");
            } else if (mUpper === 'NON-TUNAI' || mUpper === 'NON TUNAI') {
                whereClauses.push("(metode ILIKE '%Transfer%' OR metode ILIKE '%QRIS%' OR metode ILIKE '%Bank%' OR (metode NOT ILIKE '%Tunai%' AND metode IS NOT NULL))");
            } else if (mUpper === 'TRANSFER') {
                whereClauses.push("(metode ILIKE '%Transfer%' OR metode ILIKE '%Bank%')");
            } else if (mUpper === 'QRIS') {
                whereClauses.push("metode ILIKE '%QRIS%'");
            } else {
                whereClauses.push('metode ILIKE ?');
                params.push(`%${metode}%`);
            }
        }
        if (search && search.trim()) {
            whereClauses.push('(id ILIKE ? OR nama ILIKE ? OR student_id ILIKE ?)');
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
        const [[pay]] = await db.query("SELECT id, student_id, nama, program, unit, kategori, jumlah, metode, status, TO_CHAR(tanggal::timestamp, 'DD Month YYYY') AS tanggal_formatted, notes FROM payments WHERE id = ?", [id]);
        if (!pay) {
            return res.status(404).json({ success: false, message: 'Transaksi pembayaran tidak ditemukan.' });
        }

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
                jumlah: pay.jumlah,
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
    const { student_id, nama, program, unit, kategori, bill_id, jumlah, metode, status, tanggal, notes, pay_all } = req.body;
    const cleanJumlah = Number(jumlah) || 0;
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

        await conn.query(
            'INSERT INTO payments (id, student_id, nama, program, unit, kategori, bill_id, jumlah, metode, status, tanggal, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [invoiceId, finalStudentId || null, finalNama || 'Siswa', validProgName, unit || program || 'KBEC', kategori || 'SPP', bill_id || null, cleanJumlah, metode || 'Tunai', status || 'Lunas', finalDate, notes || '']
        );

        // Handle bill settlement logic
        if (bill_id && bill_id !== 'ALL') {
            const [[bRow]] = await conn.query('SELECT nominal, terbayar FROM bills WHERE id = ?', [bill_id]);
            if (bRow) {
                const newTerbayar = Number(bRow.terbayar || 0) + cleanJumlah;
                const newStatus = newTerbayar >= Number(bRow.nominal || 0) ? 'Lunas' : (newTerbayar > 0 ? 'Partial' : 'Tertagih');
                await conn.query('UPDATE bills SET terbayar = ?, status = ? WHERE id = ?', [newTerbayar, newStatus, bill_id]);
            } else {
                await conn.query('UPDATE bills SET terbayar = terbayar + ?, status = CASE WHEN terbayar + ? >= nominal THEN ? ELSE ? END WHERE id = ?', [cleanJumlah, cleanJumlah, 'Lunas', 'Partial', bill_id]);
            }
        } else if (finalStudentId) {
            // Settle all unpaid/partially-paid bills for this student starting from oldest month (FIFO)
            const cleanId = String(finalStudentId).split('-')[0].trim();
            const [pendingBills] = await conn.query(
                "SELECT id, nominal, terbayar FROM bills WHERE (student_id = ? OR student_id ILIKE ? OR nama ILIKE ?) AND status != 'Lunas' ORDER BY bulan_tagihan ASC",
                [finalStudentId, `%${cleanId}%`, `%${finalNama}%`]
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
                await conn.query('UPDATE bills SET terbayar = terbayar + ?, status = CASE WHEN terbayar + ? >= nominal THEN ? ELSE status END WHERE (student_id = ? OR student_id ILIKE ?) AND bulan_tagihan = ?', [cleanJumlah, cleanJumlah, 'Lunas', finalStudentId, `%${cleanId}%`, currentMonth]);
            }
        }

        await conn.commit();
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
