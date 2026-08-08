/**
 * Rekap Siswa & Kehadiran JavaScript Engine
 * KBEC Management System
 */

const API_BASE = window.location.origin;

let rawClassDetails = [];
let donutChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    // Set default filter-bulan ke bulan saat ini (YYYY-MM)
    const filterBulan = document.getElementById('filter-bulan');
    if (filterBulan && !filterBulan.value) {
        filterBulan.value = new Date().toISOString().slice(0, 7);
    }

    loadRecapData();
});

async function loadRecapData() {
    const bulanVal = document.getElementById('filter-bulan').value || new Date().toISOString().slice(0, 7);
    const mingguVal = document.getElementById('filter-minggu').value || '1';
    const unitVal = document.getElementById('filter-unit') ? document.getElementById('filter-unit').value : 'Semua';

    // Update Label Minggu Detail & Badge Chart
    const labelMinggu = document.getElementById('label-minggu-detail');
    const badgeWeek = document.getElementById('chart-week-badge');
    const weekRomanMap = { '1': 'Minggu I', '2': 'Minggu II', '3': 'Minggu III', '4': 'Minggu IV' };
    const romanStr = weekRomanMap[mingguVal] || 'Minggu I';

    if (labelMinggu) labelMinggu.innerText = romanStr;
    if (badgeWeek) badgeWeek.innerText = romanStr;

    try {
        const res = await fetch(`${API_BASE}/api/reports/attendance-recap?bulan=${bulanVal}&minggu=${mingguVal}&unit=${encodeURIComponent(unitVal)}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Gagal memuat data rekap');

        // 1. Render Summary Cards
        renderSummaryCards(data.summary);

        // 2. Render Table Rekap Unit
        renderUnitRecapTable(data.unit_recap);

        // 3. Render Donut Chart
        renderDonutChart(data.chart_data);

        // 4. Render Table Detail per Kelas & Guru
        rawClassDetails = data.class_details || [];
        renderClassDetailsTable(rawClassDetails);

        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error('Error loading attendance recap:', err);
    }
}

function renderSummaryCards(summary = {}) {
    document.getElementById('stat-total-siswa').innerText = (summary.total_siswa || 0).toLocaleString('id-ID');
    document.getElementById('stat-total-kehadiran').innerText = (summary.total_kehadiran || 0).toLocaleString('id-ID');
    document.getElementById('stat-avg-persentase').innerText = `${summary.avg_persentase || 0}%`;
    document.getElementById('stat-total-tidak-hadir').innerText = (summary.total_tidak_hadir || 0).toLocaleString('id-ID');
}

function renderUnitRecapTable(unitRecap = []) {
    const tbody = document.getElementById('unit-recap-tbody');
    if (!tbody) return;

    if (unitRecap.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400 font-medium">Belum ada data rekap unit.</td></tr>`;
        return;
    }

    let grandSiswa = 0;
    let grandM1 = 0, grandM2 = 0, grandM3 = 0, grandM4 = 0, grandTotal = 0;

    let html = unitRecap.map(item => {
        grandSiswa += item.total_siswa || 0;
        grandM1 += item.m1 || 0;
        grandM2 += item.m2 || 0;
        grandM3 += item.m3 || 0;
        grandM4 += item.m4 || 0;
        grandTotal += item.total_keseluruhan || 0;

        return `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3 px-3 font-bold text-slate-900 flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-[#0A58CA]"></span>
                    ${item.unit}
                </td>
                <td class="py-3 px-3 text-center font-bold text-slate-800">${item.total_siswa}</td>
                <td class="py-3 px-3 text-center text-slate-600">${item.m1}</td>
                <td class="py-3 px-3 text-center text-slate-600">${item.m2}</td>
                <td class="py-3 px-3 text-center text-slate-600">${item.m3}</td>
                <td class="py-3 px-3 text-center text-slate-600">${item.m4}</td>
                <td class="py-3 px-3 text-right font-extrabold text-[#0A58CA]">${item.total_keseluruhan}</td>
            </tr>
        `;
    }).join('');

    // Total Row
    html += `
        <tr class="bg-slate-50 font-extrabold text-slate-900 border-t-2 border-slate-200">
            <td class="py-3.5 px-3">TOTAL KESELURUHAN</td>
            <td class="py-3.5 px-3 text-center text-[#0A58CA]">${grandSiswa}</td>
            <td class="py-3.5 px-3 text-center">${grandM1}</td>
            <td class="py-3.5 px-3 text-center">${grandM2}</td>
            <td class="py-3.5 px-3 text-center">${grandM3}</td>
            <td class="py-3.5 px-3 text-center">${grandM4}</td>
            <td class="py-3.5 px-3 text-right text-emerald-600">${grandTotal}</td>
        </tr>
    `;

    tbody.innerHTML = html;
}

function renderDonutChart(chartData = {}) {
    const hadir = (chartData.hadir && chartData.hadir.percentage) || 0;
    const ijin = (chartData.ijin && chartData.ijin.percentage) || 0;
    const alfa = (chartData.alfa && chartData.alfa.percentage) || 0;
    const sakit = (chartData.sakit && chartData.sakit.percentage) || 0;

    document.getElementById('legend-hadir').innerText = `${hadir}% (${chartData.hadir ? chartData.hadir.count : 0})`;
    document.getElementById('legend-ijin').innerText = `${ijin}% (${chartData.ijin ? chartData.ijin.count : 0})`;
    document.getElementById('legend-alfa').innerText = `${alfa}% (${chartData.alfa ? chartData.alfa.count : 0})`;
    document.getElementById('legend-sakit').innerText = `${sakit}% (${chartData.sakit ? chartData.sakit.count : 0})`;

    const chartEl = document.getElementById('attendance-donut-chart');
    if (!chartEl) return;

    if (donutChartInstance) {
        donutChartInstance.destroy();
    }

    const options = {
        series: [hadir, ijin, alfa, sakit],
        labels: ['Hadir', 'Ijin', 'Alfa', 'Sakit'],
        chart: {
            type: 'donut',
            height: 230
        },
        colors: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'],
        dataLabels: {
            enabled: false
        },
        legend: {
            show: false
        },
        tooltip: {
            y: {
                formatter: function (val) {
                    return val + '%';
                }
            }
        },
        plotOptions: {
            pie: {
                donut: {
                    size: '72%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Kehadiran',
                            formatter: function () {
                                return hadir + '%';
                            }
                        }
                    }
                }
            }
        }
    };

    if (window.ApexCharts) {
        donutChartInstance = new ApexCharts(chartEl, options);
        donutChartInstance.render();
    } else {
        chartEl.innerHTML = `<div class="text-xs text-slate-400 font-semibold text-center py-8">Grafik tidak dapat dimuat (CDN Off).</div>`;
    }
}

function renderClassDetailsTable(classes = []) {
    const tbody = document.getElementById('class-details-tbody');
    if (!tbody) return;

    if (classes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400 font-medium">Tidak ada data kelas kursus terdaftar.</td></tr>`;
        return;
    }

    const html = classes.map((c, idx) => {
        const pct = c.persentase || 0;
        let barColor = 'bg-emerald-500';
        let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (pct < 50) {
            barColor = 'bg-rose-500';
            badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
        } else if (pct < 75) {
            barColor = 'bg-amber-500';
            badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
        }

        return `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3.5 px-4 font-bold text-slate-400">${idx + 1}</td>
                <td class="py-3.5 px-4">
                    <div class="font-extrabold text-slate-900">${c.nama_kelas}</div>
                    <div class="text-[10px] text-slate-400 font-semibold">${c.program || 'KBEC'}</div>
                </td>
                <td class="py-3.5 px-4 font-extrabold text-[#0A58CA] flex items-center gap-2">
                    <i data-lucide="user-check" class="w-3.5 h-3.5 text-blue-500"></i>
                    ${c.nama_guru}
                </td>
                <td class="py-3.5 px-4 text-slate-600 font-bold">${c.unit}</td>
                <td class="py-3.5 px-4 text-center font-bold text-emerald-600 bg-emerald-50/30">${c.total_hadir}</td>
                <td class="py-3.5 px-4 text-center text-blue-600">${c.total_ijin}</td>
                <td class="py-3.5 px-4 text-center text-amber-600">${c.total_alfa}</td>
                <td class="py-3.5 px-4 text-center text-rose-600">${c.total_sakit}</td>
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-3">
                        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div class="${barColor} h-2 rounded-full transition-all duration-500" style="width: ${Math.min(pct, 100)}%"></div>
                        </div>
                        <span class="text-[11px] font-extrabold px-2 py-0.5 rounded-md border ${badgeColor}">${pct}%</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html;
}

function filterClassTable() {
    const term = (document.getElementById('search-kelas').value || '').toLowerCase().trim();
    if (!term) {
        renderClassDetailsTable(rawClassDetails);
        return;
    }

    const filtered = rawClassDetails.filter(c =>
        (c.nama_kelas && c.nama_kelas.toLowerCase().includes(term)) ||
        (c.nama_guru && c.nama_guru.toLowerCase().includes(term)) ||
        (c.unit && c.unit.toLowerCase().includes(term)) ||
        (c.program && c.program.toLowerCase().includes(term))
    );

    renderClassDetailsTable(filtered);
}

function exportClassDetailsCSV() {
    if (rawClassDetails.length === 0) {
        alert('Tidak ada data untuk diexport.');
        return;
    }

    const mingguVal = document.getElementById('filter-minggu').value || '1';
    const bulanVal = document.getElementById('filter-bulan').value || '';

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += `No,Nama Kelas,Nama Guru Pengajar,Unit / Program,Total Hadir,Total Ijin,Total Alfa,Total Sakit,Persentase Kehadiran Kelas (%)\n`;

    rawClassDetails.forEach((c, idx) => {
        csvContent += `${idx + 1},"${c.nama_kelas}","${c.nama_guru}","${c.unit}",${c.total_hadir},${c.total_ijin},${c.total_alfa},${c.total_sakit},${c.persentase}%\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap_kehadiran_kelas_minggu_${mingguVal}_${bulanVal}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
