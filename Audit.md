# Audit.md

# Laporan Hasil Audit Aplikasi

| Informasi | Keterangan |
|-----------|------------|
| Jenis Pengujian | Functional Testing & UI/UX Testing |
| Tanggal Audit | 31 Juli 2026 |
| Status | Open Issue |
| Auditor | QA |

---

# Tujuan Audit

Audit ini dilakukan untuk mengidentifikasi permasalahan pada fungsi aplikasi, validasi proses bisnis, filter data, pencarian, navigasi, penyimpanan data, serta tampilan antarmuka (UI). Temuan berikut disusun berdasarkan hasil pengujian langsung pada setiap modul aplikasi.

---

# Ringkasan Temuan

| No | Modul | Jumlah Temuan | Prioritas Tertinggi |
|----|--------|---------------|---------------------|
| 1 | SPP | 5 | Critical |
| 2 | Data Siswa | 1 | Medium |
| 3 | Akademik | 3 | Critical |
| 4 | Unit KBEC | 3 | Critical |
| 5 | Inventaris | 1 | Medium |
| 6 | Laporan | 1 | Low |
| 7 | Manajemen User | 2 | High |

---

# Detail Temuan

## BUG-001 — SPP
**Judul:** Perhitungan pembayaran Partial dan Lunas menggunakan logika yang sama.

**Severity:** Critical

**Langkah Pengujian**
1. Buat tagihan bimbel sebesar Rp1.000.000.
2. Lakukan pembayaran sebesar Rp200.000.
3. Pilih status pembayaran **Lunas**.

**Hasil Aktual**
- Sistem langsung menganggap seluruh tagihan telah lunas.
- Semua bulan berubah menjadi status lunas.
- Nominal tagihan tersisa tidak dihitung.

**Expected Result**
- Pembayaran Rp200.000 hanya mengurangi saldo tagihan.
- Status menjadi **Partial** hingga seluruh tagihan dibayar.

**Dampak**
Kesalahan perhitungan pembayaran dan status tagihan.

---

## BUG-002 — SPP
**Judul:** Filter Program Beginner 1 tidak menampilkan data.

**Severity:** High

**Hasil Aktual**
Filter menghasilkan data kosong meskipun data tersedia.

**Expected Result**
Semua data Program Beginner 1 tampil sesuai filter.

---

## BUG-003 — SPP
**Judul:** Filter Status Pembayaran belum memiliki opsi Tunggakan.

**Severity:** Medium

**Expected Result**
Filter memiliki pilihan:
- Lunas
- Partial
- Tunggakan

---

## BUG-004 — SPP
**Judul:** Filter Status Tagihan tidak sesuai.

**Severity:** High

**Hasil Aktual**
Data tidak sesuai dengan filter yang dipilih.

**Expected Result**
Data sesuai status tagihan.

---

## BUG-005 — SPP
**Judul:** Search Nama masih menampilkan data lain.

**Severity:** Medium

**Hasil Aktual**
Data sesuai keyword muncul, namun di bawahnya masih terdapat data lain yang tidak dicari.

**Expected Result**
Hanya data sesuai keyword yang ditampilkan.

---

## BUG-006 — Data Siswa
**Judul:** Filter TK masih menampilkan data KBEC.

**Severity:** Medium

**Expected Result**
Filter hanya menampilkan data TK.

---

## BUG-007 — Akademik
**Judul:** Tidak dapat menambahkan kelas.

**Severity:** Critical

**Expected Result**
Kelas berhasil disimpan dan muncul pada daftar kelas.

---

## BUG-008 — Akademik
**Judul:** Menu Kinerja Siswa tidak berfungsi.

**Severity:** Critical

**Hasil Aktual**
Seluruh fungsi tidak berjalan.

**Rekomendasi**
Perlu dilakukan perombakan (refactor) modul secara menyeluruh.

---

## BUG-009 — Akademik
**Judul:** Tidak ada indikator submenu aktif pada Kinerja Siswa.

**Severity:** Low

**Expected Result**
Submenu aktif memiliki highlight yang jelas.

---

## BUG-010 — Unit KBEC
**Judul:** Tambah Level menampilkan notifikasi berhasil tetapi data tidak tersimpan.

**Severity:** Critical

**Hasil Aktual**
- Notifikasi berhasil muncul.
- Data tidak tersimpan.
- Data tidak muncul pada tabel.

---

## BUG-011 — Unit KBEC
**Judul:** Form tambah level tidak tertutup otomatis.

**Severity:** Low

**Expected Result**
Form tertutup otomatis setelah proses berhasil.

---

## BUG-012 — Unit KBEC
**Judul:** Data level baru tidak muncul.

**Severity:** High

**Expected Result**
Data langsung muncul setelah penyimpanan berhasil.

---

## BUG-013 — Inventaris
**Judul:** Search Inventaris tidak berfungsi.

**Severity:** Medium

**Expected Result**
Pencarian menampilkan data sesuai keyword.

---

## BUG-014 — Laporan
**Judul:** Indikator menu terlalu dominan sehingga tulisan tidak terlihat jelas.

**Severity:** Low

**Expected Result**
Indikator aktif tidak mengganggu keterbacaan teks.

---

## BUG-015 — Manajemen User
**Judul:** Beberapa menu tidak mengarah ke halaman mana pun.

**Severity:** High

**Expected Result**
Seluruh menu berfungsi sesuai tujuan.

---

## BUG-016 — Manajemen User
**Judul:** Struktur menu membingungkan.

**Severity:** Low

**Rekomendasi**
- Gabungkan menu yang memiliki fungsi sama.
- Hilangkan menu yang belum digunakan.
- Sederhanakan struktur navigasi.

---

# Kesimpulan

Ditemukan **16 temuan** dengan rincian:

| Severity | Jumlah |
|----------|--------|
| Critical | 4 |
| High | 4 |
| Medium | 5 |
| Low | 3 |

Prioritas utama perbaikan adalah modul **SPP**, **Akademik**, dan **Unit KBEC** karena berdampak langsung terhadap proses bisnis utama aplikasi.
