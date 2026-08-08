// public/js/ui-guard.js - Dynamic UI Guard & Action Suppression KBEC Admin
(function () {
    function getRole() {
        const userRole = localStorage.getItem('userRole');
        if (userRole) return userRole;
        const rawUser = localStorage.getItem('currentUser');
        if (rawUser) {
            try {
                const user = JSON.parse(rawUser);
                return user.role || user.role_name || user.type || 'Admin';
            } catch (e) {}
        }
        return 'Admin';
    }

    function applyRoleGuards() {
        const role = getRole();
        const isAdmin = role === 'Admin';
        const isTeacher = role === 'Pengajar' || role === 'Guru';
        const currentPath = window.location.pathname.toLowerCase();

        // 1. Filter elemen dengan data-role-allow
        document.querySelectorAll('[data-role-allow]').forEach(el => {
            const allowedRoles = el.getAttribute('data-role-allow').split(',').map(r => r.trim().toLowerCase());
            const currentRoleLower = role.toLowerCase();
            const allowed = allowedRoles.includes('*') || allowedRoles.some(r => currentRoleLower.includes(r));
            if (!allowed) {
                el.style.display = 'none';
                el.classList.add('hidden');
            }
        });

        // 2. Filter elemen dengan data-role-deny
        document.querySelectorAll('[data-role-deny]').forEach(el => {
            const deniedRoles = el.getAttribute('data-role-deny').split(',').map(r => r.trim().toLowerCase());
            const currentRoleLower = role.toLowerCase();
            const denied = deniedRoles.some(r => currentRoleLower.includes(r));
            if (denied) {
                el.style.display = 'none';
                el.classList.add('hidden');
            }
        });

        // 3. Admin Suppression: Tombol Hapus/Verifikasi di pembayaran.html & Tab Kinerja di laporan.html
        if (isAdmin) {
            if (currentPath.endsWith('pembayaran.html')) {
                document.querySelectorAll('button, a, [role="button"]').forEach(btn => {
                    const txt = (btn.textContent || btn.innerText || '').trim().toLowerCase();
                    const onclickAttr = btn.getAttribute('onclick') || '';
                    if (txt.includes('verifikasi') || txt.includes('hapus') || onclickAttr.includes('delete') || onclickAttr.includes('verify') || onclickAttr.includes('verifikasi') || onclickAttr.includes('hapus')) {
                        btn.style.display = 'none';
                        btn.classList.add('hidden');
                    }
                });
            }
            if (currentPath.endsWith('laporan.html')) {
                document.querySelectorAll('button, a, [role="button"], div').forEach(el => {
                    const txt = (el.textContent || el.innerText || '').trim().toLowerCase();
                    const onclickAttr = el.getAttribute('onclick') || '';
                    if ((txt.includes('kinerja siswa') || onclickAttr.includes('kinerja')) && (el.classList.contains('tab-btn') || onclickAttr.includes('switchReportTab'))) {
                        el.style.display = 'none';
                        el.classList.add('hidden');
                    }
                });
            }
        }

        // 4. Pengajar Suppression: Sembunyikan tombol CRUD non-absensi & modal triggers
        if (isTeacher) {
            if (currentPath.endsWith('kelas.html') || currentPath.endsWith('siswa.html')) {
                document.querySelectorAll('button, a, [role="button"]').forEach(btn => {
                    const txt = (btn.textContent || btn.innerText || '').trim().toLowerCase();
                    const onclickAttr = btn.getAttribute('onclick') || '';
                    
                    const isAdd = txt.includes('tambah') || txt.includes('create') || onclickAttr.includes('openModal') || onclickAttr.includes('tambah');
                    const isEdit = txt.includes('edit') || txt.includes('ubah') || onclickAttr.includes('edit');
                    const isDelete = txt.includes('hapus') || txt.includes('delete') || onclickAttr.includes('delete');
                    
                    const isNavOrToggle = onclickAttr.includes('toggle') || onclickAttr.includes('switchTab') || onclickAttr.includes('filter');

                    if ((isAdd || isEdit || isDelete) && !isNavOrToggle) {
                        btn.style.display = 'none';
                        btn.classList.add('hidden');
                    }
                });
            }
        }
    }

    window.applyRoleGuards = applyRoleGuards;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyRoleGuards);
    } else {
        applyRoleGuards();
    }

    let isObserving = false;
    document.addEventListener('DOMContentLoaded', () => {
        if (!isObserving && document.body) {
            isObserving = true;
            const observer = new MutationObserver(() => {
                applyRoleGuards();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    });
})();
