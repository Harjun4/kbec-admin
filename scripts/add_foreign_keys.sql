-- ==========================================
-- KBEC MANAGEMENT SYSTEM - SUPABASE PHYSICAL FOREIGN KEY CONSTRAINTS
-- Execute this script in Supabase SQL Editor if you want database-level foreign key constraints.
-- ==========================================

-- 1. Relasi Bills -> Students
ALTER TABLE bills 
  ADD CONSTRAINT fk_bills_student 
  FOREIGN KEY (student_id) REFERENCES students(id) 
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Relasi Payments -> Students
ALTER TABLE payments 
  ADD CONSTRAINT fk_payments_student 
  FOREIGN KEY (student_id) REFERENCES students(id) 
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Relasi Payments -> Bills
ALTER TABLE payments 
  ADD CONSTRAINT fk_payments_bill 
  FOREIGN KEY (bill_id) REFERENCES bills(id) 
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Relasi Class Students -> Classes & Students
ALTER TABLE class_students 
  ADD CONSTRAINT fk_cs_class 
  FOREIGN KEY (class_id) REFERENCES classes(id) 
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE class_students 
  ADD CONSTRAINT fk_cs_student 
  FOREIGN KEY (student_id) REFERENCES students(id) 
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Relasi Student Grades -> Students
ALTER TABLE student_grades 
  ADD CONSTRAINT fk_sg_student 
  FOREIGN KEY (student_id) REFERENCES students(id) 
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Relasi Attendance -> Students
ALTER TABLE attendance 
  ADD CONSTRAINT fk_attendance_student 
  FOREIGN KEY (student_id) REFERENCES students(id) 
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Relasi Teacher Checkins -> Teachers
ALTER TABLE teacher_checkins 
  ADD CONSTRAINT fk_checkins_teacher 
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) 
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Relasi Inventory Mutations -> Inventory
ALTER TABLE inventory_mutations 
  ADD CONSTRAINT fk_mutations_item 
  FOREIGN KEY (item_id) REFERENCES inventory(id) 
  ON DELETE CASCADE ON UPDATE CASCADE;
