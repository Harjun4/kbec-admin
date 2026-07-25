# Product Requirements Document (PRD)
## Dashboard Khusus Pengajar — KBEC (Kampung Bahasa English Course)
### Versi: 2.0 | Status: FINAL (Disetujui)

---

### 1. Keputusan Arsitektur Utama: Dashboard Terpisah

> **Dashboard Pengajar adalah aplikasi web yang SEPENUHNYA TERPISAH dari Dashboard Super Admin.**

Kedua dashboard menggunakan **database yang sama** (TiDB Cloud `kbec_db`), namun memiliki:
- URL / halaman HTML yang berbeda (`teacher-*.html` vs halaman admin yang sudah ada).
- Halaman login yang berbeda (`teacher-login.html` vs `login.html`).
- Sidebar dan navigasi yang berbeda (tema Emerald vs tema Biru Super Admin).
- Hak akses endpoint API yang berbeda (`/api/teacher/*` vs `/api/admin/*`).

**Mengapa dipisahkan?**

| Alasan | Penjelasan |
|---|---|
| **Fokus UX** | Pengajar tidak perlu melihat menu konfigurasi sistem, keuangan, atau manajemen user yang tidak relevan. UI pengajar harus bersih, cepat, dan fokus pada tugas mengajar. |
| **Keamanan** | Pengajar tidak boleh memiliki akses — bahkan tidak sengaja — ke data sensitif seperti pembayaran, gaji, atau konfigurasi database. |
| **Routing & Middleware** | Backend memisahkan endpoint `/api/teacher/*` dari `/api/admin/*` dengan middleware RBAC yang berbeda. |
| **Skalabilitas** | Di masa depan, Dashboard Pengajar bisa dikembangkan menjadi Progressive Web App (PWA) yang dapat diinstall di smartphone pengajar, tanpa mempengaruhi Dashboard Super Admin. |

---

### 2. Hierarki Role & Hak Akses (RBAC — 3 Tingkatan)

```
┌─────────────────────────────────────────────────────────────┐
│                     KBEC System RBAC                        │
│                                                             │
│  [ Super Admin ]                                            │
│    Kontrol Penuh Sistem                                     │
│    ✅ Manajemen User (tambah/hapus Admin & Pengajar)        │
│    ✅ Konfigurasi Global Platform KBEC                      │
│    ✅ Seluruh Data Keuangan & Pembayaran                    │
│    ✅ Monitoring Rekap Kehadiran Semua Pengajar             │
│    ✅ Seluruh Data Siswa, Kelas, Program                    │
│           │                                                  │
│           ▼                                                  │
│  [ Admin / Staff Akademik ] ← Opsional, Direkomendasikan   │
│    Operasional Harian                                        │
│    ✅ Menyetujui izin & dispensasi pengajar                 │
│    ✅ Mengatur jadwal kelas & penugasan guru                 │
│    ✅ Memvalidasi rekap jam mengajar untuk payroll          │
│    ❌ Tidak bisa mengubah konfigurasi sistem inti           │
│    ❌ Tidak bisa menghapus akun pengguna                    │
│           │                                                  │
│           ▼                                                  │
│  [ Pengajar / Teacher ]                                     │
│    Fokus Mengajar                                            │
│    ✅ Lihat jadwal & kelas milik sendiri saja               │
│    ✅ Input absensi siswa di kelas yang diampu              │
│    ✅ Input nilai & catatan progress siswa                  │
│    ✅ Check-in / Check-out kehadiran sendiri + GPS          │
│    ❌ Tidak bisa melihat data pengajar lain                 │
│    ❌ Tidak bisa melihat data keuangan/pembayaran           │
│    ❌ Tidak bisa menghapus kelas, siswa, atau program       │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. Pemetaan Halaman (URL Routing)

| Halaman | File | Akses | Deskripsi |
|---|---|---|---|
| **Login Pengajar** | `teacher-login.html` | Publik | Portal masuk khusus pengajar |
| **Dashboard Pengajar** | `teacher-dashboard.html` | Teacher | Statistik, jadwal hari ini, log aktivitas diri sendiri |
| **Check-in Kehadiran** | `teacher-checkin.html` | Teacher | Absensi kehadiran pengajar + GPS Geofencing |
| **Kelas Saya** | `teacher-classes.html` | Teacher | Daftar kelas yang diampu |
| **Absensi Siswa** | `teacher-attendance.html` | Teacher | Input presensi harian siswa per kelas |
| **Nilai & Progres** | `teacher-grades.html` | Teacher | Input nilai tugas, UTS, UAS, progress note |
| **Jadwal Mingguan** | `teacher-schedules.html` | Teacher | Jadwal Senin–Sabtu milik pengajar |
| **Profil Pengajar** | `teacher-profile.html` | Teacher | Update data pribadi & password |

---

### 4. Fitur Utama (Core Features)

#### A. Portal Login Pengajar (`teacher-login.html`)
- Login terpisah menggunakan email & password akun pengajar dari tabel `teachers`.
- Sesi tersimpan di `localStorage` dengan key berbeda dari Super Admin (`teacherSession` bukan `authToken`).
- Guard navigasi otomatis: Jika bukan pengajar login, redirect ke `teacher-login.html`.

#### B. Dashboard Ringkasan Pengajar (`teacher-dashboard.html`)
- Statistik: Total Kelas Diampu, Total Siswa, Jam Mengajar Minggu Ini, % Kehadiran Siswa.
- Widget Jadwal Hari Ini.
- Log Aktivitas Diri Sendiri (presensi & check-in yang dilakukan pengajar tersebut).

#### C. Absensi Kehadiran Pengajar + GPS Geofencing (`teacher-checkin.html`)
- **Check-in Tatap Muka**: Validasi GPS, radius ≤ 100m dari gedung KBEC, timestamp dari server.
- **Check-in Online**: Geofencing dilewati, timestamp server tetap digunakan.
- **Check-out**: Merekam waktu selesai & menghitung durasi mengajar.
- Koordinat, akurasi GPS, jarak dari KBEC, dan status lokasi dicatat di `teacher_checkins`.
- Rekap kehadiran pengajar ini **dapat dilihat oleh Super Admin** di halaman Pengajar yang sudah ada.

#### D. Kelas Saya (`teacher-classes.html`)
- Hanya menampilkan kelas yang `classes.pengajar = [Nama Pengajar Login]`.

#### E. Absensi Siswa (`teacher-attendance.html`)
- One-click attendance (H/S/I/A), tombol "Tandai Semua Hadir".
- Data tersimpan di tabel `attendance` yang sama dengan Super Admin.

#### F. Nilai & Progres Siswa (`teacher-grades.html`)
- Input nilai tugas, UTS, UAS (0–100). Auto-konversi ke grade letter (A/B/C/D/E).
- Catatan Progress Note kualitatif.

#### G. Jadwal Mingguan (`teacher-schedules.html`)
- Tabel kalender Senin–Sabtu.

#### H. Profil Pengajar (`teacher-profile.html`)
- Update nama, email, kontak, spesialisasi, foto avatar, dan password.

---

### 5. Integrasi Data (Bukan UI) dengan Super Admin

Meskipun UI terpisah, **data yang diinput pengajar langsung tersimpan ke database bersama** sehingga Super Admin tetap dapat memantaunya:

| Data yang Diinput Pengajar | Terlihat oleh Super Admin di |
|---|---|
| Presensi siswa | Halaman Absensi Super Admin |
| Nilai & Progress Note | Detail Siswa → Tab Nilai |
| Check-in/out + GPS | Halaman Pengajar → Tab Rekam Kehadiran |
| Log Aktivitas | Dashboard → Widget Log Aktivitas Terbaru |

---

### 6. Non-Functional Requirements
- **Performa**: Load halaman < 1 detik, respons validasi GPS < 3 detik.
- **Keamanan**: Server-side timestamp (tidak bisa dimanipulasi), RBAC ketat per endpoint.
- **Responsivitas**: Mobile-first. Check-in card dioptimalkan untuk penggunaan dengan satu tangan di smartphone.

---

### 7. Kriteria Keberhasilan (Success Metrics)
- 100% data absensi siswa terisi secara digital.
- 100% kehadiran pengajar tercatat dengan timestamp + GPS terverifikasi.
- Zero akses pengajar ke data keuangan atau konfigurasi sistem.
- Zero manipulasi timestamp kehadiran (server-side enforcement).
- CSAT pengajar terhadap kemudahan penggunaan > 90%.
