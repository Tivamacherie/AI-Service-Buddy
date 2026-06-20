// dashboard.js
// ===============================
// หน้าที่:
//  - จัดการหน้า Dashboard ทั้งหมด
//  - โหลดสถิติและแสดงกราฟ
//  - รีเฟรชข้อมูลอัตโนมัติทุก 30 วินาที
// ===============================

let chartInstances = {};
let refreshIntervalId = null;
const REFRESH_INTERVAL_MS = 30000;
let chartJsLoaded = false;

// ===============================
// State Management
// ===============================

function showLoading() {
    const loading = document.getElementById('dashboard-loading');
    const error = document.getElementById('dashboard-error');
    const content = document.getElementById('dashboard-content');
    if (loading) loading.style.display = 'flex';
    if (error) error.style.display = 'none';
    if (content) content.style.display = 'none';
}

function showError(message) {
    const loading = document.getElementById('dashboard-loading');
    const error = document.getElementById('dashboard-error');
    const content = document.getElementById('dashboard-content');
    if (loading) loading.style.display = 'none';
    if (error) {
        error.style.display = 'flex';
        const p = error.querySelector('p');
        if (p) p.textContent = message;
    }
    if (content) content.style.display = 'none';
}

function showContent() {
    const loading = document.getElementById('dashboard-loading');
    const error = document.getElementById('dashboard-error');
    const content = document.getElementById('dashboard-content');
    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'none';
    if (content) content.style.display = 'flex';
}

// ===============================
// Chart.js Loading
// ===============================

async function loadChartJs() {
    if (chartJsLoaded) return true;
    if (typeof Chart !== 'undefined') {
        chartJsLoaded = true;
        return true;
    }

    try {
        await Promise.race([
            new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
                script.onload = () => {
                    chartJsLoaded = true;
                    resolve();
                };
                script.onerror = () => {
                    reject(new Error('Failed to load Chart.js from CDN'));
                };
                document.head.appendChild(script);
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Chart.js load timeout')), 10000)
            ),
        ]);
        return true;
    } catch (error) {
        console.error('Chart.js load error:', error);
        return false;
    }
}

// ===============================
// Main Dashboard Loader
// ===============================

async function loadDashboard() {
    console.log('[Dashboard] Loading dashboard...');
    showLoading();

    const chartReady = await loadChartJs();
    if (!chartReady) {
        console.warn('[Dashboard] Chart.js not available');
    }

    try {
        await Promise.all([
            loadStats(),
            loadDailyUsageChart(),
            loadDailySearchesChart(),
            loadHourlyUsageChart(),
            loadTopSearchesChart(),
            loadSourceBreakdownChart(),
        ]);
        updateLastUpdatedTime();
        showContent();
        console.log('[Dashboard] All data loaded successfully');
    } catch (error) {
        console.error('[Dashboard] Failed to load dashboard:', error);
        showError('ไม่สามารถโหลดข้อมูลแดชบอร์ดได้');
    }

    const refreshBtn = document.getElementById('refresh-dashboard');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            destroyCharts();
            loadDashboard();
        });
    }

    const retryBtn = document.getElementById('retry-dashboard');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            destroyCharts();
            loadDashboard();
        });
    }

    startAutoRefresh();
}

// ===============================
// Auto Refresh
// ===============================

function startAutoRefresh() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
    }
    refreshIntervalId = setInterval(() => {
        console.log('[Dashboard] Auto-refreshing...');
        destroyCharts();
        loadDashboard();
    }, REFRESH_INTERVAL_MS);
}

function destroyCharts() {
    Object.values(chartInstances).forEach((chart) => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    chartInstances = {};
}

// ===============================
// Stats Loading
// ===============================

async function loadStats() {
    try {
        console.log('[Dashboard] Loading stats...');
        const stats = await getDashboardStats();
        console.log('[Dashboard] Stats received:', stats);

        const totalChatsEl = document.getElementById('stat-total-chats');
        const totalSessionsEl = document.getElementById('stat-total-sessions');
        const totalSearchesEl = document.getElementById('stat-total-searches');
        const uniqueKeywordsEl = document.getElementById('stat-unique-keywords');

        if (totalChatsEl) totalChatsEl.textContent = formatNumber(stats.total_chats || 0);
        if (totalSessionsEl) totalSessionsEl.textContent = formatNumber(stats.total_sessions || 0);
        if (totalSearchesEl) totalSearchesEl.textContent = formatNumber(stats.total_searches || 0);
        if (uniqueKeywordsEl) uniqueKeywordsEl.textContent = formatNumber(stats.unique_keywords || 0);
    } catch (error) {
        console.error('[Dashboard] Failed to load stats:', error);
    }
}

// ===============================
// Chart Loading Functions
// ===============================

async function loadDailyUsageChart() {
    try {
        console.log('[Dashboard] Loading daily usage...');
        const result = await getDailyUsage(7);
        console.log('[Dashboard] Daily usage received:', result);
        const labels = result.data.map((item) => item.day);
        const values = result.data.map((item) => item.count);

        if (labels.length === 0) {
            renderEmptyChart('dailyUsageChart', 'ยังไม่มีข้อมูลการใช้งาน');
            return;
        }

        if (typeof Chart === 'undefined') {
            renderEmptyChart('dailyUsageChart', 'ไม่สามารถแสดงกราฟได้');
            return;
        }
        renderLineChart('dailyUsageChart', labels, values, 'จำนวนการสนทนา', '#A52A1D');
    } catch (error) {
        console.error('[Dashboard] Failed to load daily usage chart:', error);
        renderEmptyChart('dailyUsageChart', 'ไม่สามารถโหลดข้อมูลได้');
    }
}

async function loadDailySearchesChart() {
    try {
        console.log('[Dashboard] Loading daily searches...');
        const result = await getDailySearches(7);
        console.log('[Dashboard] Daily searches received:', result);
        const labels = result.data.map((item) => item.day);
        const values = result.data.map((item) => item.count);

        if (labels.length === 0) {
            renderEmptyChart('dailySearchesChart', 'ยังไม่มีข้อมูลการค้นหา');
            return;
        }

        if (typeof Chart === 'undefined') {
            renderEmptyChart('dailySearchesChart', 'ไม่สามารถแสดงกราฟได้');
            return;
        }
        renderBarChart('dailySearchesChart', labels, values, 'จำนวนการค้นหา', '#A52A1D');
    } catch (error) {
        console.error('[Dashboard] Failed to load daily searches chart:', error);
        renderEmptyChart('dailySearchesChart', 'ไม่สามารถโหลดข้อมูลได้');
    }
}

async function loadHourlyUsageChart() {
    try {
        console.log('[Dashboard] Loading hourly usage...');
        const result = await getHourlyUsage(7);
        console.log('[Dashboard] Hourly usage received:', result);
        const labels = result.data.map((item) => `${item.hour}:00`);
        const values = result.data.map((item) => item.count);

        if (labels.length === 0) {
            renderEmptyChart('hourlyUsageChart', 'ยังไม่มีข้อมูลการใช้งาน');
            return;
        }

        if (typeof Chart === 'undefined') {
            renderEmptyChart('hourlyUsageChart', 'ไม่สามารถแสดงกราฟได้');
            return;
        }
        renderLineChart('hourlyUsageChart', labels, values, 'จำนวนการสนทนา', '#A52A1D');
    } catch (error) {
        console.error('[Dashboard] Failed to load hourly usage chart:', error);
        renderEmptyChart('hourlyUsageChart', 'ไม่สามารถโหลดข้อมูลได้');
    }
}

async function loadTopSearchesChart() {
    try {
        console.log('[Dashboard] Loading top searches...');
        const result = await getDashboardTopSearches(5);
        console.log('[Dashboard] Top searches received:', result);
        const labels = result.items.map((item) => item.keyword || item.question || '');
        const values = result.items.map((item) => item.count || 0);

        if (labels.length === 0) {
            renderEmptyChart('topSearchesChart', 'ยังไม่มีข้อมูลการค้นหา');
            return;
        }

        if (typeof Chart === 'undefined') {
            renderEmptyChart('topSearchesChart', 'ไม่สามารถแสดงกราฟได้');
            return;
        }
        renderHorizontalBarChart('topSearchesChart', labels, values, 'จำนวนการค้นหา', '#A52A1D');
    } catch (error) {
        console.error('[Dashboard] Failed to load top searches chart:', error);
        renderEmptyChart('topSearchesChart', 'ไม่สามารถโหลดข้อมูลได้');
    }
}

async function loadSourceBreakdownChart() {
    try {
        console.log('[Dashboard] Loading answer sources...');
        const sources = await getDashboardAnswerSources();
        console.log('[Dashboard] Answer sources received:', sources);

        const labels = Object.keys(sources);
        const values = Object.values(sources);

        if (labels.length === 0) {
            renderEmptyChart('sourceBreakdownChart', 'ยังไม่มีข้อมูลแหล่งที่มา');
            return;
        }

        if (typeof Chart === 'undefined') {
            renderEmptyChart('sourceBreakdownChart', 'ไม่สามารถแสดงกราฟได้');
            return;
        }
        renderDoughnutChart('sourceBreakdownChart', labels, values);
    } catch (error) {
        console.error('[Dashboard] Failed to load source breakdown chart:', error);
        renderEmptyChart('sourceBreakdownChart', 'ไม่สามารถโหลดข้อมูลได้');
    }
}

// ===============================
// Chart Rendering Functions
// ===============================

function renderEmptyChart(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }

    if (typeof Chart === 'undefined') {
        canvas.parentElement.innerHTML = `<p style="color:#999;text-align:center;padding:20px;">${message}</p>`;
        return;
    }

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: [message],
            datasets: [
                {
                    label: message,
                    data: [0],
                    backgroundColor: '#e5e7eb',
                    borderColor: '#d1d5db',
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                    },
                },
            },
        },
    });
}

function renderBarChart(canvasId, labels, values, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (typeof Chart === 'undefined') {
        renderEmptyChart(canvasId, 'ไม่สามารถแสดงกราฟได้');
        return;
    }

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label,
                    data: values,
                    backgroundColor: labels.map(() => hexToRgba(color, 0.7)),
                    borderColor: labels.map(() => color),
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                    },
                },
            },
        },
    });
}

function renderLineChart(canvasId, labels, values, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (typeof Chart === 'undefined') {
        renderEmptyChart(canvasId, 'ไม่สามารถแสดงกราฟได้');
        return;
    }

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label,
                    data: values,
                    borderColor: color,
                    backgroundColor: hexToRgba(color, 0.1),
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: color,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                    },
                },
            },
        },
    });
}

function renderHorizontalBarChart(canvasId, labels, values, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (typeof Chart === 'undefined') {
        renderEmptyChart(canvasId, 'ไม่สามารถแสดงกราฟได้');
        return;
    }

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label,
                    data: values,
                    backgroundColor: labels.map(() => hexToRgba(color, 0.7)),
                    borderColor: labels.map(() => color),
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                    },
                },
            },
        },
    });
}

function renderDoughnutChart(canvasId, labels, values) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (typeof Chart === 'undefined') {
        renderEmptyChart(canvasId, 'ไม่สามารถแสดงกราฟได้');
        return;
    }

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const colors = [
        '#A52A1D',
        '#3b82f6',
        '#10b981',
        '#f59e0b',
        '#ef4444',
        '#8b5cf6',
        '#ec4899',
        '#14b8a6',
        '#f97316',
        '#6366f1',
    ];

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [
                {
                    data: values,
                    backgroundColor: labels.map((_, index) => colors[index % colors.length]),
                    borderWidth: 2,
                    borderColor: '#ffffff',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                },
            },
        },
    });
}

// ===============================
// Utility Functions
// ===============================

function formatNumber(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('th-TH');
}

function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateLastUpdatedTime() {
    const el = document.getElementById('last-updated');
    if (!el) return;
    const now = new Date();
    const time = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.textContent = `อัปเดตล่าสุด: ${time}`;
}

// ===============================
// Initialize Dashboard
// ===============================

document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
});
