const { z } = require('zod');

function validate(schema) {
    return (req, res, next) => {
        try {
            schema.parse(req.body);
            next();
        } catch (err) {
            if (err instanceof z.ZodError) {
                const issues = err.issues.map(i => i.message).join(', ');
                return res.status(400).json({ success: false, message: `Validasi gagal: ${issues}` });
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

module.exports = {
    validate,
    loginSchema,
    studentSchema,
    paymentSchema
};
