// public/js/route-guard.js - Client-Side Route Guard KBEC Admin
(function () {
    const userRole = localStorage.getItem('userRole');
    const rawUser = localStorage.getItem('currentUser');
    const currentUser = rawUser ? JSON.parse(rawUser) : null;
    const effectiveRole = userRole || (currentUser ? (currentUser.role || currentUser.role_name || currentUser.type) : null);

    const currentPath = window.location.pathname;

    // 1. Cek Autentikasi dasar
    const publicPages = ['/login.html', '/register.html', 'login.html', 'register.html'];
    const isPublicPage = publicPages.some(page => currentPath.endsWith(page));

    if (effectiveRole === 'Pending' || (currentUser && (currentUser.role === 'Pending' || currentUser.status === 'Pending'))) {
        alert('Akun Anda sedang menunggu persetujuan dan pengaturan role oleh Super Admin.');
        localStorage.clear();
        if (!isPublicPage) {
            window.location.href = 'login.html';
        }
        return;
    }

    if (!effectiveRole && !isPublicPage) {
        window.location.href = 'login.html';
        return;
    }

    // 2. Pemetaan Hak Akses Halaman Terkini
    const rolePermissions = {
        'Pengajar': ['/absensi.html', '/jadwal.html', '/profile.html', 'absensi.html', 'jadwal.html', 'profile.html'],
        'Guru': ['/absensi.html', '/jadwal.html', '/profile.html', 'absensi.html', 'jadwal.html', 'profile.html'],
        'Admin': ['/dashboard.html', '/laporan.html', '/pembayaran.html', '/siswa.html', '/jadwal.html', '/kelas.html', '/inventaris.html', '/program.html', '/profile.html', 'dashboard.html', 'laporan.html', 'pembayaran.html', 'siswa.html', 'jadwal.html', 'kelas.html', 'inventaris.html', 'program.html', 'profile.html'],
        'Super Admin': ['*'] // Akses ke semua halaman
    };

    // profile.html bebas diakses oleh seluruh role yang terautentikasi
    if (currentPath.endsWith('profile.html')) return;

    // 3. Eksekusi Proteksi & Redirect jika melanggar
    if (effectiveRole && effectiveRole !== 'Super Admin' && !isPublicPage) {
        const allowedRoutes = rolePermissions[effectiveRole] || [];
        const isAllowed = allowedRoutes.includes('*') || allowedRoutes.some(route => currentPath.endsWith(route));

        if (!isAllowed) {
            alert('Akses Ditolak: Anda tidak memiliki izin mengakses halaman ini.');
            const fallbackUrl = (effectiveRole === 'Pengajar' || effectiveRole === 'Guru') ? 'absensi.html' : 'dashboard.html';
            window.location.href = fallbackUrl;
        }
    }
})();
