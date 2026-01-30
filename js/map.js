// ============================================================================
// MAP - Map Initialization, Floor System, SVG Layer Control
// ============================================================================

// ============================================================================
// MAP MANAGEMENT
// ============================================================================

async function initMap(mapName, questNames = [], selectedQuests = []) {
    const cfg = MAP_CONFIG[mapName];
    if (!cfg) return;
    
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }
    
    // Reset SVG element reference
    currentSvgElement = null;
    
    const isSvg = cfg.file.toLowerCase().endsWith('.svg');
    let svgText = null;
    
    try {
        if (isSvg) {
            // For SVG: fetch and parse viewBox to get dimensions
            const response = await fetch(cfg.file);
            if (!response.ok) throw new Error('SVG not found');
            svgText = await response.text();
            
            // Parse viewBox from SVG
            const viewBoxMatch = svgText.match(/viewBox=["']([^"']+)["']/);
            if (viewBoxMatch) {
                const [minX, minY, width, height] = viewBoxMatch[1].split(/\s+/).map(Number);
                currentMapOffsetX = minX || 0;
                currentMapOffsetY = minY || 0;
                currentMapWidth = width;
                currentMapHeight = height;
                console.log(`SVG viewBox: minX=${minX}, minY=${minY}, width=${width}, height=${height}`);
            } else {
                // Fallback: try width/height attributes
                const widthMatch = svgText.match(/width=["'](\d+)/);
                const heightMatch = svgText.match(/height=["'](\d+)/);
                currentMapWidth = widthMatch ? parseInt(widthMatch[1]) : 1000;
                currentMapHeight = heightMatch ? parseInt(heightMatch[1]) : 1000;
                currentMapOffsetX = 0;
                currentMapOffsetY = 0;
            }
        } else {
            // For raster images: use Image object
            const img = new Image();
            img.src = cfg.file;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            currentMapWidth = img.naturalWidth;
            currentMapHeight = img.naturalHeight;
        }
    } catch (e) {
        document.getElementById('map').innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--eft-red);">
                <div class="text-center">
                    <div style="font-size: 2rem;">!</div>
                    <div>Map not found: ${cfg.file}</div>
                </div>
            </div>
        `;
        return;
    }
    
    imageBounds = [[0, 0], [currentMapHeight, currentMapWidth]];
    
    // Create Leaflet bounds object for pad() method
    const leafletBounds = L.latLngBounds(imageBounds);
    const paddedBounds = leafletBounds.pad(0.1); // 10% padding for maxBounds
    
    // Get map container dimensions to calculate optimal zoom
    const mapContainer = document.getElementById('map');
    const containerWidth = mapContainer.clientWidth;
    const containerHeight = mapContainer.clientHeight;
    
    // Calculate the zoom level that makes the image fit exactly in the container
    // This will be our minZoom (can't zoom out further than full image visible)
    const zoomX = Math.log2(containerWidth / currentMapWidth);
    const zoomY = Math.log2(containerHeight / currentMapHeight);
    const fitZoom = Math.min(zoomX, zoomY);
    
    // Set minZoom slightly below fitZoom to allow small margin, but not too much
    const calculatedMinZoom = Math.floor(fitZoom * 4) / 4; // Round to nearest 0.25
    
    console.log(`Map zoom calculation: container=${containerWidth}x${containerHeight}, image=${currentMapWidth}x${currentMapHeight}, fitZoom=${fitZoom.toFixed(2)}, minZoom=${calculatedMinZoom}`);
    
    mapInstance = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: calculatedMinZoom,
        maxZoom: 5,  // Allow much more zoom in for detail work
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: false,
        maxBounds: paddedBounds,      // Restrict panning/zooming
        maxBoundsViscosity: 1.0       // Hard boundary (no elastic effect)
    });
    
    // Load SVG with DOM access for layer control, or image for raster
    if (isSvg && svgText && cfg.floors && cfg.floors.length > 1) {
        // Parse SVG text into DOM element for layer control
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const svgElement = svgDoc.documentElement;
        
        // Store reference for layer manipulation
        currentSvgElement = svgElement;
        
        // Use L.svgOverlay for DOM access - put it in tilePane so it's below other layers
        currentMapLayer = L.svgOverlay(svgElement, imageBounds, { 
            pane: 'tilePane',
            interactive: false 
        }).addTo(mapInstance);
        
        // Set default floor visibility
        const defaultFloor = cfg.floors.find(f => f.default) || cfg.floors[0];
        currentFloor = defaultFloor.id;
        
        // Don't hide layers initially - show all, just highlight active
        // updateSvgLayerVisibility(cfg, currentFloor);
        
        console.log(`Loaded SVG with layer control, floors: ${cfg.floors.map(f => f.id).join(', ')}`);
    } else {
        // Use image overlay for simple maps or raster images
        currentMapLayer = L.imageOverlay(cfg.file, imageBounds).addTo(mapInstance);
    }
    
    // Fit bounds and set view to show full map centered
    mapInstance.fitBounds(imageBounds);
    
    // Set padded max bounds again after fitBounds (important!)
    mapInstance.setMaxBounds(paddedBounds);
    
    questMarkersLayer = L.layerGroup().addTo(mapInstance);
    
    // Setup floor tabs for multi-level maps
    setupFloorTabs(mapName);
    
    // Draw quest markers only for selected quests
    await drawQuestMarkers(mapName, currentMapWidth, currentMapHeight, questNames, selectedQuests);
    
    // Update floor marker counts and hint
    updateFloorMarkerCounts();
    updateOtherFloorsHint();
    
    // Load and render custom map areas
    await renderMapAreas(mapName);
    
    setTimeout(() => mapInstance.invalidateSize(), 200);
}

function formatFloorName(floor) {
    return floor ? floor.replace(/_/g, ' ') : 'Ground Level';
}

// ============================================================================
// FLOOR SYSTEM - Multi-level map support
// ============================================================================

function setupFloorTabs(mapName) {
    const cfg = MAP_CONFIG[mapName];
    const tabsContainer = document.getElementById('floorTabs');
    
    if (!cfg || !cfg.floors || cfg.floors.length <= 1) {
        tabsContainer.style.display = 'none';
        return;
    }
    
    // Set default floor
    const defaultFloor = cfg.floors.find(f => f.default) || cfg.floors[0];
    currentFloor = defaultFloor.id;
    
    // Build tabs HTML (reversed so highest floor is at top)
    const floorsReversed = [...cfg.floors].reverse();
    tabsContainer.innerHTML = `
        <div class="floor-tabs-label">Floor</div>
        ${floorsReversed.map(floor => `
            <button class="floor-tab ${floor.id === currentFloor ? 'active' : ''}" 
                    data-floor="${floor.id}"
                    onclick="switchFloor('${floor.id}')"
                    title="${floor.label}">
                ${floor.short}
                <span class="marker-count" id="floor-count-${floor.id}">0</span>
            </button>
        `).join('')}
    `;
    
    tabsContainer.style.display = 'flex';
}

function switchFloor(floorId) {
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    const cfg = MAP_CONFIG[mapKey];
    
    currentFloor = floorId;
    
    // Update tab states
    document.querySelectorAll('.floor-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.floor === floorId);
    });
    
    // Update SVG layer visibility if we have layer info
    if (cfg && cfg.floors && currentSvgElement) {
        updateSvgLayerVisibility(cfg, floorId);
    }
    
    // Update marker visibility
    updateMarkerFloorVisibility();
    
    // Update area visibility
    updateAreaFloorVisibility();
    
    // Update other floors hint
    updateOtherFloorsHint();
    
    console.log(`Switched to floor: ${floorId}`);
}

function updateSvgLayerVisibility(cfg, activeFloorId) {
    if (!currentSvgElement) return;
    
    // Get the active floor config
    const activeFloor = cfg.floors.find(f => f.id === activeFloorId);
    
    // Collect all SVG layer IDs from all floors
    const allLayerIds = [];
    cfg.floors.forEach(floor => {
        if (floor.svgLayers) {
            floor.svgLayers.forEach(layerId => {
                if (!allLayerIds.includes(layerId)) {
                    allLayerIds.push(layerId);
                }
            });
        }
    });
    
    // If no layers defined, don't hide anything
    if (allLayerIds.length === 0) return;
    
    // Get active layer IDs for current floor
    const activeLayerIds = activeFloor?.svgLayers || [];
    
    // Update visibility of each layer
    allLayerIds.forEach(layerId => {
        const layerElement = currentSvgElement.getElementById(layerId);
        if (layerElement) {
            const shouldShow = activeLayerIds.includes(layerId) || activeLayerIds.length === 0;
            layerElement.style.opacity = shouldShow ? '1' : '0.15';
            layerElement.style.transition = 'opacity 0.3s ease';
        }
    });
    
    console.log(`SVG layers updated: showing ${activeLayerIds.join(', ') || 'all'}`);
}

function updateMarkerFloorVisibility() {
    if (!questMarkersLayer) return;
    
    questMarkersLayer.eachLayer(marker => {
        const markerFloor = marker.options?.floor || 'ground';
        const isCurrentFloor = markerFloor === currentFloor;
        
        if (marker._icon) {
            if (isCurrentFloor) {
                marker._icon.style.opacity = '1';
                marker._icon.style.filter = 'none';
                marker._icon.style.pointerEvents = 'auto';
            } else {
                marker._icon.style.opacity = '0.25';
                marker._icon.style.filter = 'grayscale(100%)';
                marker._icon.style.pointerEvents = 'none';
            }
        }
    });
}

function updateFloorMarkerCounts() {
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    const cfg = MAP_CONFIG[mapKey];
    
    if (!cfg || !cfg.floors) return;
    
    // Count markers per floor
    const counts = {};
    cfg.floors.forEach(f => counts[f.id] = 0);
    
    if (questMarkersLayer) {
        questMarkersLayer.eachLayer(marker => {
            const floor = marker.options?.floor || 'ground';
            if (counts[floor] !== undefined) {
                counts[floor]++;
            } else {
                counts['ground']++; // Default to ground
            }
        });
    }
    
    // Update tab counts
    cfg.floors.forEach(floor => {
        const countEl = document.getElementById(`floor-count-${floor.id}`);
        if (countEl) {
            countEl.textContent = counts[floor.id] || 0;
            countEl.style.display = counts[floor.id] > 0 ? 'inline-block' : 'none';
        }
    });
    
    return counts;
}

function updateOtherFloorsHint() {
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    const cfg = MAP_CONFIG[mapKey];
    const hintEl = document.getElementById('otherFloorsHint');
    
    if (!cfg || !cfg.floors || cfg.floors.length <= 1) {
        hintEl.style.display = 'none';
        return;
    }
    
    // Count markers NOT on current floor
    let otherCount = 0;
    if (questMarkersLayer) {
        questMarkersLayer.eachLayer(marker => {
            const floor = marker.options?.floor || 'ground';
            if (floor !== currentFloor) {
                otherCount++;
            }
        });
    }
    
    const countEl = document.getElementById('otherFloorsCount');
    if (countEl) countEl.textContent = otherCount;
    
    hintEl.style.display = otherCount > 0 ? 'block' : 'none';
}

function showOtherFloorsMarkers() {
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    const cfg = MAP_CONFIG[mapKey];
    
    if (!cfg || !cfg.floors) return;
    
    // Find floors with markers
    const floorsWithMarkers = [];
    if (questMarkersLayer) {
        questMarkersLayer.eachLayer(marker => {
            const floor = marker.options?.floor || 'ground';
            if (floor !== currentFloor && !floorsWithMarkers.includes(floor)) {
                floorsWithMarkers.push(floor);
            }
        });
    }
    
    if (floorsWithMarkers.length > 0) {
        // Switch to first floor with markers
        switchFloor(floorsWithMarkers[0]);
    }
}

function getFloorLabel(floorId, mapKey) {
    const cfg = MAP_CONFIG[mapKey];
    if (!cfg || !cfg.floors) return floorId;
    const floor = cfg.floors.find(f => f.id === floorId);
    return floor ? floor.label : floorId;
}

function resetMapView() {
    if (mapInstance && imageBounds) {
        mapInstance.fitBounds(imageBounds, { animate: true });
    }
}

// Recalculate map bounds on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (mapInstance && imageBounds) {
            // Recalculate minZoom based on new container size
            const mapContainer = document.getElementById('map');
            const containerWidth = mapContainer.clientWidth;
            const containerHeight = mapContainer.clientHeight;
            
            const zoomX = Math.log2(containerWidth / currentMapWidth);
            const zoomY = Math.log2(containerHeight / currentMapHeight);
            const fitZoom = Math.min(zoomX, zoomY);
            const calculatedMinZoom = Math.floor(fitZoom * 4) / 4;
            
            mapInstance.setMinZoom(calculatedMinZoom);
            mapInstance.invalidateSize();
        }
    }, 250);
});

async function onMapChange() {
    const mapName = document.getElementById('mapSelect').value;
    // Redraw with currently selected quests (if any)
    await initMap(mapName, selectedQuestNamesForMarkers, selectedQuestsForMarkers);
    // Render extract markers (new system)
    await renderExtractMarkers();
    // Also render legacy overlay markers
    await renderOverlayMarkers();
}

