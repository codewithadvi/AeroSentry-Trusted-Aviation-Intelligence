// scripts/spoofing-detection.js
class SpoofingDetector {
    constructor() {
        this.spoofingThresholds = {
            temperature: 2.0,    // °C difference
            pressure: 0.05,      // inches Hg difference
            windSpeed: 5,        // knots difference
            visibility: 1.0,     // miles difference
            ceiling: 500,        // feet difference
            humidity: 15         // percentage difference
        };
        
        this.spoofingIndicators = [];
        this.spoofingAttempts = 0;
    }

    // Main spoofing detection method
    detectSpoofing(realTimeData, syntheticData) {
        this.spoofingIndicators = [];
        
        const anomalies = {
            temperature: this.checkTemperature(realTimeData.temperature, syntheticData.temperature),
            pressure: this.checkPressure(realTimeData.pressure, syntheticData.pressure),
            wind: this.checkWind(realTimeData.wind, syntheticData.wind),
            visibility: this.checkVisibility(realTimeData.visibility, syntheticData.visibility),
            ceiling: this.checkCeiling(realTimeData.ceiling, syntheticData.ceiling),
            flightCategory: this.checkFlightCategory(realTimeData.flightCategory, syntheticData.flightCategory),
            weatherPhenomena: this.checkWeatherPhenomena(realTimeData.weather, syntheticData.weather)
        };

        const result = this.analyzeAnomalies(anomalies);
        
        if (result.isSpoofed) {
            this.spoofingAttempts++;
            this.logSpoofingAttempt(realTimeData, syntheticData, result);
        }
        
        return result;
    }

    // Individual parameter checks
    checkTemperature(realTemp, syntheticTemp) {
        const diff = Math.abs(realTemp - syntheticTemp);
        if (diff > this.spoofingThresholds.temperature) {
            this.spoofingIndicators.push(`Temperature anomaly: ${diff.toFixed(1)}°C difference (Real: ${realTemp}°C vs Synthetic: ${syntheticTemp}°C)`);
            return { spoofed: true, severity: this.getSeverity(diff, 5), difference: diff };
        }
        return { spoofed: false, difference: diff };
    }

    checkPressure(realPressure, syntheticPressure) {
        const diff = Math.abs(realPressure - syntheticPressure);
        if (diff > this.spoofingThresholds.pressure) {
            this.spoofingIndicators.push(`Pressure anomaly: ${diff.toFixed(3)} inHg difference (Real: ${realPressure} vs Synthetic: ${syntheticPressure})`);
            return { spoofed: true, severity: this.getSeverity(diff * 100, 5), difference: diff };
        }
        return { spoofed: false, difference: diff };
    }

    checkWind(realWind, syntheticWind) {
        const speedDiff = Math.abs(realWind.speed - syntheticWind.speed);
        const directionDiff = Math.abs(realWind.direction - syntheticWind.direction) % 360;
        const directionDiffNormalized = Math.min(directionDiff, 360 - directionDiff);

        let spoofed = false;
        let indicators = [];

        if (speedDiff > this.spoofingThresholds.windSpeed) {
            indicators.push(`Wind speed anomaly: ${speedDiff.toFixed(1)} knots difference`);
            spoofed = true;
        }
        if (directionDiffNormalized > 45) {
            indicators.push(`Wind direction anomaly: ${directionDiffNormalized.toFixed(0)}° difference`);
            spoofed = true;
        }

        if (spoofed) {
            this.spoofingIndicators.push(...indicators);
            return { 
                spoofed: true, 
                severity: this.getSeverity(Math.max(speedDiff, directionDiffNormalized/10), 10),
                speedDifference: speedDiff,
                directionDifference: directionDiffNormalized
            };
        }

        return { spoofed: false, speedDifference: speedDiff, directionDifference: directionDiffNormalized };
    }

    checkVisibility(realVis, syntheticVis) {
        const diff = Math.abs(realVis - syntheticVis);
        if (diff > this.spoofingThresholds.visibility) {
            this.spoofingIndicators.push(`Visibility anomaly: ${diff.toFixed(1)} miles difference (Real: ${realVis}mi vs Synthetic: ${syntheticVis}mi)`);
            return { spoofed: true, severity: this.getSeverity(diff, 2), difference: diff };
        }
        return { spoofed: false, difference: diff };
    }

    checkCeiling(realCeiling, syntheticCeiling) {
        const diff = Math.abs(realCeiling - syntheticCeiling);
        if (diff > this.spoofingThresholds.ceiling) {
            this.spoofingIndicators.push(`Ceiling anomaly: ${diff.toFixed(0)} feet difference (Real: ${realCeiling}ft vs Synthetic: ${syntheticCeiling}ft)`);
            return { spoofed: true, severity: this.getSeverity(diff/100, 10), difference: diff };
        }
        return { spoofed: false, difference: diff };
    }

    checkFlightCategory(realCategory, syntheticCategory) {
        const categoryOrder = { 'VFR': 0, 'MVFR': 1, 'IFR': 2, 'LIFR': 3 };
        const realOrder = categoryOrder[realCategory] || 0;
        const syntheticOrder = categoryOrder[syntheticCategory] || 0;
        const diff = Math.abs(realOrder - syntheticOrder);

        if (diff >= 2) { // Major category difference (e.g., VFR vs IFR)
            this.spoofingIndicators.push(`Flight category manipulation: Real ${realCategory} vs Synthetic ${syntheticCategory}`);
            return { spoofed: true, severity: 'high', difference: diff };
        }

        return { spoofed: false, difference: diff };
    }

    checkWeatherPhenomena(realWeather, syntheticWeather) {
        const realSet = new Set(realWeather || []);
        const syntheticSet = new Set(syntheticWeather || []);
        
        const missingPhenomena = [...syntheticSet].filter(p => !realSet.has(p));
        const addedPhenomena = [...realSet].filter(p => !syntheticSet.has(p));

        if (missingPhenomena.length > 0 || addedPhenomena.length > 0) {
            if (missingPhenomena.length > 0) {
                this.spoofingIndicators.push(`Missing weather phenomena: ${missingPhenomena.join(', ')}`);
            }
            if (addedPhenomena.length > 0) {
                this.spoofingIndicators.push(`Added weather phenomena: ${addedPhenomena.join(', ')}`);
            }
            return { 
                spoofed: true, 
                severity: missingPhenomena.length + addedPhenomena.length > 1 ? 'high' : 'medium',
                missing: missingPhenomena, 
                added: addedPhenomena 
            };
        }

        return { spoofed: false };
    }

    // Analysis and scoring
    analyzeAnomalies(anomalies) {
        const spoofedCategories = Object.entries(anomalies).filter(([_, anomaly]) => anomaly.spoofed);
        const totalScore = spoofedCategories.reduce((score, [category, anomaly]) => {
            const severityWeight = { low: 1, medium: 2, high: 3 }[anomaly.severity] || 1;
            const categoryWeight = this.getCategoryWeight(category);
            return score + (severityWeight * categoryWeight);
        }, 0);

        let spoofingProbability = 'low';
        let confidence = 'Possible';
        
        if (totalScore >= 8) {
            spoofingProbability = 'high';
            confidence = 'Confirmed';
        } else if (totalScore >= 4) {
            spoofingProbability = 'medium';
            confidence = 'Likely';
        }

        return {
            isSpoofed: spoofedCategories.length > 0,
            probability: spoofingProbability,
            confidence: confidence,
            score: totalScore,
            indicators: this.spoofingIndicators,
            affectedParameters: spoofedCategories.map(([category]) => category),
            details: anomalies
        };
    }

    getCategoryWeight(category) {
        const weights = {
            flightCategory: 3,    // Most critical
            ceiling: 2,
            visibility: 2,
            wind: 1.5,
            weatherPhenomena: 1.5,
            temperature: 1,
            pressure: 1
        };
        return weights[category] || 1;
    }

    getSeverity(difference, threshold) {
        const ratio = difference / threshold;
        if (ratio > 2) return 'high';
        if (ratio > 1) return 'medium';
        return 'low';
    }

    logSpoofingAttempt(realData, syntheticData, result) {
        console.warn('🚨 Spoofing Attempt Detected:', {
            timestamp: new Date().toISOString(),
            realData,
            syntheticData,
            detectionResult: result,
            totalAttempts: this.spoofingAttempts
        });
    }

    // Method to generate realistic spoofed data for demonstration
    generateSpoofedData(realData, spoofType = 'moderate') {
        const spoofedData = { ...realData };
        
        switch (spoofType) {
            case 'aggressive':
                // Major spoofing - clear weather when it's actually bad
                spoofedData.flightCategory = 'VFR';
                spoofedData.visibility = 10;
                spoofedData.ceiling = 10000;
                spoofedData.weather = ['Clear'];
                spoofedData.temperature = realData.temperature + 5;
                break;
                
            case 'moderate':
                // Moderate spoofing - improve conditions slightly
                if (realData.flightCategory === 'IFR') spoofedData.flightCategory = 'MVFR';
                if (realData.flightCategory === 'LIFR') spoofedData.flightCategory = 'IFR';
                spoofedData.visibility = Math.min(realData.visibility + 2, 10);
                spoofedData.ceiling = realData.ceiling + 1000;
                break;
                
            case 'subtle':
                // Subtle spoofing - minor improvements
                spoofedData.visibility = realData.visibility + 0.5;
                spoofedData.ceiling = realData.ceiling + 500;
                spoofedData.temperature = realData.temperature + 1;
                break;
        }
        
        return spoofedData;
    }

    resetAttempts() {
        this.spoofingAttempts = 0;
    }
}