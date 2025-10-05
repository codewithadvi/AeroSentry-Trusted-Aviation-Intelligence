// scripts/app.js

// Import the API functions we need
import { getMissionBriefing, getMissionBriefingText } from './api.js';

// Global variables for current briefing data
let currentBriefingData = null;
let currentTextBriefing = '';
let mapManager = null;

// --- Authentication Check ---
document.addEventListener('DOMContentLoaded', () => {
    const user = AuthManager.getUser();
    if (!AuthManager.isAuthenticated() || !user) {
        window.location.href = '/';
        return;
    }
    if (user.role !== 'pilot') {
        AuthManager.redirectBasedOnRole();
        return;
    }

    // Personalize the dashboard
    document.getElementById('pilot-name').textContent = ``;
    document.getElementById('logout-btn').addEventListener('click', () => AuthManager.logout());
    
    // Initialize map
    initializeMap();
    
    // Setup event listeners for the dashboard
    setupDashboard();
});

function initializeMap() {
    try {
        mapManager = new MapManager('map-container');
        console.log("2D Map initialized successfully");
        
        // Add a temporary message to confirm map is working
        setTimeout(() => {
            if (mapManager && mapManager.map) {
                console.log("Map instance created successfully");
            }
        }, 1000);
        
    } catch (error) {
        console.error("Failed to initialize map:", error);
        // Show error message on the map container
        document.getElementById('map-container').innerHTML = `
            <div class="map-loading">
                <p>Error loading map. Please refresh the page.</p>
                <p class="text-sm">${error.message}</p>
            </div>
        `;
    }
}

function setupDashboard() {
    const briefButton = document.getElementById('brief-button');
    const downloadButton = document.getElementById('download-report');
    
    briefButton.addEventListener('click', handleBriefingRequest);
    downloadButton.addEventListener('click', handleDownloadReport);
    
    // Add enter key support for inputs
    document.getElementById('departure').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleBriefingRequest();
    });
    
    document.getElementById('destination').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleBriefingRequest();
    });
}

async function handleBriefingRequest() {
    const departureICAO = document.getElementById('departure').value.toUpperCase().trim();
    const destinationICAO = document.getElementById('destination').value.toUpperCase().trim();
    const loadingOverlay = document.getElementById('loading-overlay');
    const chatMessages = document.getElementById('chat-messages');

    if (!departureICAO || !destinationICAO) {
        alert("Please enter both departure and destination ICAO codes.");
        return;
    }

    // Validate ICAO codes (basic validation)
    if (departureICAO.length !== 4 || destinationICAO.length !== 4) {
        alert("Please enter valid 4-character ICAO codes.");
        return;
    }

    loadingOverlay.classList.remove('hidden');
    chatMessages.innerHTML = '';

    try {
        const [briefingData, textData] = await Promise.all([
            getMissionBriefing(departureICAO, destinationICAO),
            getMissionBriefingText(departureICAO, destinationICAO)
        ]);
        
        console.log("Received Briefing Data:", briefingData);
        
        // Store the data for download
        currentBriefingData = briefingData;
        currentTextBriefing = textData.briefing_text;
        
        updateStats(briefingData);
        updateMapWithRoute(briefingData);

        // Display the formatted text briefing
        chatMessages.innerHTML = `<div class="text-left"><pre class="whitespace-pre-wrap text-sm">${textData.briefing_text}</pre></div>`;

    } catch (error) {
        console.error("Briefing Error:", error);
        chatMessages.innerHTML = `<div class="text-red-400 p-2">Error fetching briefing: ${error.message}</div>`;
        currentBriefingData = null;
        currentTextBriefing = '';
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

function updateMapWithRoute(briefingData) {
    if (!mapManager || !briefingData.enroute_briefing) {
        console.warn("Map manager not available or no route data");
        return;
    }

    try {
        const enrouteData = briefingData.enroute_briefing;
        const startCoords = enrouteData.path_data?.start;
        const endCoords = enrouteData.path_data?.end;
        const routePoints = enrouteData.sampled_points;

        console.log("Route data for map:", { startCoords, endCoords, routePoints });
        
        if (startCoords && endCoords && routePoints) {
            mapManager.drawFlightPath(
                { 
                    lat: Array.isArray(startCoords) ? startCoords[0] : startCoords.lat, 
                    lon: Array.isArray(startCoords) ? startCoords[1] : startCoords.lon, 
                    icao: document.getElementById('departure').value.toUpperCase() 
                },
                { 
                    lat: Array.isArray(endCoords) ? endCoords[0] : endCoords.lat, 
                    lon: Array.isArray(endCoords) ? endCoords[1] : endCoords.lon, 
                    icao: document.getElementById('destination').value.toUpperCase() 
                },
                routePoints,
                briefingData
            );
        } else {
            console.warn("Incomplete route data for map display");
        }
    } catch (error) {
        console.error("Error updating map with route:", error);
    }
}

function updateStats(data) {
    const riskEl = document.getElementById('stat-risk');
    const ceilingEl = document.getElementById('stat-ceiling');
    const windEl = document.getElementById('stat-wind');
    const visibilityEl = document.getElementById('stat-visibility');

    const risk = data.overall_risk || 'N/A';
    riskEl.textContent = risk;
    
    // Set color based on risk
    const riskColors = { 
        'VFR': 'text-green-400', 
        'MVFR': 'text-yellow-400', 
        'IFR': 'text-red-400', 
        'LIFR': 'text-purple-400' 
    };
    riskEl.className = `text-2xl md:text-3xl font-bold stat-value ${riskColors[risk] || 'text-gray-400'}`;
    
    // Find lowest ceiling, max wind, and worst visibility between departure and destination
    const depMetar = data.departure_briefing?.metar;
    const destMetar = data.destination_briefing?.metar;

    const lowestCeiling = Math.min(depMetar?.ceiling_ft || 99999, destMetar?.ceiling_ft || 99999);
    const maxWind = Math.max(depMetar?.wind?.speed_knots || 0, destMetar?.wind?.speed_knots || 0);
    const worstVisibility = Math.min(depMetar?.visibility_miles || 99, destMetar?.visibility_miles || 99);

    ceilingEl.textContent = lowestCeiling === 99999 ? 'UNL' : lowestCeiling.toLocaleString();
    windEl.textContent = maxWind;
    visibilityEl.textContent = worstVisibility === 99 ? 'N/A' : worstVisibility.toFixed(1);
}

function handleDownloadReport() {
    if (!currentTextBriefing) {
        alert("Please generate a briefing first before downloading the report.");
        return;
    }

    try {
        // Create a formatted report with additional details
        const reportContent = createFormattedReport();
        
        // Create and download the file
        const blob = new Blob([reportContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AeroSentry_Report_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log("Report downloaded successfully");
    } catch (error) {
        console.error("Error downloading report:", error);
        alert("Error downloading report. Please try again.");
    }
}

function createFormattedReport() {
    const timestamp = new Date().toLocaleString();
    let report = `AEROSENTRY MISSION REPORT\n`;
    report += `Generated: ${timestamp}\n`;
    report += '='.repeat(50) + '\n\n';
    
    if (currentBriefingData) {
        const departure = document.getElementById('departure').value.toUpperCase();
        const destination = document.getElementById('destination').value.toUpperCase();
        
        report += `FLIGHT ROUTE: ${departure} → ${destination}\n\n`;
        report += `OVERALL RISK: ${currentBriefingData.overall_risk || 'N/A'}\n\n`;
    }
    
    report += `WEATHER BRIEFING:\n`;
    report += `${currentTextBriefing}\n\n`;
    
    report += `ADDITIONAL NOTES:\n`;
    report += `- This report is generated for flight planning purposes only.\n`;
    report += `- Always consult official weather sources and ATC before flight.\n`;
    report += `- Weather conditions may change rapidly.\n`;
    
    report += `\nEnd of Report`;
    
    return report;
}

// Export for testing
window.AeroSentryApp = {
    initializeMap,
    updateMapWithRoute,
    handleBriefingRequest
};