// frontend/scripts/api.js

const API_BASE_URL = 'http://127.0.0.1:8000';

async function fetchWithAuth(url, options = {}) {
    const token = AuthManager.getToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        AuthManager.logout(); // Token is invalid or expired
        throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `API request failed with status ${response.status}`);
    }

    return response.json();
}

// Export functions for different parts of your app to use
export async function getMissionBriefing(departure, destination) {
    const url = `${API_BASE_URL}/mission-briefing?departure=${departure}&destination=${destination}`;
    return fetchWithAuth(url);
}

export async function getMissionBriefingText(departure, destination) {
    const url = `${API_BASE_URL}/mission-briefing/text?departure=${departure}&destination=${destination}`;
    return fetchWithAuth(url);
}

export async function getAdminAnalytics() {
    const url = `${API_BASE_URL}/admin/analytics`;
    return fetchWithAuth(url);
}