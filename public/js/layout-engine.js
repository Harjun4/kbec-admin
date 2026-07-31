// KBEC Admin Layout Engine & Dynamic Component Renderer

document.addEventListener("DOMContentLoaded", () => {
    // 1. Inject Favicon jika belum ada
    if (!document.querySelector("link[rel*='icon']")) {
        const favicon = document.createElement('link');
        favicon.rel = 'icon';
        favicon.type = 'image/x-icon';
        favicon.href = 'favicon.ico';
        document.head.appendChild(favicon);
    }

    // 2. Aksesibilitas (a11y) Focus Trapping & Keyboard Nav untuk Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const openModals = document.querySelectorAll('.fixed:not(.hidden)');
            openModals.forEach(m => {
                if (m.id && m.id.includes('modal')) {
                    m.classList.add('hidden');
                }
            });
        }
    });
});
