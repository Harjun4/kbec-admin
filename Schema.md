# Database Schema Specifications (Schema.md)
## Ekstensi Skema Database & Relasi Fitur Pengajar - TiDB Cloud

---

### 1. Overview Struktur Tabel
Dashboard Pengajar memanfaatkan tabel-tabel utama yang sudah ada di TiDB Cloud, serta menambahkan 1 tabel ekstensi baru `student_grades` untuk menyimpan nilai dan evaluasi kualitatif siswa.

```
       ┌──────────────┐
       │   teachers   │
       └──────┬───────┘
              │ (nama / id)
              ▼
       ┌──────────────┐          ┌──────────────────┐
       │   classes    │ ◄───────►│  class_students  │
       └──────┬───────┘          └────────┬─────────┘
              │                           │
              ▼                           ▼
       ┌──────────────┐          ┌──────────────────┐
       │  attendance  │          │     students     │
       └──────────────┘          └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │  student_grades  │ (NEW)
                                 └──────────────────┘
```

---

### 2. Spesifikasi Tabel Ekstensi Baru: `student_grades`

Tabel ini menyimpan nilai harian, UTS, UAS, dan catatan perkembangan kualitatif siswa per kelas & pengajar.

```sql
CREATE TABLE IF NOT EXISTS `student_grades` (
  `id` INT NOT NULL,
  `student_id` VARCHAR(50) COLLATE utf8mb4_general_ci NOT NULL,
  `class_id` INT NOT NULL,
  `teacher_id` VARCHAR(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nilai_tugas` INT DEFAULT 0,
  `nilai_uts` INT DEFAULT 0,
  `nilai_uas` INT DEFAULT 0,
  `nilai_akhir` INT DEFAULT 0,
  `grade_letter` VARCHAR(5) COLLATE utf8mb4_general_ci DEFAULT 'A',
  `catatan_progress` TEXT COLLATE utf8mb4_general_ci DEFAULT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_student_class` (`student_id`, `class_id`),
  KEY `idx_class` (`class_id`),
  KEY `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

---

### 3. Pembaruan Skema Tabel `teachers` (Dukungan Login & Password)

Untuk memungkinkan pengajar melakukan login mandiri, tabel `teachers` diperbarui dengan menambahkan kolom `password` hashed dan `role`:

```sql
ALTER TABLE `teachers` 
ADD COLUMN IF NOT EXISTS `password` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `role` VARCHAR(30) COLLATE utf8mb4_general_ci DEFAULT 'teacher';
```

---

### 4. Kamus Data & Relasi Tabel Terkait Pengajar

#### A. Tabel `classes` (Digunakan oleh Pengajar)
- `id` (INT, PRIMARY KEY): ID Unik Kelas.
- `nama` (VARCHAR): Nama Kelas (misal: "Beginner 1-A").
- `program` (VARCHAR): Nama Program Kursus.
- `pengajar` (VARCHAR, KEY): Nama Pengajar yang dihubungkan ke `teachers.nama`.
- `hari`, `mulai`, `selesai`, `ruang`: Data jadwal kelas harian.

#### B. Tabel `attendance` (Diisi oleh Pengajar)
- `id` (INT, PRIMARY KEY): ID Presensi.
- `student_id` (VARCHAR, KEY): ID Siswa (`#KB-...`).
- `nama` (VARCHAR): Nama Lengkap Siswa.
- `kelas` (VARCHAR, KEY): Nama Kelas.
- `status` (VARCHAR): Status Kehadiran (`Hadir`, `Izin`, `Sakit`, `Alpa`).
- `tanggal` (DATE): Tanggal pelaksanaan presensi.

#### C. Tabel `student_grades` (Diisi oleh Pengajar)
- `student_id`: Referensi ke `students.id`.
- `class_id`: Referensi ke `classes.id`.
- `teacher_id`: Referensi ke `teachers.id`.
- `catatan_progress`: Catatan perkembangan evaluasi dari pengajar.

---

### 5. Query SQL Utama Fitur Pengajar

#### A. Mengambil Daftar Kelas Pengajar yang Sedang Login:
```sql
SELECT c.*, COALESCE(cs.total_siswa, 0) AS total_siswa
FROM classes c
LEFT JOIN (
    SELECT class_id, COUNT(*) AS total_siswa 
    FROM class_students 
    GROUP BY class_id
) cs ON c.id = cs.class_id
WHERE c.pengajar = ? OR c.pengajar LIKE ?;
```

#### B. Upsert Nilai & Progress Note Siswa:
```sql
INSERT INTO student_grades (id, student_id, class_id, teacher_id, nilai_tugas, nilai_uts, nilai_uas, nilai_akhir, grade_letter, catatan_progress)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE 
  nilai_tugas = VALUES(nilai_tugas),
  nilai_uts = VALUES(nilai_uts),
  nilai_uas = VALUES(nilai_uas),
  nilai_akhir = VALUES(nilai_akhir),
  grade_letter = VALUES(grade_letter),
  catatan_progress = VALUES(catatan_progress);
```
