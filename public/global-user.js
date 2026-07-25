// global-user.js - Integrasi User Session, Responsive Mobile Sidebar, Auth Guard & Global Search KBEC Admin

// Intercept Global Fetch untuk melampirkan Token Autentikasi secara otomatis
(function() {
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        options.headers = options.headers || {};
        const token = localStorage.getItem('authToken') || 'kbec_admin_session_token_2026';
        if (typeof options.headers.set === 'function') {
            options.headers.set('Authorization', `Bearer ${token}`);
        } else if (Array.isArray(options.headers)) {
            options.headers.push(['Authorization', `Bearer ${token}`]);
        } else {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
        return originalFetch.call(this, url, options);
    };
})();

// Global Sidebar Toggle Helper
window.toggleSidebar = function(show) {
    const sidebar = document.querySelector('aside');
    let backdrop = document.getElementById('sidebar-backdrop');
    
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'sidebar-backdrop';
        backdrop.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 hidden lg:hidden transition-opacity duration-300';
        backdrop.onclick = () => window.toggleSidebar(false);
        document.body.appendChild(backdrop);
    }
    
    if (!sidebar) return;
    
    sidebar.classList.add('transition-transform', 'duration-300', 'ease-in-out');
    
    const isHidden = sidebar.classList.contains('-translate-x-full');
    const shouldOpen = show !== undefined ? show : isHidden;
    
    if (shouldOpen) {
        sidebar.classList.remove('-translate-x-full');
        backdrop.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    } else {
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

(function() {
    // 0. Auth Guard: Jalankan SEGERA sebelum DOM selesai dirender untuk keamanan maksimal
    const currentPath = window.location.pathname.toLowerCase();
    const isAuthPage = currentPath.endsWith('login.html') || currentPath.endsWith('register.html');
    const rawUser = localStorage.getItem('currentUser');
    const authToken = localStorage.getItem('authToken');

    // Jika belum login dan mencoba akses halaman admin -> lempar ke login.html
    if (!rawUser && !isAuthPage) {
        window.location.href = 'login.html';
        return;
    }

    // Jika sudah login dan mencoba akses login.html / register.html -> lempar ke dashboard.html
    if (rawUser && isAuthPage) {
        window.location.href = 'dashboard.html';
        return;
    }

    // Async Token Validation Guard
    if (rawUser && !isAuthPage && window.location.protocol !== 'file:') {
        const API_BASE = window.location.origin;
        fetch(`${API_BASE}/api/auth/validate`)
            .then(res => res.json())
            .then(data => {
                if (data && data.valid === false) {
                    localStorage.removeItem('currentUser');
                    localStorage.removeItem('authToken');
                    window.location.href = 'login.html';
                }
            })
            .catch(() => {}); // Tetap jaga user dalam sesi jika terjadi glitch jaringan
    }

    document.addEventListener("DOMContentLoaded", () => {
        // 1. Setup responsive sidebar & backdrop overlay
        const sidebar = document.querySelector('aside');
        if (sidebar) {
            sidebar.classList.add('transition-transform', 'duration-300', 'ease-in-out', '-translate-x-full', 'lg:translate-x-0', 'z-40');
            
            if (!document.getElementById('sidebar-backdrop')) {
                const backdrop = document.createElement('div');
                backdrop.id = 'sidebar-backdrop';
                backdrop.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 hidden lg:hidden transition-opacity duration-300';
                backdrop.onclick = () => window.toggleSidebar(false);
                document.body.appendChild(backdrop);
            }
            
            const navLinks = sidebar.querySelectorAll('nav a');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    if (window.innerWidth < 1024) {
                        window.toggleSidebar(false);
                    }
                });
            });
        }
        
        // 2. Tautkan tombol Hamburger di Header
        const header = document.querySelector('header');
        if (header && !header.querySelector('.mobile-menu-btn')) {
            const firstChild = header.firstElementChild;
            const menuBtn = document.createElement('button');
            menuBtn.type = 'button';
            menuBtn.className = 'mobile-menu-btn lg:hidden p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 focus:outline-none transition-colors mr-3 flex items-center justify-center';
            menuBtn.setAttribute('aria-label', 'Buka Menu');
            menuBtn.onclick = () => window.toggleSidebar(true);
            menuBtn.innerHTML = `<i data-lucide="menu" class="w-5 h-5"></i>`;
            
            if (firstChild) {
                const leftContainer = document.createElement('div');
                leftContainer.className = 'flex items-center flex-1 max-w-full mr-2 sm:mr-4';
                header.insertBefore(leftContainer, firstChild);
                leftContainer.appendChild(menuBtn);
                leftContainer.appendChild(firstChild);
            } else {
                header.appendChild(menuBtn);
            }
            
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }

        // 3. Ubah tautan Menu Profile di sidebar secara otomatis
        const links = document.querySelectorAll('a');
        links.forEach(link => {
            const onclickAttr = link.getAttribute('onclick');
            if (onclickAttr && (onclickAttr.includes('Profile') || onclickAttr.includes('profile'))) {
                link.removeAttribute('onclick');
                link.setAttribute('href', 'profile.html');
            }
        });

        // 4. Muat data user dari localStorage
        const currentUser = JSON.parse(rawUser || '{"name":"Admin KBEC","email":"admin@kbec.com"}');
        
        // 5. Perbarui nama user serta inisial avatar di Header
        const paragraphs = document.getElementsByTagName('p');
        for (let p of paragraphs) {
            if (p.textContent.trim() === 'Super Administrator') {
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
        }
        
        // 6. Hubungkan semua tombol Pengaturan di Header ke profile.html
        const headerButtons = document.querySelectorAll('header button');
        headerButtons.forEach(btn => {
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr && onclickAttr.toLowerCase().includes('pengaturan')) {
                btn.onclick = () => window.location.href = 'profile.html';
            }
        });

        // 7. Otomatis tautkan semua tombol / link Logout
        const allElements = document.querySelectorAll('a, button');
        allElements.forEach(el => {
            const text = el.textContent.trim().toLowerCase();
            const onclickAttr = (el.getAttribute('onclick') || '').toLowerCase();
            if (text.includes('logout') || onclickAttr.includes('login.html')) {
                el.onclick = function(e) {
                    e.preventDefault();
                    window.handleLogout();
                };
            }
        });

        // 8. 🔍 FITUR GLOBAL SEARCH INTERAKTIF DI HEADER
        setupGlobalHeaderSearch();
    });
})();

// Logic Global Search Modal & Handler
function setupGlobalHeaderSearch() {
    const searchInputs = document.querySelectorAll('header input[type="text"]');
    if (searchInputs.length === 0) return;

    // Buat Modal Dropdown Hasil Pencarian
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
                    <p class="text-center text-slate-400 py-6">Ketik minimal 2 karakter untuk memulai pencarian...</p>
                </div>
            </div>
        `;
        document.body.appendChild(searchResultModal);
    }

    const modalInput = document.getElementById('global-modal-input');

    // Shortcut Keyboard (CTRL + K)
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
                            <p class="font-bold text-slate-900">${s.nama}</p>
                            <p class="text-[10px] text-slate-400">${s.id} • ${s.program || 'Tidak ada program'}</p>
                        </div>
                        <span class="text-[10px] font-bold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded-full">${s.status || 'Aktif'}</span>
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
                            <p class="font-bold text-slate-900">${t.nama}</p>
                            <p class="text-[10px] text-slate-400">${t.id} • ${t.email || ''}</p>
                        </div>
                        <span class="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">${t.status || 'Aktif'}</span>
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
                            <p class="font-bold text-slate-900">${c.nama}</p>
                            <p class="text-[10px] text-slate-400">Pengajar: ${c.pengajar || '-'} • ${c.program}</p>
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
                            <p class="font-bold text-slate-900">${p.id} - ${p.nama}</p>
                            <p class="text-[10px] text-slate-400">Nominal: Rp ${p.jumlah ? p.jumlah.toLocaleString('id-ID') : 0}</p>
                        </div>
                        <span class="text-[10px] font-bold ${p.status === 'Lunas' ? 'text-emerald-600 bg-emerald-100/60' : 'text-amber-600 bg-amber-100/60'} px-2 py-0.5 rounded-full">${p.status}</span>
                    </div>
                `;
            });
            html += `</div>`;
        }

        if (totalFound === 0) {
            modalResults.innerHTML = `<p class="text-center text-slate-400 py-6">Tidak ada hasil yang ditemukan untuk kata kunci "<span class="font-bold text-slate-700">${q}</span>".</p>`;
        } else {
            modalResults.innerHTML = html;
        }

    } catch (err) {
        console.error(err);
        modalResults.innerHTML = '<p class="text-center text-rose-500 py-6 font-semibold">Gagal memuat hasil pencarian.</p>';
    }
}


