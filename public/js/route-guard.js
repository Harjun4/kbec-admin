// public/js/route-guard.js - Client-Side Route Guard & Session Inactivity Manager KBEC Admin
(function () {
    const currentPath = window.location.pathname;
    const publicPages = ['/login.html', '/register.html', 'login.html', 'register.html'];
    const isPublicPage = publicPages.some(page => currentPath.endsWith(page));

    // =========================================================================
    // 1. Konfigurasi Batas Waktu Ketidakaktifan (Inactivity Timeout)
    // =========================================================================
    // Standar keamanan: 30 menit tanpa aktivitas pengguna (mouse, keyboard, scroll, touch)
    const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 menit
    const WARNING_BEFORE_MS = 2 * 60 * 1000;    // Tampilkan peringatan jika tersisa 2 menit

    function triggerAutoLogout(reason) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('authToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('lastActivityTime');
        localStorage.removeItem('loginTime');

        if (reason) {
            sessionStorage.setItem('session_expired_reason', reason);
        }

        if (!isPublicPage) {
            window.location.href = 'login.html';
        }
    }
    window.triggerAutoLogout = triggerAutoLogout;

    // Global Fetch Interceptor untuk menangkap status 401 Unauthorized
    if (!window.__kbecFetchInterceptorInstalled) {
        window.__kbecFetchInterceptorInstalled = true;
        const nativeFetch = window.fetch;
        window.fetch = async function (...args) {
            try {
                const response = await nativeFetch.apply(this, args);
                if (response && response.status === 401 && !isPublicPage) {
                    triggerAutoLogout('Sesi Anda telah kedaluwarsa dari server. Silakan masuk kembali.');
                }
                return response;
            } catch (err) {
                throw err;
            }
        };
    }

    // Jika di halaman publik (login/register), tidak perlu lakukan proteksi route & idle tracker
    if (isPublicPage) return;

    const userRole = localStorage.getItem('userRole');
    const rawUser = localStorage.getItem('currentUser');
    const authToken = localStorage.getItem('authToken');
    const currentUser = rawUser ? JSON.parse(rawUser) : null;
    const effectiveRole = userRole || (currentUser ? (currentUser.role || currentUser.role_name || currentUser.type) : null);

    // =========================================================================
    // 2. Pemeriksaan Kedaluwarsa Token JWT (Expired Token Guard)
    // =========================================================================
    if (authToken) {
        try {
            const tokenParts = authToken.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                if (payload.exp && Date.now() >= payload.exp * 1000) {
                    triggerAutoLogout('Masa berlaku sesi login Anda telah berakhir. Silakan masuk kembali.');
                    return;
                }
            }
        } catch (e) {
            // Abaikan kesalahan decoding, biarkan middleware backend memverifikasi
        }
    }

    // =========================================================================
    // 3. Pemeriksaan Inactivity Timeout saat Membuka Halaman (Page Load Check)
    // =========================================================================
    const lastActivityStr = localStorage.getItem('lastActivityTime');
    const now = Date.now();
    if (lastActivityStr) {
        const lastActivity = parseInt(lastActivityStr, 10);
        if (!isNaN(lastActivity) && (now - lastActivity > INACTIVITY_LIMIT_MS)) {
            triggerAutoLogout('Sesi Anda telah berakhir karena tidak ada aktivitas selama lebih dari 30 menit. Silakan login kembali.');
            return;
        }
    }

    // Perbarui penanda waktu aktivitas saat ini
    localStorage.setItem('lastActivityTime', now.toString());

    // =========================================================================
    // 4. Cek Autentikasi Dasar & Status Akun
    // =========================================================================
    if (effectiveRole === 'Pending' || (currentUser && (currentUser.role === 'Pending' || currentUser.status === 'Pending'))) {
        alert('Akun Anda sedang menunggu persetujuan dan pengaturan role oleh Super Admin.');
        triggerAutoLogout('Akun Anda sedang menunggu persetujuan Super Admin.');
        return;
    }

    if (!effectiveRole) {
        window.location.href = 'login.html';
        return;
    }

    // =========================================================================
    // 5. Pemetaan Hak Akses Halaman Terkini (RBAC Matrix)
    // =========================================================================
    const rolePermissions = {
        'Pengajar': ['/jadwal.html', '/absensi.html', '/absensi-pengajar.html', '/profile.html', 'jadwal.html', 'absensi.html', 'absensi-pengajar.html', 'profile.html'],
        'Guru': ['/jadwal.html', '/absensi.html', '/absensi-pengajar.html', '/profile.html', 'jadwal.html', 'absensi.html', 'absensi-pengajar.html', 'profile.html'],
        'Staff': ['/siswa.html', '/pengajar.html', '/kelas.html', '/jadwal.html', '/absensi-pengajar.html', '/inventaris.html', '/profile.html', 'siswa.html', 'pengajar.html', 'kelas.html', 'jadwal.html', 'absensi-pengajar.html', 'inventaris.html', 'profile.html'],
        'Staf': ['/siswa.html', '/pengajar.html', '/kelas.html', '/jadwal.html', '/absensi-pengajar.html', '/inventaris.html', '/profile.html', 'siswa.html', 'pengajar.html', 'kelas.html', 'jadwal.html', 'absensi-pengajar.html', 'inventaris.html', 'profile.html'],
        'Admin': ['/dashboard.html', '/siswa.html', '/pembayaran.html', '/biaya-lain.html', '/voucher.html', '/laporan.html', '/rekap-kehadiran.html', '/absensi-pengajar.html', '/profile.html', 'dashboard.html', 'siswa.html', 'pembayaran.html', 'biaya-lain.html', 'voucher.html', 'laporan.html', 'rekap-kehadiran.html', 'absensi-pengajar.html', 'profile.html'],
        'Super Admin': ['*'] // Akses ke semua halaman
    };

    // profile.html bebas diakses oleh seluruh role yang terautentikasi
    if (!currentPath.endsWith('profile.html')) {
        if (effectiveRole !== 'Super Admin') {
            const allowedRoutes = rolePermissions[effectiveRole] || [];
            const isAllowed = allowedRoutes.includes('*') || allowedRoutes.some(route => currentPath.endsWith(route));

            if (!isAllowed) {
                alert('Akses Ditolak: Anda tidak memiliki izin mengakses halaman ini.');
                let fallbackUrl = 'dashboard.html';
                const roleLower = String(effectiveRole).toLowerCase();
                if (roleLower.includes('pengajar') || roleLower.includes('guru') || roleLower.includes('teacher')) {
                    fallbackUrl = 'jadwal.html';
                } else if (roleLower.includes('staff') || roleLower.includes('staf')) {
                    fallbackUrl = 'siswa.html';
                }
                window.location.href = fallbackUrl;
                return;
            }
        }
    }

    // =========================================================================
    // 6. Inactivity Tracker Runtime & Peringatan Otomatis (Idle Monitor)
    // =========================================================================
    function setupInactivityTracker() {
        let warningModal = null;
        let countdownTimer = null;
        let lastThrottleTime = 0;

        function recordUserActivity() {
            const current = Date.now();
            // Throttle write ke localStorage setiap 5 detik agar performa browser optimal
            if (current - lastThrottleTime > 5000) {
                lastThrottleTime = current;
                localStorage.setItem('lastActivityTime', current.toString());
            }
            // Jika ada modal peringatan, tutup karena ada aktivitas baru dari pengguna
            if (warningModal && !warningModal.classList.contains('hidden')) {
                dismissWarningModal();
            }
        }

        // Listener interaksi pengguna
        const userActivityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
        userActivityEvents.forEach(evt => {
            window.addEventListener(evt, recordUserActivity, { passive: true });
        });

        // Deteksi ketika tab kembali aktif (user kembali setelah meninggalkan tab / laptop sleep)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                checkInactivityState();
            }
        });
        window.addEventListener('focus', () => {
            checkInactivityState();
        });

        // Sinkronisasi antar tab: jika tab lain logout atau update aktivitas
        window.addEventListener('storage', (e) => {
            if (e.key === 'lastActivityTime' && warningModal && !warningModal.classList.contains('hidden')) {
                dismissWarningModal();
            }
            if (e.key === 'currentUser' && !e.newValue) {
                window.location.href = 'login.html';
            }
        });

        function showWarningModal(remainingSeconds) {
            if (!warningModal) {
                warningModal = document.createElement('div');
                warningModal.id = 'idle-warning-modal';
                warningModal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none';
                warningModal.innerHTML = `
                    <div class="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in duration-200">
                        <div class="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm shadow-amber-500/20">
                            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke-width="2"></circle>
                                <polyline points="12 6 12 12 16 14" stroke-width="2"></polyline>
                            </svg>
                        </div>
                        <h3 class="text-base font-extrabold text-slate-900 mb-1.5">Peringatan Tidak Aktif</h3>
                        <p class="text-xs text-slate-500 mb-5 leading-relaxed">
                            Sistem mendeteksi tidak ada aktivitas. Sesi Anda akan otomatis ditutup demi keamanan dalam:
                        </p>
                        <div class="bg-amber-50 border border-amber-200/80 rounded-2xl py-2.5 px-4 mb-6 inline-block">
                            <span id="idle-countdown-sec" class="text-2xl font-black text-amber-600 font-mono">${remainingSeconds}</span>
                            <span class="text-xs font-bold text-amber-700 ml-1">detik</span>
                        </div>
                        <div class="flex flex-col gap-2">
                            <button id="btn-extend-session" class="w-full py-2.5 bg-[#0A58CA] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all">
                                Saya Masih Bekerja (Lanjutkan Sesi)
                            </button>
                            <button id="btn-logout-now" class="w-full py-2 bg-transparent text-slate-400 hover:text-slate-600 rounded-xl text-xs font-semibold transition-all">
                                Keluar Sekarang
                            </button>
                        </div>
                    </div>
                `;
                document.body.appendChild(warningModal);

                warningModal.querySelector('#btn-extend-session').onclick = () => {
                    localStorage.setItem('lastActivityTime', Date.now().toString());
                    dismissWarningModal();
                };
                warningModal.querySelector('#btn-logout-now').onclick = () => {
                    triggerAutoLogout('Anda telah keluar dari sistem.');
                };
            }

            warningModal.classList.remove('hidden');
            const countdownEl = warningModal.querySelector('#idle-countdown-sec');
            if (countdownEl) countdownEl.innerText = remainingSeconds;

            if (countdownTimer) clearInterval(countdownTimer);
            let secLeft = remainingSeconds;
            countdownTimer = setInterval(() => {
                secLeft--;
                if (countdownEl) countdownEl.innerText = Math.max(0, secLeft);
                if (secLeft <= 0) {
                    clearInterval(countdownTimer);
                    triggerAutoLogout('Sesi Anda telah berakhir karena tidak ada aktivitas selama lebih dari 30 menit. Silakan login kembali.');
                }
            }, 1000);
        }

        function dismissWarningModal() {
            if (countdownTimer) {
                clearInterval(countdownTimer);
                countdownTimer = null;
            }
            if (warningModal) {
                warningModal.classList.add('hidden');
            }
        }

        function checkInactivityState() {
            const last = parseInt(localStorage.getItem('lastActivityTime') || '0', 10);
            if (!last) return;
            const diff = Date.now() - last;

            // Jika sudah melebihi 30 menit (misal ditinggal semalaman), langsung logout
            if (diff >= INACTIVITY_LIMIT_MS) {
                triggerAutoLogout('Sesi Anda telah berakhir karena tidak ada aktivitas selama lebih dari 30 menit. Silakan login kembali.');
                return;
            }

            const timeUntilExpire = INACTIVITY_LIMIT_MS - diff;
            // Jika tersisa <= 2 menit, tampilkan peringatan
            if (timeUntilExpire <= WARNING_BEFORE_MS) {
                const sec = Math.ceil(timeUntilExpire / 1000);
                showWarningModal(sec);
            } else {
                dismissWarningModal();
            }
        }

        // Jalankan pengecekan setiap 10 detik
        setInterval(checkInactivityState, 10000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupInactivityTracker);
    } else {
        setupInactivityTracker();
    }
})();
