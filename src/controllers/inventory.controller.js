const db = require('../config/db');
const { escapeHTML } = require('../utils/helpers');

async function getInventory(req, res, next) {
    try {
        const [items] = await db.query('SELECT * FROM inventory ORDER BY id DESC');
        let totalItems = items.length;
        let totalStock = 0;
        let totalAssetValue = 0;
        let lowStockCount = 0;

        items.forEach(item => {
            const s = Number(item.stok) || 0;
            const hb = Number(item.harga_beli) || 0;
            const min = Number(item.stok_min) || 0;
            totalStock += s;
            totalAssetValue += (s * hb);
            if (s <= min) lowStockCount++;
        });

        res.json({
            success: true,
            summary: {
                totalItems,
                totalStock,
                totalAssetValue,
                lowStockCount
            },
            data: items
        });
    } catch (err) {
        next(err);
    }
}

async function createInventoryItem(req, res, next) {
    const { kode_barang, nama_barang, kategori, stok, stok_min, satuan, harga_beli, harga_jual, lokasi, keterangan } = req.body;
    if (!nama_barang || !kategori) {
        return res.status(400).json({ error: 'Nama barang dan kategori wajib diisi.' });
    }

    let finalKode = kode_barang ? kode_barang.trim() : `INV-${Date.now().toString().slice(-6)}`;

    try {
        const [result] = await db.query(
            'INSERT INTO inventory (kode_barang, nama_barang, kategori, stok, stok_min, satuan, harga_beli, harga_jual, lokasi, keterangan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                finalKode,
                escapeHTML(nama_barang.trim()),
                escapeHTML(kategori.trim()),
                Number(stok) || 0,
                Number(stok_min) || 10,
                escapeHTML(satuan || 'Pcs'),
                Number(harga_beli) || 0,
                Number(harga_jual) || 0,
                escapeHTML(lokasi || '-'),
                escapeHTML(keterangan || '')
            ]
        );
        const newId = (result && result.length > 0 && result[0].id) ? result[0].id : (result.insertId || null);

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Update Stok/Inventaris (${nama_barang.trim()})`,
                program: kategori || '-',
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.status(201).json({ success: true, id: newId, kode_barang: finalKode });
    } catch (err) {
        next(err);
    }
}

async function updateInventoryItem(req, res, next) {
    const { id } = req.params;
    const { kode_barang, nama_barang, kategori, stok, stok_min, satuan, harga_beli, harga_jual, lokasi, keterangan } = req.body;
    try {
        await db.query(
            'UPDATE inventory SET kode_barang=?, nama_barang=?, kategori=?, stok=?, stok_min=?, satuan=?, harga_beli=?, harga_jual=?, lokasi=?, keterangan=? WHERE id=?',
            [
                escapeHTML(kode_barang),
                escapeHTML(nama_barang),
                escapeHTML(kategori),
                Number(stok) || 0,
                Number(stok_min) || 10,
                escapeHTML(satuan || 'Pcs'),
                Number(harga_beli) || 0,
                Number(harga_jual) || 0,
                escapeHTML(lokasi || '-'),
                escapeHTML(keterangan || ''),
                id
            ]
        );

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Update Stok/Inventaris (${nama_barang || id})`,
                program: kategori || '-',
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function deleteInventoryItem(req, res, next) {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM inventory WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function mutateInventory(req, res, next) {
    const { item_id, jenis, jumlah, keterangan, user_name } = req.body;
    const qty = Number(jumlah) || 0;
    if (!item_id || !jenis || qty <= 0) {
        return res.status(400).json({ error: 'Item ID, jenis mutasi, dan jumlah valid wajib diisi.' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [items] = await conn.query('SELECT * FROM inventory WHERE id = ? FOR UPDATE', [item_id]);
        if (items.length === 0) {
            await conn.rollback();
            conn.release();
            return res.status(404).json({ error: 'Barang inventaris tidak ditemukan.' });
        }

        const item = items[0];
        let currentStok = Number(item.stok) || 0;
        let newStok = currentStok;

        if (jenis === 'Masuk') {
            newStok += qty;
        } else if (jenis === 'Keluar') {
            if (currentStok < qty) {
                await conn.rollback();
                conn.release();
                return res.status(400).json({ error: `Stok tidak mencukupi. Stok saat ini: ${currentStok} ${item.satuan}` });
            }
            newStok -= qty;
        } else {
            await conn.rollback();
            conn.release();
            return res.status(400).json({ error: 'Jenis mutasi harus Masuk atau Keluar' });
        }

        await conn.query('UPDATE inventory SET stok = ? WHERE id = ?', [newStok, item_id]);
        await conn.query(
            'INSERT INTO inventory_mutations (item_id, jenis, jumlah, keterangan, user_name) VALUES (?, ?, ?, ?, ?)',
            [item_id, jenis, qty, escapeHTML(keterangan || ''), escapeHTML(user_name || (req.user && req.user.name) || 'Admin')]
        );

        await conn.commit();

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || user_name || 'Admin',
                action: `Mutasi Stok (${item.nama_barang || item_id} - ${jenis} ${qty})`,
                program: item.kategori || '-',
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.json({ success: true, stok_lama: currentStok, stok_baru: newStok });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
}

async function getInventoryMutations(req, res, next) {
    try {
        const [mutations] = await db.query(`
            SELECT m.*, i.kode_barang, i.nama_barang, i.satuan 
            FROM inventory_mutations m
            JOIN inventory i ON m.item_id = i.id
            ORDER BY m.id DESC
            LIMIT 100
        `);
        res.json({ success: true, data: mutations });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getInventory,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    mutateInventory,
    getInventoryMutations
};
