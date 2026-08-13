const db = require('../config/db');

async function getVouchers(req, res, next) {
    try {
        const { search, status } = req.query;
        let whereClauses = [];
        let params = [];

        if (search && search.trim()) {
            whereClauses.push('(code ILIKE ? OR description ILIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term);
        }
        if (status && status !== 'Semua') {
            whereClauses.push('status = ?');
            params.push(status);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const [vouchers] = await db.query(
            `SELECT id, code, description, discount_type, discount_value, max_usage, usage_count, 
                    TO_CHAR(valid_until::timestamp, 'YYYY-MM-DD') AS valid_until, status, created_at 
             FROM vouchers ${whereSql} ORDER BY created_at DESC`,
            params
        );
        res.json(vouchers);
    } catch (err) {
        next(err);
    }
}

async function createVoucher(req, res, next) {
    const { code, description, discount_type, discount_value, max_usage, valid_until, status } = req.body;
    
    if (!code || !discount_value || discount_value <= 0) {
        return res.status(400).json({ success: false, message: 'Kode voucher dan nilai diskon wajib diisi.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const id = `VCH-${cleanCode}-${Date.now().toString().slice(-4)}`;

    try {
        const [[existing]] = await db.query('SELECT id FROM vouchers WHERE UPPER(code) = ?', [cleanCode]);
        if (existing) {
            return res.status(400).json({ success: false, message: `Kode voucher '${cleanCode}' sudah digunakan.` });
        }

        await db.query(
            `INSERT INTO vouchers (id, code, description, discount_type, discount_value, max_usage, usage_count, valid_until, status) 
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [
                id,
                cleanCode,
                description || '',
                discount_type === 'percentage' ? 'percentage' : 'nominal',
                Number(discount_value) || 0,
                Number(max_usage) || 100,
                valid_until || null,
                status || 'Aktif'
            ]
        );

        res.status(201).json({ success: true, message: `Voucher ${cleanCode} berhasil dibuat.`, id });
    } catch (err) {
        next(err);
    }
}

async function updateVoucher(req, res, next) {
    const { id } = req.params;
    const { code, description, discount_type, discount_value, max_usage, valid_until, status } = req.body;

    try {
        const [[vExisting]] = await db.query('SELECT id, code FROM vouchers WHERE id = ?', [id]);
        if (!vExisting) {
            return res.status(404).json({ success: false, message: 'Voucher tidak ditemukan.' });
        }

        const cleanCode = code ? String(code).trim().toUpperCase() : vExisting.code;

        if (cleanCode !== vExisting.code) {
            const [[checkCode]] = await db.query('SELECT id FROM vouchers WHERE UPPER(code) = ? AND id != ?', [cleanCode, id]);
            if (checkCode) {
                return res.status(400).json({ success: false, message: `Kode voucher '${cleanCode}' sudah digunakan.` });
            }
        }

        await db.query(
            `UPDATE vouchers 
             SET code = ?, description = ?, discount_type = ?, discount_value = ?, max_usage = ?, valid_until = ?, status = ?, updated_at = NOW() 
             WHERE id = ?`,
            [
                cleanCode,
                description !== undefined ? description : '',
                discount_type === 'percentage' ? 'percentage' : 'nominal',
                Number(discount_value) || 0,
                Number(max_usage) || 100,
                valid_until || null,
                status || 'Aktif',
                id
            ]
        );

        res.json({ success: true, message: `Voucher ${cleanCode} berhasil diperbarui.` });
    } catch (err) {
        next(err);
    }
}

async function deleteVoucher(req, res, next) {
    const { id } = req.params;
    try {
        // AUDIT FIX #2 (KRITIS): Tolak penghapusan jika voucher sudah digunakan dalam transaksi
        const [[usageCheck]] = await db.query(
            'SELECT COUNT(*) AS cnt FROM payments WHERE voucher_id = ?',
            [id]
        );
        if (Number(usageCheck.cnt) > 0) {
            return res.status(400).json({
                success: false,
                message: `Voucher tidak dapat dihapus karena sudah digunakan dalam ${usageCheck.cnt} transaksi. Silakan ubah statusnya menjadi Nonaktif.`
            });
        }

        // Cek juga di tabel bills (tagihan yang sudah mendapat diskon voucher)
        const [[billUsageCheck]] = await db.query(
            'SELECT COUNT(*) AS cnt FROM bills WHERE voucher_id = ?',
            [id]
        );
        if (Number(billUsageCheck.cnt) > 0) {
            return res.status(400).json({
                success: false,
                message: `Voucher tidak dapat dihapus karena sudah diterapkan pada ${billUsageCheck.cnt} tagihan. Silakan ubah statusnya menjadi Nonaktif.`
            });
        }

        await db.query('DELETE FROM vouchers WHERE id = ?', [id]);
        res.json({ success: true, message: 'Voucher berhasil dihapus.' });
    } catch (err) {
        next(err);
    }
}

async function validateVoucher(req, res, next) {
    const { code, bill_amount } = req.body;
    if (!code) {
        return res.status(400).json({ valid: false, message: 'Mohon masukkan kode voucher.' });
    }

    const cleanCode = String(code).trim().toUpperCase();

    try {
        const [[v]] = await db.query(
            `SELECT id, code, description, discount_type, discount_value, max_usage, usage_count, 
                    TO_CHAR(valid_until::timestamp, 'YYYY-MM-DD') AS valid_until, status 
             FROM vouchers WHERE UPPER(code) = ?`,
            [cleanCode]
        );

        if (!v) {
            return res.status(404).json({ valid: false, message: `Kode voucher '${cleanCode}' tidak ditemukan.` });
        }

        if (v.status !== 'Aktif') {
            return res.status(400).json({ valid: false, message: `Voucher '${cleanCode}' sudah tidak aktif.` });
        }

        if (v.max_usage && v.usage_count >= v.max_usage) {
            return res.status(400).json({ valid: false, message: `Kuota penggunaan voucher '${cleanCode}' telah habis.` });
        }

        if (v.valid_until) {
            const todayStr = new Date().toISOString().slice(0, 10);
            if (v.valid_until < todayStr) {
                return res.status(400).json({ valid: false, message: `Voucher '${cleanCode}' telah kadaluarsa (berlaku hingga ${v.valid_until}).` });
            }
        }

        const originalAmount = Number(bill_amount) || 0;
        let discount = 0;
        if (v.discount_type === 'percentage') {
            discount = (originalAmount * Number(v.discount_value)) / 100;
        } else {
            discount = Number(v.discount_value);
        }

        // Discount cannot exceed original amount
        discount = Math.min(originalAmount, discount);
        const netAmount = Math.max(0, originalAmount - discount);

        res.json({
            valid: true,
            voucher: v,
            discount_amount: discount,
            net_amount: netAmount,
            message: `Voucher ${cleanCode} berhasil diterapkan! Potongan: Rp ${discount.toLocaleString('id-ID')}`
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getVouchers,
    createVoucher,
    updateVoucher,
    deleteVoucher,
    validateVoucher
};
