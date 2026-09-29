// public/js/absensi-pengajar.js - KBEC Teacher Attendance & Tracking Module

let currentCameraStream = null;
let currentFacingMode = 'user'; // 'user' (selfie) atau 'environment' (belakang)
let currentCapturedPhoto = null;
let isPhotoFromLiveCamera = false; // Flag penanda foto langsung dari kamera (bukan upload foto lama)
let currentAttendanceLogs = [];

// Koordinat Resmi Yayasan Ar-Rasyid Bintaro — KBEC Jakarta (https://maps.app.goo.gl/gjiAmuJcTriC3VX49)
const KBEC_LAT = -6.2545644;
const KBEC_LNG = 106.7340093;
const KBEC_ALLOWED_RADIUS = 150; // Radius toleransi (150 meter)

document.addEventListener('DOMContentLoaded', async () => {
    initUserSession();
    await loadInitialData();
    detectGPSLocation(); // Auto detect GPS saat pertama buka
    
    // Auto refresh logs setiap 60 detik jika halaman terbuka
    setInterval(() => {
        const rawUser = localStorage.getItem('currentUser');
        const user = JSON.parse(rawUser || '{}');
        const role = (user.role || user.role_name || user.type || 'Pengajar').trim().toLowerCase();
        const isTeacher = role.includes('pengajar') || role.includes('guru') || role.includes('teacher');
        if (!isTeacher) {
            loadAttendanceSummary();
        }
    }, 60000);
});

// 1. Inisialisasi User & Hak Akses
function initUserSession() {
    const rawUser = localStorage.getItem('currentUser');
    const user = JSON.parse(rawUser || '{}');
    const role = (user.role || user.role_name || user.type || 'Pengajar').trim();
    const isTeacher = role.toLowerCase().includes('pengajar') || role.toLowerCase().includes('guru') || role.toLowerCase().includes('teacher');
    const isSuperAdmin = role.toLowerCase().includes('super');
    const isAdmin = !isSuperAdmin && role.toLowerCase().includes('admin');

    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-display-role');
    const avatarEl = document.getElementById('user-display-avatar');

    if (nameEl) nameEl.innerText = user.name || 'Pengguna KBEC';
    if (roleEl) roleEl.innerText = (window.getFormattedRoleText ? window.getFormattedRoleText(role) : role);
    if (avatarEl) {
        const initials = (user.name || 'KB').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        avatarEl.innerText = initials;
    }

    // Penyesuaian antarmuka berdasarkan role
    const statsSection = document.getElementById('section-stats-cards');
    if (isTeacher) {
        // Pengajar: Bagian card statistik TIDAK PERLU TERLIHAT (pengajar fokus melihat riwayat presensinya sendiri)
        if (statsSection) statsSection.classList.add('hidden');

        // Pengajar: Form langsung terbuka siap absen
        const formSection = document.getElementById('section-form-absensi');
        if (formSection) formSection.classList.remove('hidden');
        const btnToggle = document.getElementById('btn-toggle-form');
        if (btnToggle) btnToggle.classList.add('hidden'); // Tidak perlu tombol toggle jika sudah terbuka

        const teacherFilter = document.getElementById('filter-teacher-container');
        if (teacherFilter) teacherFilter.classList.add('hidden'); // Pengajar hanya lihat milik sendiri

        const tableTitle = document.getElementById('table-title');
        if (tableTitle) tableTitle.innerText = 'Riwayat Presensi Saya';
    } else {
        // Admin / Super Admin / Staff: Tampilkan bagian card statistik
        if (statsSection) statsSection.classList.remove('hidden');

        // Admin / Super Admin: Sembunyikan form awal, tampilkan dropdown pilih pengajar jika admin entry
        const wrapperSelectTeacher = document.getElementById('wrapper-select-teacher');
        if (wrapperSelectTeacher) wrapperSelectTeacher.classList.remove('hidden');
    }
}

// 2. Load Data Awal
async function loadInitialData() {
    const rawUser = localStorage.getItem('currentUser');
    const user = JSON.parse(rawUser || '{}');
    const role = (user.role || user.role_name || user.type || 'Pengajar').trim().toLowerCase();
    const isTeacher = role.includes('pengajar') || role.includes('guru') || role.includes('teacher');

    const tasks = [
        loadTeachersDropdown(),
        loadTeacherClasses(),
        loadCheckinLogs()
    ];
    if (!isTeacher) {
        tasks.push(loadAttendanceSummary());
    }

    await Promise.all(tasks);
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const bgColors = {
        success: 'bg-emerald-600 text-white',
        error: 'bg-rose-600 text-white',
        warning: 'bg-amber-500 text-white',
        info: 'bg-slate-900 text-white'
    };

    const icons = {
        success: 'check-circle',
        error: 'alert-triangle',
        warning: 'alert-circle',
        info: 'info'
    };

    const toast = document.createElement('div');
    toast.className = `flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold pointer-events-auto transform transition-all duration-300 translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `
        <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 flex-shrink-0"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// 3. Tab Switching pada Formulir Presensi
function switchFormTab(type) {
    document.getElementById('form-attendance-type').value = type;

    const tabBtnHarian = document.getElementById('tab-btn-harian');
    const tabBtnSesi = document.getElementById('tab-btn-sesi');
    const tabBtnCheckout = document.getElementById('tab-btn-checkout');
    const tabBtnIzin = document.getElementById('tab-btn-izin');

    const fieldsSesi = document.getElementById('fields-sesi-mengajar');
    const fieldsIzin = document.getElementById('fields-izin-sakit');
    const submitBtnText = document.getElementById('submit-btn-text');

    const photoTitle = document.getElementById('photo-label-title');
    const photoNotice = document.getElementById('photo-rule-notice');
    const containerUpload = document.getElementById('container-upload-file');

    const inactiveClass = 'px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all';
    const activeClass = 'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all bg-white text-[#0A58CA] shadow-xs';

    [tabBtnHarian, tabBtnSesi, tabBtnCheckout, tabBtnIzin].forEach(btn => {
        if (btn) btn.className = inactiveClass;
    });

    if (fieldsSesi) fieldsSesi.classList.add('hidden');
    if (fieldsIzin) fieldsIzin.classList.add('hidden');

    if (type === 'checkin_harian') {
        if (tabBtnHarian) tabBtnHarian.className = activeClass;
        if (submitBtnText) submitBtnText.innerText = 'Kirim Check-in Datang';
        if (photoTitle) photoTitle.innerHTML = 'Bukti Foto Datang (Wajib Kamera Langsung) <span class="text-rose-500">*</span>';
        if (photoNotice) photoNotice.innerHTML = '<i data-lucide="shield-alert" class="w-4 h-4 text-amber-600 flex-shrink-0"></i><span>Presensi datang <b>wajib foto kamera langsung saat ini</b> (menghindari penggunaan foto lama dari galeri).</span>';
        if (containerUpload) containerUpload.classList.add('hidden');
        if (!isPhotoFromLiveCamera && currentCapturedPhoto) retakePhoto();
    } else if (type === 'sesi_mengajar') {
        if (tabBtnSesi) tabBtnSesi.className = activeClass;
        if (fieldsSesi) fieldsSesi.classList.remove('hidden');
        if (submitBtnText) submitBtnText.innerText = 'Kirim Absensi Sesi Mengajar';
        if (photoTitle) photoTitle.innerHTML = 'Bukti Foto Sesi Mengajar (Kamera / Berkas) <span class="text-rose-500">*</span>';
        if (photoNotice) photoNotice.innerHTML = '<i data-lucide="info" class="w-4 h-4 text-blue-600 flex-shrink-0"></i><span>Untuk Sesi Mengajar, diperbolehkan foto langsung ataupun <b>mengunggah dokumentasi berkas foto kegiatan mengajar</b>.</span>';
        if (containerUpload) containerUpload.classList.remove('hidden');
    } else if (type === 'checkout_harian') {
        if (tabBtnCheckout) tabBtnCheckout.className = activeClass;
        if (submitBtnText) submitBtnText.innerText = 'Kirim Check-out Pulang';
        if (photoTitle) photoTitle.innerHTML = 'Bukti Foto Pulang (Wajib Kamera Langsung) <span class="text-rose-500">*</span>';
        if (photoNotice) photoNotice.innerHTML = '<i data-lucide="shield-alert" class="w-4 h-4 text-amber-600 flex-shrink-0"></i><span>Presensi pulang <b>wajib foto kamera langsung saat ini</b> (menghindari penggunaan foto lama dari galeri).</span>';
        if (containerUpload) containerUpload.classList.add('hidden');
        if (!isPhotoFromLiveCamera && currentCapturedPhoto) retakePhoto();
    } else if (type === 'izin' || type === 'sakit') {
        if (tabBtnIzin) tabBtnIzin.className = activeClass;
        if (fieldsIzin) fieldsIzin.classList.remove('hidden');
        if (submitBtnText) submitBtnText.innerText = 'Kirim Pengajuan Izin/Sakit';
        if (photoTitle) photoTitle.innerHTML = 'Bukti Surat Izin / Sakit (Berkas / Foto)';
        if (photoNotice) photoNotice.innerHTML = '<i data-lucide="info" class="w-4 h-4 text-amber-600 flex-shrink-0"></i><span>Unggah berkas surat keterangan dokter atau dokumen pendukung perizinan.</span>';
        if (containerUpload) containerUpload.classList.remove('hidden');
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function toggleAbsensiForm(forceOpen = null) {
    const section = document.getElementById('section-form-absensi');
    const btnLabel = document.getElementById('btn-form-label');
    if (!section) return;

    const isOpen = forceOpen !== null ? !forceOpen : section.classList.contains('hidden');
    if (isOpen) {
        section.classList.remove('hidden');
        if (btnLabel) btnLabel.innerText = 'Tutup Formulir';
        detectGPSLocation();
    } else {
        section.classList.add('hidden');
        if (btnLabel) btnLabel.innerText = 'Buka Presensi Mandiri';
        stopCamera();
    }
}

// 4. Fitur Kamera Langsung & Ambil Foto
async function startCamera() {
    stopCamera();
    const video = document.getElementById('camera-stream');
    const placeholder = document.getElementById('camera-placeholder');
    const preview = document.getElementById('photo-preview');
    const btnStart = document.getElementById('btn-start-camera');
    const btnTake = document.getElementById('btn-take-photo');
    const btnRetake = document.getElementById('btn-retake-photo');
    const overlay = document.getElementById('camera-controls-overlay');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Kamera tidak didukung pada peramban/koneksi ini. Silakan gunakan opsi unggah berkas.', 'warning');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: currentFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        currentCameraStream = stream;
        video.srcObject = stream;
        video.classList.remove('hidden');
        if (currentFacingMode === 'environment') {
            video.classList.add('environment');
        } else {
            video.classList.remove('environment');
        }

        if (placeholder) placeholder.classList.add('hidden');
        if (preview) preview.classList.add('hidden');
        if (btnStart) btnStart.classList.add('hidden');
        if (btnTake) btnTake.classList.remove('hidden');
        if (btnRetake) btnRetake.classList.add('hidden');
        if (overlay) overlay.classList.remove('hidden');

        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    } catch (err) {
        console.error('Camera Access Error:', err);
        showToast('Tidak dapat mengakses kamera: ' + (err.message || 'Izin kamera ditolak'), 'error');
    }
}

function stopCamera() {
    if (currentCameraStream) {
        currentCameraStream.getTracks().forEach(track => track.stop());
        currentCameraStream = null;
    }
    const video = document.getElementById('camera-stream');
    const overlay = document.getElementById('camera-controls-overlay');
    if (video) video.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
}

function flipCamera() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    startCamera();
}

function takePhoto() {
    const video = document.getElementById('camera-stream');
    const canvas = document.getElementById('photo-canvas');
    const preview = document.getElementById('photo-preview');
    const btnTake = document.getElementById('btn-take-photo');
    const btnRetake = document.getElementById('btn-retake-photo');
    const statusBadge = document.getElementById('photo-status-badge');

    if (!video || !video.srcObject) return;

    // Tentukan dimensi maksimal untuk kompresi (maks 800px)
    let width = video.videoWidth || 640;
    let height = video.videoHeight || 480;
    const maxDim = 800;

    if (width > maxDim || height > maxDim) {
        if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
        } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
        }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Jika kamera selfie, cerminkan kembali di canvas agar foto tidak terbalik
    if (currentFacingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);

    // Kompresi JPEG kualitas 75%
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    currentCapturedPhoto = dataUrl;
    isPhotoFromLiveCamera = true; // Ditandai diambil langsung dari kamera

    // Tampilkan preview foto
    preview.src = dataUrl;
    preview.classList.remove('hidden');
    stopCamera();

    if (btnTake) btnTake.classList.add('hidden');
    if (btnRetake) btnRetake.classList.remove('hidden');
    if (statusBadge) {
        statusBadge.innerText = 'Foto Kamera Siap';
        statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold';
    }

    showToast('Foto kamera langsung berhasil diambil!', 'success');
}

function retakePhoto() {
    currentCapturedPhoto = null;
    isPhotoFromLiveCamera = false;
    const preview = document.getElementById('photo-preview');
    const placeholder = document.getElementById('camera-placeholder');
    const statusBadge = document.getElementById('photo-status-badge');
    const btnStart = document.getElementById('btn-start-camera');
    const btnRetake = document.getElementById('btn-retake-photo');
    const btnTake = document.getElementById('btn-take-photo');

    if (preview) preview.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    if (btnRetake) btnRetake.classList.add('hidden');
    if (btnTake) btnTake.classList.add('hidden');
    if (btnStart) btnStart.classList.remove('hidden');

    if (statusBadge) {
        statusBadge.innerText = 'Belum Diambil';
        statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold';
    }

    // Reset input file jika ada
    const fileInput = document.getElementById('file-photo-input');
    if (fileInput) fileInput.value = '';
}

// 5. Unggah Berkas Foto (Khusus Sesi Mengajar & Izin)
function handleFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Mohon pilih berkas gambar (JPG, PNG, atau WEBP).', 'warning');
        return;
    }

    stopCamera();
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.getElementById('photo-canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 800;

            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
            currentCapturedPhoto = compressedDataUrl;
            isPhotoFromLiveCamera = false; // Dari berkas unggahan, bukan kamera langsung

            const preview = document.getElementById('photo-preview');
            const placeholder = document.getElementById('camera-placeholder');
            const btnStart = document.getElementById('btn-start-camera');
            const btnRetake = document.getElementById('btn-retake-photo');
            const statusBadge = document.getElementById('photo-status-badge');

            if (preview) {
                preview.src = compressedDataUrl;
                preview.classList.remove('hidden');
            }
            if (placeholder) placeholder.classList.add('hidden');
            if (btnStart) btnStart.classList.add('hidden');
            if (btnRetake) btnRetake.classList.remove('hidden');

            if (statusBadge) {
                statusBadge.innerText = 'Berkas Terunggah';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold';
            }

            showToast('Foto dokumentasi sesi berhasil diunggah.', 'success');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// 6. Deteksi Lokasi GPS & Perhitungan Radius Haversine
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function detectGPSLocation() {
    const titleEl = document.getElementById('gps-title');
    const detailEl = document.getElementById('gps-detail');
    const badgeEl = document.getElementById('gps-radius-badge');
    const iconContainer = document.getElementById('gps-icon-container');

    if (!navigator.geolocation) {
        if (titleEl) titleEl.innerText = 'GPS Tidak Didukung';
        if (detailEl) detailEl.innerText = 'Peramban ini tidak mendukung layanan geolokasi GPS.';
        document.getElementById('form-lat').value = '';
        document.getElementById('form-lng').value = '';
        if (iconContainer) iconContainer.className = 'p-2 rounded-lg bg-rose-100 text-rose-600';
        if (badgeEl) {
            badgeEl.classList.remove('hidden');
            badgeEl.innerText = 'GPS Tidak Didukung';
            badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-700';
        }
        return;
    }

    if (titleEl) titleEl.innerText = 'Mendeteksi Koordinat GPS...';
    if (detailEl) detailEl.innerText = 'Mohon izinkan akses lokasi jika peramban meminta konfirmasi...';

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            document.getElementById('form-lat').value = lat;
            document.getElementById('form-lng').value = lng;

            const dist = calculateHaversineDistance(lat, lng, KBEC_LAT, KBEC_LNG);
            const distRound = Math.round(dist);

            if (titleEl) titleEl.innerText = `Lokasi Terdeteksi (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
            if (detailEl) detailEl.innerText = `Jarak perkiraan ke titik KBEC: ${distRound} meter.`;

            if (badgeEl) {
                badgeEl.classList.remove('hidden');
                if (dist <= KBEC_ALLOWED_RADIUS) {
                    badgeEl.innerText = `Dalam Radius (${distRound}m)`;
                    badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700';
                    if (iconContainer) iconContainer.className = 'p-2 rounded-lg bg-emerald-100 text-emerald-600';
                } else {
                    badgeEl.innerText = `Luar Radius (${distRound}m)`;
                    badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700';
                    if (iconContainer) iconContainer.className = 'p-2 rounded-lg bg-amber-100 text-amber-600';
                }
            }
        },
        (err) => {
            console.warn('Geolocation Error:', err.message);
            document.getElementById('form-lat').value = '';
            document.getElementById('form-lng').value = '';
            if (titleEl) titleEl.innerText = 'GPS Belum Diizinkan / Mati';
            if (detailEl) detailEl.innerText = 'Akses lokasi wajib diaktifkan & diizinkan pada peramban/HP Anda agar presensi dapat diproses. Klik "Perbarui Lokasi" setelah mengaktifkan izin lokasi.';
            if (iconContainer) iconContainer.className = 'p-2 rounded-lg bg-rose-100 text-rose-600';
            if (badgeEl) {
                badgeEl.classList.remove('hidden');
                badgeEl.innerText = 'GPS Wajib Aktif';
                badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-700';
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// 7. Pengiriman Formulir Presensi
async function handleAttendanceSubmit(event) {
    event.preventDefault();

    const type = document.getElementById('form-attendance-type').value;
    const lat = document.getElementById('form-lat').value;
    const lng = document.getElementById('form-lng').value;
    const notes = document.getElementById('form-notes').value;

    let class_id = null;
    let class_name = null;
    let is_online = 0;
    let topic_material = null;

    if (type === 'sesi_mengajar') {
        const classSelect = document.getElementById('form-class-select');
        class_id = classSelect.value;
        class_name = classSelect.options[classSelect.selectedIndex] ? classSelect.options[classSelect.selectedIndex].text : '';
        is_online = parseInt(document.getElementById('form-is-online').value || '0', 10);
        topic_material = document.getElementById('form-topic-material').value;

        if (!class_id) {
            showToast('Silakan pilih kelas yang diajar hari ini.', 'warning');
            return;
        }
        if (!topic_material || !topic_material.trim()) {
            showToast('Topik atau materi pembelajaran wajib diisi.', 'warning');
            return;
        }
    } else if (type === 'izin' || type === 'sakit') {
        const izinType = document.getElementById('form-izin-type').value;
        topic_material = izinType === 'sakit' ? 'Sakit' : 'Izin';
    }

    // Validasi WAJIB Lokasi GPS untuk presensi tatap muka (Check-in Datang, Check-out Pulang, dan Sesi Mengajar Tatap Muka)
    const isOfflinePresence = type === 'checkin_harian' || type === 'checkout_harian' || (type === 'sesi_mengajar' && !is_online);
    if (isOfflinePresence) {
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        if (!lat || !lng || isNaN(parsedLat) || isNaN(parsedLng) || (parsedLat === 0 && parsedLng === 0)) {
            showToast('Akses lokasi GPS belum terdeteksi atau tidak diizinkan! Silakan aktifkan GPS dan izinkan akses lokasi di peramban/ponsel Anda, lalu klik "Perbarui Lokasi".', 'error');
            detectGPSLocation();
            const gpsCard = document.getElementById('gps-status-card');
            if (gpsCard) gpsCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
    }

    // Validasi Foto Bukti:
    // Khusus Check-in Datang & Check-out Pulang: WAJIB foto kamera langsung (bukan berkas lama)
    // Kecuali Sesi Mengajar: Boleh foto langsung ataupun unggah berkas dokumentasi
    if (type === 'checkin_harian' || type === 'checkout_harian') {
        if (!currentCapturedPhoto) {
            showToast('Foto selfie kamera langsung wajib diambil sebelum mengirim presensi!', 'warning');
            return;
        }
        if (!isPhotoFromLiveCamera) {
            showToast('Presensi datang/pulang wajib foto kamera langsung saat ini (tidak boleh dari berkas foto lama).', 'warning');
            return;
        }
    } else if (type === 'sesi_mengajar') {
        if (!currentCapturedPhoto) {
            showToast('Foto dokumentasi sesi mengajar (kamera langsung atau berkas foto) wajib disertakan.', 'warning');
            return;
        }
    }

    const teacherSelect = document.getElementById('form-teacher-id');
    const teacher_id = teacherSelect ? teacherSelect.value : null;
    const teacher_name = teacherSelect && teacherSelect.selectedIndex > 0 ? teacherSelect.options[teacherSelect.selectedIndex].text : null;

    const payload = {
        attendance_type: type,
        class_id: class_id || null,
        class_name: class_name || null,
        topic_material: topic_material || null,
        notes: notes || null,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        is_online: is_online,
        proof_image: currentCapturedPhoto || null,
        teacher_id: teacher_id || undefined,
        teacher_name: teacher_name || undefined
    };

    const submitBtn = document.getElementById('btn-submit-attendance');
    const submitText = document.getElementById('submit-btn-text');
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.innerText = 'Mengirim Presensi...';

    const token = localStorage.getItem('authToken');

    try {
        const res = await fetch('/api/teachers/attendance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || 'Gagal menyimpan absensi pengajar.');
        }

        showToast(data.message || 'Presensi berhasil dicatat!', 'success');

        // Reset form
        document.getElementById('form-notes').value = '';
        if (document.getElementById('form-topic-material')) document.getElementById('form-topic-material').value = '';
        retakePhoto();
        stopCamera();

        // Refresh log & ringkasan
        await loadAttendanceSummary();
        await loadCheckinLogs();
    } catch (err) {
        console.error('Submit Attendance Error:', err);
        showToast(err.message, 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        switchFormTab(type); // reset button text
    }
}

// 8. Load Dropdown & Data Terkait
async function loadTeachersDropdown() {
    const filterSelect = document.getElementById('filter-teacher');
    const formSelect = document.getElementById('form-teacher-id');
    const token = localStorage.getItem('authToken');

    try {
        const res = await fetch('/api/teachers', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const teachers = await res.json();

        if (filterSelect) {
            filterSelect.innerHTML = '<option value="all">Semua Pengajar</option>';
            teachers.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.nama} (${t.id})`;
                filterSelect.appendChild(opt);
            });
        }

        if (formSelect) {
            formSelect.innerHTML = '<option value="">-- Pilih Pengajar (Entry Admin) --</option>';
            teachers.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.nama} (${t.id})`;
                formSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.warn('Load Teachers Error:', err.message);
    }
}

async function loadTeacherClasses() {
    const classSelect = document.getElementById('form-class-select');
    if (!classSelect) return;

    const token = localStorage.getItem('authToken');
    try {
        const res = await fetch('/api/teachers/my-classes-today', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const classes = await res.json();

        classSelect.innerHTML = '<option value="">-- Pilih Kelas yang Diajar --</option>';
        classes.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.nama} (${c.program || 'Reguler'}) - ${c.mulai || ''} s/d ${c.selesai || ''}`;
            classSelect.appendChild(opt);
        });
    } catch (err) {
        console.warn('Load Classes Error:', err.message);
    }
}

function onAdminTeacherSelectChange() {
    // Jika Super Admin memilih pengajar lain pada form entry, refresh daftar kelasnya
    loadTeacherClasses();
}

function onClassSelectChange() {
    // Optional helper when class is selected
}

// 9. Load Ringkasan KPI
async function loadAttendanceSummary() {
    const token = localStorage.getItem('authToken');
    try {
        const res = await fetch('/api/teachers/attendance-summary', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();

        const checkinEl = document.getElementById('stat-today-checkins');
        const sessionEl = document.getElementById('stat-today-sessions');
        const leaveEl = document.getElementById('stat-today-leave');
        const teacherEl = document.getElementById('stat-total-teachers');

        if (checkinEl) checkinEl.innerText = data.today_checkins || 0;
        if (sessionEl) sessionEl.innerText = data.today_sessions || 0;
        if (leaveEl) leaveEl.innerText = data.today_leave || 0;
        if (teacherEl) teacherEl.innerText = data.total_teachers || 0;
    } catch (err) {
        console.warn('Load Summary Error:', err.message);
    }
}

// 10. Load Riwayat Presensi & Render Tabel
async function loadCheckinLogs() {
    const token = localStorage.getItem('authToken');
    const tbody = document.getElementById('logs-table-body');
    const emptyState = document.getElementById('logs-empty-state');
    const countBadge = document.getElementById('log-count-badge');

    const teacherVal = document.getElementById('filter-teacher') ? document.getElementById('filter-teacher').value : 'all';
    const typeVal = document.getElementById('filter-type') ? document.getElementById('filter-type').value : 'all';
    const dateVal = document.getElementById('filter-date') ? document.getElementById('filter-date').value : '';

    let url = `/api/teachers/attendance-logs?limit=200`;
    if (teacherVal && teacherVal !== 'all') url += `&teacher_id=${encodeURIComponent(teacherVal)}`;
    if (typeVal && typeVal !== 'all') url += `&attendance_type=${encodeURIComponent(typeVal)}`;
    if (dateVal) url += `&date=${encodeURIComponent(dateVal)}`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Gagal memuat log presensi');
        const logs = await res.json();
        currentAttendanceLogs = logs || [];

        if (countBadge) countBadge.innerText = `${currentAttendanceLogs.length} Catatan`;

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');
        renderLogsTable(logs);
    } catch (err) {
        console.error('Load Logs Error:', err);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-rose-500 font-semibold">Gagal memuat data presensi: ${err.message}</td></tr>`;
    }
}

function renderLogsTable(logs) {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    const typeBadges = {
        checkin_harian: '<span class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center gap-1 w-max"><i data-lucide="log-in" class="w-3 h-3"></i> Check-in Datang</span>',
        checkout_harian: '<span class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 w-max"><i data-lucide="log-out" class="w-3 h-3"></i> Check-out Pulang</span>',
        sesi_mengajar: '<span class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-200/60 flex items-center gap-1 w-max"><i data-lucide="book-open" class="w-3 h-3"></i> Sesi Mengajar</span>',
        izin: '<span class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60 flex items-center gap-1 w-max"><i data-lucide="clock" class="w-3 h-3"></i> Izin</span>',
        sakit: '<span class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-50 text-rose-700 border border-rose-200/60 flex items-center gap-1 w-max"><i data-lucide="heart-pulse" class="w-3 h-3"></i> Sakit</span>'
    };

    tbody.innerHTML = logs.map((log, index) => {
        const typeBadge = typeBadges[log.attendance_type] || `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">${log.attendance_type || 'Presensi'}</span>`;
        
        let gpsStatusBadge = '';
        if (log.attendance_type === 'izin' || log.attendance_type === 'sakit') {
            gpsStatusBadge = '<span class="text-[11px] font-semibold text-slate-500">Keterangan Izin</span>';
        } else if (log.is_online) {
            gpsStatusBadge = '<span class="text-[11px] font-bold text-indigo-600 flex items-center gap-1"><i data-lucide="globe" class="w-3 h-3"></i> Daring (Online)</span>';
        } else if (log.distance_meters > 0) {
            const isWithin = log.distance_meters <= 100;
            gpsStatusBadge = `
                <div class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full ${isWithin ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
                    <span class="font-bold text-[11px] ${isWithin ? 'text-emerald-700' : 'text-amber-700'}">${Math.round(log.distance_meters)} meter</span>
                    ${!isWithin ? '<span class="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">Luar Radius</span>' : ''}
                </div>
            `;
        } else {
            gpsStatusBadge = '<span class="text-[11px] text-slate-400">Tanpa GPS</span>';
        }

        const hasPhoto = !!log.proof_image;
        const photoThumb = hasPhoto 
            ? `<button onclick="openProofModal(${index})" class="relative group w-10 h-10 rounded-xl overflow-hidden border border-slate-200 shadow-xs hover:ring-2 hover:ring-blue-500 transition-all flex items-center justify-center bg-slate-100">
                 <img src="${log.proof_image}" alt="Bukti" class="w-full h-full object-cover">
                 <div class="absolute inset-0 bg-black/30 group-hover:bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                     <i data-lucide="maximize-2" class="w-3.5 h-3.5 text-white"></i>
                 </div>
               </button>`
            : '<span class="text-[11px] text-slate-400 italic">Tidak ada foto</span>';

        return `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="font-bold text-slate-900">${log.waktu ? `${log.waktu} WIB` : '-'}</div>
                    <div class="text-[10px] text-slate-400 font-medium">${log.tanggal || ''}</div>
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-extrabold text-[11px]">
                            ${(log.teacher_name || 'KB').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div>
                            <div class="font-extrabold text-slate-900 leading-tight">${log.teacher_name || '-'}</div>
                            <div class="text-[10px] text-slate-400">${log.teacher_id || '-'}</div>
                        </div>
                    </div>
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                    ${typeBadge}
                </td>
                <td class="py-3.5 px-4 max-w-xs">
                    <div class="font-bold text-slate-800 truncate">${log.class_name || (log.attendance_type === 'checkin_harian' ? 'Kantor / Bimbel KBEC' : '-')}</div>
                    <div class="text-[11px] text-slate-500 truncate mt-0.5">${log.topic_material || log.notes || '-'}</div>
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                    ${gpsStatusBadge}
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center">
                        ${photoThumb}
                    </div>
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <button onclick="openProofModal(${index})" class="px-3 py-1.5 text-[11px] font-bold text-[#0A58CA] bg-blue-50 hover:bg-blue-100 rounded-xl transition-all flex items-center gap-1.5 mx-auto">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        <span>Lihat Bukti</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

// 11. Modal Viewer Bukti Absensi
function openProofModal(logIndex) {
    const log = currentAttendanceLogs[logIndex];
    if (!log) return;

    const modal = document.getElementById('modal-proof-viewer');
    const teacherEl = document.getElementById('modal-proof-teacher');
    const timeEl = document.getElementById('modal-proof-time');
    const imgEl = document.getElementById('modal-proof-img');
    const noImgEl = document.getElementById('modal-proof-no-img');
    const typeEl = document.getElementById('modal-proof-type');
    const statusEl = document.getElementById('modal-proof-status');
    const materialEl = document.getElementById('modal-proof-material');
    const notesEl = document.getElementById('modal-proof-notes');
    const mapLinkEl = document.getElementById('modal-proof-map-link');

    if (teacherEl) teacherEl.innerText = `${log.teacher_name} (${log.teacher_id})`;
    if (timeEl) timeEl.innerText = `Waktu Presensi: ${log.waktu}`;

    if (log.proof_image) {
        imgEl.src = log.proof_image;
        imgEl.classList.remove('hidden');
        if (noImgEl) noImgEl.classList.add('hidden');
    } else {
        imgEl.src = '';
        imgEl.classList.add('hidden');
        if (noImgEl) noImgEl.classList.remove('hidden');
    }

    if (typeEl) typeEl.innerText = (log.attendance_type || 'Presensi').toUpperCase().replace('_', ' ');
    if (statusEl) {
        let text = log.status || 'Hadir';
        if (log.distance_meters > 0) text += ` (${Math.round(log.distance_meters)}m)`;
        statusEl.innerText = text;
    }
    if (materialEl) materialEl.innerText = `${log.class_name || '-'} — ${log.topic_material || 'Tidak ada catatan materi'}`;
    if (notesEl) notesEl.innerText = log.notes || 'Tidak ada catatan tambahan.';

    if (mapLinkEl) {
        if (log.lat && log.lng && parseFloat(log.lat) !== 0) {
            mapLinkEl.href = `https://www.google.com/maps?q=${log.lat},${log.lng}`;
            mapLinkEl.classList.remove('hidden');
        } else {
            mapLinkEl.classList.add('hidden');
        }
    }

    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.children[0].classList.remove('scale-95');
        }, 10);
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function closeProofModal() {
    const modal = document.getElementById('modal-proof-viewer');
    if (!modal) return;
    modal.classList.add('opacity-0');
    modal.children[0].classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

// 12. Ekspor Rekap Presensi ke Excel (XLSX)
function exportToExcel() {
    if (!currentAttendanceLogs || currentAttendanceLogs.length === 0) {
        showToast('Tidak ada data presensi untuk diekspor.', 'warning');
        return;
    }

    if (typeof XLSX === 'undefined') {
        showToast('Pustaka Excel belum siap dimuat.', 'error');
        return;
    }

    const dataRows = currentAttendanceLogs.map((l, i) => ({
        'No': i + 1,
        'Waktu': l.waktu || '',
        'Tanggal': l.tanggal || '',
        'Jam': l.jam || '',
        'ID Pengajar': l.teacher_id || '',
        'Nama Pengajar': l.teacher_name || '',
        'Tipe Kehadiran': l.attendance_type || '',
        'Kelas': l.class_name || '',
        'Topik / Materi': l.topic_material || '',
        'Status': l.status || '',
        'Jarak GPS (Meter)': Math.round(l.distance_meters || 0),
        'Latitude': l.lat || '',
        'Longitude': l.lng || '',
        'Catatan': l.notes || '',
        'Ada Bukti Foto': l.proof_image ? 'Ya' : 'Tidak'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Presensi Pengajar');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Rekap_Presensi_Pengajar_KBEC_${dateStr}.xlsx`);
    showToast('Berkas Excel berhasil diunduh.', 'success');
}

function refreshData() {
    loadAttendanceSummary();
    loadCheckinLogs();
    showToast('Data presensi diperbarui.', 'info');
}
