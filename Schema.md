# Database Schema Specifications (Schema.md)
## Ekstensi Skema Database & Relasi — Dashboard Pengajar KBEC

---

### 1. Overview Struktur Database (Shared dengan Super Admin)

Dashboard Pengajar dan Super Admin menggunakan **satu database TiDB Cloud yang sama** (`kbec_db`). Ekstensi untuk fitur pengajar adalah menambahkan 2 tabel baru (`teacher_checkins`, `student_grades`) dan mengubah 1 tabel yang sudah ada (`teachers`).

```
                         [ kbec_db — TiDB Cloud ]

┌───────────┐   ┌────────────────┐   ┌──────────────────┐
│  teachers │──►│    classes     │──►│  class_students  │
│ [+password│   │ (pengajar=name)│   │(class_id,student)│
│  +role]   │   └───────┬────────┘   └────────┬─────────┘
└─────┬─────┘           │                     │
      │                 ▼                     ▼
      │          ┌────────────┐         ┌──────────┐
      │          │ attendance │         │ students │
      │          └────────────┘         └────┬─────┘
      │                                      │
      ▼                                      ▼
┌─────────────────┐                ┌─────────────────┐
│ teacher_checkins│                │ student_grades  │
│ [NEW — GPS Log] │                │ [NEW — Penilaian│
└─────────────────┘                └─────────────────┘

 Semua tabel juga terhubung ke:
 ┌────────────────┐  ┌───────────────┐  ┌──────────┐
 │ activity_logs  │  │   reminders   │  │ payments │
 │ (dibaca Super  │  │ (agenda)      │  │ (Admin)  │
 │  Admin & Guru) │  └───────────────┘  └──────────┘
 └────────────────┘
```

---

### 2. Tabel Baru 1: `teacher_checkins` — Rekam Kehadiran Pengajar

Tabel ini menyimpan setiap event check-in dan check-out pengajar beserta data GPS dan timestamp server.

```sql
CREATE TABLE IF NOT EXISTS `teacher_checkins` (
  `id`               INT NOT NULL,
  `teacher_id`       VARCHAR(50)  COLLATE utf8mb4_general_ci NOT NULL,
  `teacher_nama`     VARCHAR(150) COLLATE utf8mb4_general_ci NOT NULL,
  `class_id`         INT DEFAULT NULL,
  `class_nama`       VARCHAR(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tipe_kelas`       ENUM('tatap_muka', 'online') DEFAULT 'tatap_muka',
  -- GPS Check-in Data
  `checkin_time`     DATETIME NOT NULL DEFAULT (NOW()),
  `checkin_lat`      DECIMAL(10, 8) DEFAULT NULL,
  `checkin_lng`      DECIMAL(11, 8) DEFAULT NULL,
  `checkin_accuracy` FLOAT DEFAULT NULL,            -- Akurasi GPS dalam meter
  `jarak_dari_kbec`  FLOAT DEFAULT NULL,            -- Jarak dari koordinat KBEC dalam meter
  `status_lokasi`    ENUM(
                        'VALID_IN_RANGE',            -- Dalam radius ≤100m KBEC
                        'OUT_OF_RANGE_BYPASS',       -- Di luar radius (ada izin admin)
                        'ONLINE_MODE'                -- Kelas online, geofencing tidak berlaku
                     ) NOT NULL DEFAULT 'VALID_IN_RANGE',
  -- GPS Check-out Data
  `checkout_time`    DATETIME DEFAULT NULL,
  `checkout_lat`     DECIMAL(10, 8) DEFAULT NULL,
  `checkout_lng`     DECIMAL(11, 8) DEFAULT NULL,
  `durasi_menit`     INT DEFAULT NULL,              -- Durasi mengajar (checkout - checkin)
  -- Metadata
  `tanggal`          DATE NOT NULL,
  `catatan`          TEXT COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_teacher_class_date` (`teacher_id`, `class_id`, `tanggal`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_tanggal` (`tanggal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

---

### 3. Tabel Baru 2: `student_grades` — Nilai & Progress Note Siswa

```sql
CREATE TABLE IF NOT EXISTS `student_grades` (
  `id`               INT NOT NULL,
  `student_id`       VARCHAR(50)  COLLATE utf8mb4_general_ci NOT NULL,
  `class_id`         INT NOT NULL,
  `teacher_id`       VARCHAR(50)  COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nilai_tugas`      TINYINT UNSIGNED DEFAULT 0,   -- 0–100
  `nilai_uts`        TINYINT UNSIGNED DEFAULT 0,   -- 0–100
  `nilai_uas`        TINYINT UNSIGNED DEFAULT 0,   -- 0–100
  `nilai_akhir`      TINYINT UNSIGNED DEFAULT 0,   -- rata-rata tertimbang
  `grade_letter`     CHAR(2) COLLATE utf8mb4_general_ci DEFAULT 'E',  -- A/B/C/D/E
  `catatan_progress` TEXT COLLATE utf8mb4_general_ci DEFAULT NULL,
  `updated_at`       DATETIME DEFAULT (NOW()) ON UPDATE (NOW()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_student_class` (`student_id`, `class_id`),
  KEY `idx_class` (`class_id`),
  KEY `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

---

### 4. Modifikasi Tabel Existing: `teachers`

Tambahkan kolom untuk mendukung login mandiri pengajar dan konfigurasi tipe kelas.

```sql
-- Jalankan di TiDB Cloud Query Editor atau via server.js seedDB():
ALTER TABLE `teachers`
  ADD COLUMN IF NOT EXISTS `password`     VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `role`         VARCHAR(30)  COLLATE utf8mb4_general_ci DEFAULT 'teacher',
  ADD COLUMN IF NOT EXISTS `tipe_kelas`   VARCHAR(30)  COLLATE utf8mb4_general_ci DEFAULT 'tatap_muka';
  -- tipe_kelas: 'tatap_muka' | 'online' | 'hybrid'
```

---

### 5. Query SQL Utama Fitur Pengajar

#### A. Check-in Pengajar (INSERT dari API Server):
```sql
INSERT INTO teacher_checkins
  (id, teacher_id, teacher_nama, class_id, class_nama, tipe_kelas,
   checkin_time, checkin_lat, checkin_lng, checkin_accuracy,
   jarak_dari_kbec, status_lokasi, tanggal)
VALUES
  (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, CURDATE())
ON DUPLICATE KEY UPDATE
  catatan = VALUES(catatan);
-- checkin_time = NOW() — WAJIB dari server, bukan klien!
```

#### B. Check-out Pengajar:
```sql
UPDATE teacher_checkins
SET checkout_time = NOW(),
    checkout_lat  = ?,
    checkout_lng  = ?,
    durasi_menit  = TIMESTAMPDIFF(MINUTE, checkin_time, NOW())
WHERE teacher_id = ? AND tanggal = CURDATE();
```

#### C. Rekap Kehadiran Pengajar (Dibaca oleh Super Admin):
```sql
SELECT tc.*, t.foto, t.keahlian
FROM teacher_checkins tc
JOIN teachers t ON tc.teacher_id = t.id
WHERE tc.tanggal BETWEEN ? AND ?
ORDER BY tc.tanggal DESC, tc.checkin_time DESC;
```

#### D. Kelas yang Diampu Pengajar Login:
```sql
SELECT c.*, COALESCE(cs.total_siswa, 0) AS total_siswa
FROM classes c
LEFT JOIN (
    SELECT class_id, COUNT(*) AS total_siswa
    FROM class_students GROUP BY class_id
) cs ON c.id = cs.class_id
WHERE c.pengajar = ?;
```

#### E. Upsert Nilai Siswa:
```sql
INSERT INTO student_grades
  (id, student_id, class_id, teacher_id,
   nilai_tugas, nilai_uts, nilai_uas, nilai_akhir, grade_letter, catatan_progress)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  nilai_tugas      = VALUES(nilai_tugas),
  nilai_uts        = VALUES(nilai_uts),
  nilai_uas        = VALUES(nilai_uas),
  nilai_akhir      = VALUES(nilai_akhir),
  grade_letter     = VALUES(grade_letter),
  catatan_progress = VALUES(catatan_progress);
```

---

### 6. Logika Konversi Nilai Akhir ke Grade Letter

```javascript
// Dijalankan di server sebelum INSERT ke student_grades
function toGradeLetter(nilaiAkhir) {
    if (nilaiAkhir >= 85) return 'A';
    if (nilaiAkhir >= 70) return 'B';
    if (nilaiAkhir >= 55) return 'C';
    if (nilaiAkhir >= 40) return 'D';
    return 'E';
}
```

---

### 7. Variabel ENV Wajib Ditambahkan ke `.env`

```env
# Koordinat Resmi Lokasi KBEC (sesuaikan dengan lokasi gedung sesungguhnya)
KBEC_LATITUDE=-7.9666
KBEC_LONGITUDE=112.6326
KBEC_RADIUS_METERS=100
```
