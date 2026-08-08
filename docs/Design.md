# Design Specifications (Design.md)
## Panduan UI/UX & Sistem Desain — KBEC Management System
### Versi: 3.2 | Status: APPROVED | Tema: Dynamic Workspace (Classic Royal & Fresh Emerald)

---

## 1. Palet Warna Badge Unit Yayasan

| Unit Yayasan | Color Theme | Badge Style | Icon |
|---|---|---|---|
| **Unit KBEC** | Royal Blue | `bg-blue-50 text-blue-700 border-blue-200` | `graduation-cap` |
| **Unit Bimbel** | Warm Amber | `bg-amber-50 text-amber-700 border-amber-200` | `book-open` |
| **Unit Calistung** | Fresh Emerald | `bg-emerald-50 text-emerald-700 border-emerald-200` | `edit-3` |
| **Unit TK** | Soft Purple | `bg-purple-50 text-purple-700 border-purple-200` | `smile` |
| **Unit Arabin (Beasiswa)** | Humanitarian Gold | `bg-amber-50 text-amber-800 border-amber-300` | `heart-handshake` |

---

## 2. Dynamic Level Dropdown Behavior

- Setiap pengubahan pilihan **Unit Yayasan** pada modal form maupun filter tabel mengusung perilaku **Auto-Filter Dropdown Dynamic**:
  - `KBEC`: Level Beginner 1 - Advance
  - `TK`: KB, TKA, TKB
  - `Bimbel`: Bimbel (SD-SMP)
  - `Calistung`: Calistung 1A - 3B
  - `Arabin`: Arabin 1 - Arabin 2

---

## 3. Desain UI Modul Inventaris (`inventaris.html`)

- **Kartu Ringkasan Metric**: Total Barang, Total Stock Unit, Total Nilai Aset (Rp), Item Alert Stok Minimum (`stok <= stok_min`).
- **Tabel Barang Inventaris**: Kode Barang, Nama Barang, Kategori, Stok Sisa (dengan Badge Merah jika Minimum), Harga Beli/Jual, Lokasi, Tombol Aksi Mutasi (+ Masuk / - Keluar), Edit & Hapus.
- **Modal Input / Edit Barang**: Form lengkap dengan validasi `kode_barang` unik.
- **Modal Mutasi Stok**: Form penambahan/pengurangan stok dengan catatan alasan mutasi.
