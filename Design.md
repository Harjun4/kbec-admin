# Design Specifications (Design.md)
## Panduan UI/UX & Sistem Desain — Dashboard Pengajar KBEC

---

### 1. Filosofi & Aesthetics Desain

Untuk membedakan antarmuka **Dashboard Pengajar** dari Dashboard Super Admin (dominasi Biru `#0A58CA`), Dashboard Pengajar mengusung tema **"Fresh Emerald & Indigo Workspace"** — memberikan nuansa akademis yang segar, tenang, dan fokus pada pengajaran.

---

### 2. Design System & Tokens

#### A. Palet Warna (Color Palette)

| Token | Nilai | Penggunaan |
|---|---|---|
| `--color-primary` | `#059669` (Emerald 600) | Tombol utama, header sidebar, aksen aktif |
| `--color-secondary` | `#0D9488` (Teal 500) | Tombol sekunder, badge jadwal |
| `--color-danger` | `#DC2626` (Red 600) | Tombol Check-out, pesan error GPS |
| `--color-warning` | `#D97706` (Amber 600) | Status "Di luar radius", peringatan |
| `--color-bg` | `#F8FAFC` (Slate 50) | Background halaman utama |
| `--color-card` | `#FFFFFF` | Background kartu konten |
| `--color-text-primary` | `#0F172A` (Slate 900) | Judul & heading utama |
| `--color-text-muted` | `#94A3B8` (Slate 400) | Subtitle & label sekunder |

#### B. Typografi
- **Font Family**: `'Plus Jakarta Sans', sans-serif` (diimpor dari Google Fonts)
- **Heading 1** (Nama Pengajar di Header): 24px, Weight 800 ExtraBold
- **Card Title**: 14px, Weight 700 Bold
- **Body / Form Label**: 13px, Weight 500 Medium
- **Badge / Tag Kecil**: 10px, Weight 700 Bold, UPPERCASE

---

### 3. Komponen UI Utama

#### A. Navigation Sidebar Pengajar
```
┌──────────────────────────────┐
│  🎓 KBEC Pengajar           │
│  [Avatar] Nama Pengajar      │
│  Keahlian / Spesialisasi     │
├──────────────────────────────┤
│  Dashboard                   │
│  Kelas Saya                  │
│  ▶ Check-in Kelas  [•LIVE]  │  ← Badge hijau berkedip saat aktif
│  Absensi Siswa               │
│  Nilai & Progres             │
│  Jadwal Mengajar             │
│  Profil Saya                 │
├──────────────────────────────┤
│  [Keluar / Logout]           │
└──────────────────────────────┘
```

#### B. Check-in Card Component (Fitur Utama)

```
┌──────────────────────────────────────────────────────────┐
│  📍 Presensi Kehadiran Pengajar                          │
│  Jum'at, 25 Juli 2026 — Pemrograman Web Lanjut          │
│                                                          │
│  Status Lokasi GPS:  🟢 DALAM RADIUS KBEC (42m)         │
│  Koordinat:          -7.9666°, 112.6326°                 │
│  Akurasi GPS:        ±8 meter                            │
│                                                          │
│  [ 📍 CHECK-IN KELAS ]    [ Waktu: 08:01:23 WIB ]      │
│                                                          │
│  ── Setelah Mengajar ─────────────────────────────────── │
│                                                          │
│  [ ⏹ CHECK-OUT KELAS ]   [ Waktu: 09:30:47 WIB ]      │
│  Total Durasi: 1 jam 29 menit                            │
└──────────────────────────────────────────────────────────┘
```

**States & Micro-animations Check-in**:
- **State: Menunggu GPS** → Ikon spinner berputar + teks "Mendapatkan lokasi GPS..."
- **State: Valid dalam Radius** → Badge hijau `bg-emerald-50 text-emerald-700` dengan ikon `check-circle` + `ring` animasi pulse.
- **State: Di Luar Radius** → Badge merah `bg-rose-50 text-rose-700` dengan ikon `alert-triangle` + jarak dalam meter ditampilkan eksplisit.
- **State: Berhasil Check-in** → Konfirmasi slide-down toast hijau + tombol Check-in berubah disable + timer aktif berjalan.
- **State: Mode Online** → Badge biru `bg-blue-50 text-blue-700` — geofencing otomatis dilewati.

#### C. Badge Status Presensi Siswa

| Status | Class CSS |
|---|---|
| Hadir (H) | `bg-emerald-50 text-emerald-700 border border-emerald-200` |
| Izin (I) | `bg-blue-50 text-blue-700 border border-blue-200` |
| Sakit (S) | `bg-amber-50 text-amber-700 border border-amber-200` |
| Alpa (A) | `bg-rose-50 text-rose-700 border border-rose-200` |

#### D. Rekap Kehadiran Pengajar (Di Super Admin)

Halaman `/pengajar.html` di Super Admin menambahkan tab **"Rekam Kehadiran"** yang menampilkan tabel:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Rekam Kehadiran Pengajar                                              │
│  Filter: [ Semua Pengajar ▾ ]  [ Bulan: Juli 2026 ▾ ]  [ Export ]   │
├────────┬───────────────┬──────────────┬──────────────┬────────────────┤
│ Tgl    │ Pengajar      │ Check-in     │ Check-out    │ Status Lokasi  │
├────────┼───────────────┼──────────────┼──────────────┼────────────────┤
│ 25 Jul │ Harjuna Putra │ 08:01 WIB    │ 09:30 WIB    │ 🟢 Valid (42m) │
│ 24 Jul │ Budi Santoso  │ 10:00 WIB    │ 11:30 WIB    │ 🟢 Valid (18m) │
│ 23 Jul │ Siti Rahayu   │ 13:05 WIB    │ 14:30 WIB    │ 🟡 Online Mode │
└────────┴───────────────┴──────────────┴──────────────┴────────────────┘
```

---

### 4. Responsivitas & Mobile Layout
- **Desktop (≥1024px)**: Sidebar tetap di kiri (W-64), konten utama di kanan.
- **Tablet & Smartphone (<1024px)**: Sidebar collapsible (burger menu), tombol Check-in berukuran besar dengan touch target minimal **56px × 56px** untuk kemudahan di lapangan.
- Kartu Check-in didesain seperti **tombol aksi utama mobile** yang mudah dijangkau dengan ibu jari saat memegang ponsel.
