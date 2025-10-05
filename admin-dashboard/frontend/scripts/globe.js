// scripts/globe.js (Fixed Version with Rotating Path)

class GlobeManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Globe container #${containerId} not found.`);
            return;
        }
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.controls = null;
        this.earth = null;
        this.flightPath = null;
        this.markers = [];
        this.earthGroup = new THREE.Group(); // Group to hold earth and paths
        this.overlays = new THREE.Group();
        
        this.initialize();
    }
    
    initialize() {
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);
        
        // Lighting
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 3, 5);
        this.scene.add(directionalLight);
        
        // Add earth group to scene
        this.scene.add(this.earthGroup);
        
        this.createEarth();
        
        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enablePan = false;
        this.controls.minDistance = 2.5;
        this.controls.maxDistance = 10;
        this.controls.rotateSpeed = 0.4;
        
        this.camera.position.z = 5;
        this.animate();
        
        window.addEventListener('resize', () => this.handleResize());
    }
    
    createEarth() {
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
        
        this.earth = new THREE.Mesh(
            new THREE.SphereGeometry(2, 64, 64),
            new THREE.MeshPhongMaterial({ 
                map: texture, 
                specular: 0x333333, 
                shininess: 15 
            })
        );
        this.earthGroup.add(this.earth);
        
        // Atmosphere effect
        const atmosphere = new THREE.Mesh(
            new THREE.SphereGeometry(2.1, 64, 64),
            new THREE.ShaderMaterial({
                vertexShader: `
                    varying vec3 vertexNormal;
                    void main() {
                        vertexNormal = normalize(normalMatrix * normal);
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    varying vec3 vertexNormal;
                    void main() {
                        float intensity = pow(0.6 - dot(vertexNormal, vec3(0, 0, 1.0)), 2.0);
                        gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
                    }
                `,
                blending: THREE.AdditiveBlending,
                side: THREE.BackSide,
                transparent: true
            })
        );
        this.earthGroup.add(atmosphere);
    }
    
    latLonToVector3(lat, lon, radius = 2.02) {
        // Convert latitude and longitude to spherical coordinates
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        
        const x = -(radius * Math.sin(phi) * Math.cos(theta));
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        
        return new THREE.Vector3(x, y, z);
    }
    
    drawFlightPath(startCoords, endCoords, routePoints) {
        this.clearFlightPath();
        
        if (!startCoords || !endCoords || !routePoints || routePoints.length === 0) {
            console.warn("Invalid coordinates for flight path");
            return;
        }

        try {
            // Convert all points to 3D vectors relative to earth surface
            const points = routePoints.map(p => this.latLonToVector3(p.lat, p.lon));
            
            // Create curved path using CatmullRom curve
            const curve = new THREE.CatmullRomCurve3(points);
            const curvePoints = curve.getPoints(50); // More points for smoother curve
            
            // Create the flight path line
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
            const lineMaterial = new THREE.LineBasicMaterial({ 
                color: 0x00ffff, 
                linewidth: 3,
                transparent: true, 
                opacity: 0.8 
            });
            const pathLine = new THREE.Line(lineGeometry, lineMaterial);
            
            // Create a tube for better visibility
            const tubeGeometry = new THREE.TubeGeometry(curve, 64, 0.02, 8, false);
            const tubeMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x00ffff, 
                transparent: true, 
                opacity: 0.3 
            });
            const pathTube = new THREE.Mesh(tubeGeometry, tubeMaterial);
            
            // Create markers for start and end
            const startMarker = this.createAirportMarker(points[0], 0x00ff00, 'START');
            const endMarker = this.createAirportMarker(points[points.length - 1], 0xff0000, 'END');
            
            // Add pulsing animation to markers
            this.animateMarker(startMarker);
            this.animateMarker(endMarker);
            
            // Create group for the flight path
            this.flightPath = new THREE.Group();
            this.flightPath.add(pathLine);
            this.flightPath.add(pathTube);
            this.flightPath.add(startMarker);
            this.flightPath.add(endMarker);
            
            // Add flight path to the earth group so it rotates with the earth
            this.earthGroup.add(this.flightPath);
            
            console.log("Flight path drawn successfully with rotation");
            
            // Add animation to the path
            this.animateFlightPath(pathLine, pathTube);
            
        } catch (error) {
            console.error("Error drawing flight path:", error);
        }
    }
    
    createAirportMarker(position, color, label) {
        const markerGeometry = new THREE.SphereGeometry(0.05, 16, 16);
        const markerMaterial = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.9
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(position);
        
        // Add glow effect
        const glowGeometry = new THREE.SphereGeometry(0.08, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        marker.add(glow);
        
        return marker;
    }
    
    animateMarker(marker) {
        const originalScale = marker.scale.clone();
        let scaleDirection = 1;
        
        const animate = () => {
            if (!marker.parent) return; // Stop if marker removed
            
            marker.scale.lerp(
                originalScale.clone().multiplyScalar(scaleDirection > 0 ? 1.2 : 0.8), 
                0.1
            );
            
            if (marker.scale.x >= originalScale.x * 1.3) scaleDirection = -1;
            if (marker.scale.x <= originalScale.x * 0.7) scaleDirection = 1;
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    animateFlightPath(line, tube) {
        const pulseMaterial = (material, originalOpacity) => {
            let opacityDirection = -1;
            
            const pulse = () => {
                if (!material) return;
                
                material.opacity += opacityDirection * 0.02;
                
                if (material.opacity <= 0.3) {
                    material.opacity = 0.3;
                    opacityDirection = 1;
                } else if (material.opacity >= 0.8) {
                    material.opacity = 0.8;
                    opacityDirection = -1;
                }
                
                material.needsUpdate = true;
                requestAnimationFrame(() => pulse(material, originalOpacity));
            };
            
            pulse();
        };
        
        pulseMaterial(line.material, 0.8);
        pulseMaterial(tube.material, 0.3);
    }
    
    clearFlightPath() {
        if (this.flightPath) {
            this.earthGroup.remove(this.flightPath);
            
            // Dispose of geometry and materials to prevent memory leaks
            this.flightPath.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.flightPath = null;
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.controls) this.controls.update();
        
        // Rotate the entire earth group (including flight paths)
        if (this.earthGroup) {
            this.earthGroup.rotation.y += 0.0005;
        }
        
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    handleResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
    
    // Method to highlight hazardous segments
    highlightHazardousSegment(segmentPoints, hazardType = 'thunderstorm') {
        if (!segmentPoints || segmentPoints.length < 2) return;
        
        const points = segmentPoints.map(p => this.latLonToVector3(p.lat, p.lon));
        const curve = new THREE.CatmullRomCurve3(points);
        
        const hazardColor = hazardType === 'thunderstorm' ? 0xff0000 : 
                           hazardType === 'turbulence' ? 0xffaa00 : 0xffff00;
        
        const hazardGeometry = new THREE.TubeGeometry(curve, 32, 0.03, 8, false);
        const hazardMaterial = new THREE.MeshBasicMaterial({ 
            color: hazardColor,
            transparent: true,
            opacity: 0.6
        });
        const hazardSegment = new THREE.Mesh(hazardGeometry, hazardMaterial);
        
        // Pulsing effect for hazards
        const pulseHazard = () => {
            hazardMaterial.opacity = 0.3 + Math.sin(Date.now() * 0.005) * 0.3;
            hazardMaterial.needsUpdate = true;
            requestAnimationFrame(pulseHazard);
        };
        pulseHazard();
        
        this.earthGroup.add(hazardSegment);
        
        return hazardSegment; // Return reference for possible removal later
    }
}