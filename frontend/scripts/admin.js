// frontend/scripts/admin.js

import { getAdminAnalytics } from './api.js';

// --- Authentication Check ---
document.addEventListener('DOMContentLoaded', () => {
    const user = AuthManager.getUser();
    if (!AuthManager.isAuthenticated() || !user) {
        window.location.href = '/'; // Redirect if not logged in
        return;
    }
    if (user.role !== 'admin') {
        // If a pilot is somehow on this page, redirect them
        AuthManager.redirectBasedOnRole();
        return;
    }

    // Setup the dashboard
    document.getElementById('admin-name').textContent = `Welcome, ${user.full_name}`;
    document.getElementById('logout-btn').addEventListener('click', () => AuthManager.logout());

    loadDashboardData();
});

async function loadDashboardData() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.remove('hidden');

    try {
        const analytics = await getAdminAnalytics();
        console.log("Admin Analytics:", analytics);
        
        populateStats(analytics);
        renderCharts(); // Using mock data for now

    } catch (error) {
        console.error("Failed to load admin data:", error);
        document.getElementById('stats-overview').innerHTML = `<p class="text-red-400 col-span-4">${error.message}</p>`;
    } finally {
        // Use a small delay to make the loading feel smoother
        setTimeout(() => loadingOverlay.classList.add('hidden'), 500);
    }
}

function populateStats(data) {
    const container = document.getElementById('stats-overview');
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon bg-blue-500/20 text-blue-400">📈</div>
            <div>
                <p class="stat-label">Briefings Today</p>
                <p class="stat-value">${data.total_briefings_today}</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon bg-yellow-500/20 text-yellow-400">🔄</div>
            <div>
                <p class="stat-label">Reroutes Suggested</p>
                <p class="stat-value">${data.reroutes_suggested}</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon bg-green-500/20 text-green-400">✈️</div>
            <div>
                <p class="stat-label">Most Frequent Airport</p>
                <p class="stat-value">${data.most_frequent_airport}</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon bg-purple-500/20 text-purple-400">👤</div>
            <div>
                <p class="stat-label">Welcome Admin</p>
                <p class="stat-value">${data.message.split(', ')[1].replace('!','')}</p>
            </div>
        </div>
    `;
}

function renderCharts() {
    // Mock data for charts
    const apiChartCtx = document.getElementById('api-chart').getContext('2d');
    new Chart(apiChartCtx, {
        type: 'line',
        data: {
            labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
            datasets: [{
                label: 'API Calls',
                data: [120, 150, 130, 180, 160, 200, 190],
                borderColor: 'rgba(59, 130, 246, 0.8)',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const riskChartCtx = document.getElementById('risk-chart').getContext('2d');
    new Chart(riskChartCtx, {
        type: 'doughnut',
        data: {
            labels: ['VFR', 'MVFR', 'IFR', 'LIFR'],
            datasets: [{
                label: 'Risk Distribution',
                data: [300, 150, 75, 20],
                backgroundColor: ['#22C55E', '#FACC15', '#EF4444', '#A855F7'],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}