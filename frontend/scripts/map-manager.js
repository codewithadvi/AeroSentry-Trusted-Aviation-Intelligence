// scripts/map-manager.js
class MapManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.map = null;
        this.markers = {};
        this.flightPath = null;
        this.weatherStations = [];
        this.spoofingDetector = new SpoofingDetector();
        this.currentViewMode = 'realtime'; // 'realtime' or 'spoofing'
        this.spoofingData = null;
        
        this.initializeMap();
    }

    initializeMap() {
        try {
            if (!this.container) {
                throw new Error('Map container not found');
            }
            
            this.map = L.map(this.container, {
                zoomControl: true,
                attributionControl: true
            }).setView([20, 0], 2);

            // Dark theme base layer
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '©OpenStreetMap, ©CartoDB',
                maxZoom: 18,
                subdomains: 'abcd'
            }).addTo(this.map);

            this.weatherLayer = L.layerGroup().addTo(this.map);
            this.spoofingLayer = L.layerGroup();

            this.setupEventListeners();
            this.updateViewModeIndicator();
            console.log("Map initialized successfully");
            
        } catch (error) {
            console.error("Map initialization failed:", error);
            this.showMapError(error.message);
        }
    }

    setupEventListeners() {
        document.getElementById('toggle-spoofing-view').addEventListener('click', () => this.toggleViewMode());
        document.getElementById('close-alert').addEventListener('click', () => this.hideSpoofingAlert());
    }

    async drawFlightPath(departure, destination, routePoints, weatherData) {
        this.clearMap();

        try {
            const depCoords = [departure.lat, departure.lon];
            const destCoords = [destination.lat, destination.lon];
            const routeLatLngs = routePoints.map(p => [p.lat, p.lon]);

            // Draw flight path
            this.flightPath = L.polyline(routeLatLngs, {
                color: '#00ffff',
                weight: 4,
                opacity: 0.8,
                dashArray: '5, 5'
            }).addTo(this.map);

            // Add airports
            this.addAirportMarker(depCoords, departure.icao, 'departure');
            this.addAirportMarker(destCoords, destination.icao, 'destination');

            // Add weather stations
            await this.addWeatherStations(routeLatLngs);

            this.map.fitBounds(this.flightPath.getBounds(), { padding: [20, 20] });
            
        } catch (error) {
            console.error("Error drawing flight path:", error);
        }
    }

    addAirportMarker(coords, icao, type) {
        const icon = L.divIcon({
            className: `airport-marker ${type}-marker`,
            html: `
                <div class="flex flex-col items-center">
                    <div class="text-2xl">${type === 'departure' ? '🛫' : '🛬'}</div>
                    <span class="text-white font-bold bg-black bg-opacity-50 px-1 rounded text-xs">${icao}</span>
                </div>
            `,
            iconSize: [50, 40],
            iconAnchor: [25, 20]
        });

        this.markers[icao] = L.marker(coords, { icon })
            .addTo(this.map)
            .bindPopup(`
                <div class="p-2 bg-gray-900 text-white rounded">
                    <strong class="text-cyan-400">${type.toUpperCase()} AIRPORT</strong><br>
                    <strong>${icao}</strong>
                </div>
            `);
    }

    async addWeatherStations(routePoints) {
        const samplePoints = this.sampleRoutePoints(routePoints, 6);
        this.spoofingData = [];
        
        for (let i = 0; i < samplePoints.length; i++) {
            const point = samplePoints[i];
            
            // Get real weather data
            const realTimeData = await this.fetchRealWeatherData(point);
            
            // Generate spoofed data for this station
            const spoofType = this.getSpoofTypeForStation(i, samplePoints.length);
            const syntheticData = this.spoofingDetector.generateSpoofedData(realTimeData, spoofType);
            
            // Detect spoofing
            const spoofingResult = this.spoofingDetector.detectSpoofing(realTimeData, syntheticData);
            
            // Store data for both views
            this.spoofingData.push({
                point,
                realTimeData,
                syntheticData,
                spoofingResult,
                stationId: i
            });
            
            // Add weather station marker (always show real-time data first)
            this.addWeatherMarker(point, realTimeData, spoofingResult, i, false);
        }
    }

    addWeatherMarker(coords, weatherData, spoofingResult, stationId, showSpoofing = false) {
        const isSpoofed = spoofingResult.isSpoofed;
        const displayData = showSpoofing && isSpoofed ? 
            this.spoofingData.find(d => d.stationId === stationId)?.syntheticData : weatherData;

        const icon = L.divIcon({
            className: `weather-marker ${isSpoofed ? 'spoofed-marker' : 'normal-marker'} ${showSpoofing && isSpoofed ? 'showing-spoofed' : ''}`,
            html: `
                <div class="weather-station ${isSpoofed ? 'spoofed' : 'normal'} relative group">
                    ${this.getWeatherIcon(displayData.flightCategory)}
                    ${isSpoofed ? '<div class="spoofing-indicator"></div>' : ''}
                    <div class="weather-tooltip group-hover:block">
                        <strong>Station ${stationId + 1}</strong><br>
                        ${showSpoofing && isSpoofed ? '🔴 SPOOFED: ' : '🟢 REAL: '}${displayData.flightCategory}<br>
                        ${isSpoofed ? 'Click for analysis' : 'Authentic data'}
                    </div>
                    ${showSpoofing && isSpoofed ? '<div class="spoofing-badge">⚠️</div>' : ''}
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        const marker = L.marker(coords, { icon }).addTo(this.weatherLayer);
        
        const popupContent = this.createWeatherPopup(weatherData, spoofingResult, stationId, showSpoofing);
        marker.bindPopup(popupContent, { maxWidth: 400 });

        this.weatherStations.push(marker);

        // Show alert only in real-time view when spoofing is detected
        if (isSpoofed && !showSpoofing) {
            this.showSpoofingAlert(spoofingResult, stationId);
        }

        // Add spoofing visualization if showing spoofing view
        if (showSpoofing && isSpoofed) {
            this.addSpoofingVisualization(coords, spoofingResult);
        }
    }

    createWeatherPopup(realData, spoofingResult, stationId, showSpoofing = false) {
        const stationData = this.spoofingData.find(d => d.stationId === stationId);
        const syntheticData = stationData?.syntheticData;
        const isSpoofed = spoofingResult.isSpoofed;

        const displayData = showSpoofing && isSpoofed ? syntheticData : realData;
        const viewType = showSpoofing && isSpoofed ? 'Spoofed Data' : 'Real-time Data';

        return `
            <div class="weather-popup bg-gray-900 text-white p-4 rounded-lg max-w-sm">
                <h4 class="font-bold text-lg mb-3 ${showSpoofing && isSpoofed ? 'text-red-400' : 'text-cyan-400'}">
                    ${viewType} - Station ${stationId + 1}
                </h4>
                
                <div class="weather-parameters space-y-2 text-sm">
                    <div class="grid grid-cols-2 gap-2">
                        <span class="text-gray-400">Flight Category:</span>
                        <span class="font-bold">${displayData.flightCategory}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <span class="text-gray-400">Visibility:</span>
                        <span>${displayData.visibility} mi</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <span class="text-gray-400">Ceiling:</span>
                        <span>${displayData.ceiling} ft</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <span class="text-gray-400">Temperature:</span>
                        <span>${displayData.temperature}°C</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <span class="text-gray-400">Wind:</span>
                        <span>${displayData.wind.speed} kt / ${displayData.wind.direction}°</span>
                    </div>
                </div>
                
                ${isSpoofed ? `
                    <div class="mt-3 p-2 rounded border-l-4 ${showSpoofing ? 'bg-yellow-900 border-yellow-500' : 'bg-red-900 border-red-500'}">
                        <div class="font-bold ${showSpoofing ? 'text-yellow-300' : 'text-red-300'}">
                            ${showSpoofing ? '⚠️ Showing Spoofed Data' : '🚨 Spoofing Detected'}
                        </div>
                        ${!showSpoofing ? `
                            <div class="text-xs mt-1 text-red-200">
                                ${spoofingResult.indicators.slice(0, 2).map(ind => `<div>• ${ind}</div>`).join('')}
                            </div>
                            <button onclick="mapManager.toggleViewMode()" class="mt-2 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs">
                                Show Spoofing Analysis
                            </button>
                        ` : `
                            <div class="text-xs mt-1 text-yellow-200">
                                This data has been manipulated to show better conditions
                            </div>
                        `}
                    </div>
                ` : `
                    <div class="mt-3 p-2 bg-green-900 border border-green-500 rounded text-green-300 text-center text-xs">
                        ✅ Authentic weather data
                    </div>
                `}
            </div>
        `;
    }

    toggleViewMode() {
        this.currentViewMode = this.currentViewMode === 'realtime' ? 'spoofing' : 'realtime';
        this.updateWeatherStationsView();
        this.updateViewModeIndicator();
        this.updateToggleButton();
    }

    updateWeatherStationsView() {
        // Clear existing weather stations
        this.weatherLayer.clearLayers();
        this.spoofingLayer.clearLayers();
        this.weatherStations = [];

        // Re-add stations with appropriate view
        this.spoofingData.forEach(data => {
            this.addWeatherMarker(
                data.point, 
                data.realTimeData, 
                data.spoofingResult, 
                data.stationId, 
                this.currentViewMode === 'spoofing'
            );
        });

        // Hide alert when switching to spoofing view
        if (this.currentViewMode === 'spoofing') {
            this.hideSpoofingAlert();
        }
    }

    updateViewModeIndicator() {
        const indicator = document.getElementById('view-mode-indicator');
        if (this.currentViewMode === 'realtime') {
            indicator.innerHTML = '📡 Real-time Data View';
            indicator.className = indicator.className.replace('bg-yellow-600', 'bg-gray-900') + ' bg-gray-900/80';
        } else {
            indicator.innerHTML = '⚠️ Spoofing Analysis View';
            indicator.className = indicator.className.replace('bg-gray-900', 'bg-yellow-600') + ' bg-yellow-600/80';
        }
    }

    updateToggleButton() {
        const button = document.getElementById('toggle-spoofing-view');
        const icon = document.getElementById('spoofing-icon');
        const text = document.getElementById('spoofing-text');

        if (this.currentViewMode === 'realtime') {
            icon.textContent = '🔍';
            text.textContent = 'Show Spoofing Analysis';
            button.className = button.className.replace('bg-yellow-600', 'bg-blue-600') + ' bg-blue-600 hover:bg-blue-700';
        } else {
            icon.textContent = '📡';
            text.textContent = 'Show Real-time Data';
            button.className = button.className.replace('bg-blue-600', 'bg-yellow-600') + ' bg-yellow-600 hover:bg-yellow-700';
        }
    }

    addSpoofingVisualization(coords, spoofingResult) {
        if (this.currentViewMode !== 'spoofing') return;

        const circle = L.circle(coords, {
            color: '#ff6b6b',
            fillColor: '#ff6b6b',
            fillOpacity: 0.1,
            radius: 80000,
            weight: 2
        }).addTo(this.spoofingLayer);

        this.animateSpoofingCircle(circle);
    }

    animateSpoofingCircle(circle) {
        let opacity = 0.1;
        let growing = true;
        
        const animate = () => {
            if (!this.map.hasLayer(circle)) return;
            
            if (growing) {
                opacity += 0.01;
                if (opacity >= 0.2) growing = false;
            } else {
                opacity -= 0.01;
                if (opacity <= 0.1) growing = true;
            }
            
            circle.setStyle({ fillOpacity: opacity });
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    showSpoofingAlert(spoofingResult, stationId) {
        if (this.currentViewMode !== 'realtime') return;

        const alert = document.getElementById('spoofing-alert');
        const details = document.getElementById('spoofing-details');
        const indicators = document.getElementById('spoofing-indicators');

        details.textContent = `Station ${stationId + 1} - ${spoofingResult.confidence} confidence`;
        indicators.innerHTML = spoofingResult.indicators.slice(0, 3).map(ind => 
            `<div class="flex items-center gap-2">
                <span class="text-red-400 text-xs">●</span>
                <span class="flex-1">${ind}</span>
            </div>`
        ).join('');

        alert.classList.remove('hidden');
    }

    hideSpoofingAlert() {
        document.getElementById('spoofing-alert').classList.add('hidden');
    }

    // Utility methods (keep the same as before)
    sampleRoutePoints(points, count) {
        if (points.length <= count) return points;
        const step = Math.floor(points.length / count);
        return points.filter((_, index) => index % step === 0).slice(0, count);
    }

    getSpoofTypeForStation(stationIndex, totalStations) {
        const spoofTypes = ['aggressive', 'moderate', 'subtle', 'none', 'moderate', 'aggressive'];
        return spoofTypes[stationIndex % spoofTypes.length];
    }

    async fetchRealWeatherData(coords) {
        return new Promise(resolve => {
            setTimeout(() => {
                const baseTemp = 15 + (coords[0] / 90) * 20;
                resolve({
                    flightCategory: this.generateFlightCategory(),
                    temperature: baseTemp + (Math.random() * 10 - 5),
                    pressure: 30.0 + (Math.random() * 0.4 - 0.2),
                    wind: {
                        speed: 8 + Math.random() * 15,
                        direction: Math.floor(Math.random() * 360)
                    },
                    visibility: 3 + Math.random() * 7,
                    ceiling: 1000 + Math.random() * 8000,
                    weather: ['Clear', 'Few Clouds', 'Broken Clouds'][Math.floor(Math.random() * 3)]
                });
            }, 100);
        });
    }

    generateFlightCategory() {
        const rand = Math.random();
        if (rand < 0.6) return 'VFR';
        if (rand < 0.8) return 'MVFR';
        if (rand < 0.95) return 'IFR';
        return 'LIFR';
    }

    getWeatherIcon(flightCategory) {
        const icons = {
            'VFR': '🌤️',
            'MVFR': '⛅', 
            'IFR': '☁️',
            'LIFR': '🌫️'
        };
        return icons[flightCategory] || '🌈';
    }

    clearMap() {
        Object.values(this.markers).forEach(marker => this.map.removeLayer(marker));
        this.markers = {};
        
        if (this.flightPath) {
            this.map.removeLayer(this.flightPath);
            this.flightPath = null;
        }
        
        this.weatherLayer.clearLayers();
        this.spoofingLayer.clearLayers();
        this.weatherStations = [];
        this.spoofingData = null;
        this.hideSpoofingAlert();
        this.currentViewMode = 'realtime';
        this.updateViewModeIndicator();
        this.updateToggleButton();
    }
}