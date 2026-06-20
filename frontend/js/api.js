// api.js
// ===============================
// หน้าที่:
//  - เรียก Backend API ทั้งหมด
// ===============================

const REQUEST_TIMEOUT_MS = 12000;

function buildApiCandidates() {
    const candidates = [];
    const origin = window.location.origin;

    if (origin && origin !== 'null') {
        candidates.push(`${origin}/ask`);
    }

    candidates.push('/ask');
    candidates.push('http://127.0.0.1:8000/ask');
    candidates.push('http://localhost:8000/ask');

    return [...new Set(candidates)];
}

const API_URL_CANDIDATES = buildApiCandidates();

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

async function askAI(question, sessionId) {
    for (const url of API_URL_CANDIDATES) {
        try {
            const response = await fetchWithTimeout(
                url,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        question,
                        session_id: sessionId
                    })
                },
                REQUEST_TIMEOUT_MS
            );

            if (!response.ok) continue;
            return await response.json();
        } catch (_) {}
    }

    throw new Error('Unable to reach backend API');
}

async function getTopSearches() {
    for (const url of API_URL_CANDIDATES) {
        try {
            const response = await fetchWithTimeout(
                url.replace(/\/ask$/, '/top-searches'),
                {},
                REQUEST_TIMEOUT_MS
            );

            if (!response.ok) continue;
            return await response.json();
        } catch (_) {}
    }

    throw new Error('Unable to load top searches');
}

async function getHistory(sessionId) {
    for (const url of API_URL_CANDIDATES) {
        try {
            const response = await fetchWithTimeout(
                url.replace(/\/ask$/, `/history/${encodeURIComponent(sessionId)}`),
                {},
                REQUEST_TIMEOUT_MS
            );

            if (!response.ok) continue;
            return await response.json();
        } catch (_) {}
    }

    throw new Error('Unable to load history');
}

async function getDashboardStats() {
    for (const url of API_URL_CANDIDATES) {
        try {
            const response = await fetchWithTimeout(
                url.replace(/\/ask$/, '/dashboard/stats'),
                {},
                REQUEST_TIMEOUT_MS
            );

            if (!response.ok) continue;
            return await response.json();
        } catch (_) {}
    }

    throw new Error('Unable to load dashboard stats');
}

async function getDailyUsage(days = 7) {
    for (const url of API_URL_CANDIDATES) {
        try {
            const response = await fetchWithTimeout(
                `${url.replace(/\/ask$/, '/dashboard/daily-usage')}?days=${encodeURIComponent(days)}`,
                {},
                REQUEST_TIMEOUT_MS
            );

            if (!response.ok) continue;
            return await response.json();
        } catch (_) {}
    }

    throw new Error('Unable to load daily usage');
}

async function getDailySearches(days = 7) {
    for (const url of API_URL_CANDIDATES) {
        try {
            const response = await fetchWithTimeout(
                `${url.replace(/\/ask$/, '/dashboard/daily-searches')}?days=${encodeURIComponent(days)}`,
                {},
                REQUEST_TIMEOUT_MS
            );

            if (!response.ok) continue;
            return await response.json();
        } catch (_) {}
    }

    throw new Error('Unable to load daily searches');
}

async function getHourlyUsage(days = 7) {
    for (const url of API_URL_CANDIDATES) {
        try {
            const response = await fetchWithTimeout(
                `${url.replace(/\/ask$/, '/dashboard/hourly-usage')}?days=${encodeURIComponent(days)}`,
                {},
                REQUEST_TIMEOUT_MS
            );

            if (!response.ok) continue;
            return await response.json();
        } catch (_) {}
    }

    throw new Error('Unable to load hourly usage');
}

async function getDashboardTopSearches(limit = 5) {
    for (const url of API_URL_CANDIDATES) {
        try {
            const response = await fetchWithTimeout(
                `${url.replace(/\/ask$/, '/dashboard/top-searches')}?limit=${encodeURIComponent(limit)}`,
                {},
                REQUEST_TIMEOUT_MS
            );

            if (!response.ok) continue;
            return await response.json();
        } catch (_) {}
    }

    throw new Error('Unable to load top searches');
}

async function getDashboardAnswerSources() {
    for (const url of API_URL_CANDIDATES) {
        try {
            const response = await fetchWithTimeout(
                `${url.replace(/\/ask$/, '/dashboard/answer-sources')}`,
                {},
                REQUEST_TIMEOUT_MS
            );

            if (!response.ok) continue;
            return await response.json();
        } catch (_) {}
    }

    throw new Error('Unable to load answer sources');
}