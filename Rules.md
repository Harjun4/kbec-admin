# Business Rules & Authorization (Rules.md)
## Aturan Bisnis & Hak Akses KBEC Management System
### Versi: 3.2 | Status: APPROVED | Pendekatan: Process-Driven Business Rules & Codebase Integration

---

## 1. Dynamic RBAC & Security Access Rules

```
┌───────────────────────────┬─────────────┬─────────────┬─────────────┐
│ Modul & Aksi (Menu/Action)│ Super Admin │    Admin    │  Pengajar   │
├───────────────────────────┼─────────────┼─────────────┼─────────────┤
│ 🔍 Global Search          │ VIEW        │ VIEW        │ VIEW        │
│ 🏠 Dashboard              │ VIEW        │ VIEW        │ VIEW (Own)  │
│ 👨🎓 Data Siswa (5 Unit)   │ ALL (C/R/U/D│ ALL (C/R/U/D│ VIEW (Own)  │
│ 📚 Akademik - Guru        │ ALL (C/R/U/D│ VIEW ONLY   │ GPS Check-in│
│ 📚 Akademik - Kelas       │ ALL (C/R/U/D│ ALL (C/R/U/D│ VIEW (Own)  │
│ 📚 Akademik - Presensi    │ ALL (C/R/U/D│ ALL (C/R/U/D│ ALL (Own C/U│
│ 📚 Akademik - Kinerja     │ ALL (C/R/U/D│ VIEW / READ │ ALL (Own C/U│
│ 📅 Agenda & Reminders     │ ALL (C/R/U/D│ ALL (C/R/U/D│ VIEW ONLY   │
│ 💰 Keuangan - Tagihan SPP │ ALL (C/R/U/D│ ALL (C/R/U/D│ NO ACCESS   │
│ 💰 Keuangan - Kuitansi/Inv│ ALL (C/R/U/D│ ALL (C/R/U/D│ NO ACCESS   │
│ 💰 Keuangan - Setoran     │ ALL (C/R/U/D│ ALL (C/R/U/D│ NO ACCESS   │
│ 💰 Keuangan - Kas Kecil   │ ALL (C/R/U/D│ ALL (C/R/U/D│ NO ACCESS   │
│ 🏫 Pengelolaan Unit/Prog  │ ALL (C/R/U/D│ ALL (C/R/U/D│ NO ACCESS   │
│ 📦 Inventaris             │ ALL (C/R/U/D│ ALL (C/R/U/D│ VIEW ONLY   │
│ 📊 Laporan                │ ALL (C/R/U/D│ ALL (C/R/U/D│ READ (Own)  │
│ 👤 Manajemen User         │ ALL (C/R/U/D│ NO ACCESS   │ NO ACCESS   │
│ ⚙️ Pengaturan System      │ ALL (C/R/U/D│ NO ACCESS   │ NO ACCESS   │
└───────────────────────────┴─────────────┴─────────────┴─────────────┘
```

---

## 2. Aturan Keamanan & Rate Limiting (Security Rules)

- **SEC-01 (Rate Limiting Login)**: Percobaan login dibatasi maksimal **15 kali percobaan per 15 menit** per alamat IP.
- **SEC-02 (Password Salting & Auto-Migration)**: Seluruh password wajib di-hash menggunakan SHA-256 HMAC dengan salt terenkripsi (`PASSWORD_SALT`).
- **SEC-03 (Authentication Tokens)**: Seluruh request API yang terlindungi wajib menyertakan token autentikasi valid pada header `Authorization` atau `x-auth-token`.

---

## 3. Aturan Bisnis Modul Data Siswa, Multi-Unit (5 Unit) & Foreign Key Strictness

- **STU-01 (Auto-Generate Official Multi-Unit Student NIS)**: Nomor Induk Siswa (NIS) resmi diterbitkan secara otomatis dengan format `[YY][MM][000001][SUFFIX]`:
  - **Unit KBEC**: Tanpa Suffix (contoh: `2607000001`)
  - **Unit Calistung**: Suffix `-C` (contoh: `2607000001-C`)
  - **Unit Bimbel**: Suffix `-B` (contoh: `2607000001-B`)
  - **Unit TK**: Suffix `-TK` (contoh: `2607000001-TK`)
  - **Unit Arabin**: Suffix `-A` (contoh: `2607000001-A` — *Beasiswa Anak Pemulung / Kurang Mampu*)
- **STU-02 (Foreign Key Strictness)**: Kolom `program` pada `students`, `bills`, dan `payments` mereferensikan secara ketat ke Foreign Key `programs(nama)`.
- **STU-03 (Auto-Filter Dynamic Dropdown)**: Pengubahan pilihan Unit Yayasan pada modal form maupun filter tabel secara otomatis menyaring opsi Level yang relevan saja (`UNIT_DEFAULT_LEVELS`).

---

## 4. Aturan Keuangan (Statements vs Receipts)

- **FIN-01 (ID Tagihan vs No Invoice Kuitansi)**:
  - **ID Tagihan (`TAG-[YYYYMM]-[RAND4/SEQ]`)**: Berfungsi sebagai *Receivables Statement* (Lembar Pernyataan Kewajiban SPP Siswa).
  - **No Invoice (`INV-[YYMM]-[RAND4]`)**: Berfungsi sebagai *Payment Receipt* (Bukti Kuitansi Penerimaan Uang Kasir/Admin).
- **FIN-02 (Auto-Generate SPP Bulanan)**: Penjanaan tagihan SPP massal secara otomatis memeriksa keberadaan tagihan siswa pada bulan bersangkutan untuk mencegah duplikasi.
- **FIN-03 (Kas Kecil & Setoran)**: Kasir wajib menginput setoran harian sebelum penutupan kas. Saldo Kas Kecil tidak boleh bernilai negatif (`Saldo >= 0`).

---

## 5. Aturan Inventaris & Mutasi Stok

- **INV-01 (Stok Minimum Alert)**: Sistem memberikan notifikasi peringatan visual jika sisa stok barang berada di bawah ambang `stok_min` (`stok <= stok_min`).
- **INV-02 (Stock Mutation Log)**: Setiap transaksi barang masuk (pembelian) atau barang keluar (distribusi ke siswa/kelas) secara otomatis mencatat audit trail di tabel `inventory_mutations`.
