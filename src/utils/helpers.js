/**
 * Helpers utility functions for KBEC Admin
 */

/**
 * Resolves the unit (KBEC, Calistung, Bimbel, TK, Arabin) for a student
 * based on student ID suffix, program name, or level.
 * Eliminates false positive matches (e.g. -ADM suffix mistaken for Arabin).
 */
function resolveStudentUnit(studentId = '', program = '', level = '', unit = '') {
    const u = (unit || '').toLowerCase().trim();
    if (u === 'calistung') return 'Calistung';
    if (u === 'bimbel') return 'Bimbel';
    if (u === 'arabin') return 'Arabin';
    if (u === 'tk') return 'TK';
    if (u === 'kbec') return 'KBEC';

    const id = (studentId || '').toUpperCase().trim();
    const prog = (program || '').toLowerCase().trim();
    const lvl = (level || '').toLowerCase().trim();

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
 * Generates a unique NIS/Student ID safely without race conditions.
 * Format: YYMM + 6-digit sequence + Suffix (-C, -B, -A, -TK, or empty for KBEC)
 */
async function generateUniqueStudentId(db, unitCodeOrProgram = 'KBEC') {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');

    let suffix = '';
    const progLower = (unitCodeOrProgram || '').toLowerCase();

    if (progLower.includes('calistung') || progLower.includes('baca')) {
        suffix = '-C';
    } else if (progLower.includes('bimbel') || progLower.includes('bimbingan')) {
        suffix = '-B';
    } else if (progLower.includes('arabin') || progLower.includes('arab') || progLower.includes('beasiswa')) {
        suffix = '-A';
    } else if (progLower.includes('tk') || progLower.includes('preschool')) {
        suffix = '-TK';
    }

    let isUnique = false;
    let candidateId = '';
    let attempts = 0;

    while (!isUnique && attempts < 10) {
        const randomNum = String(Math.floor(100000 + Math.random() * 900000));
        candidateId = `${yy}${mm}${randomNum}${suffix}`;
        const [existing] = await db.query('SELECT id FROM students WHERE id = ?', [candidateId]);
        if (existing.length === 0) {
            isUnique = true;
        }
        attempts++;
    }

    return candidateId;
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
    } else if (roleLower.includes('pengajar') || roleLower.includes('teacher')) {
        suffix = '-TCH';
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

module.exports = {
    resolveStudentUnit,
    generateUniqueStudentId,
    generateUniqueUserId,
    escapeHTML
};
