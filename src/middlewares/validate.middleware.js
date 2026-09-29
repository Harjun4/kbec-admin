const { z } = require('zod');

function validate(schema) {
    return (req, res, next) => {
        try {
            schema.parse(req.body);
            next();
        } catch (err) {
            if (err instanceof z.ZodError) {
                const issues = err.issues.map(i => i.message).join(', ');
                return res.status(400).json({ success: false, message: `Validasi gagal: ${issues}`, errors: err.issues });
            }
            next(err);
        }
    };
}

const loginSchema = z.object({
    email: z.string().min(1, 'Email atau NIS wajib diisi'),
    password: z.string().min(1, 'Password wajib diisi')
});

const studentSchema = z.object({
    nama: z.string().min(2, 'Nama siswa minimal 2 karakter'),
    program: z.string().optional(),
    level: z.string().optional(),
    status: z.enum(['Aktif', 'Alumni', 'Non-Aktif']).optional()
});

const paymentSchema = z.object({
    jumlah: z.number().min(1, 'Nominal pembayaran harus lebih dari 0').or(z.string()),
    nama: z.string().min(2, 'Nama wajib diisi'),
    metode: z.string().optional()
});

const userSchema = z.object({
    name: z.string().min(2, 'Nama minimal 2 karakter'),
    email: z.string().email('Format email tidak valid'),
    role: z.enum(['Super Admin', 'Admin', 'Staff', 'Staf', 'Pengajar'], {
        errorMap: () => ({ message: 'Role harus Super Admin, Admin, Staff, atau Pengajar' })
    })
}).passthrough();

const teacherSchema = z.object({
    nama: z.string().min(2, 'Nama minimal 2 karakter'),
    email: z.string().email('Format email tidak valid'),
    kontak: z.string().optional().nullable()
}).passthrough();

const classSchema = z.object({
    nama: z.string().min(1, 'Nama kelas wajib diisi'),
    program: z.string().min(1, 'Program/Unit wajib diisi')
}).passthrough();

const attendanceItemSchema = z.object({
    student_id: z.string().or(z.number()).optional(),
    id: z.string().or(z.number()).optional(),
    class_id: z.string().or(z.number()).optional(),
    kelas: z.string().optional().nullable(),
    program: z.string().optional().nullable(),
    nama: z.string().optional().nullable(),
    status: z.enum(['Hadir', 'Izin', 'Ijin', 'Sakit', 'Alpha', 'Alfa', 'Kosong', '-'], {
        errorMap: () => ({ message: 'Status harus Hadir, Izin, Sakit, Alpha, Kosong, atau -' })
    }),
    date: z.string().optional(),
    tanggal: z.string().optional(),
    notes: z.string().optional().nullable()
}).passthrough();

const attendanceSchema = z.union([
    z.array(attendanceItemSchema).min(1, 'Daftar absensi tidak boleh kosong'),
    z.object({
        class_id: z.string().or(z.number()).optional(),
        kelas: z.string().optional().nullable(),
        date: z.string().optional(),
        tanggal: z.string().optional(),
        items: z.array(attendanceItemSchema).optional(),
        list: z.array(attendanceItemSchema).optional()
    }).passthrough()
]);

const inventorySchema = z.object({
    nama_barang: z.string().min(1, 'Nama barang wajib diisi'),
    stok: z.number().min(0, 'Jumlah stok tidak boleh negatif').or(
        z.string().regex(/^\d+$/, 'Jumlah harus berupa angka').transform(Number)
    )
}).passthrough();

const teacherAttendanceSchema = z.object({
    attendance_type: z.enum(['checkin_harian', 'checkout_harian', 'sesi_mengajar', 'izin', 'sakit']).optional().default('checkin_harian'),
    class_id: z.union([z.string(), z.number()]).optional().nullable(),
    class_name: z.string().optional().nullable(),
    topic_material: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    lat: z.union([z.number(), z.string()]).optional().nullable(),
    lng: z.union([z.number(), z.string()]).optional().nullable(),
    is_online: z.union([z.boolean(), z.number(), z.string()]).optional().nullable(),
    proof_image: z.string().optional().nullable()
}).passthrough();

module.exports = {
    validate,
    loginSchema,
    studentSchema,
    paymentSchema,
    userSchema,
    teacherSchema,
    classSchema,
    attendanceSchema,
    inventorySchema,
    teacherAttendanceSchema
};
