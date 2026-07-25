# Design Specifications
## Panduan UI/UX & Sistem Desain - Dashboard Pengajar KBEC

---

### 1. Filosofi & Aesthetics Desain
Untuk membedakan antarmuka **Dashboard Pengajar** dari Dashboard Super Admin (yang didominasi warna Biru `#0A58CA`), Dashboard Pengajar mengusung tema estetika **Fresh Emerald & Indigo Workspace**.

Penggunaan palet warna Hijau Zamrud (*Emerald*) memberikan nuansa akademis yang segar, tenang, dan fokus pada pengajaran, dipadukan dengan aksen Indigo untuk elemen interaktif premium.

---

### 2. Design System & Tokens

#### A. Palet Warna (Color Palette)
- **Primary Accent (Teacher Brand)**: Emerald Green (`#059669` / `bg-emerald-600` / `text-emerald-600`)
- **Secondary Accent**: Indigo / Teal (`#0D9488` / `bg-teal-500`)
- **Background Utama**: Slate Ultra Light (`#F8FAFC` / `bg-slate-50/50`)
- **Card Background**: Pure White (`#FFFFFF`) dengan border halus (`border-slate-100`) dan bayangan lembut `shadow-[0_4px_20px_rgba(0,0,0,0.02)]`.
- **Text Hierarki**:
  - Primary Heading: Dark Slate (`#0F172A` / `text-slate-900`)
  - Body Text: Medium Slate (`#334155` / `text-slate-700`)
  - Subtitle / Muted: Light Slate (`#94A3B8` / `text-slate-400`)

#### B. Typografi (Typography)
- **Font Family**: `'Plus Jakarta Sans', sans-serif`
- **Heading 1**: 24px (Font-weight: 800 ExtraBold, Tracking: Tight)
- **Card Title**: 14px (Font-weight: 700 Bold)
- **Body / Form**: 13px (Font-weight: 500 Medium)
- **Badge / Tag**: 10px (Font-weight: 700 Bold, Uppercase)

#### C. Component Badges Status Presensi
- **Hadir (H)**: `bg-emerald-50 text-emerald-700 border-emerald-200`
- **Izin (I)**: `bg-blue-50 text-blue-700 border-blue-200`
- **Sakit (S)**: `bg-amber-50 text-amber-700 border-amber-200`
- **Alpa (A)**: `bg-rose-50 text-rose-700 border-rose-200`

---

### 3. Struktur Layout & Komponen Utama

#### A. Navigation Sidebar (`Teacher Sidebar`)
- **Logo & Header**: Icon `graduation-cap` dengan badge "Pengajar KBEC".
- **Menu Utama**:
  1. `layout-dashboard`: **Dashboard Utama**
  2. `book-open`: **Kelas Saya**
  3. `check-square`: **Input Absensi**
  4. `award`: **Nilai & Progres Siswa**
  5. `calendar`: **Jadwal Mengajar**
  6. `user`: **Profil Pengajar**

#### B. Quick Attendance Modal / Sheet
- Modal pop-up modern tanpa *page reload*.
- Menyediakan tombol cepat **"Tandai Semua Hadir"**.
- Micro-animations pada saat mengklik tombol status (efek scale & color transition halus 200ms).

#### C. Student Progress Card Component
Setiap kartu evaluasi siswa menampilkan:
- Inisial Avatar Bulat Warna-Warni
- Nama Siswa & ID Siswa
- Input Nilai Angka (Daily, Mid, Final)
- Textarea Catatan *Progress Note* Pengajar dengan indikator karakter otomatis.

---

### 4. Responsivitas & Mobile Layout
- **Desktop (>= 1024px)**: Sidebar tetap di sebelah kiri (W-64), konten utama di kanan.
- **Tablet & Smartphone (< 1024px)**: Sidebar dapat disembunyikan (*collapsible burger menu*), tombol presensi berubah menjadi kartu bertumpuk vertikal dengan ukuran sentuh (*touch target*) minimal 44px x 44px.
