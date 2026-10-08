/**
 * Helpers utility functions for KBEC Admin
 */

/** Daftar Unit Yayasan yang valid (sumber kebenaran tunggal). */
const UNITS = ['KBEC', 'TK', 'Bimbel', 'Calistung', 'Arabin'];

/** Status siswa kanonik. */
const STUDENT_STATUSES = ['Aktif', 'Nonaktif', 'Alumni', 'Cuti'];

/**
 * Normalisasi teks bebas (mis. "BIMBEL", "TK (Preschool / PAUD)") menjadi
 * salah satu nilai UNITS. Mengembalikan null bila tidak dikenali.
 */
function normalizeUnit(input) {
    const t = String(input === null || input === undefined ? '' : input).toLowerCase().trim();
    if (!t) return null;
    if (t.includes('kbec') || t.includes('english')) return 'KBEC';
    if (t.includes('calistung')) return 'Calistung';
    if (t.includes('bimbel') || t.includes('bimbingan')) return 'Bimbel';
    if (t.includes('arabin')) return 'Arabin';
    if (t.startsWith('tk') || t.includes('paud') || t.includes('preschool')) return 'TK';
    return null;
}

/**
 * Normalisasi status siswa (AKTIF / Non-Aktif / nonaktif / alumni / cuti ...).
 * - input kosong  -> fallback
 * - tidak dikenali -> null (pemanggil harus menolak)
 */
function normalizeStudentStatus(input, fallback = 'Aktif') {
    const t = String(input === null || input === undefined ? '' : input).toLowerCase().replace(/[^a-z]/g, '');
    if (!t) return fallback;
    if (t === 'aktif') return 'Aktif';
    if (t === 'nonaktif' || t === 'tidakaktif') return 'Nonaktif';
    if (t === 'alumni' || t === 'lulus') return 'Alumni';
    if (t === 'cuti' || t === 'istirahat' || t === 'pause' || t === 'off') return 'Cuti';
    return null;
}

/**
 * Trim string; kosong/null/undefined -> null.
 */
function cleanText(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).replace(/\s+/g, ' ').trim();
    return s === '' ? null : s;
}

function normProgramText(s) {
    return String(s === null || s === undefined ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
}

const PROGRAM_ALIASES = {
    'tk a': 'TKA',
    'tk b': 'TKB',
    'tk-a': 'TKA',
    'tk-b': 'TKB',
    'paud': 'KB',
    '1a': 'Calistung 1A',
    '1b': 'Calistung 1B',
    '2a': 'Calistung 2A',
    '2b': 'Calistung 2B',
    '3a': 'Calistung 3A',
    '3b': 'Calistung 3B',
    'elementary': 'Elementary 1A',
    'bimbel (sd-smp)': 'Bimbel (SD-SMP)',
    'mtk': 'Bimbel (SD)'
};

/**
 * Mencari baris master `programs` yang cocok dengan teks program dari Excel/form.
 * Pencocokan case-insensitive & toleran spasi, dibatasi pada unit yang sama.
 * Baris master dengan cat bukan unit valid (mis. 'basic') diabaikan.
 *
 * @param {Array<{id:number,nama:string,cat:string}>} programs
 * @param {string|null} unit  salah satu UNITS (opsional)
 * @param {string} text
 * @returns {object|null}
 */
function matchProgramMaster(programs, unit, text) {
    const raw = normProgramText(text);
    if (!raw || !Array.isArray(programs)) return null;

    const valid = programs.filter(p => {
        if (!p || !p.nama) return false;
        const normCat = normalizeUnit(p.cat);
        if (!normCat) return false;
        const nameLower = normProgramText(p.nama);
        if (['kbec', 'calistung', 'bimbel', 'tk', 'arabin'].includes(nameLower)) return false;
        return true;
    });
    const pool = unit ? valid.filter(p => normalizeUnit(p.cat) === unit) : valid;

    const candidates = [raw];
    if (PROGRAM_ALIASES[raw]) candidates.push(normProgramText(PROGRAM_ALIASES[raw]));
    if (unit) {
        candidates.push(normProgramText(`${unit} ${raw}`));
        candidates.push(normProgramText(`${unit} (${raw})`));
    }

    for (const c of candidates) {
        const found = pool.find(p => normProgramText(p.nama) === c);
        if (found) return found;
    }
    return null;
}

/**
 * Resolves the unit (KBEC, Calistung, Bimbel, TK, Arabin) for a student
 * based on explicit unit, student ID pattern, program name, or level.
 * Eliminates false positive matches (e.g. -ADM suffix mistaken for Arabin).
 */
function resolveStudentUnit(studentId = '', program = '', level = '', unit = '') {
    const explicit = normalizeUnit(unit);
    if (explicit) return explicit;

    const id = (studentId || '').toUpperCase().trim();
    const prog = (program || '').toLowerCase().trim();
    const lvl = (level || '').toLowerCase().trim();

    if (id.startsWith('ARBN.')) {
        return 'TK';
    }
    if (id.endsWith('-C') || prog.includes('calistung') || lvl.includes('calistung')) {
        return 'Calistung';
    }
    if (id.endsWith('-B') || prog.includes('bimbel') || prog.includes('akademik sd') || lvl.includes('bimbel')) {
        return 'Bimbel';
    }
    if (id.endsWith('-A') || prog.includes('arabin') || lvl.includes('arabin')) {
        return 'Arabin';
    }
    if (id.endsWith('-TK') || prog.includes('preschool') || ['kb', 'tka', 'tkb'].includes(prog) || lvl.includes('tk')) {
        return 'TK';
    }
    return 'KBEC';
}

/**
 * Nomor urut maksimum yang dianggap "resmi". NIS lama yang dibuat acak
 * (6 digit >= 100000) diabaikan agar tidak mencemari urutan.
 */
const MAX_OFFICIAL_SEQ = 99999;

/**
 * Aturan penomoran NIS resmi per unit (sesuai data Excel yayasan):
 *   KBEC      : YYMM + 6 digit                  -> 2607001805
 *   Calistung : YYMM + 6 digit + "-C"           -> 2507000715-C
 *   Bimbel    : YYMM + 6 digit + "-B"           -> 2502001439-B
 *   Arabin    : YYMM + 6 digit + "-A"           -> (mengikuti pola suffix lama)
 *   TK        : ARBN.YYYY.MM.NNN                -> ARBN.2026.07.228
 */
const NIS_RULES = {
    KBEC: { regex: /^\d{4}(\d{6})$/, build: (p, seq) => `${p.yy}${p.mm}${String(seq).padStart(6, '0')}` },
    Calistung: { regex: /^\d{4}(\d{6})-C$/i, build: (p, seq) => `${p.yy}${p.mm}${String(seq).padStart(6, '0')}-C` },
    Bimbel: { regex: /^\d{4}(\d{6})-B$/i, build: (p, seq) => `${p.yy}${p.mm}${String(seq).padStart(6, '0')}-B` },
    Arabin: { regex: /^\d{4}(\d{6})-A$/i, build: (p, seq) => `${p.yy}${p.mm}${String(seq).padStart(6, '0')}-A` },
    TK: { regex: /^ARBN\.\d{4}\.\d{2}\.(\d{1,})$/i, build: (p, seq) => `ARBN.${p.yyyy}.${p.mm}.${String(seq).padStart(3, '0')}` }
};

/**
 * Menghitung NIS berikutnya untuk sebuah unit berdasarkan daftar NIS yang ada.
 * Fungsi murni (mudah diuji).
 */
function computeNextStudentId(existingIds, unit, now = new Date()) {
    const rule = NIS_RULES[unit] || NIS_RULES.KBEC;
    const wib = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now); // YYYY-MM-DD
    const [yyyy, mm] = wib.split('-');
    const parts = { yyyy, yy: yyyy.slice(-2), mm };

    let maxSeq = 0;
    for (const raw of existingIds || []) {
        const m = rule.regex.exec(String(raw || '').trim());
        if (!m) continue;
        const seq = parseInt(m[1], 10);
        if (!isNaN(seq) && seq <= MAX_OFFICIAL_SEQ && seq > maxSeq) maxSeq = seq;
    }
    return { parts, nextSeq: maxSeq + 1, build: (seq) => rule.build(parts, seq) };
}

/**
 * Generates a unique NIS/Student ID following the official per-unit format.
 * Aman dipakai di dalam transaksi (db boleh berupa koneksi transaksi).
 */
async function generateUniqueStudentId(db, unitCodeOrProgram = 'KBEC') {
    const unit = normalizeUnit(unitCodeOrProgram) || resolveStudentUnit('', unitCodeOrProgram, '');
    const [rows] = await db.query('SELECT id FROM students');
    const ids = (rows || []).map(r => r.id);

    const { nextSeq, build } = computeNextStudentId(ids, unit);
    const taken = new Set(ids.map(i => String(i).toUpperCase()));

    let seq = nextSeq;
    let candidate = build(seq);
    let attempts = 0;
    while (taken.has(candidate.toUpperCase()) && attempts < 50) {
        seq++;
        candidate = build(seq);
        attempts++;
    }
    return candidate;
}

/**
 * Generates a unique User NIS / ID safely.
 * Format: YYMM + 6-digit sequence + Suffix (-SA, -ADM, -TCH)
 */
async function generateUniqueUserId(db, role = 'Admin') {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');

    let suffix = '-ADM';
    const roleLower = (role || '').toLowerCase();
    if (roleLower.includes('super')) {
        suffix = '-SA';
    } else if (roleLower.includes('pengajar') || roleLower.includes('teacher') || roleLower.includes('guru')) {
        suffix = '-TCH';
    } else if (roleLower.includes('staff') || roleLower.includes('staf')) {
        suffix = '-STF';
    }

    let isUnique = false;
    let candidateId = '';
    let attempts = 0;

    while (!isUnique && attempts < 10) {
        const randomNum = String(Math.floor(100000 + Math.random() * 900000));
        candidateId = `${yy}${mm}${randomNum}${suffix}`;
        const [existing] = await db.query('SELECT id FROM users WHERE id = ? OR nis = ?', [candidateId, candidateId]);
        if (existing.length === 0) {
            isUnique = true;
        }
        attempts++;
    }

    return candidateId;
}

/**
 * HTML Escaping helper to prevent XSS injection
 */
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

/**
 * Returns current or given date formatted as YYYY-MM-DD in Western Indonesia Time (WIB / Asia/Jakarta)
 */
function getWIBDate(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
}

/**
 * Returns current or given date formatted as YYYY-MM in Western Indonesia Time (WIB / Asia/Jakarta)
 */
function getWIBMonth(date = new Date()) {
    return getWIBDate(date).slice(0, 7);
}

/**
 * Formats a timestamp into Indonesian human-readable WIB datetime string
 */
function formatWIBTime(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(d);
}

module.exports = {
    UNITS,
    STUDENT_STATUSES,
    normalizeUnit,
    normalizeStudentStatus,
    cleanText,
    matchProgramMaster,
    resolveStudentUnit,
    computeNextStudentId,
    generateUniqueStudentId,
    generateUniqueUserId,
    escapeHTML,
    getWIBDate,
    getWIBMonth,
    formatWIBTime
};
