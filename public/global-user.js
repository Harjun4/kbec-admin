// global-user.js - Integrasi User Session, Dynamic Responsive Tree Submenu Sidebar, Auth Guard & Global Search KBEC Admin

// Intercept Global Fetch untuk melampirkan Token Autentikasi secara otomatis
(function() {
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        options.headers = options.headers || {};
        const token = localStorage.getItem('authToken');
        if (token) {
            if (typeof options.headers.set === 'function') {
                options.headers.set('Authorization', `Bearer ${token}`);
            } else if (Array.isArray(options.headers)) {
                options.headers.push(['Authorization', `Bearer ${token}`]);
            } else {
                options.headers['Authorization'] = `Bearer ${token}`;
            }
        }
        return originalFetch.call(this, url, options);
    };
})();

// Global Helper Toggle Submenu (Accordion)
window.toggleMenu = function(menuId) {
    const menu = document.getElementById(menuId);
    const arrow = document.getElementById('arrow-' + menuId);
    if (menu) {
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
            menu.classList.remove('hidden');
            if (arrow) arrow.classList.add('rotate-180');
        } else {
            menu.classList.add('hidden');
            if (arrow) arrow.classList.remove('rotate-180');
        }
    }
};

// Global Responsive Sidebar Mobile Drawer Toggle Helper
window.toggleSidebar = function(show) {
    let sidebar = document.querySelector('aside');
    let backdrop = document.getElementById('sidebar-backdrop');
    
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'sidebar-backdrop';
        backdrop.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 hidden transition-opacity duration-300';
        backdrop.onclick = () => window.toggleSidebar(false);
        document.body.appendChild(backdrop);
    }
    
    if (!sidebar) return;
    
    const isHidden = sidebar.style.transform === 'translateX(-100%)' || sidebar.classList.contains('-translate-x-full') || !sidebar.classList.contains('open');
    const shouldOpen = show !== undefined ? show : isHidden;
    
    if (shouldOpen) {
        sidebar.style.transform = 'translateX(0)';
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('open', 'show', 'translate-x-0');
        backdrop.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    } else {
        sidebar.style.transform = 'translateX(-100%)';
        sidebar.classList.remove('open', 'show', 'translate-x-0');
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.add('hidden');
        document.body.style.overflow = '';
    }
};

// Global Helper Logout System
window.handleLogout = function() {
    if (confirm('Apakah Anda yakin ingin keluar dari sistem?')) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('authToken');
        window.location.href = 'login.html';
    }
};

// Render Sidebar Terpadu dengan Tree Submenu & Otorisasi Role
function renderDynamicGlobalSidebar() {
    let sidebar = document.querySelector('aside');
    if (!sidebar) {
        sidebar = document.createElement('aside');
        document.body.prepend(sidebar);
    }
    // Bersihkan style inline dan gunakan kelas CSS terstruktur
    sidebar.style.cssText = '';
    sidebar.className = 'w-64 bg-white border-r border-slate-100 flex flex-col justify-between fixed h-full z-40 shadow-[4px_0_24px_rgba(0,0,0,0.03)] transition-transform duration-300 kbec-sidebar';

    // Helper Formatting Text Role untuk Header & Components
    function getFormattedRoleText(roleKey) {
        if (!roleKey) return 'ADMIN';
        const key = String(roleKey).toLowerCase().trim();
        if (key.includes('super')) return 'SUPER ADMINISTRATOR';
        if (key.includes('pengajar') || key.includes('guru') || key.includes('teacher')) return 'PENGAJAR';
        return 'ADMIN'; // Default fallback jika role biasa / 'admin'
    }
    window.getFormattedRoleText = getFormattedRoleText;

    // Helper Global Auth Check & Current User Session
    const rawUser = localStorage.getItem('currentUser');
    const user = JSON.parse(rawUser || '{"name":"Super Admin KBEC","email":"admin@kbec.com","role":"Super Admin"}');
    const userRole = (user.role || user.role_name || user.type || 'Admin').toLowerCase();
    const isSuperAdmin = userRole.includes('super');
    const isTeacher = userRole.includes('pengajar') || userRole.includes('teacher') || userRole.includes('guru');

    const currentPath = window.location.pathname.split('/').pop().toLowerCase() || 'dashboard.html';
    const fullSearch = window.location.search || '';
    const fullSearchLower = fullSearch.toLowerCase();
    const fullHash = window.location.hash.toLowerCase();

    // Tentukan Submenu mana yang harus terbuka secara otomatis
    let openSiswa = currentPath === 'siswa.html';
    let openAkademik = ['pengajar.html', 'kelas.html', 'absensi.html', 'jadwal.html'].includes(currentPath);
    let openKeuangan = ['pembayaran.html'].includes(currentPath);
    let openInventaris = currentPath === 'inventaris.html' || fullHash.includes('inventaris');
    let openLaporan = currentPath === 'laporan.html';
    let openUnitProgram = currentPath === 'program.html';
    let openUsers = currentPath === 'profile.html' && (fullHash.includes('users') || fullHash.includes('roles') || fullHash.includes('reset'));
    let openSettings = (currentPath === 'profile.html' && fullHash.includes('backup'));

    const isKbecActive = currentPath === 'program.html' && (fullHash.includes('kbec') || (!fullHash || fullHash === '#all' || fullHash === '#'));
    const isBimbelActive = currentPath === 'program.html' && fullHash.includes('bimbel');
    const isCalistungActive = currentPath === 'program.html' && fullHash.includes('calistung');
    const isTkActive = currentPath === 'program.html' && fullHash.includes('tk');
    const isArabinActive = currentPath === 'program.html' && fullHash.includes('arabin');

    const isPinActive = currentPath === 'inventaris.html' && (fullHash.includes('pin') || fullSearchLower.includes('pin') || (!fullHash && !fullSearch));
    const isModulActive = currentPath === 'inventaris.html' && (fullHash.includes('modul') || fullSearchLower.includes('modul'));
    const isKaosActive = currentPath === 'inventaris.html' && (fullHash.includes('kaos') || fullSearchLower.includes('kaos') || fullHash.includes('seragam'));
    const isVocabActive = currentPath === 'inventaris.html' && (fullHash.includes('vocab') || fullSearchLower.includes('vocab'));

    // Submenu Items Active State Detection
    const isSemuaSiswaActive = currentPath === 'siswa.html' && !fullSearch;
    const isKbecSiswaActive = currentPath === 'siswa.html' && fullSearchLower.includes('kbec');
    const isTkSiswaActive = currentPath === 'siswa.html' && fullSearchLower.includes('tk');
    const isBimbelSiswaActive = currentPath === 'siswa.html' && fullSearchLower.includes('bimbel');
    const isCalistungSiswaActive = currentPath === 'siswa.html' && fullSearchLower.includes('calistung');
    const isArabinSiswaActive = currentPath === 'siswa.html' && fullSearchLower.includes('arabin');

    const isPengajarActive = currentPath === 'pengajar.html';
    const isKelasActive = currentPath === 'kelas.html';
    const isAbsensiActive = currentPath === 'absensi.html';

    const isTagihanActive = currentPath === 'pembayaran.html' && (!fullHash || fullHash.includes('bills'));
    const isPembayaranActive = currentPath === 'pembayaran.html' && fullHash.includes('payments');
    const isSetoranActive = currentPath === 'pembayaran.html' && (fullHash.includes('deposits') || fullHash.includes('setoran'));
    const isKasKecilActive = currentPath === 'pembayaran.html' && (fullHash.includes('petty') || fullHash.includes('kas'));

    // Laporan Active States (Strict Guard: Only evaluated on laporan.html)
    let isLaporanPembayaranActive = false;
    let isLaporanSetoranActive = false;
    let isLaporanKasActive = false;
    let isLaporanKehadiranActive = false;
    let isLaporanKasKecilActive = false;
    let isLaporanKinerjaActive = false;

    if (currentPath === 'laporan.html') {
        const rawSearch = (window.location.search || '').split('#')[0];
        const searchParams = new URLSearchParams(rawSearch);
        const rawType = (searchParams.get('type') || '').toLowerCase().trim();
        const rawHash = (window.location.hash || '').replace('#', '').split('?')[0].toLowerCase().trim();

        const cleanReportType = (rawType || rawHash || 'pembayaran').replace(/[^a-z0-9_]/g, '');

        isLaporanPembayaranActive = cleanReportType === 'pembayaran' || (!rawType && !rawHash);
        isLaporanSetoranActive = cleanReportType === 'setoran';
        isLaporanKasActive = cleanReportType === 'kas' || cleanReportType === 'kas_besar' || cleanReportType === 'kasbesar';
        isLaporanKehadiranActive = cleanReportType === 'kehadiran';
        isLaporanKasKecilActive = cleanReportType === 'kas_kecil' || cleanReportType === 'kaskecil' || cleanReportType === 'petty';
        isLaporanKinerjaActive = cleanReportType === 'kinerja';
    }

    // Helper Styling Classes
    const getSubmenuItemClass = (isActive, activeBg = 'bg-[#0A58CA] text-white font-bold shadow-sm shadow-blue-500/20') => 
        `block py-1.5 px-3 rounded-lg text-xs transition-all ${isActive ? activeBg : 'text-slate-600 hover:text-[#0A58CA] hover:bg-blue-50/60 font-medium'}`;

    const sidebarHTML = `
        <div>
            <!-- Header Brand Sidebar -->
            <div class="p-5 flex items-center justify-between border-b border-slate-100/60">
                <div class="flex items-center gap-3">
                    <div class="bg-[#0A58CA] text-white p-2.5 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20">
                        <i data-lucide="${isTeacher ? 'award' : 'shield-check'}" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <h1 class="font-extrabold text-slate-900 text-sm leading-tight">KBEC System</h1>
                        <span class="text-[9px] font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md uppercase tracking-wider">${userRole}</span>
                    </div>
                </div>
                <button onclick="window.toggleSidebar(false)" class="lg:hidden text-slate-400 hover:text-slate-600">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <!-- Navigasi Tree Menu -->
            <nav class="px-3 py-3 space-y-1.5 overflow-y-auto max-h-[calc(100vh-140px)]">
                
                <!-- 🏠 Dashboard -->
                <a href="dashboard.html"
                    class="relative w-full flex items-center gap-3 px-3.5 py-2.5 text-xs font-bold rounded-xl ${currentPath === 'dashboard.html' ? 'bg-[#0A58CA]/10 text-[#0A58CA] shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'} transition-all">
                    ${currentPath === 'dashboard.html' ? '<span class="absolute left-0 top-2 bottom-2 w-1 bg-[#0A58CA] rounded-r-md"></span>' : ''}
                    <i data-lucide="layout-dashboard" class="w-4 h-4 ${currentPath === 'dashboard.html' ? 'text-[#0A58CA]' : 'text-slate-500'}"></i> 
                    <span>Dashboard</span>
                </a>

                <!-- 👨🎓 Data Siswa -->
                <div>
                    <button onclick="window.toggleMenu('menu-siswa')"
                        class="w-full flex items-center justify-between px-3.5 py-2.5 text-xs ${openSiswa ? 'bg-blue-50/80 text-[#0A58CA] font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 font-semibold'} rounded-xl transition-all">
                        <div class="flex items-center gap-3">
                            <i data-lucide="users" class="w-4 h-4 ${openSiswa ? 'text-[#0A58CA]' : 'text-slate-500'}"></i>
                            <span>Data Siswa</span>
                        </div>
                        <i data-lucide="chevron-down" id="arrow-menu-siswa" class="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${openSiswa ? 'rotate-180 text-[#0A58CA]' : ''}"></i>
                    </button>
                    <div id="menu-siswa" class="${openSiswa ? '' : 'hidden'} pl-8 pr-2 py-1 space-y-1 text-xs">
                        <a href="siswa.html" class="${getSubmenuItemClass(isSemuaSiswaActive)}">Semua Siswa</a>
                        <a href="siswa.html?program=KBEC" class="${getSubmenuItemClass(isKbecSiswaActive)}">Data KBEC</a>
                        <a href="siswa.html?program=TK" class="${getSubmenuItemClass(isTkSiswaActive)}">Data TK</a>
                        <a href="siswa.html?program=Bimbel" class="${getSubmenuItemClass(isBimbelSiswaActive)}">Data Bimbel</a>
                        <a href="siswa.html?program=Calistung" class="${getSubmenuItemClass(isCalistungSiswaActive)}">Data Calistung</a>
                        <a href="siswa.html?program=Arabin" class="${getSubmenuItemClass(isArabinSiswaActive, 'bg-amber-600 text-white font-bold shadow-sm shadow-amber-500/20')} flex items-center justify-between">
                            <span>Data Arabin</span>
                            <span class="text-[9px] font-bold px-1 rounded ${isArabinSiswaActive ? 'bg-white text-amber-800' : 'bg-amber-100 text-amber-800'}">Beasiswa</span>
                        </a>
                    </div>
                </div>

                <!-- 📚 Akademik -->
                <div>
                    <button onclick="window.toggleMenu('menu-akademik')"
                        class="w-full flex items-center justify-between px-3.5 py-2.5 text-xs ${openAkademik ? 'bg-blue-50/80 text-[#0A58CA] font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 font-semibold'} rounded-xl transition-all">
                        <div class="flex items-center gap-3">
                            <i data-lucide="book-open" class="w-4 h-4 ${openAkademik ? 'text-[#0A58CA]' : 'text-slate-500'}"></i>
                            <span>Akademik</span>
                        </div>
                        <i data-lucide="chevron-down" id="arrow-menu-akademik" class="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${openAkademik ? 'rotate-180 text-[#0A58CA]' : ''}"></i>
                    </button>
                    <div id="menu-akademik" class="${openAkademik ? '' : 'hidden'} pl-8 pr-2 py-1 space-y-1 text-xs">
                        <a href="pengajar.html" class="${getSubmenuItemClass(isPengajarActive)}">Guru / Pengajar</a>
                        <a href="kelas.html" class="${getSubmenuItemClass(isKelasActive)}">Kelas & Jadwal</a>
                        <a href="absensi.html?mode=excel" class="${getSubmenuItemClass(isAbsensiActive)}">Kinerja Siswa</a>
                    </div>
                </div>

                <!-- 💰 Keuangan -->
                ${!isTeacher ? `
                <div>
                    <button onclick="window.toggleMenu('menu-keuangan')"
                        class="w-full flex items-center justify-between px-3.5 py-2.5 text-xs ${openKeuangan ? 'bg-blue-50/80 text-[#0A58CA] font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 font-semibold'} rounded-xl transition-all">
                        <div class="flex items-center gap-3">
                            <i data-lucide="credit-card" class="w-4 h-4 ${openKeuangan ? 'text-[#0A58CA]' : 'text-slate-500'}"></i>
                            <span>Keuangan</span>
                        </div>
                        <i data-lucide="chevron-down" id="arrow-menu-keuangan" class="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${openKeuangan ? 'rotate-180 text-[#0A58CA]' : ''}"></i>
                    </button>
                    <div id="menu-keuangan" class="${openKeuangan ? '' : 'hidden'} pl-8 pr-2 py-1 space-y-1 text-xs">
                        <a href="pembayaran.html#bills" onclick="if(typeof window.switchTab === 'function') window.switchTab('bills');" class="${getSubmenuItemClass(isTagihanActive)}">Tagihan SPP</a>
                        <a href="pembayaran.html#payments" onclick="if(typeof window.switchTab === 'function') window.switchTab('payments');" class="${getSubmenuItemClass(isPembayaranActive)}">Pembayaran & Kuitansi</a>
                        <a href="pembayaran.html#deposits" onclick="if(typeof window.switchTab === 'function') window.switchTab('deposits');" class="${getSubmenuItemClass(isSetoranActive)}">Setoran Kasir</a>
                        <a href="pembayaran.html#petty" onclick="if(typeof window.switchTab === 'function') window.switchTab('petty');" class="${getSubmenuItemClass(isKasKecilActive)}">Kas Kecil</a>
                    </div>
                </div>
                ` : ''}

                <!-- 🏫 Pengelolaan Unit & Program -->
                ${!isTeacher ? `
                <div>
                    <button onclick="window.toggleMenu('menu-pendaftaran')"
                        class="w-full flex items-center justify-between px-3.5 py-2.5 text-xs ${openUnitProgram ? 'bg-blue-50/80 text-[#0A58CA] font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 font-semibold'} rounded-xl transition-all">
                        <div class="flex items-center gap-3">
                            <i data-lucide="layers" class="w-4 h-4 ${openUnitProgram ? 'text-[#0A58CA]' : 'text-slate-500'}"></i>
                            <span>Pengelolaan Unit & Program</span>
                        </div>
                        <i data-lucide="chevron-down" id="arrow-menu-pendaftaran" class="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${openUnitProgram ? 'rotate-180 text-[#0A58CA]' : ''}"></i>
                    </button>
                    <div id="menu-pendaftaran" class="${openUnitProgram ? '' : 'hidden'} pl-8 pr-2 py-1 space-y-1 text-xs">
                        <a href="program.html#kbec" onclick="if(typeof window.switchUnitTab==='function') window.switchUnitTab('KBEC');" class="${getSubmenuItemClass(isKbecActive)}">Unit KBEC</a>
                        <a href="program.html#bimbel" onclick="if(typeof window.switchUnitTab==='function') window.switchUnitTab('Bimbel');" class="${getSubmenuItemClass(isBimbelActive)}">Unit Bimbel</a>
                        <a href="program.html#calistung" onclick="if(typeof window.switchUnitTab==='function') window.switchUnitTab('Calistung');" class="${getSubmenuItemClass(isCalistungActive)}">Unit Calistung</a>
                        <a href="program.html#tk" onclick="if(typeof window.switchUnitTab==='function') window.switchUnitTab('TK');" class="${getSubmenuItemClass(isTkActive)}">Unit TK</a>
                        <a href="program.html#arabin" onclick="if(typeof window.switchUnitTab==='function') window.switchUnitTab('Arabin');" class="${getSubmenuItemClass(isArabinActive, 'bg-amber-600 text-white font-bold shadow-sm shadow-amber-500/20')}">Unit Arabin (Beasiswa)</a>
                    </div>
                </div>
                ` : ''}

                <!-- 📦 Inventaris -->
                ${!isTeacher ? `
                <div>
                    <button onclick="window.toggleMenu('menu-inventaris')"
                        class="w-full flex items-center justify-between px-3.5 py-2.5 text-xs ${openInventaris ? 'bg-blue-50/80 text-[#0A58CA] font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 font-semibold'} rounded-xl transition-all">
                        <div class="flex items-center gap-3">
                            <i data-lucide="package" class="w-4 h-4 ${openInventaris ? 'text-[#0A58CA]' : 'text-slate-500'}"></i>
                            <span>Inventaris</span>
                        </div>
                        <i data-lucide="chevron-down" id="arrow-menu-inventaris" class="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${openInventaris ? 'rotate-180 text-[#0A58CA]' : ''}"></i>
                    </button>
                    <div id="menu-inventaris" class="${openInventaris ? '' : 'hidden'} pl-8 pr-2 py-1 space-y-1 text-xs">
                        <a href="inventaris.html#pin" onclick="if(typeof window.filterByCat==='function') window.filterByCat('PIN KBEC');" class="${getSubmenuItemClass(isPinActive)}">PIN KBEC</a>
                        <a href="inventaris.html#modul" onclick="if(typeof window.filterByCat==='function') window.filterByCat('Modul Cetak');" class="${getSubmenuItemClass(isModulActive)}">Modul Cetak</a>
                        <a href="inventaris.html#kaos" onclick="if(typeof window.filterByCat==='function') window.filterByCat('Kaos & Seragam');" class="${getSubmenuItemClass(isKaosActive)}">Kaos & Seragam</a>
                        <a href="inventaris.html#vocab" onclick="if(typeof window.filterByCat==='function') window.filterByCat('Vocabulary Book');" class="${getSubmenuItemClass(isVocabActive)}">Vocabulary Book</a>
                    </div>
                </div>
                ` : ''}

                <!-- 📊 Laporan -->
                <div>
                    <button onclick="window.toggleMenu('menu-laporan')"
                        class="w-full flex items-center justify-between px-3.5 py-2.5 text-xs ${openLaporan ? 'bg-blue-50/80 text-[#0A58CA] font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50 font-semibold'} rounded-xl transition-all">
                        <div class="flex items-center gap-3">
                            <i data-lucide="file-bar-chart" class="w-4 h-4 ${openLaporan ? 'text-[#0A58CA]' : 'text-slate-500'}"></i>
                            <span>Laporan</span>
                        </div>
                        <i data-lucide="chevron-down" id="arrow-menu-laporan" class="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${openLaporan ? 'rotate-180 text-[#0A58CA]' : ''}"></i>
                    </button>
                    <div id="menu-laporan" class="${openLaporan ? '' : 'hidden'} pl-8 pr-2 py-1 space-y-1 text-xs">
                        <a href="laporan.html?type=pembayaran#pembayaran" onclick="if(typeof window.switchReportTab==='function') { window.switchReportTab('pembayaran'); return false; }" class="${getSubmenuItemClass(isLaporanPembayaranActive)}">Laporan Pembayaran</a>
                        <a href="laporan.html?type=setoran#setoran" onclick="if(typeof window.switchReportTab==='function') { window.switchReportTab('setoran'); return false; }" class="${getSubmenuItemClass(isLaporanSetoranActive)}">Laporan Setoran</a>
                        <a href="laporan.html?type=kas#kas" onclick="if(typeof window.switchReportTab==='function') { window.switchReportTab('kas'); return false; }" class="${getSubmenuItemClass(isLaporanKasActive)}">Laporan Kas Besar</a>
                        <a href="laporan.html?type=kehadiran#kehadiran" onclick="if(typeof window.switchReportTab==='function') { window.switchReportTab('kehadiran'); return false; }" class="${getSubmenuItemClass(isLaporanKehadiranActive)}">Laporan Kehadiran</a>
                        <a href="laporan.html?type=kas_kecil#kas_kecil" onclick="if(typeof window.switchReportTab==='function') { window.switchReportTab('kas_kecil'); return false; }" class="${getSubmenuItemClass(isLaporanKasKecilActive)}">Laporan Kas Kecil</a>
                        <a href="laporan.html?type=kinerja#kinerja" onclick="if(typeof window.switchReportTab==='function') { window.switchReportTab('kinerja'); return false; }" class="${getSubmenuItemClass(isLaporanKinerjaActive)}">Laporan Kinerja Siswa</a>
                    </div>
                </div>

                <!-- 👤 Manajemen User (Super Admin Only) -->
                ${isSuperAdmin ? `
                <a href="profile.html"
                    class="relative w-full flex items-center gap-3 px-3.5 py-2.5 text-xs font-bold rounded-xl ${currentPath === 'profile.html' ? 'bg-[#0A58CA]/10 text-[#0A58CA] shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'} transition-all">
                    ${currentPath === 'profile.html' ? '<span class="absolute left-0 top-2 bottom-2 w-1 bg-[#0A58CA] rounded-r-md"></span>' : ''}
                    <i data-lucide="user-check" class="w-4 h-4 ${currentPath === 'profile.html' ? 'text-[#0A58CA]' : 'text-slate-500'}"></i>
                    <span>Manajemen User</span>
                </a>
                ` : ''}
            </nav>
        </div>

        <div class="p-4 border-t border-slate-100">
            <a href="#" onclick="window.handleLogout(); return false;"
                class="flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                <i data-lucide="log-out" class="w-4 h-4 text-rose-500"></i> <span>Keluar System</span>
            </a>
        </div>
    `;

    sidebar.innerHTML = sidebarHTML;

    // Explicit binding tombol close sidebar mobile
    const closeBtn = sidebar.querySelector('#mobile-sidebar-close');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.preventDefault();
            window.toggleSidebar(false);
        };
    }

    // Re-initialize Lucide Icons untuk elemen sidebar yang baru dibuat
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    // Auto-close sidebar jika link di-klik pada layar mobile (<1024px)
    const links = sidebar.querySelectorAll('a');
    links.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 1024) {
                window.toggleSidebar(false);
            }
        });
    });

    // Responsif: Sembunyikan di mobile, tampilkan di desktop
    function applyResponsiveSidebar() {
        if (window.innerWidth >= 1024) {
            sidebar.style.transform = 'translateX(0)';
        } else {
            sidebar.style.transform = 'translateX(-100%)';
        }
    }
    applyResponsiveSidebar();
    window.addEventListener('resize', applyResponsiveSidebar);
}

(function() {
    // 0. Auth Guard: Jalankan SEGERA sebelum DOM selesai dirender
    const currentPath = window.location.pathname.toLowerCase();
    const isAuthPage = currentPath.endsWith('login.html') || currentPath.endsWith('register.html');
    const rawUser = localStorage.getItem('currentUser');
    const authToken = localStorage.getItem('authToken');

    if (!rawUser && !isAuthPage) {
        window.location.href = 'login.html';
        return;
    }

    if (rawUser && isAuthPage) {
        window.location.href = 'dashboard.html';
        return;
    }

    if (rawUser && !isAuthPage && window.location.protocol !== 'file:') {
        const API_BASE = window.location.origin;
        fetch(`${API_BASE}/api/auth/validate`)
            .then(res => {
                if (!res.ok) throw new Error('Invalid token');
                return res.json();
            })
            .then(data => {
                if (data && data.valid === false) {
                    localStorage.removeItem('currentUser');
                    localStorage.removeItem('authToken');
                    window.location.href = 'login.html';
                }
            })
            .catch(() => {
                localStorage.removeItem('currentUser');
                localStorage.removeItem('authToken');
                window.location.href = 'login.html';
            });
    }

    window.renderDynamicGlobalSidebar = renderDynamicGlobalSidebar;
    window.addEventListener('hashchange', renderDynamicGlobalSidebar);
    window.addEventListener('popstate', renderDynamicGlobalSidebar);

    // Intercept Tab Switchers untuk Menyinkronkan Hash & Highlight Sidebar
    (function setupTabSyncInterceptors() {
        function syncSidebarOnTab(tabName) {
            if (tabName && typeof tabName === 'string') {
                const pagePath = window.location.pathname.split('/').pop().toLowerCase() || 'dashboard.html';
                const cleanTab = tabName.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
                
                if (pagePath === 'laporan.html') {
                    const targetUrl = `laporan.html?type=${cleanTab}#${cleanTab}`;
                    if (window.location.hash.toLowerCase() !== `#${cleanTab}` || !window.location.search.includes(cleanTab)) {
                        try {
                            history.replaceState(null, '', targetUrl);
                        } catch (e) {
                            window.location.hash = cleanTab;
                        }
                    }
                } else if (window.location.hash.toLowerCase() !== `#${cleanTab}`) {
                    try {
                        history.replaceState(null, '', `#${cleanTab}`);
                    } catch (e) {
                        window.location.hash = cleanTab;
                    }
                }
            }
            setTimeout(() => {
                if (typeof window.renderDynamicGlobalSidebar === 'function') {
                    window.renderDynamicGlobalSidebar();
                }
            }, 20);
        }

        // Intercept switchTab jika didefinisikan oleh halaman (misal pembayaran.html)
        let _originalSwitchTab = window.switchTab;
        Object.defineProperty(window, 'switchTab', {
            get() {
                return _originalSwitchTab;
            },
            set(fn) {
                _originalSwitchTab = function(...args) {
                    const res = fn.apply(this, args);
                    syncSidebarOnTab(args[0]);
                    return res;
                };
            },
            configurable: true
        });

        // Intercept switchUnitTab jika didefinisikan oleh halaman (misal program.html)
        let _originalSwitchUnitTab = window.switchUnitTab;
        Object.defineProperty(window, 'switchUnitTab', {
            get() {
                return _originalSwitchUnitTab;
            },
            set(fn) {
                _originalSwitchUnitTab = function(...args) {
                    const res = fn.apply(this, args);
                    syncSidebarOnTab(args[0]);
                    return res;
                };
            },
            configurable: true
        });

        // Intercept filterByCat jika didefinisikan oleh halaman (misal inventaris.html)
        let _originalFilterByCat = window.filterByCat;
        Object.defineProperty(window, 'filterByCat', {
            get() {
                return _originalFilterByCat;
            },
            set(fn) {
                _originalFilterByCat = function(...args) {
                    const res = fn.apply(this, args);
                    syncSidebarOnTab(args[0]);
                    return res;
                };
            },
            configurable: true
        });

        // Intercept switchReportTab jika didefinisikan oleh halaman (misal laporan.html)
        let _originalSwitchReportTab = window.switchReportTab;
        Object.defineProperty(window, 'switchReportTab', {
            get() {
                return _originalSwitchReportTab;
            },
            set(fn) {
                _originalSwitchReportTab = function(...args) {
                    const res = fn.apply(this, args);
                    syncSidebarOnTab(args[0]);
                    return res;
                };
            },
            configurable: true
        });

        // Listener klik tombol tab di DOM
        document.addEventListener('click', (e) => {
            const target = e.target.closest('button[onclick*="switchTab"], button[onclick*="switchUnitTab"], button[onclick*="filterByCat"], button[onclick*="switchReportTab"], button[id^="tab-"], a[href*="#"]');
            if (target) {
                const match = target.getAttribute('onclick') || '';
                const m = match.match(/['"]([^'"]+)['"]/);
                if (m && m[1]) {
                    syncSidebarOnTab(m[1]);
                } else {
                    setTimeout(() => {
                        if (typeof window.renderDynamicGlobalSidebar === 'function') {
                            window.renderDynamicGlobalSidebar();
                        }
                    }, 50);
                }
            }
        }, true);
    })();

    document.addEventListener("DOMContentLoaded", () => {
        // 1. Render Sidebar Terpadu secara Otomatis di Semua Halaman
        renderDynamicGlobalSidebar();

        // 2. Setup Backdrop mobile overlay
        if (!document.getElementById('sidebar-backdrop')) {
            const backdrop = document.createElement('div');
            backdrop.id = 'sidebar-backdrop';
            backdrop.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 hidden lg:hidden transition-opacity duration-300';
            backdrop.onclick = () => window.toggleSidebar(false);
            document.body.appendChild(backdrop);
        }

        // 3. Tautkan tombol Hamburger Tunggal di Header untuk Layar Mobile
        const header = document.querySelector('header');
        if (header) {
            // Hapus tombol hamburger duplikat yang mungkin sudah ada di HTML bawaan
            const preExistingBtns = header.querySelectorAll('button[onclick*="toggleSidebar"]');
            preExistingBtns.forEach((btn, idx) => {
                if (idx > 0 || !btn.classList.contains('mobile-menu-btn')) {
                    btn.remove();
                }
            });

            if (!header.querySelector('.mobile-menu-btn')) {
                const firstChild = header.firstElementChild;
                const menuBtn = document.createElement('button');
                menuBtn.type = 'button';
                menuBtn.id = 'mobile-menu-btn';
                menuBtn.className = 'mobile-menu-btn lg:hidden p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 focus:outline-none transition-colors mr-3 flex items-center justify-center';
                menuBtn.setAttribute('aria-label', 'Buka Menu Navigasi');
                menuBtn.onclick = (e) => {
                    e.preventDefault();
                    window.toggleSidebar(true);
                };
                menuBtn.innerHTML = `<i data-lucide="menu" class="w-5 h-5"></i>`;
                
                if (firstChild) {
                    if (firstChild.classList.contains('flex') && firstChild.querySelector('div.text-xs')) {
                        firstChild.prepend(menuBtn);
                    } else {
                        const leftContainer = document.createElement('div');
                        leftContainer.className = 'flex items-center flex-1 max-w-full mr-2 sm:mr-4';
                        header.insertBefore(leftContainer, firstChild);
                        leftContainer.appendChild(menuBtn);
                        leftContainer.appendChild(firstChild);
                    }
                } else {
                    header.appendChild(menuBtn);
                }
                
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }
        }

        // 4. Update Profil, Role & Avatar User di Header (Strict Isolation Guard)
        const currentUser = JSON.parse(rawUser || '{"name":"Super Admin KBEC","email":"admin@kbec.com","role":"Super Admin"}');
        const userRoleKey = currentUser.role || currentUser.role_name || currentUser.user_role || currentUser.type || '';
        const formattedRole = getFormattedRoleText(userRoleKey);

        const headerEl = document.querySelector('header');
        if (headerEl) {
            const headerParagraphs = headerEl.querySelectorAll('p, div.text-xs, p.text-xs');
            headerParagraphs.forEach(p => {
                const txt = p.textContent.trim().toUpperCase();
                if (txt.includes('SUPER ADMINISTRATOR') || txt.includes('ADMINISTRATOR') || txt.includes('ADMIN') || txt.includes('PENGAJAR') || txt.includes('GURU')) {
                    // Update Role Text khusus di Header Profile
                    p.innerText = formattedRole;

                    const parent = p.parentElement;
                    if (parent) {
                        const nameEl = parent.querySelector('h4');
                        if (nameEl && currentUser.name) nameEl.innerText = currentUser.name;
                    }
                    
                    const container = p.closest('div');
                    if (container) {
                        const grandparent = container.parentElement;
                        if (grandparent) {
                            const avatarEl = grandparent.querySelector('div.w-9.h-9');
                            if (avatarEl && currentUser.name) {
                                avatarEl.innerText = currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                            }
                        }
                    }
                }
            });
        }

        // 5. Setup Global Header Search Interaktif
        setupGlobalHeaderSearch();
    });
})();

// Logic Global Search Modal & Keyboard Shortcut (CTRL+K)
function setupGlobalHeaderSearch() {
    const searchInputs = document.querySelectorAll('header input[type="text"]');
    if (searchInputs.length === 0) return;

    let searchResultModal = document.getElementById('global-search-modal');
    if (!searchResultModal) {
        searchResultModal = document.createElement('div');
        searchResultModal.id = 'global-search-modal';
        searchResultModal.className = 'fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-start justify-center pt-20 hidden p-4';
        searchResultModal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden flex flex-col max-h-[80vh] animate-slide-in">
                <div class="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div class="flex items-center gap-2 flex-1 mr-2">
                        <i data-lucide="search" class="w-4 h-4 text-blue-600"></i>
                        <input type="text" id="global-modal-input" placeholder="Cari siswa, pengajar, kelas, invoice..." 
                               class="w-full text-xs font-semibold bg-transparent border-none outline-none text-slate-800">
                    </div>
                    <button onclick="closeGlobalSearchModal()" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                </div>
                <div id="global-search-results" class="p-4 overflow-y-auto space-y-4 text-xs">
                    <p class="text-center text-slate-400 py-6">Ketik minimal 2 karakter untuk mencari data...</p>
                </div>
            </div>
        `;
        document.body.appendChild(searchResultModal);
    }

    const modalInput = document.getElementById('global-modal-input');

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openGlobalSearchModal();
        }
        if (e.key === 'Escape') {
            closeGlobalSearchModal();
        }
    });

    searchInputs.forEach(input => {
        input.addEventListener('focus', () => openGlobalSearchModal(input.value));
        input.addEventListener('click', () => openGlobalSearchModal(input.value));
    });

    if (modalInput) {
        let debounceTimer = null;
        modalInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => performGlobalSearch(modalInput.value), 300);
        });
    }
}

function openGlobalSearchModal(initialQuery = '') {
    const modal = document.getElementById('global-search-modal');
    const modalInput = document.getElementById('global-modal-input');
    if (!modal) return;

    modal.classList.remove('hidden');
    if (modalInput) {
        modalInput.value = initialQuery;
        modalInput.focus();
        if (initialQuery.trim().length >= 2) {
            performGlobalSearch(initialQuery);
        }
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function closeGlobalSearchModal() {
    const modal = document.getElementById('global-search-modal');
    if (modal) modal.classList.add('hidden');
}

function escapeHTML(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

async function performGlobalSearch(query) {
    const modalResults = document.getElementById('global-search-results');
    if (!modalResults) return;

    const q = query.trim();
    if (q.length < 2) {
        modalResults.innerHTML = '<p class="text-center text-slate-400 py-6">Ketik minimal 2 karakter untuk mencari...</p>';
        return;
    }

    modalResults.innerHTML = '<p class="text-center text-blue-600 py-6 font-semibold">Mencari data...</p>';

    const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin;

    try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();

        let html = '';
        let totalFound = 0;

        if (data.students && data.students.length > 0) {
            totalFound += data.students.length;
            html += `<div class="space-y-1.5"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data Siswa (${data.students.length})</p>`;
            data.students.forEach(s => {
                html += `
                    <div onclick="window.location.href='siswa.html'; closeGlobalSearchModal();" 
                         class="p-2.5 bg-slate-50 hover:bg-blue-50 rounded-xl cursor-pointer flex items-center justify-between transition-colors">
                        <div>
                            <p class="font-bold text-slate-900">${escapeHTML(s.nama)}</p>
                            <p class="text-[10px] text-slate-400">${escapeHTML(s.id)} • ${escapeHTML(s.program || 'Tanpa program')}</p>
                        </div>
                        <span class="text-[10px] font-bold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded-full">${escapeHTML(s.status || 'Aktif')}</span>
                    </div>
                `;
            });
            html += `</div>`;
        }

        if (data.teachers && data.teachers.length > 0) {
            totalFound += data.teachers.length;
            html += `<div class="space-y-1.5"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data Pengajar (${data.teachers.length})</p>`;
            data.teachers.forEach(t => {
                html += `
                    <div onclick="window.location.href='pengajar.html'; closeGlobalSearchModal();" 
                         class="p-2.5 bg-slate-50 hover:bg-[#0A58CA]/5 rounded-xl cursor-pointer flex items-center justify-between transition-colors">
                        <div>
                            <p class="font-bold text-slate-900">${escapeHTML(t.nama)}</p>
                            <p class="text-[10px] text-slate-400">${escapeHTML(t.id)} • ${escapeHTML(t.email || '')}</p>
                        </div>
                        <span class="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">${escapeHTML(t.status || 'Aktif')}</span>
                    </div>
                `;
            });
            html += `</div>`;
        }

        if (data.classes && data.classes.length > 0) {
            totalFound += data.classes.length;
            html += `<div class="space-y-1.5"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data Kelas (${data.classes.length})</p>`;
            data.classes.forEach(c => {
                html += `
                    <div onclick="window.location.href='kelas.html'; closeGlobalSearchModal();" 
                         class="p-2.5 bg-slate-50 hover:bg-indigo-50 rounded-xl cursor-pointer flex items-center justify-between transition-colors">
                        <div>
                            <p class="font-bold text-slate-900">${escapeHTML(c.nama)}</p>
                            <p class="text-[10px] text-slate-400">Pengajar: ${escapeHTML(c.pengajar || '-')} • ${escapeHTML(c.program)}</p>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        if (data.payments && data.payments.length > 0) {
            totalFound += data.payments.length;
            html += `<div class="space-y-1.5"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invoice / Pembayaran (${data.payments.length})</p>`;
            data.payments.forEach(p => {
                html += `
                    <div onclick="window.location.href='pembayaran.html'; closeGlobalSearchModal();" 
                         class="p-2.5 bg-slate-50 hover:bg-emerald-50 rounded-xl cursor-pointer flex items-center justify-between transition-colors">
                        <div>
                            <p class="font-bold text-slate-900">${escapeHTML(p.id)} - ${escapeHTML(p.nama)}</p>
                            <p class="text-[10px] text-slate-400">Nominal: Rp ${p.jumlah ? p.jumlah.toLocaleString('id-ID') : 0}</p>
                        </div>
                        <span class="text-[10px] font-bold ${p.status === 'Lunas' ? 'text-emerald-600 bg-emerald-100/60' : 'text-amber-600 bg-amber-100/60'} px-2 py-0.5 rounded-full">${escapeHTML(p.status)}</span>
                    </div>
                `;
            });
            html += `</div>`;
        }

        if (totalFound === 0) {
            modalResults.innerHTML = `<p class="text-center text-slate-400 py-6">Tidak ada hasil yang ditemukan untuk kata kunci "<span class="font-bold text-slate-700">${escapeHTML(q)}</span>".</p>`;
        } else {
            modalResults.innerHTML = html;
        }

    } catch (err) {
        console.error(err);
        modalResults.innerHTML = '<p class="text-center text-rose-500 py-6 font-semibold">Gagal memuat hasil pencarian.</p>';
    }
}
