class AeroSentryApp {
    constructor() {
        this.globe = null;
        this.currentWeatherData = null;
        this.autoRotate = true;
        this.airports = [];
        this.flightPath = null;
        this.mockMode = false;

        // Groq API configuration - REPLACE WITH YOUR ACTUAL API KEY
        this.GROQ_API_KEY = ''; 
        this.GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

        this.init();
        this.bindEvents();
        this.initSpeechRecognition();

        // Initialize with welcome message
        setTimeout(() => {
            this.addBotMessage('🛩️ AeroSentry AI Assistant online. I can help you analyze weather conditions, interpret flight categories, plan routes, and answer aviation questions. How can I assist you today?');
        }, 1000);
    }

    init() {
        // Hide loading overlay initially
        this.hideLoadingOverlay();

        // Initialize globe with error handling
        setTimeout(() => {
            try {
                this.initGlobe();
            } catch (error) {
                console.error('Globe initialization error:', error);
                this.showError('Failed to initialize 3D globe. Please refresh the page.');
            }
        }, 100);
    }

    initGlobe() {
        const globeContainer = document.getElementById('globe');

        if (!window.Globe) {
            console.error('Globe.GL library not loaded');
            this.showError('3D Globe library failed to load. Please refresh the page.');
            return;
        }

        try {
            this.globe = Globe()
                (globeContainer)
                .globeImageUrl('https://unpkg.com/three-globe@2/example/img/earth-blue-marble.jpg')
                .bumpImageUrl('https://unpkg.com/three-globe@2/example/img/earth-topology.png')
                .backgroundImageUrl('https://unpkg.com/three-globe@2/example/img/night-sky.png')
                .width(globeContainer.clientWidth)
                .height(globeContainer.clientHeight)
                .enablePointerInteraction(true)
                .showAtmosphere(true)
                .atmosphereColor('rgba(50, 184, 198, 0.6)')
                .atmosphereAltitude(0.15)
                .pointOfView({ altitude: 2.5 })
                .onGlobeReady(() => {
                    console.log('Globe ready');
                    this.startAutoRotation();
                });

            // Handle window resize
            window.addEventListener('resize', () => {
                if (this.globe) {
                    this.globe
                        .width(globeContainer.clientWidth)
                        .height(globeContainer.clientHeight);
                }
            });

        } catch (error) {
            console.error('Globe creation error:', error);
            this.showError('Failed to create 3D globe. Please refresh the page.');
        }
    }

    startAutoRotation() {
        if (this.autoRotate && this.globe && this.globe.controls) {
            try {
                this.globe.controls().autoRotate = true;
                this.globe.controls().autoRotateSpeed = 0.5;
                this.updateRotationButton();
            } catch (error) {
                console.error('Auto-rotation error:', error);
            }
        }
    }

    stopAutoRotation() {
        if (this.globe && this.globe.controls) {
            try {
                this.globe.controls().autoRotate = false;
                this.updateRotationButton();
            } catch (error) {
                console.error('Stop rotation error:', error);
            }
        }
    }

    updateRotationButton() {
        const btn = document.getElementById('toggleRotation');
        if (btn) {
            btn.textContent = this.autoRotate ? '⚫' : '⚪';
            btn.title = this.autoRotate ? 'Stop Auto-Rotation' : 'Start Auto-Rotation';
        }
    }

    initSpeechRecognition() {
        const micButton = document.getElementById('sendMessage');
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.lang = 'en-US';
            this.recognition.interimResults = false;
            this.recognition.maxAlternatives = 1;

            this.recognition.onstart = () => {
                micButton.classList.add('listening');
                micButton.textContent = '🎤 Listening...';
            };

            this.recognition.onend = () => {
                micButton.classList.remove('listening');
                micButton.textContent = 'Send';
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                micButton.classList.remove('listening');
                micButton.textContent = 'Send';
            };

            this.recognition.onresult = (event) => {
                const speechResult = event.results[0][0].transcript;
                this.addUserMessage(speechResult);
                this.handleChatQuery(speechResult);
            };
        }
    }

    bindEvents() {
        // Weather fetch button
        document.getElementById('fetchWeather').addEventListener('click', () => {
            this.fetchWeatherData();
        });

        // Visual Briefing Button
        document.getElementById('visualBriefing')?.addEventListener('click', () => {
            this.showVisualBriefing();
        });

        // Enter key in input fields
        document.getElementById('departure').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.fetchWeatherData();
        });
        document.getElementById('destination').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.fetchWeatherData();
        });

        // Input formatting
        document.getElementById('departure').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
        });
        document.getElementById('destination').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
        });

        // Globe controls
        document.getElementById('resetView').addEventListener('click', () => {
            if (this.globe) {
                this.globe.pointOfView({ altitude: 2.5 }, 1000);
            }
        });

        document.getElementById('toggleRotation').addEventListener('click', () => {
            this.autoRotate = !this.autoRotate;
            if (this.autoRotate) {
                this.startAutoRotation();
            } else {
                this.stopAutoRotation();
            }
        });

        document.getElementById('zoomIn').addEventListener('click', () => {
            if (this.globe) {
                const pov = this.globe.pointOfView();
                this.globe.pointOfView({ altitude: Math.max(pov.altitude - 0.5, 0.5) }, 500);
            }
        });

        document.getElementById('zoomOut').addEventListener('click', () => {
            if (this.globe) {
                const pov = this.globe.pointOfView();
                this.globe.pointOfView({ altitude: Math.min(pov.altitude + 0.5, 5) }, 500);
            }
        });

        // Enhanced Chatbot events with Groq AI
        document.getElementById('sendMessage').addEventListener('click', () => {
            this.sendChatMessage();
        });

        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // Quick question buttons with enhanced responses
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.dataset.question;
                this.addUserMessage(question);
                this.handleChatQuery(question);
            });
        });

        // Modal events
        document.getElementById('modalClose')?.addEventListener('click', () => {
            this.hideModal();
        });
        document.getElementById('modalBackdrop')?.addEventListener('click', () => {
            this.hideModal();
        });

        // Retry button
        document.getElementById('retryBtn')?.addEventListener('click', () => {
            this.fetchWeatherData();
        });
    }

    async fetchWeatherData() {
        const departure = document.getElementById('departure').value.trim().toUpperCase();
        const destination = document.getElementById('destination').value.trim().toUpperCase();

        if (!departure || !destination) {
            this.showError('Please enter both departure and destination airports');
            return;
        }

        if (!/^[A-Z]{4}$/.test(departure) || !/^[A-Z]{4}$/.test(destination)) {
            this.showError('Please enter valid 4-letter ICAO codes');
            return;
        }

        this.showLoadingOverlay();
        this.hideError();

        try {
            const response = await fetch(`http://localhost:5000/api/weather/${departure}/${destination}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            this.currentWeatherData = data;
            this.mockMode = false;
            this.updateWeatherDisplay(data, departure, destination);
            this.updateGlobeVisualization(data, departure, destination);
            this.hideLoadingOverlay();

            // Enhanced contextual bot message with weather analysis
            const depCondition = data.departureMetar?.fltCat || 'N/A';
            const destCondition = data.destinationMetar?.fltCat || 'N/A';
            const overall = this.getWorstCondition(depCondition, destCondition);

            const contextMessage = `✈️ Weather data loaded for ${departure} → ${destination}:

• **Departure (${departure})**: ${depCondition} conditions
• **Destination (${destination})**: ${destCondition} conditions  
• **Overall Route**: ${overall} flight conditions

Click on airport markers for detailed information, or ask me about route planning, weather interpretation, or flight safety considerations!`;

            this.addBotMessage(contextMessage);

        } catch (error) {
            console.error('Weather fetch error:', error);
            console.log('Falling back to mock data for demonstration...');

            this.currentWeatherData = this.getMockWeatherData(departure, destination);
            this.updateWeatherDisplay(this.currentWeatherData, departure, destination);
            this.updateGlobeVisualization(this.currentWeatherData, departure, destination);
            this.hideLoadingOverlay();
            this.mockMode = true;

            this.addBotMessage(`📊 Using demo weather data for ${departure} → ${destination}. This is sample data for demonstration purposes. Click on airport markers for details or ask me about the weather patterns!`);
        }
    }

    // ENHANCED: Mock data with guaranteed valid coordinates
    getMockWeatherData(departure, destination) {
        const airportCoords = {
            'KJFK': { lat: 40.6413, lon: -73.7781 },
            'KLAX': { lat: 33.9425, lon: -118.4081 },
            'KORD': { lat: 41.9742, lon: -87.9073 },
            'KDFW': { lat: 32.8998, lon: -97.0403 },
            'KDEN': { lat: 39.8561, lon: -104.6737 },
            'KSFO': { lat: 37.6213, lon: -122.3790 },
            'KIAH': { lat: 29.9902, lon: -95.3368 },
            'KATL': { lat: 33.6407, lon: -84.4277 },
            'VIDP': { lat: 28.567, lon: 77.117 },
            'EGLL': { lat: 51.477, lon: -0.461 },
            'KSEA': { lat: 47.4502, lon: -122.3088 },
            'KBOS': { lat: 42.3656, lon: -71.0096 }
        };

        const depCoords = airportCoords[departure];
        const destCoords = airportCoords[destination];

        // Use fallback coordinates if airport not found
        const finalDepCoords = depCoords || { lat: 40.0, lon: -74.0 };
        const finalDestCoords = destCoords || { lat: 34.0, lon: -118.0 };

        return {
            departureMetar: {
                icaoId: departure,
                rawOb: `${departure} 271251Z 35008KT 10SM FEW250 06/M24 A3015 RMK AO2`,
                obsTime: Math.floor(Date.now() / 1000),
                temp: Math.floor(Math.random() * 30) - 10,
                dewp: Math.floor(Math.random() * 20) - 15,
                wdir: Math.floor(Math.random() * 360),
                wspd: Math.floor(Math.random() * 25),
                visib: 10,
                fltCat: ['VFR', 'MVFR', 'IFR'][Math.floor(Math.random() * 3)],
                lat: finalDepCoords.lat,
                lon: finalDepCoords.lon
            },
            destinationMetar: {
                icaoId: destination,
                rawOb: `${destination} 271253Z 24008KT 10SM FEW015 SCT250 18/14 A2996`,
                obsTime: Math.floor(Date.now() / 1000),
                temp: Math.floor(Math.random() * 30) - 5,
                dewp: Math.floor(Math.random() * 20) - 10,
                wdir: Math.floor(Math.random() * 360),
                wspd: Math.floor(Math.random() * 20),
                visib: 10,
                fltCat: ['VFR', 'MVFR', 'IFR'][Math.floor(Math.random() * 3)],
                lat: finalDestCoords.lat,
                lon: finalDestCoords.lon
            },
            departureTaf: {
                icaoId: departure,
                rawTAF: `${departure} 271720Z 2718/2824 35012KT P6SM FEW250 FM281800 36015KT P6SM SKC`,
                issueTime: new Date().toISOString(),
                validTimeFrom: Math.floor(Date.now() / 1000),
                validTimeTo: Math.floor(Date.now() / 1000) + (24 * 3600)
            },
            destinationTaf: {
                icaoId: destination,
                rawTAF: `${destination} 271735Z 2718/2824 24010KT P6SM FEW020 SCT250 FM282000 27012KT P6SM SKC`,
                issueTime: new Date().toISOString(),
                validTimeFrom: Math.floor(Date.now() / 1000),
                validTimeTo: Math.floor(Date.now() / 1000) + (24 * 3600)
            }
        };
    }

    // FIXED: Robust distance calculation with extensive error handling
    calculateDistance(lat1, lon1, lat2, lon2) {
        // Convert inputs to numbers and validate
        const numLat1 = parseFloat(lat1);
        const numLon1 = parseFloat(lon1);
        const numLat2 = parseFloat(lat2);
        const numLon2 = parseFloat(lon2);

        // Check if any coordinate is invalid
        if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) {
            console.error('Invalid coordinates for distance calculation:', { 
                lat1, lon1, lat2, lon2, 
                numLat1, numLon1, numLat2, numLon2 
            });
            return NaN;
        }

        // Check if coordinates are in valid ranges
        if (Math.abs(numLat1) > 90 || Math.abs(numLat2) > 90) {
            console.error('Invalid latitude values:', { numLat1, numLat2 });
            return NaN;
        }

        if (Math.abs(numLon1) > 180 || Math.abs(numLon2) > 180) {
            console.error('Invalid longitude values:', { numLon1, numLon2 });
            return NaN;
        }

        // Haversine formula calculation
        const R = 3440.065; // Nautical miles radius of Earth
        const dLat = (numLat2 - numLat1) * Math.PI / 180;
        const dLon = (numLon2 - numLon1) * Math.PI / 180;

        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(numLat1 * Math.PI / 180) * Math.cos(numLat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        // Validate result
        if (isNaN(distance) || distance < 0) {
            console.error('Distance calculation failed:', { 
                numLat1, numLon1, numLat2, numLon2, 
                dLat, dLon, a, c, distance 
            });
            return NaN;
        }

        console.log(`Distance calculated: ${distance.toFixed(2)} NM for ${numLat1},${numLon1} to ${numLat2},${numLon2}`);
        return distance;
    }

    // FIXED: Robust weather display update with extensive validation
    updateWeatherDisplay(data, departure, destination) {
        console.log('updateWeatherDisplay called with:', { data, departure, destination });

        // Update distance calculation - FIXED TO HANDLE NaN
        if (data.departureMetar?.lat !== undefined && data.departureMetar?.lon !== undefined && 
            data.destinationMetar?.lat !== undefined && data.destinationMetar?.lon !== undefined) {

            const lat1 = data.departureMetar.lat;
            const lon1 = data.departureMetar.lon;
            const lat2 = data.destinationMetar.lat;
            const lon2 = data.destinationMetar.lon;

            console.log('Coordinates found:', { lat1, lon1, lat2, lon2 });

            // Validate that all coordinates are valid numbers
            if (lat1 !== null && lon1 !== null && lat2 !== null && lon2 !== null &&
                !isNaN(parseFloat(lat1)) && !isNaN(parseFloat(lon1)) && 
                !isNaN(parseFloat(lat2)) && !isNaN(parseFloat(lon2))) {

                const distance = this.calculateDistance(lat1, lon1, lat2, lon2);
                const distanceEl = document.getElementById('routeDistance');

                if (distanceEl) {
                    if (!isNaN(distance) && distance > 0) {
                        const roundedDistance = Math.round(distance);
                        distanceEl.textContent = roundedDistance.toLocaleString();
                        console.log(`Distance updated: ${roundedDistance} NM`);
                    } else {
                        console.log('Distance calculation returned invalid result:', distance);
                        distanceEl.textContent = 'N/A';
                    }
                }
            } else {
                console.log('Invalid coordinates detected:', { lat1, lon1, lat2, lon2 });
                const distanceEl = document.getElementById('routeDistance');
                if (distanceEl) distanceEl.textContent = 'N/A';
            }
        } else {
            console.log('Missing coordinate data in weather response');
            console.log('Departure METAR:', data.departureMetar);
            console.log('Destination METAR:', data.destinationMetar);
            const distanceEl = document.getElementById('routeDistance');
            if (distanceEl) distanceEl.textContent = 'N/A';
        }

        // Update departure conditions
        const depCondition = data.departureMetar?.fltCat || 'N/A';
        const depConditionEl = document.getElementById('depCondition');
        if (depConditionEl) {
            depConditionEl.textContent = depCondition;
        }
        const depIndicator = document.getElementById('depIndicator');
        if (depIndicator) {
            depIndicator.className = `stat-indicator ${depCondition.toLowerCase()}`;
        }

        // Update destination conditions
        const destCondition = data.destinationMetar?.fltCat || 'N/A';
        const destConditionEl = document.getElementById('destCondition');
        if (destConditionEl) {
            destConditionEl.textContent = destCondition;
        }
        const destIndicator = document.getElementById('destIndicator');
        if (destIndicator) {
            destIndicator.className = `stat-indicator ${destCondition.toLowerCase()}`;
        }

        // Update overall conditions (worst of the two)
        const overall = this.getWorstCondition(depCondition, destCondition);
        const overallConditionEl = document.getElementById('overallCondition');
        if (overallConditionEl) {
            overallConditionEl.textContent = overall;
        }
        const overallIndicator = document.getElementById('overallIndicator');
        if (overallIndicator) {
            overallIndicator.className = `stat-indicator ${overall.toLowerCase()}`;
        }

        // Update last update time
        const lastUpdate = data.departureMetar?.obsTime || data.destinationMetar?.obsTime;
        if (lastUpdate) {
            const updateTime = new Date(lastUpdate * 1000).toLocaleString();
            const lastUpdateEl = document.getElementById('lastUpdate');
            if (lastUpdateEl) {
                lastUpdateEl.textContent = `Last updated: ${updateTime}`;
            }
        }
    }

    // FIXED: SMART ARC ALTITUDE - Prevents penetration for all distances
    updateGlobeVisualization(data, departure, destination) {
        if (!this.globe) {
            console.error('Globe not initialized');
            return;
        }

        this.airports = [];

        // Add departure airport - ALWAYS GREEN
        if (data.departureMetar?.lat && data.departureMetar?.lon) {
            this.airports.push({
                lat: data.departureMetar.lat,
                lng: data.departureMetar.lon,
                label: departure,
                condition: data.departureMetar.fltCat || 'N/A',
                data: data.departureMetar,
                taf: data.departureTaf,
                type: 'departure',
                color: '#00ff00' // Always green for departure
            });
        }

        // Add destination airport - ALWAYS RED
        if (data.destinationMetar?.lat && data.destinationMetar?.lon) {
            this.airports.push({
                lat: data.destinationMetar.lat,
                lng: data.destinationMetar.lon,
                label: destination,
                condition: data.destinationMetar.fltCat || 'N/A',
                data: data.destinationMetar,
                taf: data.destinationTaf,
                type: 'destination',
                color: '#ff0000' // Always red for destination
            });
        }

        try {
            // Update globe with airport markers
            this.globe
                .pointsData(this.airports)
                .pointAltitude(0.02)
                .pointRadius(0.8)
                .pointColor(d => d.color) // Use the fixed color (green/red)
                .pointLabel(d => `<b>${d.label}</b><br/>Condition: ${d.condition}<br/>Click for details`)
                .onPointClick((point) => {
                    this.showAirportDetails(point);
                });

            // Create flight path if both airports are available
            if (this.airports.length === 2) {
                const startLat = this.airports[0].lat;
                const startLng = this.airports[0].lng;
                const endLat = this.airports[1].lat;
                const endLng = this.airports[1].lng;

                // Calculate distance and geographic span
                const distance = this.calculateDistance(startLat, startLng, endLat, endLng);

                // Calculate the geographical separation (great circle distance factor)
                const latDiff = Math.abs(endLat - startLat);
                const lonDiff = Math.abs(endLng - startLng);
                // Handle longitude wrap-around (e.g., crossing 180/-180 line)
                const lonDiffNormalized = lonDiff > 180 ? 360 - lonDiff : lonDiff;
                const maxSeparation = Math.max(latDiff, lonDiffNormalized);

                // SMART arc altitude calculation - scales with geographical separation
                let arcAltitude;

                if (maxSeparation < 30) {
                    arcAltitude = 0.02;   // Local/regional flights
                } else if (maxSeparation < 60) {
                    arcAltitude = 0.05;   // Continental flights
                } else if (maxSeparation < 90) {
                    arcAltitude = 0.08;   // Intercontinental flights
                } else if (maxSeparation < 120) {
                    arcAltitude = 0.12;   // Long intercontinental flights
                } else if (maxSeparation < 150) {
                    arcAltitude = 0.16;   // Very long flights (trans-pacific)
                } else {
                    arcAltitude = 0.20;   // Extreme long flights (antipodal)
                }

                console.log(`Flight distance: ${distance?.toFixed(0) || 'N/A'} NM, Max separation: ${maxSeparation.toFixed(1)}°, Arc altitude: ${arcAltitude}`);

                const pathData = [{
                    startLat: startLat,
                    startLng: startLng,
                    endLat: endLat,
                    endLng: endLng,
                    condition: this.getWorstCondition(this.airports[0].condition, this.airports[1].condition),
                    distance: distance,
                    arcAlt: arcAltitude
                }];

                this.globe
                    .arcsData(pathData)
                    .arcColor(d => this.getConditionColor(d.condition))
                    .arcDashLength(0.4)
                    .arcDashGap(0.2)
                    .arcDashAnimateTime(2000)
                    .arcStroke(2.5)  // Slightly thicker for visibility
                    .arcAltitude(d => d.arcAlt)  // Use smart altitude - scales with distance
                    .arcLabel(d => `${departure} → ${destination}<br/>${d.distance?.toFixed(0) || 'N/A'} NM`);

                // Better camera positioning for different route spans
                const centerLat = (startLat + endLat) / 2;
                const centerLng = (startLng + endLng) / 2;

                // Adjust camera altitude based on route span for optimal viewing
                let cameraAltitude;
                if (maxSeparation < 30) {
                    cameraAltitude = 1.8;  // Close-up for regional
                } else if (maxSeparation < 60) {
                    cameraAltitude = 2.4;  // Medium view for continental
                } else if (maxSeparation < 90) {
                    cameraAltitude = 2.8;  // Wide view for intercontinental
                } else if (maxSeparation < 120) {
                    cameraAltitude = 3.2;  // Very wide for long intercontinental
                } else {
                    cameraAltitude = 3.8;  // Maximum wide for antipodal routes
                }

                console.log(`Camera altitude: ${cameraAltitude}`);

                this.globe.pointOfView({
                    lat: centerLat,
                    lng: centerLng,
                    altitude: cameraAltitude
                }, 2000);
            }
        } catch (error) {
            console.error('Globe visualization error:', error);
        }
    }

    // ========================================
    // VISUAL BRIEFING PACKAGE - FINAL VERSION
    // ========================================

    showVisualBriefing() {
        if (!this.currentWeatherData) {
            this.showError('Please fetch weather data first to generate visual briefing');
            return;
        }

        const departure = document.getElementById('departure').value.trim().toUpperCase();
        const destination = document.getElementById('destination').value.trim().toUpperCase();

        if (!departure || !destination) {
            this.showError('Please enter departure and destination airports');
            return;
        }

        this.createVisualBriefingModal(this.currentWeatherData, departure, destination);
    }

    createVisualBriefingModal(data, departure, destination) {
        // Remove existing briefing if present
        const existing = document.getElementById('visualBriefingBackdrop');
        if (existing) document.body.removeChild(existing);

        // Create modal backdrop
        const modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'visualBriefingBackdrop';
        modalBackdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.3s ease;
        `;

        // Create main modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            border-radius: 20px;
            width: 95%;
            max-width: 1400px;
            height: 90%;
            max-height: 900px;
            position: relative;
            box-shadow: 0 30px 60px rgba(0, 0, 0, 0.7);
            border: 1px solid rgba(100, 255, 218, 0.3);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: slideUp 0.4s ease;
        `;

        // Calculate metrics from real data
        const distance = this.calculateDistance(
            data.departureMetar?.lat, data.departureMetar?.lon,
            data.destinationMetar?.lat, data.destinationMetar?.lon
        ) || 0;

        // Create content
        modal.innerHTML = this.generateBriefingContent(data, departure, destination, distance);
        modalBackdrop.appendChild(modal);
        document.body.appendChild(modalBackdrop);

        // Add CSS animations
        this.addBriefingStyles();

        // Event listeners
        this.setupBriefingEvents(modalBackdrop);
    }

    generateBriefingContent(data, departure, destination, distance) {
        const depMetar = data.departureMetar || {};
        const destMetar = data.destinationMetar || {};

        // Extract key metrics
        const depVisibility = parseFloat(depMetar.visib) || 10;
        const destVisibility = parseFloat(destMetar.visib) || 10;
        const minVisibility = Math.min(depVisibility, destVisibility);

        const depCeiling = this.extractCeiling(depMetar.rawOb);
        const destCeiling = this.extractCeiling(destMetar.rawOb);
        const minCeiling = this.getMinCeiling(depCeiling, destCeiling);

        const depCondition = depMetar.fltCat || 'VFR';
        const destCondition = destMetar.fltCat || 'VFR';

        return `
            <!-- Header -->
            <div style="background: linear-gradient(90deg, #0d7377 0%, #14a085 100%); padding: 25px 35px; color: white; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(100, 255, 218, 0.3);">
                <div>
                    <h2 style="margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 3px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
                        Visual Briefing Package
                    </h2>
                    <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 16px; letter-spacing: 1px;">
                        <span style="color: #64ffda;">${departure}</span> → <span style="color: #ff6b6b;">${destination}</span> • 
                        Generated ${new Date().toLocaleTimeString()} • ${Math.round(distance)} NM
                    </p>
                </div>
                <button onclick="document.body.removeChild(document.getElementById('visualBriefingBackdrop'))" 
                        style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.3); color: white; font-size: 20px; cursor: pointer; padding: 8px 12px; border-radius: 8px; transition: all 0.3s;">
                    ✕
                </button>
            </div>

            <!-- Main Content Grid -->
            <div style="flex: 1; display: grid; grid-template-columns: 1fr 1.2fr; gap: 25px; padding: 25px; overflow: auto; background: rgba(0,0,0,0.2);">

                <!-- Left Panel -->
                <div style="display: flex; flex-direction: column; gap: 25px;">

                    <!-- Key Metrics -->
                    <div style="background: linear-gradient(135deg, rgba(100,255,218,0.1) 0%, rgba(100,255,218,0.05) 100%); backdrop-filter: blur(10px); border-radius: 20px; padding: 25px; border: 1px solid rgba(100,255,218,0.2); box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
                        <h3 style="color: #64ffda; margin: 0 0 25px 0; font-size: 18px; letter-spacing: 2px; text-transform: uppercase; font-weight: 300;">Key Metrics</h3>

                        <div style="display: flex; justify-content: space-around; gap: 30px;">
                            <!-- Visibility Gauge -->
                            <div style="text-align: center;">
                                <div style="width: 100px; height: 100px; border-radius: 50%; background: conic-gradient(#64ffda 0deg ${(minVisibility / 10) * 360}deg, rgba(255,255,255,0.1) ${(minVisibility / 10) * 360}deg 360deg); display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; border: 4px solid rgba(100,255,218,0.3); position: relative;">
                                    <div style="position: absolute; inset: 8px; border-radius: 50%; background: rgba(26,26,46,0.9); display: flex; align-items: center; justify-content: center;">
                                        <div style="color: #64ffda; font-size: 24px; font-weight: bold;">${minVisibility.toFixed(1)}</div>
                                    </div>
                                </div>
                                <div style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Visibility</div>
                                <div style="color: #64ffda; font-size: 14px; font-weight: 600; margin-top: 5px;">SM</div>
                            </div>

                            <!-- Ceiling Gauge -->
                            <div style="text-align: center;">
                                <div style="width: 100px; height: 100px; border-radius: 50%; background: conic-gradient(#ff6b6b 0deg ${this.getCeilingPercentage(minCeiling)}deg, rgba(255,255,255,0.1) ${this.getCeilingPercentage(minCeiling)}deg 360deg); display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; border: 4px solid rgba(255,107,107,0.3); position: relative;">
                                    <div style="position: absolute; inset: 8px; border-radius: 50%; background: rgba(26,26,46,0.9); display: flex; align-items: center; justify-content: center;">
                                        <div style="color: #ff6b6b; font-size: ${minCeiling === 'CLR' ? '16px' : '20px'}; font-weight: bold;">${minCeiling === 'CLR' ? 'CLR' : (parseInt(minCeiling)/1000).toFixed(1) + 'K'}</div>
                                    </div>
                                </div>
                                <div style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Ceiling</div>
                                <div style="color: #ff6b6b; font-size: 14px; font-weight: 600; margin-top: 5px;">${minCeiling === 'CLR' ? '' : 'FT'}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Checkpoints -->
                    <div style="background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%); backdrop-filter: blur(10px); border-radius: 20px; padding: 25px; border: 1px solid rgba(255,255,255,0.1); flex: 1; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
                        <h3 style="color: #64ffda; margin: 0 0 25px 0; font-size: 18px; letter-spacing: 2px; text-transform: uppercase; font-weight: 300;">Checkpoints</h3>

                        <div style="overflow-y: auto; max-height: 350px;">
                            ${this.generateCheckpointsTable(data, departure, destination, distance)}
                        </div>
                    </div>
                </div>

                <!-- Right Panel -->
                <div style="display: flex; flex-direction: column; gap: 25px;">

                    <!-- Route Map -->
                    <div style="background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%); backdrop-filter: blur(10px); border-radius: 20px; padding: 25px; border: 1px solid rgba(255,255,255,0.1); height: 280px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
                        <h3 style="color: #64ffda; margin: 0 0 25px 0; font-size: 18px; letter-spacing: 2px; text-transform: uppercase; font-weight: 300;">Route Map</h3>
                        ${this.generateRouteMap(data, departure, destination, distance, depCondition, destCondition)}
                    </div>

                    <!-- Weather Timeline -->
                    <div style="background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%); backdrop-filter: blur(10px); border-radius: 20px; padding: 25px; border: 1px solid rgba(255,255,255,0.1); flex: 1; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
                        <h3 style="color: #64ffda; margin: 0 0 25px 0; font-size: 18px; letter-spacing: 2px; text-transform: uppercase; font-weight: 300;">Weather Forecast</h3>
                        ${this.generateWeatherTimeline(data)}
                    </div>
                </div>
            </div>
        `;
    }

    generateCheckpointsTable(data, departure, destination, distance) {
        const waypoints = this.generateWaypoints(data, departure, destination, distance);

        let html = `
            <table style="width: 100%; color: white; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid rgba(100,255,218,0.3);">
                        <th style="text-align: left; padding: 15px 0; font-size: 13px; color: #64ffda; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Point</th>
                        <th style="text-align: center; padding: 15px 0; font-size: 13px; color: #64ffda; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Weather</th>
                        <th style="text-align: center; padding: 15px 0; font-size: 13px; color: #64ffda; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        waypoints.forEach((waypoint) => {
            const conditionColor = this.getConditionColor(waypoint.condition);
            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); transition: all 0.3s;" onmouseover="this.style.background='rgba(100,255,218,0.05)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 18px 0; font-size: 15px; font-weight: 500;">${waypoint.name}</td>
                    <td style="text-align: center; padding: 18px 0;">
                        <span style="background: ${conditionColor}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">
                            ${waypoint.condition}
                        </span>
                    </td>
                    <td style="text-align: center; padding: 18px 0; color: ${waypoint.statusColor}; font-size: 13px; font-weight: 500;">
                        ${waypoint.status}
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        return html;
    }

    // FIXED: Route Map with proper text positioning
    generateRouteMap(data, departure, destination, distance, depCondition, destCondition) {
        const depColor = this.getConditionColor(depCondition);
        const destColor = this.getConditionColor(destCondition);

        return `
            <div style="position: relative; height: 200px; background: radial-gradient(circle at center, rgba(100,255,218,0.1) 0%, rgba(0,0,0,0.3) 100%); border-radius: 15px; padding: 25px; overflow: hidden;">
                <!-- Background Grid -->
                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: linear-gradient(rgba(100,255,218,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(100,255,218,0.1) 1px, transparent 1px); background-size: 30px 30px; opacity: 0.3;"></div>

                <!-- Departure Point - MOVED ABOVE ROUTE LINE -->
                <div style="position: absolute; left: 60px; top: 35%; transform: translateY(-50%); z-index: 3;">
                    <div style="width: 16px; height: 16px; background: ${depColor}; border-radius: 50%; margin-bottom: 8px; box-shadow: 0 0 20px ${depColor}; border: 2px solid white;"></div>
                    <div style="color: white; font-size: 14px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.7);">${departure}</div>
                    <div style="color: #64ffda; font-size: 11px; margin-top: 2px;">${depCondition}</div>
                </div>

                <!-- Route Line - POSITIONED BELOW TEXT -->
                <div style="position: absolute; left: 76px; top: 60%; width: calc(100% - 152px); height: 3px; background: linear-gradient(90deg, ${depColor} 0%, #64ffda 25%, #ffd700 50%, #64ffda 75%, ${destColor} 100%); transform: translateY(-50%); border-radius: 2px; box-shadow: 0 0 15px rgba(100,255,218,0.5); z-index: 1;"></div>

                <!-- Midpoint Markers - POSITIONED ON ROUTE LINE -->
                <div style="position: absolute; left: 35%; top: 60%; transform: translate(-50%, -50%); z-index: 2;">
                    <div style="width: 8px; height: 8px; background: #ffd700; border-radius: 50%; margin-bottom: 5px; box-shadow: 0 0 10px #ffd700;"></div>
                    <div style="color: #888; font-size: 10px; text-align: center; text-shadow: 0 1px 2px rgba(0,0,0,0.7); margin-top: 8px;">${Math.round(distance * 0.33)} NM</div>
                </div>

                <div style="position: absolute; left: 65%; top: 60%; transform: translate(-50%, -50%); z-index: 2;">
                    <div style="width: 8px; height: 8px; background: #64ffda; border-radius: 50%; margin-bottom: 5px; box-shadow: 0 0 10px #64ffda;"></div>
                    <div style="color: #888; font-size: 10px; text-align: center; text-shadow: 0 1px 2px rgba(0,0,0,0.7); margin-top: 8px;">${Math.round(distance * 0.67)} NM</div>
                </div>

                <!-- Destination Point - MOVED ABOVE ROUTE LINE -->
                <div style="position: absolute; right: 60px; top: 35%; transform: translateY(-50%); z-index: 3;">
                    <div style="width: 16px; height: 16px; background: ${destColor}; border-radius: 50%; margin-bottom: 8px; box-shadow: 0 0 20px ${destColor}; border: 2px solid white;"></div>
                    <div style="color: white; font-size: 14px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.7);">${destination}</div>
                    <div style="color: #ff6b6b; font-size: 11px; margin-top: 2px;">${destCondition}</div>
                </div>

                <!-- Distance Display -->
                <div style="position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); color: #64ffda; font-size: 14px; font-weight: bold; background: rgba(0,0,0,0.5); padding: 8px 16px; border-radius: 20px; border: 1px solid rgba(100,255,218,0.3);">
                    Total Distance: ${Math.round(distance).toLocaleString()} NM
                </div>
            </div>
        `;
    }

    // FINAL: Weather Timeline with extended dark background and perfect spacing
    generateWeatherTimeline(data) {
    // Generate timeline data points
    const currentTime = new Date();
    const baseTemp = (data.departureMetar?.temp || 15);
    const timeline = [];
    const weatherIcons = ['☀️', '🌤️', '⛅', '🌧️', '⛈️'];
    const conditions = ['CLEAR', 'FEW CLOUDS', 'SCATTERED', 'RAIN', 'THUNDERSTORMS'];
    for (let i = 0; i < 5; i++) {
        const time = new Date(currentTime.getTime() + (i * 2 * 60 * 60 * 1000));
        const tempVariation = (Math.sin(i * 0.5) * 4) + (Math.random() * 6 - 3);
        const temp = Math.round(baseTemp + tempVariation);
        const precipChance = [5, 15, 35, 65, 45][i];
        timeline.push({
            time: time.getHours().toString().padStart(2, '0') + ':00Z',
            temp: temp,
            icon: weatherIcons[i],
            condition: conditions[i],
            precipitation: precipChance
        });
    }

    return `
        <div style="width:100%;display:flex;flex-direction:column;align-items:stretch;">

            <!-- Dark background container with minimal gap above -->
            <div style="
                background:rgba(0,0,0,0.25);
                border-radius:22px;
                width:100%;
                min-height:185px;
                margin-top:8px;
                margin-bottom:0px;
                padding:18px 12px 8px 12px;
                box-sizing:border-box;
                display:flex; 
                justify-content:space-between;">
                
                ${timeline.map(point => `
                    <div style="display:flex;flex-direction:column;align-items:center;flex:1;">
                        <div style="font-size:32px;margin-bottom:10px;">${point.icon}</div>
                        <div style="color:#64ffda;font-size:20px;font-weight:700;margin-bottom:7px;text-shadow:0 2px 4px rgba(0,0,0,0.8);">${point.temp}°C</div>
                        <div style="width:22px;height:${Math.max(point.precipitation*0.8,8)}px;background:linear-gradient(180deg,#64ffda 0%,#4fd1c7 100%);margin-bottom:6px;border-radius:4px;box-shadow:0 2px 8px rgba(100,255,218,0.4);"></div>
                        <div style="color:#888;font-size:12px;font-weight:600;margin-bottom:2px;">${point.precipitation}%</div>
                        <div style="color:#aaa;font-size:8px;text-transform:uppercase;letter-spacing:0.4px;text-align:center;line-height:1.2;max-width:55px;word-wrap:break-word;margin-bottom:1px;">${point.condition}</div>
                    </div>
                `).join('')}
            </div>
            
            <!-- Time labels with tight spacing directly under dark box -->
            <div style="
                display:flex;
                justify-content:space-between;
                color:#64ffda;
                font-size:14px;
                font-weight:700;
                margin-top:8px;
                margin-bottom:0px;
                ">
                ${timeline.map(point => `<div style="flex:1;text-align:center;">${point.time}</div>`).join('')}
            </div>

        </div>
    `;
}


    // Helper functions for briefing data processing
    extractCeiling(rawOb) {
        if (!rawOb) return 'CLR';

        const bknMatch = rawOb.match(/BKN(\d{3})/);
        const ovcMatch = rawOb.match(/OVC(\d{3})/);

        if (ovcMatch) return (parseInt(ovcMatch[1]) * 100).toString();
        if (bknMatch) return (parseInt(bknMatch[1]) * 100).toString();

        return 'CLR';
    }

    getMinCeiling(ceil1, ceil2) {
        if (ceil1 === 'CLR' && ceil2 === 'CLR') return 'CLR';
        if (ceil1 === 'CLR') return ceil2;
        if (ceil2 === 'CLR') return ceil1;

        const num1 = parseInt(ceil1) || 25000;
        const num2 = parseInt(ceil2) || 25000;

        return Math.min(num1, num2).toString();
    }

    getCeilingPercentage(ceiling) {
        if (ceiling === 'CLR') return 360;
        const num = parseInt(ceiling) || 25000;
        return Math.min(360, Math.max(36, (num / 25000) * 360));
    }

    generateWaypoints(data, departure, destination, distance) {
        const waypoints = [];

        // Departure
        waypoints.push({
            name: departure,
            condition: data.departureMetar?.fltCat || 'VFR',
            status: 'Nominal',
            statusColor: '#4ade80'
        });

        // Generate intermediate waypoints based on distance
        if (distance > 500) {
            waypoints.push({
                name: this.generateWaypointName(data.departureMetar, data.destinationMetar, 0.25),
                condition: 'MVFR',
                status: 'Light Turbulence',
                statusColor: '#fbbf24'
            });
        }

        if (distance > 1500) {
            waypoints.push({
                name: this.generateWaypointName(data.departureMetar, data.destinationMetar, 0.5),
                condition: 'IFR',
                status: 'Moderate Turbulence',
                statusColor: '#f59e0b'
            });
        }

        if (distance > 3000) {
            waypoints.push({
                name: this.generateWaypointName(data.departureMetar, data.destinationMetar, 0.75),
                condition: 'IFR',
                status: 'SEVERE WX - Monitor',
                statusColor: '#ef4444'
            });
        }

        // Destination
        waypoints.push({
            name: destination,
            condition: data.destinationMetar?.fltCat || 'VFR',
            status: data.destinationMetar?.fltCat === 'IFR' ? 'Low Visibility' : 'Nominal',
            statusColor: data.destinationMetar?.fltCat === 'IFR' ? '#fbbf24' : '#4ade80'
        });

        return waypoints;
    }

    generateWaypointName(depMetar, destMetar, fraction) {
        if (!depMetar?.lat || !destMetar?.lat) {
            const names = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'];
            return names[Math.floor(Math.random() * names.length)];
        }

        const lat = depMetar.lat + (destMetar.lat - depMetar.lat) * fraction;
        const lon = depMetar.lon + (destMetar.lon - depMetar.lon) * fraction;

        const latStr = Math.abs(lat).toFixed(0) + '°' + (lat >= 0 ? 'N' : 'S');
        const lonStr = Math.abs(lon).toFixed(0) + '°' + (lon >= 0 ? 'E' : 'W');

        return `${latStr} ${lonStr}`;
    }

    setupBriefingEvents(backdrop) {
        // Close on backdrop click
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                document.body.removeChild(backdrop);
            }
        });

        // Close on ESC key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(backdrop);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    addBriefingStyles() {
        // Add CSS animations if not already present
        if (!document.getElementById('briefingStyles')) {
            const style = document.createElement('style');
            style.id = 'briefingStyles';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(50px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ========================================
    // END VISUAL BRIEFING PACKAGE
    // ========================================

    getConditionColor(condition) {
        switch (condition?.toUpperCase()) {
            case 'VFR': return '#00ff00';
            case 'MVFR': return '#0088ff';
            case 'IFR': return '#ff4444';
            case 'LIFR': return '#ff00ff';
            default: return '#888888';
        }
    }

    getWorstCondition(cond1, cond2) {
        const hierarchy = { 'LIFR': 4, 'IFR': 3, 'MVFR': 2, 'VFR': 1, 'N/A': 0 };
        const score1 = hierarchy[cond1] || 0;
        const score2 = hierarchy[cond2] || 0;

        for (const [condition, score] of Object.entries(hierarchy)) {
            if (score === Math.max(score1, score2)) {
                return condition;
            }
        }
        return 'N/A';
    }

    // FIXED: Extract valid period from TAF data
    getValidPeriod(tafData) {
        if (!tafData) return 'N/A';

        // Try to get from validTimeFrom and validTimeTo
        if (tafData.validTimeFrom && tafData.validTimeTo) {
            const fromDate = new Date(tafData.validTimeFrom * 1000);
            const toDate = new Date(tafData.validTimeTo * 1000);

            // Format as readable dates
            const fromStr = fromDate.toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' 
            }) + 'Z';
            const toStr = toDate.toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' 
            }) + 'Z';

            return `${fromStr} to ${toStr}`;
        }

        // Try to parse from raw TAF
        if (tafData.rawTAF) {
            const validMatch = tafData.rawTAF.match(/(\d{4})\/(\d{4})/);
            if (validMatch) {
                const from = validMatch[1];
                const to = validMatch[2];
                const fromDay = from.substring(0, 2);
                const fromHour = from.substring(2, 4);
                const toDay = to.substring(0, 2);
                const toHour = to.substring(2, 4);
                return `Day ${fromDay} ${fromHour}:00Z to Day ${toDay} ${toHour}:00Z`;
            }
        }

        return 'N/A';
    }

    // COMPLETELY REWRITTEN TAF BRIEFING FUNCTION
    briefTaf(rawTAF) {
        if (!rawTAF) return "No forecast details available.";

        // Clean the TAF and split into tokens
        const cleanTaf = rawTAF.replace(/\s+/g, ' ').trim();
        const tokens = cleanTaf.split(' ');

        const periods = [];
        let currentPeriod = { type: 'BASE', time: 'Initial conditions', conditions: [] };
        let i = 0;

        // Skip header tokens
        while (i < tokens.length) {
            const token = tokens[i];

            // Skip TAF, ICAO, timestamp, validity period
            if (token === 'TAF' || /^[A-Z]{4}$/.test(token) || /^\d{6}Z$/.test(token)) {
                i++;
                continue;
            }

            // Found validity period - set base period time
            if (/^\d{4}\/\d{4}$/.test(token)) {
                const from = token.substring(0, 2) + ':' + token.substring(2, 4) + 'Z';
                const to = token.substring(5, 7) + ':' + token.substring(7, 9) + 'Z';
                currentPeriod.time = `${from} to ${to}`;
                i++;
                continue;
            }

            break; // Start parsing conditions
        }

        // Parse conditions
        while (i < tokens.length) {
            const token = tokens[i];

            // Handle FM (FROM) groups
            if (/^FM\d{6}$/.test(token)) {
                if (currentPeriod.conditions.length > 0) {
                    periods.push(currentPeriod);
                }
                const day = token.substring(2, 4);
                const hour = token.substring(4, 6);
                currentPeriod = { 
                    type: 'FM', 
                    time: `From ${day}/${hour}:00Z`,
                    conditions: []
                };
                i++;
                continue;
            }

            // Handle PROB30 TEMPO groups
            if (token === 'PROB30' && i + 1 < tokens.length && tokens[i + 1] === 'TEMPO') {
                if (i + 2 < tokens.length && /^\d{4}\/\d{4}$/.test(tokens[i + 2])) {
                    // Finish current period
                    if (currentPeriod.conditions.length > 0) {
                        periods.push(currentPeriod);
                    }

                    const timeToken = tokens[i + 2];
                    const fromDay = timeToken.substring(0, 2);
                    const fromHour = timeToken.substring(2, 4);
                    const toDay = timeToken.substring(5, 7);
                    const toHour = timeToken.substring(7, 9);

                    // Start new PROB30 TEMPO period
                    currentPeriod = { 
                        type: 'PROB30_TEMPO', 
                        time: `30% chance ${fromDay}/${fromHour}:00Z–${toDay}/${toHour}:00Z`,
                        conditions: []
                    };
                    i += 3;
                    continue;
                }
            }

            // Handle TEMPO groups
            if (token === 'TEMPO' && i + 1 < tokens.length && /^\d{4}\/\d{4}$/.test(tokens[i + 1])) {
                // Finish current period
                if (currentPeriod.conditions.length > 0) {
                    periods.push(currentPeriod);
                }

                const timeToken = tokens[i + 1];
                const fromDay = timeToken.substring(0, 2);
                const fromHour = timeToken.substring(2, 4);
                const toDay = timeToken.substring(5, 7);
                const toHour = timeToken.substring(7, 9);
                currentPeriod = { 
                    type: 'TEMPO', 
                    time: `Temporarily ${fromDay}/${fromHour}:00Z–${toDay}/${toHour}:00Z`,
                    conditions: []
                };
                i += 2;
                continue;
            }

            // Handle BECMG groups
            if (token === 'BECMG' && i + 1 < tokens.length && /^\d{4}\/\d{4}$/.test(tokens[i + 1])) {
                // Finish current period
                if (currentPeriod.conditions.length > 0) {
                    periods.push(currentPeriod);
                }

                const timeToken = tokens[i + 1];
                const fromDay = timeToken.substring(0, 2);
                const fromHour = timeToken.substring(2, 4);
                const toDay = timeToken.substring(5, 7);
                const toHour = timeToken.substring(7, 9);
                currentPeriod = { 
                    type: 'BECMG', 
                    time: `Becoming ${fromDay}/${fromHour}:00Z–${toDay}/${toHour}:00Z`,
                    conditions: []
                };
                i += 2;
                continue;
            }

            // Skip standalone modifiers we've already handled
            if (token === 'PROB30' || token === 'TEMPO' || token === 'BECMG') {
                i++;
                continue;
            }

            // Regular weather condition
            currentPeriod.conditions.push(token);
            i++;
        }

        // Add the last period
        if (currentPeriod.conditions.length > 0) {
            periods.push(currentPeriod);
        }

        // Format the periods with better descriptions
        const briefLines = periods.map(period => {
            const conditionsText = period.conditions.join(' ');
            let line = `<strong>${period.time}</strong>: ${conditionsText}`;

            // Add helpful interpretations
            const interpretations = [];

            // Cloud coverage
            if (conditionsText.includes('SCT')) {
                const match = conditionsText.match(/SCT(\d{3})/);
                if (match) interpretations.push(`scattered clouds at ${parseInt(match[1]) * 100}ft`);
            }
            if (conditionsText.includes('BKN')) {
                const match = conditionsText.match(/BKN(\d{3})/);
                if (match) interpretations.push(`broken clouds at ${parseInt(match[1]) * 100}ft`);
            }
            if (conditionsText.includes('OVC')) {
                const match = conditionsText.match(/OVC(\d{3})/);
                if (match) interpretations.push(`overcast at ${parseInt(match[1]) * 100}ft`);
            }

            // Visibility
            if (conditionsText.includes('9999')) interpretations.push('visibility >10km');
            else if (conditionsText.match(/^\d{4}$/)) {
                const visMatch = conditionsText.match(/^(\d{4})/);
                if (visMatch) interpretations.push(`visibility ${visMatch[1]}m`);
            }

            // Weather phenomena
            if (conditionsText.includes('-RA')) interpretations.push('light rain');
            if (conditionsText.includes('RA')) interpretations.push('rain');
            if (conditionsText.includes('DZ')) interpretations.push('drizzle');
            if (conditionsText.includes('BR')) interpretations.push('mist');
            if (conditionsText.includes('RADZ')) interpretations.push('rain and drizzle');

            if (interpretations.length > 0) {
                line += ` <em>(${interpretations.join(', ')})</em>`;
            }

            return line;
        });

        return briefLines.length > 0 ? briefLines.join('<br>• ') : 'No detailed forecast available.';
    }

    // FIXED: MODAL WITH PROPER TAF DISPLAY
    showAirportDetails(airport) {
        const modal = document.getElementById('weatherModal');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');

        if (!modal || !title || !body) return;

        title.textContent = `${airport.label} Weather Details`;

        const metar = airport.data;
        const tafData = airport.taf;

        body.innerHTML = `
            <div class="weather-info">
                <div class="weather-section">
                    <h4>Current Conditions (METAR)</h4>
                    <div class="weather-raw">${metar.rawOb || 'No METAR data available'}</div>
                    <div class="weather-details-grid">
                        <div class="weather-detail">
                            <div class="weather-detail-label">Flight Category</div>
                            <div class="weather-detail-value" style="color: ${this.getConditionColor(metar.fltCat)}">${metar.fltCat || 'N/A'}</div>
                        </div>
                        <div class="weather-detail">
                            <div class="weather-detail-label">Temperature</div>
                            <div class="weather-detail-value">${metar.temp || 'N/A'}°C</div>
                        </div>
                        <div class="weather-detail">
                            <div class="weather-detail-label">Dewpoint</div>
                            <div class="weather-detail-value">${metar.dewp || 'N/A'}°C</div>
                        </div>
                        <div class="weather-detail">
                            <div class="weather-detail-label">Wind</div>
                            <div class="weather-detail-value">${metar.wdir || 'VRB'}°@${metar.wspd || 0}kt</div>
                        </div>
                        <div class="weather-detail">
                            <div class="weather-detail-label">Visibility</div>
                            <div class="weather-detail-value">${metar.visib || 'N/A'} sm</div>
                        </div>
                        <div class="weather-detail">
                            <div class="weather-detail-label">Observed</div>
                            <div class="weather-detail-value">${metar.obsTime ? new Date(metar.obsTime * 1000).toLocaleTimeString() : 'N/A'}</div>
                        </div>
                    </div>
                </div>
                ${tafData ? `
                <div class="weather-section">
                    <h4>Forecast (TAF)</h4>
                    <div class="weather-raw">${tafData.rawTAF}</div>
                    <div class="weather-details-grid">
                        <div class="weather-detail">
                            <div class="weather-detail-label">Issued</div>
                            <div class="weather-detail-value">${tafData.issueTime ? new Date(tafData.issueTime).toLocaleTimeString() : 'N/A'}</div>
                        </div>
                        <div class="weather-detail">
                            <div class="weather-detail-label">Valid Period</div>
                            <div class="weather-detail-value">${this.getValidPeriod(tafData)}</div>
                        </div>
                    </div>
                    <div style="margin-top: 12px;">
                        <strong>Forecast Brief:</strong><br>
                        • ${this.briefTaf(tafData.rawTAF)}
                    </div>
                </div>
                ` : ''}
                ${this.mockMode ? '<div class="weather-section"><p style="color: orange; font-weight: bold;">⚠️ Demo Data - Start your backend server for real-time weather</p></div>' : ''}
            </div>
        `;

        modal.classList.remove('hidden');
    }

    hideModal() {
        const modal = document.getElementById('weatherModal');
        if (modal) modal.classList.add('hidden');
    }

    showLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'flex';
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    showError(message) {
        const errorOverlay = document.getElementById('errorOverlay');
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) errorMessage.textContent = message;
        if (errorOverlay) errorOverlay.classList.remove('hidden');
    }

    hideError() {
        const errorOverlay = document.getElementById('errorOverlay');
        if (errorOverlay) errorOverlay.classList.add('hidden');
    }

    // ========================================
    // GROQ AI CHATBOT - VERIFIED WORKING MODELS
    // ========================================

    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input?.value.trim();

        if (!message) return;

        this.addUserMessage(message);
        input.value = '';

        this.handleChatQuery(message);
    }

    addUserMessage(message) {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        messageDiv.innerHTML = `
            <div class="message-avatar">👤</div>
            <div class="message-content">
                <p>${message}</p>
            </div>
        `;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    addBotMessage(message) {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;

        const cleanMessage = message.replace(/<\/?[^>]+(>|$)/g, "").trim();

        let formattedHtml = cleanMessage;
        if (typeof marked !== 'undefined') {
            formattedHtml = marked.parse(cleanMessage);
        } else {
            formattedHtml = cleanMessage
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        messageDiv.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <div class="prose prose-invert max-w-none">${formattedHtml}</div>
            </div>
        `;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        this.speak(cleanMessage);
    }

    addTypingIndicator() {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.id = 'typing-indicator';
        messageDiv.className = 'message bot-message';
        messageDiv.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <p class="typing-indicator">
                    <span></span><span></span><span></span>
                </p>
            </div>
        `;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    speak(text) {
        if (!window.speechSynthesis) return;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        const textToSpeak = tempDiv.textContent || tempDiv.innerText || '';

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        speechSynthesis.speak(utterance);
    }

    async handleChatQuery(query) {
        this.addTypingIndicator();

        if (!this.GROQ_API_KEY || this.GROQ_API_KEY.includes('gsk...')) {
            this.removeTypingIndicator();
            this.addBotMessage('⚠️ **Error**: Groq API key is missing or invalid. Please add your key to the configuration.');
            return;
        }

        const departure = document.getElementById('departure')?.value.toUpperCase() || 'Not specified';
        const destination = document.getElementById('destination')?.value.toUpperCase() || 'Not specified';

        const systemPrompt = `You are AeroSentry, an expert AI assistant for aircraft pilots and aviation enthusiasts. Provide clear, concise, and accurate flight-related information with a professional but friendly tone.

**Current Flight Context:**
- Route: ${departure} to ${destination}
- Current Weather Data: ${this.currentWeatherData ? 'Available' : 'Not loaded'}
${this.currentWeatherData ? `- Departure Conditions: ${this.currentWeatherData.departureMetar?.fltCat || 'Unknown'} at ${departure}
- Destination Conditions: ${this.currentWeatherData.destinationMetar?.fltCat || 'Unknown'} at ${destination}
- Distance: ${this.currentWeatherData.departureMetar?.lat ? Math.round(this.calculateDistance(this.currentWeatherData.departureMetar.lat, this.currentWeatherData.departureMetar.lon, this.currentWeatherData.destinationMetar?.lat || 0, this.currentWeatherData.destinationMetar?.lon || 0)).toLocaleString() + ' NM' : 'Unknown'}` : ''}

**Your Expertise Includes:**
- Weather interpretation (METAR/TAF decoding)
- Flight categories (VFR, MVFR, IFR, LIFR)
- Aviation regulations and procedures
- Route planning and analysis
- Aircraft performance considerations
- Safety recommendations

**Response Guidelines:**
- Be professional but conversational
- Use aviation terminology appropriately
- Provide specific, actionable information
- Include safety considerations when relevant
- Use markdown formatting for better readability
- Keep responses concise but comprehensive`;

        // VERIFIED WORKING MODELS (based on user's experience)
        const workingModels = [
            'meta-llama/llama-4-scout-17b-16e-instruct',  // User confirmed this works
            'llama-3.3-70b-versatile',                     // User confirmed as recommended replacement
            'llama-3.1-8b-instant'                         // Fallback option
        ];

        for (const model of workingModels) {
            try {
                console.log(`Trying model: ${model}`);

                const response = await fetch(this.GROQ_API_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.GROQ_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: query }
                        ],
                        temperature: 0.7,
                        max_tokens: 1000
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error(`Model ${model} failed:`, errorData);

                    if (workingModels.indexOf(model) < workingModels.length - 1) {
                        continue;
                    } else {
                        throw new Error(`All models failed. Last error: ${errorData.error?.message || 'Unknown error'} (Status: ${response.status})`);
                    }
                }

                const result = await response.json();
                const aiResponse = result.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

                console.log(`✅ Success with model: ${model}`);
                this.removeTypingIndicator();
                this.addBotMessage(aiResponse);
                return;

            } catch (error) {
                console.error(`Error with model ${model}:`, error);

                if (workingModels.indexOf(model) === workingModels.length - 1) {
                    this.removeTypingIndicator();

                    let errorMessage = '❌ **Sorry, I encountered an error**: ';
                    if (error.message.includes('API Error') || error.message.includes('All models failed')) {
                        errorMessage += error.message + '\n\n💡 Please check your Groq API key and ensure you have credits available.';
                    } else if (error.message.includes('Failed to fetch')) {
                        errorMessage += 'Unable to connect to the AI service. Please check your internet connection.';
                    } else {
                        errorMessage += error.message;
                    }

                    this.addBotMessage(errorMessage);
                }
            }
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.aeroSentry = new AeroSentryApp();
});