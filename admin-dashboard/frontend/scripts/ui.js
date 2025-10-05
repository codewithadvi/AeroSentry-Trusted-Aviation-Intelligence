// scripts/ui.js (Corrected)

class UIManager {
    constructor() {
        // Cache all the DOM elements the UI will need to manipulate
        this.elements = {
            departureInput: document.getElementById('departure'),
            destinationInput: document.getElementById('destination'),
            briefButton: document.getElementById('brief-button'),
            chatMessages: document.getElementById('chat-messages'),
            loadingOverlay: document.getElementById('loading-overlay'),
            
            // Stats
            statDistance: document.getElementById('stat-distance'),
            statRisk: document.getElementById('stat-risk'),
            statCeiling: document.getElementById('stat-ceiling'),
            statWind: document.getElementById('stat-wind'),
        };
    }

    // --- State Management ---

    setLoading(isLoading) {
        if (isLoading) {
            this.elements.loadingOverlay.classList.remove('hidden');
            this.elements.briefButton.disabled = true;
            this.elements.briefButton.innerHTML = `
                <div class="flex items-center justify-center">
                    <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Loading...
                </div>`;
        } else {
            this.elements.loadingOverlay.classList.add('hidden');
            this.elements.briefButton.disabled = false;
            this.elements.briefButton.textContent = 'Generate Briefing';
        }
    }

    // --- Display Updates ---

    displayBriefing(textBriefing) {
        this.elements.chatMessages.innerHTML = `<div class="text-left"><pre class="whitespace-pre-wrap">${textBriefing}</pre></div>`;
    }

    displayError(message) {
        this.elements.chatMessages.innerHTML = `<div class="text-red-400 p-2">Error: ${message}</div>`;
    }

    updateStats(briefingData) {
        const risk = briefingData.overall_risk || 'N/A';
        this.elements.statRisk.textContent = risk;
        
        const riskColors = { 
            'VFR': 'text-green-400', 
            'MVFR': 'text-yellow-400', 
            'IFR': 'text-red-400', 
            'LIFR': 'text-purple-400' 
        };
        this.elements.statRisk.className = `text-2xl md:text-3xl font-bold stat-value ${riskColors[risk] || 'text-gray-400'}`;
        
        const depMetar = briefingData.departure_briefing.metar;
        const destMetar = briefingData.destination_briefing.metar;

        const lowestCeiling = Math.min(depMetar?.ceiling_ft || 99999, destMetar?.ceiling_ft || 99999);
        const maxWind = Math.max(depMetar?.wind?.speed_knots || 0, destMetar?.wind?.speed_knots || 0);

        this.elements.statCeiling.textContent = lowestCeiling === 99999 ? 'UNL' : lowestCeiling.toLocaleString();
        this.elements.statWind.textContent = maxWind;
    }
}