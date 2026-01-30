// ============================================================================
// QUESTS - Quest Loading, Management, Completion Tracking
// ============================================================================

// ============================================================================
// TARKOVDATA INTEGRATION - Quest Locations
// ============================================================================

// Fallback URL for quests without zones in tarkov.dev
const TARKOVDATA_QUESTS_URL = 'https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/quests.json';
const TARKOVDATA_GPS_URL = 'https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/objective_gps.json';
const TARKOVDATA_MAPS_URL = 'https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/maps.json';

// tdevId to mapKey mapping (from tarkovdata maps.json)
const TDEV_ID_TO_MAP = {
    '55f2d3fd4bdc2d5f408b4567': 'factory',
    '56f40101d2720b2a4d8b45d6': 'customs',
    '5704e3c2d2720bac5b8b4567': 'woods',
    '5704e554d2720bac5b8b456e': 'shoreline',
    '5714dbc024597771384a510d': 'interchange',
    '5b0fc42d86f7744a585f9105': 'labs',
    '5704e5fad2720bc05b8b4567': 'reserve',
    '5704e4dad2720bb55b8b4567': 'lighthouse',
    '5714dc692459777137212e12': 'streets',
    '653e6760052c01c1c805532f': 'groundzero',
    // Also handle night factory
    '59fc81d786f774390775787e': 'factory'
};

// Global GPS data cache (loaded from objective_gps.json)
let objectiveGpsData = null;

async function loadQuestLocationsData() {
    try {
        // Load objective_gps.json - the PRIMARY source for GPS coordinates!
        const gpsResponse = await fetch(TARKOVDATA_GPS_URL);
        if (gpsResponse.ok) {
            objectiveGpsData = await gpsResponse.json();
            console.log('Loaded objective_gps.json:', Object.keys(objectiveGpsData).length, 'GPS entries');
        }
    } catch (err) {
        console.error('Error loading objective_gps.json:', err);
    }
    
    // Now load quests.json to get quest names and objective descriptions
    return await loadQuestLocationsFromTarkovdata();
}

async function loadQuestLocationsFromTarkovdata() {
    try {
        const response = await fetch(TARKOVDATA_QUESTS_URL);
        if (!response.ok) throw new Error('Failed to load tarkovdata');
        const data = await response.json();
        
        questLocationsData = { byMap: {}, byQuestName: {}, byObjectiveId: {} };
        let totalLocations = 0;
        let fromGpsFile = 0;
        let fromEmbedded = 0;
        
        // tarkovdata is an array
        data.forEach((quest, arrayIndex) => {
            // Use gameId for matching with tarkov.dev API, fallback to array index
            const questId = quest.gameId || `tarkovdata-${arrayIndex}`;
            const questTitle = (quest.title || quest.name || '').toLowerCase().trim();
            
            if (quest.objectives) {
                quest.objectives.forEach((obj, objIdx) => {
                    const objIndex = objIdx + 1;
                    const objectiveId = obj.id?.toString();
                    
                    // Try to get GPS from objective_gps.json first (primary source)
                    let gpsData = null;
                    let mapKey = null;
                    let source = 'none';
                    
                    if (objectiveGpsData && objectiveId && objectiveGpsData[objectiveId]) {
                        const gps = objectiveGpsData[objectiveId];
                        mapKey = TDEV_ID_TO_MAP[gps.map];
                        if (mapKey) {
                            gpsData = {
                                leftPercent: gps.leftPercent,
                                topPercent: gps.topPercent,
                                floor: gps.floor || 'Ground_Level'
                            };
                            source = 'objective_gps.json';
                            fromGpsFile++;
                        }
                    }
                    
                    // Fallback: Check if GPS is embedded in quests.json
                    if (!gpsData && obj.gps && obj.gps.leftPercent !== undefined) {
                        mapKey = getMapKeyFromLocation(obj.location, quest);
                        if (mapKey) {
                            gpsData = {
                                leftPercent: obj.gps.leftPercent,
                                topPercent: obj.gps.topPercent,
                                floor: obj.gps.floor || 'Ground_Level'
                            };
                            source = 'quests.json';
                            fromEmbedded++;
                        }
                    }
                    
                    // If we have GPS data, add it
                    if (gpsData && mapKey) {
                        const locData = {
                            questId: questId,
                            questName: quest.title || quest.name || `Quest ${questId}`,
                            objectiveIndex: objIndex,
                            objectiveId: objectiveId,
                            type: obj.type || 'unknown',
                            description: obj.target || `${obj.type || 'Objective'} #${objIndex}`,
                            target: obj.target || '',
                            tool: obj.tool || '',
                            leftPercent: gpsData.leftPercent,
                            topPercent: gpsData.topPercent,
                            floor: gpsData.floor,
                            mapKey: mapKey,
                            source: source
                        };
                        
                        // Index by map
                        if (!questLocationsData.byMap[mapKey]) {
                            questLocationsData.byMap[mapKey] = [];
                        }
                        questLocationsData.byMap[mapKey].push(locData);
                        
                        // Index by quest name (lowercase for matching)
                        if (!questLocationsData.byQuestName[questTitle]) {
                            questLocationsData.byQuestName[questTitle] = [];
                        }
                        questLocationsData.byQuestName[questTitle].push(locData);
                        
                        // Index by objective ID for direct lookup
                        if (objectiveId) {
                            questLocationsData.byObjectiveId[objectiveId] = locData;
                        }
                        
                        totalLocations++;
                    }
                });
            }
        });
        
        console.log(`Quest locations loaded: ${totalLocations} total (${fromGpsFile} from objective_gps.json, ${fromEmbedded} from embedded quests.json)`);
        return questLocationsData;
    } catch (error) {
        console.error('Error loading quest locations:', error);
        return null;
    }
}

function getMapKeyFromName(mapName) {
    if (!mapName) return null;
    const name = mapName.toLowerCase();
    const mapping = {
        'customs': 'customs',
        'factory': 'factory',
        'woods': 'woods',
        'shoreline': 'shoreline',
        'interchange': 'interchange',
        'reserve': 'reserve',
        'the lab': 'labs',
        'laboratory': 'labs',
        'labs': 'labs',
        'lighthouse': 'lighthouse',
        'streets of tarkov': 'streets',
        'streets': 'streets',
        'ground zero': 'groundzero',
        'groundzero': 'groundzero'
    };
    return mapping[name] || null;
}

function getMapKeyFromLocation(locationId, quest) {
    // CORRECTED MAPPING based on tarkovdata analysis:
    // Verified via boss locations: Tagilla(Factory), Killa(Interchange), 
    // Sanitar(Shoreline), Glukhar(Reserve), and known quest locations
    const locationMap = {
        0: 'factory',      // Tagilla, Factory quests
        1: 'customs',      // Background Check, Customs quests
        2: 'woods',        // Shootout Picnic, Woods quests
        3: 'shoreline',    // Sanitar, Shoreline quests
        4: 'interchange',  // Killa, Interchange quests
        5: 'labs',         // TerraGroup Employee, Labs quests
        6: 'reserve',      // Glukhar, Reserve quests
        7: 'lighthouse',   // Long Road, Lighthouse quests
        8: 'streets',      // Streets of Tarkov (not in tarkovdata yet)
        9: 'groundzero'    // Ground Zero (not in tarkovdata yet)
    };
    
    if (locationId !== undefined && locationMap[locationId]) {
        return locationMap[locationId];
    }
    if (quest.location !== undefined && locationMap[quest.location]) {
        return locationMap[quest.location];
    }
    return null;
}

// Quest color palette - distinct colors for each quest
const QUEST_COLORS = [
    { fill: '#2d7a2d', border: '#7fff7f' },  // Green
    { fill: '#7a2d7a', border: '#ff7fff' },  // Magenta
    { fill: '#2d5a7a', border: '#7fdfff' },  // Cyan
    { fill: '#7a5a2d', border: '#ffc77f' },  // Orange
    { fill: '#5a2d7a', border: '#bf7fff' },  // Purple
    { fill: '#7a2d2d', border: '#ff7f7f' },  // Red
    { fill: '#2d7a5a', border: '#7fffbf' },  // Teal
    { fill: '#7a7a2d', border: '#ffff7f' },  // Yellow
    { fill: '#4a4a7a', border: '#9f9fff' },  // Lavender
    { fill: '#7a4a4a', border: '#ffafaf' },  // Pink
    { fill: '#2d4a4a', border: '#7fbfbf' },  // Dark Cyan
    { fill: '#4a7a4a', border: '#afdfaf' },  // Lime
];

let currentQuestColors = {};

async function drawQuestMarkers(mapKey, mapWidth, mapHeight, questNames = [], selectedQuests = []) {
    if (!questMarkersLayer) {
        questMarkersLayer = L.layerGroup();
    }
    questMarkersLayer.clearLayers();
    
    const legend = document.getElementById('mapLegend');
    const legendItems = document.getElementById('legendItems');
    
    // Get map config
    const mapCfg = MAP_CONFIG[mapKey] || {};
    
    // Load marker corrections from database
    const corrections = await loadMarkerCorrections(mapKey);
    
    // Load manually placed markers from database (primary source)
    const manualMarkers = await loadManualMarkers(mapKey);
    
    // Build lookup for manual markers: questId|objectiveId -> marker data
    const manualMarkerLookup = {};
    manualMarkers.forEach(m => {
        const key = `${m.questId}|${m.objectiveId}`;
        manualMarkerLookup[key] = m;
    });
    
    // Only draw markers if we have selected quests
    if (questNames.length === 0) {
        updateMarkerCount(0);
        legend.style.display = 'none';
        return;
    }
    
    // Build a map of quest name -> API map key for validation
    const questApiMaps = {};
    selectedQuests.forEach(q => {
        const normalizedName = q.name.toLowerCase().trim();
        if (q.map?.name && q.map.name.toLowerCase() !== 'any') {
            questApiMaps[normalizedName] = mapNameToKey(q.map.name);
        }
    });
    
    // Assign colors to quests
    currentQuestColors = {};
    questNames.forEach((qName, index) => {
        currentQuestColors[qName.toLowerCase().trim()] = QUEST_COLORS[index % QUEST_COLORS.length];
    });
    
    // Build legend
    legendItems.innerHTML = questNames.map((qName, index) => {
        const color = QUEST_COLORS[index % QUEST_COLORS.length];
        return `<div class="legend-item">
            <div class="legend-color" style="background: ${color.fill}; border-color: ${color.border};"></div>
            <span>${qName}</span>
        </div>`;
    }).join('');
    legend.style.display = 'block';
    
    let markerCount = 0;
    const drawnObjectives = new Set(); // Track what we've drawn to avoid duplicates
    
    // PHASE 1: Draw manually placed markers first (highest priority)
    selectedQuests.forEach((quest, questIndex) => {
        const normalizedName = quest.name.toLowerCase().trim();
        const color = QUEST_COLORS[questIndex % QUEST_COLORS.length];
        
        if (!quest.objectives) return;
        
        quest.objectives.forEach((obj, objIdx) => {
            // Use same ID logic as when saving markers
            const objectiveId = obj.id || `${quest.id}-obj-${objIdx + 1}`;
            const manualKey = `${quest.id}|${objectiveId}`;
            const manualMarker = manualMarkerLookup[manualKey];
            
            if (manualMarker) {
                // Draw this manual marker
                const objectiveKey = `${quest.id}|${objectiveId}|${mapKey}`;
                if (drawnObjectives.has(objectiveKey)) return;
                drawnObjectives.add(objectiveKey);
                
                const loc = {
                    questId: quest.id,
                    questName: quest.name,
                    objectiveIndex: manualMarker.objectiveIndex || (objIdx + 1),
                    objectiveId: objectiveId,
                    type: obj.type || 'unknown',
                    description: manualMarker.description || obj.description || `Objective ${objIdx + 1}`,
                    leftPercent: manualMarker.leftPercent,
                    topPercent: manualMarker.topPercent,
                    mapKey: mapKey,
                    floor: manualMarker.floor || 'ground',
                    source: 'manual'
                };
                
                drawSingleQuestMarker(loc, color, mapCfg, mapWidth, mapHeight, corrections, markerCount);
                markerCount++;
            }
        });
    });
    
    // PHASE 2: Draw tarkovdata markers for objectives that don't have manual markers
    if (questLocationsData) {
        questNames.forEach((qName, questIndex) => {
            const normalizedName = qName.toLowerCase().trim();
            const locations = questLocationsData.byQuestName[normalizedName] || [];
            const color = QUEST_COLORS[questIndex % QUEST_COLORS.length];
            
            // Get the authoritative API map for this quest (if any)
            const apiMapKey = questApiMaps[normalizedName];
            
            locations.forEach(loc => {
                // Check if we already drew this objective manually
                const objectiveKey = `${loc.questId}|${loc.objectiveId}|${mapKey}`;
                if (drawnObjectives.has(objectiveKey)) return;
                
                // Determine if we should draw this marker
                let shouldDraw = false;
                
                if (apiMapKey) {
                    shouldDraw = (mapKey === apiMapKey);
                } else {
                    shouldDraw = (loc.mapKey === mapKey);
                }
                
                if (!shouldDraw) return;
                
                // Check if this API marker is hidden by the user
                if (isApiMarkerHidden(loc.questId, loc.objectiveIndex, mapKey)) {
                    console.log(`Skipping hidden API marker: ${loc.questName} #${loc.objectiveIndex}`);
                    return;
                }
                
                drawnObjectives.add(objectiveKey);
                drawSingleQuestMarker(loc, color, mapCfg, mapWidth, mapHeight, corrections, markerCount);
                markerCount++;
            });
        });
    }
    
    if (mapInstance) {
        questMarkersLayer.addTo(mapInstance);
    }
    
    updateMarkerCount(markerCount);
    console.log(`Drew ${markerCount} quest markers (${manualMarkers.length} manual, rest from tarkovdata)`);
}

function drawSingleQuestMarker(loc, color, mapCfg, mapWidth, mapHeight, corrections, markerIndex) {
    // Check for database correction for this marker
    const correctionKey = `${loc.questId}|${loc.objectiveIndex}`;
    const correction = corrections[correctionKey];
    
    let leftPercent = loc.leftPercent;
    let topPercent = loc.topPercent;
    let hasCorrection = false;
    
    if (correction) {
        leftPercent = correction.correctedLeftPercent;
        topPercent = correction.correctedTopPercent;
        hasCorrection = true;
    }
    
    // Simple coordinate conversion: percent to Leaflet coordinates
    // leftPercent/topPercent are designed for the SVG viewBox
    const pixelX = (leftPercent / 100) * mapWidth;
    const pixelY = (topPercent / 100) * mapHeight;
    
    // Leaflet CRS.Simple: Y is inverted (0 at bottom, height at top)
    const leafletX = pixelX;
    const leafletY = mapHeight - pixelY;
    
    // Create custom div icon with number
    const markerHtml = `
        <div style="position: relative; width: 24px; height: 24px;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background: ${color.fill}; border: 3px solid ${color.border};"></div>
            <div style="position: absolute; top: -6px; right: -6px; background: #c4b896; color: #000; font-weight: 700; font-size: 10px; width: 14px; height: 14px; line-height: 14px; text-align: center; border-radius: 50%;">${loc.objectiveIndex || (markerIndex + 1)}</div>
            ${loc.source === 'manual' ? '<div style="position: absolute; bottom: -4px; left: -4px; background: #4CAF50; color: #fff; font-size: 8px; width: 12px; height: 12px; line-height: 12px; text-align: center; border-radius: 50%;">✓</div>' : ''}
        </div>
    `;
    
    const icon = L.divIcon({
        html: markerHtml,
        className: 'quest-marker-icon',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    
    // Create marker with floor info for visibility filtering
    const marker = L.marker([leafletY, leafletX], { 
        icon: icon,
        draggable: false,
        floor: loc.floor || 'ground'
    });
    
    // Store metadata for corrections system
    marker._questData = {
        questId: loc.questId,
        questName: loc.questName,
        objectiveId: loc.objectiveId,
        objectiveIndex: loc.objectiveIndex,
        mapKey: loc.mapKey,
        originalLeftPercent: leftPercent,
        originalTopPercent: topPercent,
        description: loc.description,
        hasDbCorrection: hasCorrection,
        source: loc.source,
        floor: loc.floor
    };
    
    // Enable dragging if in edit mode
    if (isEditMode && marker.dragging) {
        marker.dragging.enable();
    }
    
    // Drag event handlers
    marker.on('dragstart', function(e) {
        this._icon?.classList.add('marker-dragging');
    });
    
    marker.on('dragend', function(e) {
        this._icon?.classList.remove('marker-dragging');
        if (isEditMode && currentUser) {
            showCorrectionDialog(this, e);
        }
    });
    
    // Build tooltip and popup
    const typeLabels = {
        'mark': 'MARK', 'find': 'FIND', 'pickup': 'PICKUP', 'place': 'PLACE',
        'locate': 'LOCATE', 'key': 'KEY', 'shoot': 'SHOOT', 'kill': 'KILL',
        'extract': 'EXTRACT', 'visit': 'VISIT', 'plantItem': 'PLANT', 'giveItem': 'GIVE'
    };
    const typeLabel = typeLabels[loc.type] || (loc.type ? loc.type.toUpperCase() : 'OBJECTIVE');
    
    const typeColorClass = {
        'mark': 'obj-mark', 'find': 'obj-find', 'pickup': 'obj-pickup', 'place': 'obj-place',
        'locate': 'obj-locate', 'kill': 'obj-kill', 'shoot': 'obj-kill',
        'key': 'obj-find', 'visit': 'obj-locate', 'plantItem': 'obj-place', 'giveItem': 'obj-place'
    }[loc.type] || 'obj-find';
    
    const sourceLabel = loc.source === 'manual' ? '<span style="color: #4CAF50; font-size: 0.7rem;">✓ Manual</span>' : '';
    const floorLabel = loc.floor && loc.floor !== 'ground' 
        ? `<div class="popup-footer">📍 Floor: ${getFloorLabel(loc.floor, loc.mapKey)}</div>` : '';
    
    // Get any existing note for this quest marker
    const noteKey = `quest|${loc.questId}-${loc.objectiveId}`;
    const existingNote = getMarkerNote('quest', `${loc.questId}-${loc.objectiveId}`);
    const noteHtml = existingNote 
        ? `<div class="marker-note-display">📝 ${existingNote}</div>` 
        : '';
    
    // Action button: Hide for API markers, Delete for manual markers
    const isApiMarker = loc.source !== 'manual';
    const actionBtn = isApiMarker
        ? `<button class="popup-action-btn popup-hide-btn" onclick="hideApiMarker('${loc.questId}', ${loc.objectiveIndex}, '${loc.mapKey}', '${loc.questName.replace(/'/g, "\\'")}')">🚫 Hide (wrong location)</button>`
        : `<button class="popup-action-btn popup-delete-btn" onclick="deleteManualMarkerFromPopup('${loc.questId}', '${loc.objectiveId}', '${loc.mapKey}')">🗑️ Delete Marker</button>`;
    
    const popupContent = `
        <div class="quest-marker-popup">
            <span class="obj-num">#${loc.objectiveIndex || (markerIndex + 1)}</span>
            <span class="obj-type ${typeColorClass}">${typeLabel}</span>
            ${sourceLabel}
            <h6>${loc.questName}</h6>
            <p>${loc.description}</p>
            ${noteHtml}
            ${floorLabel}
            <button class="popup-note-btn" onclick="showMarkerNoteDialog('quest', '${loc.questId}-${loc.objectiveId}', '${loc.questName.replace(/'/g, "\\'")} #${loc.objectiveIndex}', 'Quest Objective')">
                ${existingNote ? '✏️ Edit Note' : '📝 Add Note'}
            </button>
            ${actionBtn}
        </div>
    `;
    
    marker.bindPopup(popupContent);
    marker.bindTooltip(loc.questName, { 
        direction: 'auto',
        className: 'marker-label', 
        offset: [0, -10],
        sticky: false
    });
    
    questMarkersLayer.addLayer(marker);
}

function updateMarkerCount(questCount = null) {
    // If no count provided, calculate quest markers from DOM
    if (questCount === null) {
        questCount = document.querySelectorAll('.leaflet-marker-icon:not(.overlay-marker)').length;
    }
    // Add extract markers (new system)
    const extractCount = extractMarkers.length;
    // Add legacy overlay markers (deprecated)
    const overlayCount = Object.values(overlayLayers).reduce((sum, layer) => sum + layer.markers.length, 0);
    const total = questCount + extractCount + overlayCount;
    document.getElementById('markerCount').textContent = total + ' marker' + (total !== 1 ? 's' : '');
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================

function switchTab(tabId) {
    // Remove active from all tabs
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Find and activate the correct tab button
    const tabIndex = ['planner', 'hideout', 'penetration', 'ammo', 'weapons', 'gear', 'attachments'].indexOf(tabId);
    if (tabIndex >= 0) {
        const tabButtons = document.querySelectorAll('.nav-tab');
        if (tabButtons[tabIndex]) tabButtons[tabIndex].classList.add('active');
    }
    
    // Activate tab content
    const tabContent = document.getElementById('tab-' + tabId);
    if (tabContent) tabContent.classList.add('active');
    
    // Special handling for penetration tab
    if (tabId === 'penetration' && allAmmoData) {
        renderPenMatrix();
    }
    
    // Show/hide dashboard based on tab
    const dashboard = document.getElementById('inventoryDashboard');
    if (dashboard) {
        dashboard.style.display = ['ammo', 'weapons', 'gear', 'attachments'].includes(tabId) ? 'block' : 'none';
    }
}

// ============================================================================
// QUEST MANAGEMENT
// ============================================================================

function getSavedQuests() {
    const saved = localStorage.getItem(STORAGE_KEY_QUESTS);
    return saved ? new Set(JSON.parse(saved)) : new Set();
}

function saveQuestState(questId, isSelected) {
    const saved = getSavedQuests();
    isSelected ? saved.add(questId) : saved.delete(questId);
    localStorage.setItem(STORAGE_KEY_QUESTS, JSON.stringify([...saved]));
    updateSelectedQuestCount();
}

function deselectAllQuests() {
    // Clear storage
    localStorage.setItem(STORAGE_KEY_QUESTS, JSON.stringify([]));
    
    // Uncheck all checkboxes in UI
    document.querySelectorAll('#quest-list input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
        const row = cb.closest('.quest-row');
        if (row) row.classList.remove('selected');
    });
    
    // Update all trader badges
    document.querySelectorAll('.trader-header').forEach(header => {
        const groupId = header.id?.replace('btn-', '');
        if (groupId) updateTraderBadge(groupId);
    });
    
    // Update counter
    updateSelectedQuestCount();
    
    // Update map selection hint
    updateMapSelection();
}

function updateSelectedQuestCount() {
    const count = getSavedQuests().size;
    const el = document.getElementById('selectedQuestCount');
    if (el) el.textContent = count;
}

// ============================================================================
// QUEST COMPLETION TRACKING
// ============================================================================

const STORAGE_KEY_COMPLETED = 'tarkov_planner_completed_v1';

function getCompletedQuests() {
    const saved = localStorage.getItem(STORAGE_KEY_COMPLETED);
    return saved ? new Set(JSON.parse(saved)) : new Set();
}

function setQuestCompleted(questId, isCompleted) {
    const completed = getCompletedQuests();
    isCompleted ? completed.add(questId) : completed.delete(questId);
    localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify([...completed]));
}

function toggleQuestCompleted(questId, event) {
    event.stopPropagation();
    const completed = getCompletedQuests();
    const isNowCompleted = !completed.has(questId);
    setQuestCompleted(questId, isNowCompleted);
    
    // Update UI
    const row = document.querySelector(`#cb-${questId}`)?.closest('.quest-row');
    if (row) {
        row.classList.toggle('completed', isNowCompleted);
        const btn = row.querySelector('.complete-btn');
        if (btn) btn.textContent = isNowCompleted ? '✓' : '○';
    }
    
    // Update trader badge
    const groupId = document.querySelector(`#cb-${questId}`)?.dataset.parentGroup;
    if (groupId) updateTraderBadge(groupId);
    
    // Re-apply filter if "hide completed" is active
    const hideToggle = document.getElementById('hideCompletedToggle');
    if (hideToggle?.checked) filterQuests();
}

// ============================================================================
// QUEST PREREQUISITES
// ============================================================================

function getQuestPrereqs(quest) {
    if (!quest.taskRequirements || quest.taskRequirements.length === 0) return [];
    
    const completed = getCompletedQuests();
    return quest.taskRequirements.map(req => {
        const prereqQuest = allQuestsGlobal.find(q => q.id === req.task?.id);
        return {
            id: req.task?.id,
            name: prereqQuest?.name || req.task?.name || 'Unknown',
            isDone: completed.has(req.task?.id)
        };
    }).filter(p => p.id); // Filter out any without valid IDs
}

function isQuestLocked(quest) {
    const prereqs = getQuestPrereqs(quest);
    return prereqs.length > 0 && prereqs.some(p => !p.isDone);
}

function renderPrereqsHtml(prereqs) {
    if (!prereqs || prereqs.length === 0) return '';
    
    // Just show prerequisite names - purely informational
    const prereqHtml = prereqs.map(p => 
        `<span class="prereq-tag ${p.isDone ? 'prereq-done' : 'prereq-pending'}">${p.name}</span>`
    ).join('');
    
    return `<div class="quest-prereqs">Requires: ${prereqHtml}</div>`;
}

