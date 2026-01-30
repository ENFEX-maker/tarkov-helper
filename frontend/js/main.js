// ============================================================================
// SUPABASE CONFIGURATION
// ============================================================================
const SUPABASE_URL = 'https://dpryrhcqeviyvssyiwdz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwcnlyaGNxZXZpeXZzc3lpd2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0OTg0MjEsImV4cCI6MjA4NTA3NDQyMX0.IiYyEjEOU1fSq8DN_7tG2oQPr6Iuft2zMC2TasMXSfI';

// Initialize Supabase client (delayed to ensure SDK is loaded)
let supabaseClient = null;

function initSupabase() {
    if (supabaseClient) return supabaseClient;
    
    if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase initialized');
        return supabaseClient;
    } else {
        console.error('Supabase SDK not loaded');
        return null;
    }
}

// Auth state
let currentUser = null;
let isEditMode = false;

// Marker Creator state
let isMarkerCreatorActive = false;
let selectedObjectiveForPlacement = null;
let manualMarkersCache = null;
let manualMarkersCacheLoaded = false;
let hiddenApiMarkersCache = null;
let hiddenApiMarkersCacheLoaded = false;

// Area drawing system
let mapAreasCache = null;
let mapAreasCacheLoaded = false;
let isAreaDrawingActive = false;
let currentAreaPoints = [];
let currentAreaPreviewLayer = null;
let mapAreasLayer = null;

// ============================================================================
// AUTH FUNCTIONS
// ============================================================================

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('loginEmail').focus();
    document.getElementById('loginError').style.display = 'none';
}

function hideLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').style.display = 'none';
}

async function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const submitBtn = document.getElementById('loginSubmitBtn');
    
    if (!email || !password) {
        errorDiv.textContent = 'Please enter email and password';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (!supabaseClient) {
        errorDiv.textContent = 'Authentication service not available';
        errorDiv.style.display = 'block';
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;
        
        hideLoginModal();
        updateAuthUI(data.user);
        console.log('Login successful:', data.user.email);
        
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = error.message || 'Login failed. Please check your credentials.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
    }
}

async function logout() {
    if (!supabaseClient) return;
    
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        isEditMode = false;
        updateAuthUI(null);
        updateEditModeUI();
        console.log('Logged out');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function updateAuthUI(user) {
    currentUser = user;
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const userEmail = document.getElementById('userEmail');
    
    if (user) {
        loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        userEmail.textContent = user.email;
    } else {
        loginBtn.style.display = 'block';
        userInfo.style.display = 'none';
        userEmail.textContent = '';
    }
}

function toggleEditMode() {
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    isEditMode = !isEditMode;
    updateEditModeUI();
    
    // Make quest markers draggable/non-draggable
    if (questMarkersLayer) {
        questMarkersLayer.eachLayer(marker => {
            if (marker.dragging) {
                if (isEditMode) {
                    marker.dragging.enable();
                    marker._icon?.classList.add('leaflet-marker-draggable');
                } else {
                    marker.dragging.disable();
                    marker._icon?.classList.remove('leaflet-marker-draggable');
                }
            }
        });
    }
    
    // Make extract markers draggable/non-draggable
    extractMarkers.forEach(marker => {
        if (marker.dragging) {
            if (isEditMode) {
                marker.dragging.enable();
                marker._icon?.classList.add('extract-marker-draggable');
            } else {
                marker.dragging.disable();
                marker._icon?.classList.remove('extract-marker-draggable');
            }
        }
    });
    
    // Re-render extract markers to show/hide edit buttons in popups
    if (extractsEnabled) {
        renderExtractMarkers();
    }
    
    console.log('Edit mode:', isEditMode ? 'ON' : 'OFF');
}

function updateEditModeUI() {
    const badge = document.getElementById('editModeBadge');
    const btn = document.getElementById('editModeBtn');
    
    if (isEditMode) {
        badge.style.display = 'block';
        if (btn) {
            btn.classList.add('active');
            btn.innerHTML = '✏️ Exit Edit Mode';
        }
    } else {
        badge.style.display = 'none';
        if (btn) {
            btn.classList.remove('active');
            btn.innerHTML = '✏️ Edit Markers';
        }
    }
}

// ============================================================================
// MARKER CREATOR SYSTEM - Manually place quest markers
// ============================================================================

function showMissingMarkersAnalysis() {
    // Analyze which objectives are missing GPS coordinates
    if (!selectedQuestsForMarkers || selectedQuestsForMarkers.length === 0) {
        alert('Please select some quests first using "Plan Raid".');
        return;
    }
    
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    const missing = [];
    const hasGps = [];
    
    selectedQuestsForMarkers.forEach(quest => {
        if (!quest.objectives) return;
        
        quest.objectives.forEach((obj, idx) => {
            const objectiveId = obj.id || `${quest.id}-obj-${idx + 1}`;
            
            // Check if this objective has GPS data in questLocationsData
            let hasGpsData = false;
            if (questLocationsData?.byObjectiveId?.[objectiveId]) {
                hasGpsData = true;
            }
            
            // Check if there's a manual marker for this objective
            let hasManualMarker = false;
            if (manualMarkersCache) {
                const mapMarkers = manualMarkersCache[mapKey] || [];
                hasManualMarker = mapMarkers.some(m => 
                    m.questId === quest.id && m.objectiveId === objectiveId
                );
            }
            
            const entry = {
                questName: quest.name,
                questId: quest.id,
                objectiveIndex: idx + 1,
                objectiveId: objectiveId,
                description: obj.description || `Objective ${idx + 1}`,
                type: obj.type || 'unknown'
            };
            
            if (hasGpsData || hasManualMarker) {
                hasGps.push({ ...entry, source: hasManualMarker ? 'manual' : 'gps' });
            } else {
                missing.push(entry);
            }
        });
    });
    
    // Show results in an alert or modal
    let message = `=== Missing Markers Analysis for ${mapKey.toUpperCase()} ===\n\n`;
    message += `✅ Have markers: ${hasGps.length}\n`;
    message += `❌ Missing markers: ${missing.length}\n\n`;
    
    if (missing.length > 0) {
        message += `--- MISSING (need manual placement) ---\n`;
        missing.forEach(m => {
            message += `• ${m.questName} #${m.objectiveIndex}: ${m.description.substring(0, 50)}...\n`;
        });
    }
    
    if (missing.length === 0) {
        message += `\n🎉 All objectives have markers!`;
    }
    
    alert(message);
    console.log('Missing markers:', missing);
    console.log('Have markers:', hasGps);
}

function toggleMarkerCreator() {
    if (!currentUser) {
        alert('Please login to create markers.');
        showLoginModal();
        return;
    }
    
    const panel = document.getElementById('markerCreatorPanel');
    const btn = document.getElementById('markerCreatorBtn');
    
    isMarkerCreatorActive = !isMarkerCreatorActive;
    
    if (isMarkerCreatorActive) {
        panel.classList.add('active');
        btn.classList.add('active');
        btn.innerHTML = '🎯 Creating...';
        document.body.classList.add('placing-marker-mode');
        populateObjectiveSelect();
        populateFloorSelect();
        
        // Add click handler to map
        if (mapInstance) {
            mapInstance.on('click', onMapClickForMarker);
        }
    } else {
        cancelMarkerCreation();
    }
}

function populateFloorSelect() {
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    const cfg = MAP_CONFIG[mapKey];
    const floorSelect = document.getElementById('markerFloorSelect');
    const floorRow = document.getElementById('floorSelectRow');
    
    if (!cfg || !cfg.floors || cfg.floors.length <= 1) {
        floorRow.style.display = 'none';
        return;
    }
    
    floorSelect.innerHTML = cfg.floors.map(floor => 
        `<option value="${floor.id}" ${floor.default ? 'selected' : ''}>${floor.label}</option>`
    ).join('');
    
    floorRow.style.display = 'flex';
}

function cancelMarkerCreation() {
    const panel = document.getElementById('markerCreatorPanel');
    const btn = document.getElementById('markerCreatorBtn');
    
    isMarkerCreatorActive = false;
    selectedObjectiveForPlacement = null;
    
    panel.classList.remove('active');
    if (btn) {
        btn.classList.remove('active');
        btn.innerHTML = '🎯 Add Markers';
    }
    document.body.classList.remove('placing-marker-mode');
    
    // Remove click handler
    if (mapInstance) {
        mapInstance.off('click', onMapClickForMarker);
    }
    
    // Reset select
    const select = document.getElementById('objectiveSelect');
    if (select) select.value = '';
    
    document.getElementById('deleteMarkerBtn').style.display = 'none';
}

function populateObjectiveSelect() {
    const select = document.getElementById('objectiveSelect');
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    
    select.innerHTML = '<option value="">-- Select a quest objective --</option>';
    
    // Get selected quests
    const selectedQuests = selectedQuestsForMarkers || [];
    
    if (selectedQuests.length === 0) {
        select.innerHTML = '<option value="">-- No quests selected --</option>';
        document.getElementById('markerCreatorHint').innerHTML = 
            '⚠️ Please select some quests first, then use "Plan Raid" to load them.';
        return;
    }
    
    // Build options grouped by quest
    selectedQuests.forEach((quest, qIndex) => {
        if (!quest.objectives || quest.objectives.length === 0) return;
        
        const optGroup = document.createElement('optgroup');
        optGroup.label = quest.name;
        
        quest.objectives.forEach((obj, objIndex) => {
            // Only show objectives that have map requirements matching current map
            // or objectives without specific map (applicable to any)
            const objMaps = obj.maps?.map(m => m.normalizedName || mapNameToKey(m.name)) || [];
            const questMap = quest.map?.normalizedName || (quest.map?.name ? mapNameToKey(quest.map.name) : null);
            
            // Show if: no specific maps, or quest map matches, or obj maps include current
            const shouldShow = objMaps.length === 0 || 
                              (questMap && questMap === mapKey) ||
                              objMaps.includes(mapKey);
            
            if (shouldShow) {
                const option = document.createElement('option');
                // Generate a fallback ID if obj.id is missing
                const objectiveId = obj.id || `${quest.id}-obj-${objIndex + 1}`;
                
                option.value = JSON.stringify({
                    questId: quest.id,
                    questName: quest.name,
                    objectiveId: objectiveId,
                    objectiveIndex: objIndex + 1,
                    type: obj.type || 'unknown',
                    description: obj.description || `Objective ${objIndex + 1}`,
                    mapKey: mapKey,
                    color: QUEST_COLORS[qIndex % QUEST_COLORS.length]
                });
                
                const shortDesc = obj.description?.length > 50 
                    ? obj.description.substring(0, 47) + '...' 
                    : (obj.description || 'Objective');
                option.textContent = `#${objIndex + 1}: ${shortDesc}`;
                optGroup.appendChild(option);
            }
        });
        
        if (optGroup.children.length > 0) {
            select.appendChild(optGroup);
        }
    });
    
    document.getElementById('markerCreatorHint').innerHTML = 
        '📍 Select an objective below, then <strong>click on the map</strong> to place the marker.';
}

function onObjectiveSelectChange() {
    const select = document.getElementById('objectiveSelect');
    const deleteBtn = document.getElementById('deleteMarkerBtn');
    
    if (select.value) {
        selectedObjectiveForPlacement = JSON.parse(select.value);
        document.getElementById('markerCreatorHint').innerHTML = 
            `✅ Ready! Click on the map to place marker for: <strong>${selectedObjectiveForPlacement.description}</strong>`;
        
        // Check if this objective already has a marker
        checkExistingMarker(selectedObjectiveForPlacement).then(exists => {
            deleteBtn.style.display = exists ? 'inline-block' : 'none';
        });
    } else {
        selectedObjectiveForPlacement = null;
        document.getElementById('markerCreatorHint').innerHTML = 
            '📍 Select an objective below, then <strong>click on the map</strong> to place the marker.';
        deleteBtn.style.display = 'none';
    }
}

async function checkExistingMarker(objective) {
    if (!supabaseClient || !objective) return false;
    
    try {
        const { data, error } = await supabaseClient
            .from('quest_marker_positions')
            .select('id')
            .eq('quest_id', objective.questId)
            .eq('objective_id', objective.objectiveId)
            .eq('map_name', objective.mapKey)
            .single();
        
        return !!data;
    } catch (e) {
        return false;
    }
}

async function onMapClickForMarker(e) {
    if (!isMarkerCreatorActive || !selectedObjectiveForPlacement) {
        return;
    }
    
    if (!currentUser) {
        alert('Please login to create markers.');
        return;
    }
    
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    const selectedFloor = document.getElementById('markerFloorSelect')?.value || 'ground';
    
    // Get click coordinates (Leaflet CRS.Simple)
    const leafletX = e.latlng.lng;
    const leafletY = e.latlng.lat;
    
    // Convert Leaflet coords back to percent
    // Leaflet Y is inverted: pixelY = mapHeight - leafletY
    const pixelX = leafletX;
    const pixelY = currentMapHeight - leafletY;
    
    const leftPercent = (pixelX / currentMapWidth) * 100;
    const topPercent = (pixelY / currentMapHeight) * 100;
    
    // Save to database with floor info
    await saveManualMarker(selectedObjectiveForPlacement, leftPercent, topPercent, mapKey, selectedFloor);
}

async function saveManualMarker(objective, leftPercent, topPercent, mapKey, floor = 'ground') {
    if (!supabaseClient || !currentUser) {
        alert('Unable to save. Please ensure you are logged in.');
        return;
    }
    
    // Validate objective data
    if (!objective || !objective.questId || !objective.objectiveId) {
        console.error('Invalid objective data:', objective);
        alert('Error: Missing objective data. Please re-select the objective.');
        return;
    }
    
    const hint = document.getElementById('markerCreatorHint');
    hint.innerHTML = '💾 Saving marker...';
    
    try {
        const markerData = {
            user_id: currentUser.id,
            quest_id: objective.questId,
            objective_id: objective.objectiveId,
            objective_index: objective.objectiveIndex || 1,
            map_name: mapKey,
            left_percent: leftPercent,
            top_percent: topPercent,
            quest_name: objective.questName || 'Unknown Quest',
            objective_description: objective.description || 'Objective',
            floor: floor
        };
        
        console.log('Saving marker with data:', markerData);
        
        const { data, error } = await supabaseClient
            .from('quest_marker_positions')
            .upsert(markerData, {
                onConflict: 'quest_id,objective_id,map_name'
            });
        
        if (error) throw error;
        
        // Clear cache and refresh markers
        clearManualMarkersCache();
        
        hint.innerHTML = `✅ Marker saved for: <strong>${objective.description}</strong>. Select another or click Cancel.`;
        
        // Refresh the map markers
        await refreshQuestMarkers();
        
        // Show delete button now that marker exists
        document.getElementById('deleteMarkerBtn').style.display = 'inline-block';
        
        console.log('Manual marker saved:', markerData);
        
    } catch (error) {
        console.error('Error saving manual marker:', error);
        hint.innerHTML = `❌ Error: ${error.message}. Please try again.`;
    }
}

async function deleteSelectedMarker() {
    if (!selectedObjectiveForPlacement || !supabaseClient || !currentUser) {
        return;
    }
    
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    const hint = document.getElementById('markerCreatorHint');
    
    if (!confirm(`Delete marker for "${selectedObjectiveForPlacement.description}"?`)) {
        return;
    }
    
    hint.innerHTML = '🗑️ Deleting marker...';
    
    try {
        const { error } = await supabaseClient
            .from('quest_marker_positions')
            .delete()
            .eq('quest_id', selectedObjectiveForPlacement.questId)
            .eq('objective_id', selectedObjectiveForPlacement.objectiveId)
            .eq('map_name', mapKey);
        
        if (error) throw error;
        
        clearManualMarkersCache();
        hint.innerHTML = `✅ Marker deleted. Select an objective to place a new marker.`;
        document.getElementById('deleteMarkerBtn').style.display = 'none';
        
        // Refresh markers
        await refreshQuestMarkers();
        
    } catch (error) {
        console.error('Error deleting marker:', error);
        hint.innerHTML = `❌ Error: ${error.message}`;
    }
}

async function deleteManualMarkerFromPopup(questId, objectiveId, mapKey) {
    if (!supabaseClient || !currentUser) {
        alert('Please login to delete markers.');
        showLoginModal();
        return;
    }
    
    if (!confirm('Delete this manual marker?')) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('quest_marker_positions')
            .delete()
            .eq('quest_id', questId)
            .eq('objective_id', objectiveId)
            .eq('map_name', mapKey);
        
        if (error) throw error;
        
        console.log(`Deleted manual marker: ${questId}/${objectiveId} on ${mapKey}`);
        
        // Clear cache and refresh
        clearManualMarkersCache();
        await refreshQuestMarkers();
        
        // Close popup
        if (mapInstance) {
            mapInstance.closePopup();
        }
        
    } catch (error) {
        console.error('Error deleting marker:', error);
        alert('Failed to delete marker: ' + error.message);
    }
}

function clearManualMarkersCache() {
    manualMarkersCache = null;
    manualMarkersCacheLoaded = false;
}

async function loadManualMarkers(mapKey) {
    // Check cache first
    if (manualMarkersCacheLoaded && manualMarkersCache) {
        const mapMarkers = manualMarkersCache[mapKey] || [];
        console.log(`Using cached manual markers for ${mapKey}: ${mapMarkers.length} entries`);
        return mapMarkers;
    }
    
    if (!supabaseClient) {
        console.log('Supabase not available, skipping manual markers load');
        return [];
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('quest_marker_positions')
            .select('*');
        
        if (error) {
            console.error('Error loading manual markers:', error);
            return [];
        }
        
        // Build lookup table by map
        manualMarkersCache = {};
        (data || []).forEach(m => {
            if (!manualMarkersCache[m.map_name]) {
                manualMarkersCache[m.map_name] = [];
            }
            manualMarkersCache[m.map_name].push({
                questId: m.quest_id,
                questName: m.quest_name,
                objectiveId: m.objective_id,
                objectiveIndex: m.objective_index,
                description: m.objective_description,
                leftPercent: parseFloat(m.left_percent),
                topPercent: parseFloat(m.top_percent),
                mapKey: m.map_name,
                floor: m.floor || 'ground',
                source: 'manual'
            });
        });
        
        manualMarkersCacheLoaded = true;
        const mapMarkers = manualMarkersCache[mapKey] || [];
        console.log(`Loaded manual markers: ${Object.values(manualMarkersCache).flat().length} total, ${mapMarkers.length} for ${mapKey}`);
        return mapMarkers;
        
    } catch (err) {
        console.error('Exception loading manual markers:', err);
        return [];
    }
}

// ============================================================================
// HIDDEN API MARKERS - Track which API markers should be hidden
// ============================================================================

async function loadHiddenApiMarkers() {
    if (hiddenApiMarkersCacheLoaded && hiddenApiMarkersCache) {
        return hiddenApiMarkersCache;
    }
    
    if (!supabaseClient || !currentUser) {
        console.log('Supabase/user not available, skipping hidden markers load');
        return {};
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('hidden_api_markers')
            .select('*')
            .eq('user_id', currentUser.id);
        
        if (error) {
            console.error('Error loading hidden markers:', error);
            return {};
        }
        
        // Build lookup: "questId|objectiveIndex|mapKey" -> true
        hiddenApiMarkersCache = {};
        (data || []).forEach(m => {
            const key = `${m.quest_id}|${m.objective_index}|${m.map_name}`;
            hiddenApiMarkersCache[key] = true;
        });
        
        hiddenApiMarkersCacheLoaded = true;
        console.log(`Loaded hidden API markers: ${Object.keys(hiddenApiMarkersCache).length}`);
        return hiddenApiMarkersCache;
        
    } catch (err) {
        console.error('Exception loading hidden markers:', err);
        return {};
    }
}

function clearHiddenApiMarkersCache() {
    hiddenApiMarkersCache = null;
    hiddenApiMarkersCacheLoaded = false;
}

function isApiMarkerHidden(questId, objectiveIndex, mapKey) {
    if (!hiddenApiMarkersCache) return false;
    const key = `${questId}|${objectiveIndex}|${mapKey}`;
    return hiddenApiMarkersCache[key] === true;
}

async function hideApiMarker(questId, objectiveIndex, mapKey, questName) {
    if (!supabaseClient || !currentUser) {
        alert('Please login to hide markers.');
        showLoginModal();
        return;
    }
    
    const confirmMsg = `Hide this API marker?\n\nQuest: ${questName}\nObjective #${objectiveIndex}\n\nYou can then place a manual marker at the correct location.`;
    if (!confirm(confirmMsg)) return;
    
    try {
        const { error } = await supabaseClient
            .from('hidden_api_markers')
            .upsert({
                user_id: currentUser.id,
                quest_id: questId,
                objective_index: objectiveIndex,
                map_name: mapKey,
                reason: 'wrong_location'
            }, {
                onConflict: 'user_id,quest_id,objective_index,map_name'
            });
        
        if (error) throw error;
        
        console.log(`Hidden API marker: ${questId} #${objectiveIndex} on ${mapKey}`);
        
        // Refresh
        clearHiddenApiMarkersCache();
        await loadHiddenApiMarkers();
        await refreshQuestMarkers();
        
    } catch (err) {
        console.error('Error hiding marker:', err);
        alert('Failed to hide marker: ' + err.message);
    }
}

async function unhideApiMarker(questId, objectiveIndex, mapKey) {
    if (!supabaseClient || !currentUser) return;
    
    try {
        const { error } = await supabaseClient
            .from('hidden_api_markers')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('quest_id', questId)
            .eq('objective_index', objectiveIndex)
            .eq('map_name', mapKey);
        
        if (error) throw error;
        
        console.log(`Unhidden API marker: ${questId} #${objectiveIndex} on ${mapKey}`);
        
        clearHiddenApiMarkersCache();
        await loadHiddenApiMarkers();
        await refreshQuestMarkers();
        
    } catch (err) {
        console.error('Error unhiding marker:', err);
    }
}

// ============================================================================
// MAP AREAS - Custom polygon areas on maps
// ============================================================================

async function loadMapAreas(mapKey) {
    if (!supabaseClient || !currentUser) {
        console.log('Supabase/user not available, skipping map areas load');
        return [];
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('map_areas')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('map_name', mapKey);
        
        if (error) {
            console.error('Error loading map areas:', error);
            return [];
        }
        
        console.log(`Loaded ${data?.length || 0} map areas for ${mapKey}`);
        return data || [];
        
    } catch (err) {
        console.error('Exception loading map areas:', err);
        return [];
    }
}

async function renderMapAreas(mapKey) {
    if (!mapInstance) {
        console.log('renderMapAreas: No map instance');
        return;
    }
    
    // Clear existing areas layer
    if (mapAreasLayer) {
        mapAreasLayer.clearLayers();
        mapInstance.removeLayer(mapAreasLayer);
    }
    
    // Create new layer group and add directly to map
    mapAreasLayer = L.layerGroup();
    mapAreasLayer.addTo(mapInstance);
    
    // DEBUG: Create a test polygon in the center of the map
    const testCenter = [currentMapHeight / 2, currentMapWidth / 2];
    const testSize = 20;
    const testPolygon = L.polygon([
        [testCenter[0] - testSize, testCenter[1] - testSize],
        [testCenter[0] - testSize, testCenter[1] + testSize],
        [testCenter[0] + testSize, testCenter[1] + testSize],
        [testCenter[0] + testSize, testCenter[1] - testSize]
    ], {
        color: '#00FF00',
        weight: 5,
        fillColor: '#00FF00',
        fillOpacity: 0.5
    }).addTo(mapInstance);
    testPolygon.bindTooltip('TEST POLYGON - DELETE ME', { permanent: true });
    console.log('DEBUG: Added test polygon at center:', testCenter, 'size:', testSize);
    console.log('DEBUG: Test polygon bounds:', testPolygon.getBounds());
    
    const areas = await loadMapAreas(mapKey);
    
    if (areas.length === 0) {
        console.log('renderMapAreas: No areas found for', mapKey);
        return;
    }
    
    console.log(`renderMapAreas: Processing ${areas.length} areas for ${mapKey}`);
    
    areas.forEach((area, idx) => {
        // Convert stored points to Leaflet coordinates
        let points = area.polygon_points || [];
        
        // Handle if points is a string (JSONB might return string in some cases)
        if (typeof points === 'string') {
            try {
                points = JSON.parse(points);
            } catch (e) {
                console.error('Failed to parse polygon_points:', e);
                return;
            }
        }
        
        if (!Array.isArray(points) || points.length < 3) {
            console.log(`renderMapAreas: Area "${area.area_name}" has invalid points:`, points);
            return;
        }
        
        // Points are stored as [x, y] which is [lng, lat] in Leaflet terms
        // Leaflet L.polygon needs [lat, lng] which is [y, x]
        const latLngs = points.map(p => {
            const x = parseFloat(p[0]); // lng
            const y = parseFloat(p[1]); // lat
            return [y, x]; // [lat, lng]
        });
        
        console.log(`renderMapAreas: Drawing "${area.area_name}" with ${points.length} points`);
        console.log(`  Raw points [x,y]:`, JSON.stringify(points));
        console.log(`  LatLngs [lat,lng]:`, JSON.stringify(latLngs));
        console.log(`  Map bounds: height=${currentMapHeight}, width=${currentMapWidth}`);
        
        // Create polygon and add directly to map (not to layer group) for testing
        const polygon = L.polygon(latLngs, {
            color: area.area_color || '#FF0000',
            weight: 5,
            opacity: 1,
            fillColor: area.area_color || '#FF0000',
            fillOpacity: 0.5,
            floor: area.floor || 'ground',
            areaId: area.id,
            areaName: area.area_name
        });
        
        // Add directly to map first to test
        polygon.addTo(mapInstance);
        
        // Add popup with area info and delete button
        const popupContent = `
            <div class="area-popup">
                <strong style="color: ${area.area_color}">${area.area_name}</strong>
                ${area.notes ? `<p style="margin: 5px 0; font-size: 0.8rem;">${area.notes}</p>` : ''}
                <div style="font-size: 0.7rem; color: var(--text-sub);">Floor: ${getFloorLabel(area.floor, mapKey)}</div>
                <button class="popup-action-btn popup-delete-btn" style="margin-top: 8px;" onclick="deleteMapArea(${area.id})">🗑️ Delete Area</button>
            </div>
        `;
        polygon.bindPopup(popupContent);
        
        // Add label tooltip
        polygon.bindTooltip(area.area_name, {
            permanent: true,
            direction: 'center',
            className: 'area-polygon-label'
        });
        
        // Also add to layer group for management
        mapAreasLayer.addLayer(polygon);
        
        // Force bring to front
        polygon.bringToFront();
        
        console.log(`renderMapAreas: Added polygon for "${area.area_name}", bounds:`, polygon.getBounds());
    });
    
    // Apply floor visibility
    updateAreaFloorVisibility();
    
    console.log(`Rendered ${areas.length} map areas for ${mapKey}, current floor: ${currentFloor}`);
}

function updateAreaFloorVisibility() {
    if (!mapAreasLayer) return;
    
    mapAreasLayer.eachLayer(polygon => {
        const areaFloor = polygon.options?.floor || 'ground';
        const isCurrentFloor = areaFloor === currentFloor;
        
        console.log(`Area floor: "${areaFloor}", current: "${currentFloor}", match: ${isCurrentFloor}`);
        
        if (isCurrentFloor) {
            polygon.setStyle({ opacity: 1, fillOpacity: 0.3 });
            if (polygon._path) polygon._path.style.pointerEvents = 'auto';
        } else {
            polygon.setStyle({ opacity: 0.2, fillOpacity: 0.05 });
            if (polygon._path) polygon._path.style.pointerEvents = 'none';
        }
    });
}

function toggleAreaPanel() {
    if (!currentUser) {
        alert('Please login to manage areas.');
        showLoginModal();
        return;
    }
    
    // Close marker creator if open
    if (isMarkerCreatorActive) {
        cancelMarkerCreation();
    }
    
    const panel = document.getElementById('areaDrawingPanel');
    const btn = document.getElementById('areaDrawingBtn');
    
    const isOpen = panel.classList.contains('active');
    
    if (isOpen) {
        closeAreaPanel();
    } else {
        panel.classList.add('active');
        btn.classList.add('active');
        
        // Setup floor select
        setupAreaFloorSelect();
        
        // Load areas list
        refreshAreasList();
        
        // Default to manage tab if areas exist, otherwise draw tab
        switchAreaTab('manage');
    }
}

function closeAreaPanel() {
    const panel = document.getElementById('areaDrawingPanel');
    const btn = document.getElementById('areaDrawingBtn');
    
    // Stop drawing if active
    if (isAreaDrawingActive) {
        stopAreaDrawing();
    }
    
    panel.classList.remove('active');
    if (btn) {
        btn.classList.remove('active');
    }
}

function switchAreaTab(tabName) {
    // Update tab buttons
    document.getElementById('areaTabDraw').classList.toggle('active', tabName === 'draw');
    document.getElementById('areaTabManage').classList.toggle('active', tabName === 'manage');
    
    // Update tab content
    document.getElementById('areaDrawTab').classList.toggle('active', tabName === 'draw');
    document.getElementById('areaManageTab').classList.toggle('active', tabName === 'manage');
    
    if (tabName === 'draw') {
        startAreaDrawing();
    } else {
        stopAreaDrawing();
        refreshAreasList();
    }
}

function startAreaDrawing() {
    isAreaDrawingActive = true;
    currentAreaPoints = [];
    updateAreaPointsDisplay();
    document.body.classList.add('drawing-area-mode');
    
    if (mapInstance) {
        mapInstance.on('click', onMapClickForArea);
    }
    
    document.getElementById('areaDrawingHint').innerHTML = 
        'Click on the map to add points. Close the shape by clicking near the first point or press "Complete".';
}

function stopAreaDrawing() {
    isAreaDrawingActive = false;
    currentAreaPoints = [];
    document.body.classList.remove('drawing-area-mode');
    
    // Remove preview
    if (currentAreaPreviewLayer && mapInstance) {
        mapInstance.removeLayer(currentAreaPreviewLayer);
        currentAreaPreviewLayer = null;
    }
    
    // Remove click handler
    if (mapInstance) {
        mapInstance.off('click', onMapClickForArea);
    }
    
    // Reset inputs
    document.getElementById('areaNameInput').value = '';
    document.getElementById('areaPointsCount').textContent = '0';
    document.getElementById('completeAreaBtn').disabled = true;
}

async function refreshAreasList() {
    const listContainer = document.getElementById('areasList');
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    
    listContainer.innerHTML = '<div class="areas-loading">Loading...</div>';
    
    const areas = await loadMapAreas(mapKey);
    
    if (areas.length === 0) {
        listContainer.innerHTML = '<div class="areas-loading">No areas saved for this map</div>';
        return;
    }
    
    listContainer.innerHTML = areas.map(area => `
        <div class="area-list-item" data-area-id="${area.id}">
            <div class="area-color-dot" style="background: ${area.area_color}"></div>
            <div class="area-info">
                <div class="area-name">${area.area_name}</div>
                <div class="area-floor">Floor: ${getFloorLabel(area.floor, mapKey)}</div>
            </div>
            <div class="area-actions">
                <button class="area-action-btn" onclick="zoomToArea(${area.id})" title="Zoom to area">🔍</button>
                <button class="area-action-btn delete" onclick="deleteMapArea(${area.id})" title="Delete area">🗑️</button>
            </div>
        </div>
    `).join('');
}

async function zoomToArea(areaId) {
    if (!mapAreasLayer) return;
    
    mapAreasLayer.eachLayer(polygon => {
        if (polygon.options?.areaId === areaId) {
            const bounds = polygon.getBounds();
            mapInstance.fitBounds(bounds, { padding: [50, 50] });
            
            // Flash the polygon
            const originalColor = polygon.options.color;
            polygon.setStyle({ color: '#fff', weight: 4 });
            setTimeout(() => {
                polygon.setStyle({ color: originalColor, weight: 3 });
            }, 500);
        }
    });
}

// Keep the old function name for backwards compatibility
function toggleAreaDrawing() {
    toggleAreaPanel();
}

function cancelAreaDrawing() {
    closeAreaPanel();
}

function setupAreaFloorSelect() {
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    const cfg = MAP_CONFIG[mapKey];
    const floorSelect = document.getElementById('areaFloorSelect');
    const floorRow = document.getElementById('areaFloorRow');
    
    if (!cfg || !cfg.floors || cfg.floors.length <= 1) {
        floorRow.style.display = 'none';
        return;
    }
    
    floorSelect.innerHTML = cfg.floors.map(floor => 
        `<option value="${floor.id}" ${floor.id === currentFloor ? 'selected' : ''}>${floor.label}</option>`
    ).join('');
    
    floorRow.style.display = 'flex';
}

function onMapClickForArea(e) {
    if (!isAreaDrawingActive) return;
    
    const point = [e.latlng.lng, e.latlng.lat]; // [x, y]
    
    // Check if clicking near the first point to close the polygon
    if (currentAreaPoints.length >= 3) {
        const firstPoint = currentAreaPoints[0];
        const dist = Math.sqrt(
            Math.pow(point[0] - firstPoint[0], 2) + 
            Math.pow(point[1] - firstPoint[1], 2)
        );
        
        // If close enough to first point, complete the polygon
        if (dist < 20) {
            completeAreaDrawing();
            return;
        }
    }
    
    currentAreaPoints.push(point);
    updateAreaPointsDisplay();
    updateAreaPreview();
}

function updateAreaPointsDisplay() {
    document.getElementById('areaPointsCount').textContent = currentAreaPoints.length;
    document.getElementById('completeAreaBtn').disabled = currentAreaPoints.length < 3;
}

function updateAreaPreview() {
    // Remove existing preview
    if (currentAreaPreviewLayer) {
        mapInstance.removeLayer(currentAreaPreviewLayer);
    }
    
    if (currentAreaPoints.length < 2) return;
    
    const color = document.getElementById('areaColorInput').value;
    const latLngs = currentAreaPoints.map(p => [p[1], p[0]]);
    
    if (currentAreaPoints.length >= 3) {
        // Draw polygon preview
        currentAreaPreviewLayer = L.polygon(latLngs, {
            color: color,
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.2,
            dashArray: '5, 5'
        }).addTo(mapInstance);
    } else {
        // Draw line preview
        currentAreaPreviewLayer = L.polyline(latLngs, {
            color: color,
            weight: 2,
            opacity: 0.8,
            dashArray: '5, 5'
        }).addTo(mapInstance);
    }
}

function undoLastAreaPoint() {
    if (currentAreaPoints.length > 0) {
        currentAreaPoints.pop();
        updateAreaPointsDisplay();
        updateAreaPreview();
    }
}

async function completeAreaDrawing() {
    if (currentAreaPoints.length < 3) {
        alert('At least 3 points are required to create an area.');
        return;
    }
    
    const areaName = document.getElementById('areaNameInput').value.trim();
    if (!areaName) {
        alert('Please enter a name for this area.');
        document.getElementById('areaNameInput').focus();
        return;
    }
    
    const mapKey = document.getElementById('mapSelect')?.value || 'customs';
    const areaColor = document.getElementById('areaColorInput').value;
    const areaFloor = document.getElementById('areaFloorSelect')?.value || 'ground';
    
    const hint = document.getElementById('areaDrawingHint');
    hint.innerHTML = '💾 Saving area...';
    
    try {
        const { data, error } = await supabaseClient
            .from('map_areas')
            .insert({
                user_id: currentUser.id,
                map_name: mapKey,
                floor: areaFloor,
                area_name: areaName,
                area_color: areaColor,
                polygon_points: currentAreaPoints
            });
        
        if (error) throw error;
        
        console.log('Area saved:', areaName);
        hint.innerHTML = `✅ Area "${areaName}" saved! Draw another or click Cancel.`;
        
        // Reset for next area
        currentAreaPoints = [];
        updateAreaPointsDisplay();
        if (currentAreaPreviewLayer && mapInstance) {
            mapInstance.removeLayer(currentAreaPreviewLayer);
            currentAreaPreviewLayer = null;
        }
        document.getElementById('areaNameInput').value = '';
        
        // Refresh areas
        await renderMapAreas(mapKey);
        
    } catch (error) {
        console.error('Error saving area:', error);
        hint.innerHTML = `❌ Error: ${error.message}`;
    }
}

async function deleteMapArea(areaId) {
    if (!supabaseClient || !currentUser) return;
    
    if (!confirm('Delete this area?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('map_areas')
            .delete()
            .eq('id', areaId)
            .eq('user_id', currentUser.id);
        
        if (error) throw error;
        
        console.log('Area deleted:', areaId);
        
        // Close popup and refresh
        if (mapInstance) mapInstance.closePopup();
        
        const mapKey = document.getElementById('mapSelect')?.value || 'customs';
        await renderMapAreas(mapKey);
        
        // Also refresh the list in the panel if it's open
        const panel = document.getElementById('areaDrawingPanel');
        if (panel.classList.contains('active')) {
            await refreshAreasList();
        }
        
    } catch (error) {
        console.error('Error deleting area:', error);
        alert('Failed to delete area: ' + error.message);
    }
}

async function refreshQuestMarkers() {
    const mapKey = document.getElementById('mapSelect')?.value || activeMapTab || 'customs';
    if (questMarkersLayer && mapInstance) {
        await drawQuestMarkers(mapKey, currentMapWidth, currentMapHeight, selectedQuestNamesForMarkers, selectedQuestsForMarkers);
        // Update floor marker counts and visibility
        updateFloorMarkerCounts();
        updateOtherFloorsHint();
        updateMarkerFloorVisibility();
    }
}

let pendingCorrection = null; // Stores marker data during correction dialog

function showCorrectionDialog(marker, dragEvent) {
    const data = marker._questData;
    if (!data) {
        console.error('No quest data on marker');
        return;
    }
    
    // Get new position from marker
    const newLatLng = marker.getLatLng();
    const mapKey = document.getElementById('mapSelect')?.value || activeMapTab || 'customs';
    
    // Convert Leaflet coordinates back to percent
    const pixelX = newLatLng.lng;
    const pixelY = currentMapHeight - newLatLng.lat;
    
    const newLeftPercent = (pixelX / currentMapWidth) * 100;
    const newTopPercent = (pixelY / currentMapHeight) * 100;
    
    // Calculate delta
    const deltaLeft = newLeftPercent - data.originalLeftPercent;
    const deltaTop = newTopPercent - data.originalTopPercent;
    
    // Store pending correction
    pendingCorrection = {
        marker: marker,
        questId: data.questId,
        questName: data.questName,
        objectiveId: data.objectiveId,
        objectiveIndex: data.objectiveIndex,
        mapKey: mapKey,
        originalLeftPercent: data.originalLeftPercent,
        originalTopPercent: data.originalTopPercent,
        newLeftPercent: newLeftPercent,
        newTopPercent: newTopPercent,
        deltaLeft: deltaLeft,
        deltaTop: deltaTop
    };
    
    // Populate dialog
    document.getElementById('correctionQuestName').textContent = data.questName;
    document.getElementById('correctionObjective').textContent = `#${data.objectiveIndex}: ${data.description || 'Objective'}`;
    document.getElementById('correctionOldCoords').textContent = `(${data.originalLeftPercent.toFixed(2)}%, ${data.originalTopPercent.toFixed(2)}%)`;
    document.getElementById('correctionNewCoords').textContent = `(${newLeftPercent.toFixed(2)}%, ${newTopPercent.toFixed(2)}%)`;
    
    const deltaLeftStr = deltaLeft >= 0 ? `+${deltaLeft.toFixed(2)}` : deltaLeft.toFixed(2);
    const deltaTopStr = deltaTop >= 0 ? `+${deltaTop.toFixed(2)}` : deltaTop.toFixed(2);
    document.getElementById('correctionDelta').textContent = `(${deltaLeftStr}%, ${deltaTopStr}%)`;
    
    // Show dialog
    document.getElementById('correctionDialogOverlay').style.display = 'block';
}

function cancelCorrection() {
    // Reset marker to original position
    if (pendingCorrection && pendingCorrection.marker) {
        const data = pendingCorrection.marker._questData;
        
        // Recalculate original position
        const pixelX = (data.originalLeftPercent / 100) * currentMapWidth;
        const pixelY = (data.originalTopPercent / 100) * currentMapHeight;
        const leafletY = currentMapHeight - pixelY;
        
        pendingCorrection.marker.setLatLng([leafletY, pixelX]);
    }
    
    pendingCorrection = null;
    document.getElementById('correctionDialogOverlay').style.display = 'none';
}

async function saveCorrection() {
    if (!pendingCorrection || !currentUser || !supabaseClient) {
        alert('Unable to save correction. Please ensure you are logged in.');
        return;
    }
    
    const btn = document.getElementById('saveCorrectionBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
        // Build correction record matching existing schema
        const correctionData = {
            quest_id: pendingCorrection.questId,
            objective_index: pendingCorrection.objectiveIndex,
            original_left_percent: pendingCorrection.originalLeftPercent,
            original_top_percent: pendingCorrection.originalTopPercent,
            corrected_left_percent: pendingCorrection.newLeftPercent,
            corrected_top_percent: pendingCorrection.newTopPercent,
            corrected_by: currentUser.id,
            notes: `Map: ${pendingCorrection.mapKey}, Delta: (${pendingCorrection.deltaLeft.toFixed(2)}%, ${pendingCorrection.deltaTop.toFixed(2)}%)`
        };
        
        // Upsert to Supabase (insert or update on conflict)
        const { data, error } = await supabaseClient
            .from('marker_corrections')
            .upsert(correctionData, {
                onConflict: 'quest_id,objective_index'
            });
        
        if (error) throw error;
        
        // Update marker's stored data with new position
        if (pendingCorrection.marker._questData) {
            pendingCorrection.marker._questData.originalLeftPercent = pendingCorrection.newLeftPercent;
            pendingCorrection.marker._questData.originalTopPercent = pendingCorrection.newTopPercent;
            pendingCorrection.marker._questData.hasDbCorrection = true;
        }
        
        // Clear cache so next load gets fresh data
        clearCorrectionsCache();
        
        console.log('Correction saved:', correctionData);
        
        // Close dialog
        pendingCorrection = null;
        document.getElementById('correctionDialogOverlay').style.display = 'none';
        
    } catch (error) {
        console.error('Error saving correction:', error);
        alert('Failed to save correction: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 Save Correction';
    }
}

// Cache for loaded marker corrections (global, keyed by quest_id|objective_index)
let markerCorrectionsCache = null;
let correctionsCacheLoaded = false;

async function loadMarkerCorrections(mapKey) {
    // Check cache first - corrections are global (not per-map)
    if (correctionsCacheLoaded && markerCorrectionsCache) {
        console.log(`Using cached corrections: ${Object.keys(markerCorrectionsCache).length} entries`);
        return markerCorrectionsCache;
    }
    
    if (!supabaseClient) {
        console.log('Supabase not available, skipping corrections load');
        return {};
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('marker_corrections')
            .select('*');
        
        if (error) {
            console.error('Error loading corrections:', error);
            return {};
        }
        
        // Build lookup table: quest_id|objective_index -> correction
        markerCorrectionsCache = {};
        (data || []).forEach(c => {
            const key = `${c.quest_id}|${c.objective_index}`;
            markerCorrectionsCache[key] = {
                correctedLeftPercent: parseFloat(c.corrected_left_percent),
                correctedTopPercent: parseFloat(c.corrected_top_percent),
                originalLeftPercent: parseFloat(c.original_left_percent),
                originalTopPercent: parseFloat(c.original_top_percent),
                correctedBy: c.corrected_by,
                correctedAt: c.corrected_at,
                notes: c.notes
            };
        });
        
        correctionsCacheLoaded = true;
        console.log(`Loaded ${Object.keys(markerCorrectionsCache).length} marker corrections from database`);
        return markerCorrectionsCache;
        
    } catch (err) {
        console.error('Exception loading corrections:', err);
        return {};
    }
}

function getMarkerCorrection(questId, objectiveIndex) {
    if (!markerCorrectionsCache) return null;
    const key = `${questId}|${objectiveIndex}`;
    return markerCorrectionsCache[key] || null;
}

function clearCorrectionsCache() {
    markerCorrectionsCache = null;
    correctionsCacheLoaded = false;
    console.log('Corrections cache cleared');
}

// Check auth state on page load
async function initAuth() {
    // Initialize Supabase first
    const sb = initSupabase();
    if (!sb) {
        console.warn('Supabase not available - auth disabled');
        return;
    }
    
    try {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
            updateAuthUI(session.user);
        }
        
        // Listen for auth changes
        sb.auth.onAuthStateChange((event, session) => {
            updateAuthUI(session?.user || null);
        });
    } catch (error) {
        console.error('Auth init error:', error);
    }
}

// ============================================================================
// CONFIGURATION
// ============================================================================
const API_BASE = '/api';
const STORAGE_KEY_QUESTS = 'tarkov_planner_quests_v3';
const STORAGE_KEY_AMMO = 'tarkov_planner_ammo_v3';
const STORAGE_KEY_QUEST_ITEMS = 'tarkov_planner_quest_items_v1';

// Map configuration - using tarkovdata SVG maps (coordinates match 1:1)
// Map coordinate correction factors
// The tarkovdata GPS coordinates (leftPercent, topPercent) are designed for tarkovdata SVG maps
// They should work 1:1 without offsets if using the original SVGs from the repo
// scaleX/scaleY: multiply the percent value
// offsetX/offsetY: add after scaling (in percent) - should be 0 for original SVGs
// flipY: if true, invert Y axis (100 - topPercent) BEFORE pixel conversion
// invertLeafletY: if false, don't do (height - pixelY) for Leaflet
const MAP_CONFIG = {
    customs:     { file: 'maps/Customs.svg', scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, flipY: false, invertLeafletY: true,
                   floors: [
                       { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Level'] },
                       { id: 'underground', label: 'Underground', short: 'U', svgLayers: ['Underground_Level'] },
                       { id: 'floor_1', label: '1st Floor', short: '1', svgLayers: ['First_Floor'] },
                       { id: 'floor_2', label: '2nd Floor', short: '2', svgLayers: ['Second_Floor'] },
                       { id: 'floor_3', label: '3rd Floor', short: '3', svgLayers: ['Third_Floor'] }
                   ]},
    woods:       { file: 'maps/Woods.svg', scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, flipY: false, invertLeafletY: true,
                   floors: [
                       { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: null }
                   ]},
    shoreline:   { file: 'maps/Shoreline.svg', scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, flipY: false, invertLeafletY: true,
                   floors: [
                       { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Level'] },
                       { id: 'underground', label: 'Underground', short: 'U', svgLayers: ['Underground_Level'] },
                       { id: 'floor_1', label: 'Resort 1F', short: '1', svgLayers: ['First_Floor'] },
                       { id: 'floor_2', label: 'Resort 2F', short: '2', svgLayers: ['Second_Floor'] },
                       { id: 'floor_3', label: 'Resort 3F', short: '3', svgLayers: ['Third_Floor'] }
                   ]},
    interchange: { file: 'maps/Interchange.svg', scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, flipY: false, invertLeafletY: true,
                   floors: [
                       { id: 'ground', label: 'Ground/Parking', short: 'G', default: true, svgLayers: ['Ground_Level'] },
                       { id: 'floor_1', label: '1st Floor', short: '1', svgLayers: ['First_Floor'] },
                       { id: 'floor_2', label: '2nd Floor', short: '2', svgLayers: ['Second_Floor'] }
                   ]},
    reserve:     { file: 'maps/Reserve.svg', scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, flipY: false, invertLeafletY: true,
                   floors: [
                       { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Level'] },
                       { id: 'bunkers', label: 'Bunkers/D-2', short: 'BK', svgLayers: ['Bunkers'] }
                   ]},
    lighthouse:  { file: 'maps/Lighthouse.svg', scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, flipY: false, invertLeafletY: true,
                   floors: [
                       { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: null }
                   ]},
    streets:     { file: 'maps/StreetsOfTarkov.svg', scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, flipY: false, invertLeafletY: true,
                   floors: [
                       { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Level'] },
                       { id: 'underground', label: 'Underground', short: 'U', svgLayers: ['Underground_Level'] },
                       { id: 'floor_1', label: '1st Floor', short: '1', svgLayers: ['First_Floor'] },
                       { id: 'floor_2', label: '2nd Floor', short: '2', svgLayers: ['Second_Floor'] },
                       { id: 'floor_3', label: '3rd Floor', short: '3', svgLayers: ['Third_Floor'] },
                       { id: 'floor_4', label: '4th Floor', short: '4', svgLayers: ['Fourth_Floor'] },
                       { id: 'floor_5', label: '5th Floor', short: '5', svgLayers: ['Fifth_Floor'] }
                   ]},
    groundzero:  { file: 'maps/GroundZero.svg', scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, flipY: false, invertLeafletY: true,
                   floors: [
                       { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Level'] },
                       { id: 'underground', label: 'Underground', short: 'U', svgLayers: ['Underground_Level'] },
                       { id: 'floor_1', label: '1st Floor', short: '1', svgLayers: ['First_Floor'] },
                       { id: 'floor_2', label: '2nd Floor', short: '2', svgLayers: ['Second_Floor'] },
                       { id: 'floor_3', label: '3rd Floor', short: '3', svgLayers: ['Third_Floor'] }
                   ]},
    factory:     { file: 'maps/Factory.svg', scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, flipY: false, invertLeafletY: true,
                   floors: [
                       { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Floor'] },
                       { id: 'floor_2', label: '2nd Floor', short: '2', svgLayers: ['Second_Floor'] },
                       { id: 'floor_3', label: '3rd Floor', short: '3', svgLayers: ['Third_Floor'] },
                       { id: 'basement', label: 'Basement/Tunnels', short: 'B', svgLayers: ['Basement'] }
                   ]},
    labs:        { file: 'maps/Labs.svg', scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, flipY: false, invertLeafletY: true,
                   floors: [
                       { id: 'technical', label: 'Technical Level', short: 'T', default: true, svgLayers: ['Technical_Level'] },
                       { id: 'floor_1', label: '1st Level', short: '1', svgLayers: ['First_Level'] },
                       { id: 'floor_2', label: '2nd Level', short: '2', svgLayers: ['Second_Level'] }
                   ]}
};

// Current floor state
let currentFloor = 'ground';
let currentSvgElement = null; // Reference to embedded SVG DOM

// ============================================================================
// STAT DEFINITIONS - All available stats per category from the game
// direction: 'higher' = higher is better, 'lower' = lower is better
// ============================================================================

const STAT_DEFINITIONS = {
    ammo: {
        pen:          { label: 'Penetration',       direction: 'higher', defaults: { S: 55, A: 45, B: 35, C: 25, D: 15 } },
        dmg:          { label: 'Damage',            direction: 'higher', defaults: { S: 80, A: 65, B: 50, C: 40, D: 30 } },
        armorDmg:     { label: 'Armor Damage %',    direction: 'higher', defaults: { S: 70, A: 55, B: 40, C: 30, D: 20 } },
        fragChance:   { label: 'Frag Chance %',     direction: 'higher', defaults: { S: 50, A: 35, B: 20, C: 10, D: 5 } },
        initialSpeed: { label: 'Muzzle Velocity',   direction: 'higher', defaults: { S: 900, A: 750, B: 600, C: 450, D: 300 } },
        projCount:    { label: 'Projectile Count',  direction: 'higher', defaults: { S: 8, A: 6, B: 4, C: 2, D: 1 } },
        accMod:       { label: 'Accuracy Mod %',    direction: 'lower',  defaults: { S: -5, A: 0, B: 5, C: 10, D: 20 } },
        recoilMod:    { label: 'Recoil Mod %',      direction: 'lower',  defaults: { S: -10, A: 0, B: 5, C: 10, D: 20 } },
        lightBleed:   { label: 'Light Bleed %',     direction: 'higher', defaults: { S: 50, A: 35, B: 20, C: 10, D: 5 } },
        heavyBleed:   { label: 'Heavy Bleed %',     direction: 'higher', defaults: { S: 40, A: 25, B: 15, C: 8, D: 3 } },
    },
    weapons: {
        ergo:         { label: 'Ergonomics',        direction: 'higher', defaults: { S: 70, A: 55, B: 40, C: 28, D: 15 } },
        recoilVert:   { label: 'Vertical Recoil',   direction: 'lower',  defaults: { S: 40, A: 60, B: 90, C: 130, D: 180 } },
        recoilHoriz:  { label: 'Horizontal Recoil', direction: 'lower',  defaults: { S: 150, A: 250, B: 350, C: 450, D: 550 } },
        fireRate:     { label: 'Fire Rate (RPM)',   direction: 'higher', defaults: { S: 850, A: 700, B: 550, C: 400, D: 250 } },
        effectiveDist:{ label: 'Eff. Distance (m)', direction: 'higher', defaults: { S: 600, A: 450, B: 300, C: 150, D: 50 } },
        convergence:  { label: 'Convergence',       direction: 'higher', defaults: { S: 3, A: 2.5, B: 2, C: 1.5, D: 1 } },
        cameraRecoil: { label: 'Camera Recoil',     direction: 'lower',  defaults: { S: 0.03, A: 0.05, B: 0.08, C: 0.12, D: 0.18 } },
        deviationCurve:{ label: 'Deviation Curve',  direction: 'lower',  defaults: { S: 0.2, A: 0.4, B: 0.6, C: 0.8, D: 1.0 } },
        deviationMax: { label: 'Deviation Max',     direction: 'lower',  defaults: { S: 3, A: 5, B: 8, C: 12, D: 18 } },
        sightingRange:{ label: 'Sighting Range',    direction: 'higher', defaults: { S: 1000, A: 700, B: 400, C: 200, D: 100 } },
    },
    gear: {
        armorClass:   { label: 'Armor Class',       direction: 'higher', defaults: { S: 6, A: 5, B: 4, C: 3, D: 2 } },
        durability:   { label: 'Durability',        direction: 'higher', defaults: { S: 70, A: 55, B: 40, C: 30, D: 20 } },
        ergoPenalty:  { label: 'Ergo Penalty',      direction: 'lower',  defaults: { S: -5, A: -10, B: -15, C: -25, D: -35 } },
        speedPenalty: { label: 'Speed Penalty %',   direction: 'lower',  defaults: { S: -2, A: -5, B: -10, C: -18, D: -25 } },
        turnPenalty:  { label: 'Turn Penalty',      direction: 'lower',  defaults: { S: -2, A: -5, B: -8, C: -12, D: -18 } },
        ricochetY:    { label: 'Ricochet Chance',   direction: 'higher', defaults: { S: 0.9, A: 0.7, B: 0.5, C: 0.3, D: 0.1 } },
        capacity:     { label: 'Capacity (slots)',  direction: 'higher', defaults: { S: 50, A: 35, B: 25, C: 15, D: 8 } },
        ambientVol:   { label: 'Ambient Volume',    direction: 'higher', defaults: { S: 1.5, A: 1.3, B: 1.1, C: 0.9, D: 0.7 } },
        distortion:   { label: 'Distortion',        direction: 'lower',  defaults: { S: 0.1, A: 0.2, B: 0.3, C: 0.4, D: 0.5 } },
    },
    attachments: {
        ergoMod:      { label: 'Ergonomics +/-',    direction: 'higher', defaults: { S: 15, A: 10, B: 5, C: 2, D: 0 } },
        recoilMod:    { label: 'Recoil Mod %',      direction: 'lower',  defaults: { S: -5, A: -3, B: -1, C: 0, D: 2 } },
        accMod:       { label: 'Accuracy Mod %',    direction: 'lower',  defaults: { S: -5, A: -2, B: 0, C: 2, D: 5 } },
        magCapacity:  { label: 'Mag Capacity',      direction: 'higher', defaults: { S: 60, A: 45, B: 30, C: 20, D: 10 } },
        sightingRange:{ label: 'Sighting Range',    direction: 'higher', defaults: { S: 1000, A: 600, B: 300, C: 150, D: 50 } },
        zoomLevel:    { label: 'Max Zoom',          direction: 'higher', defaults: { S: 6, A: 4, B: 2.5, C: 1.5, D: 1 } },
    }
};

// Default active stats per category
const DEFAULT_ACTIVE_STATS = {
    ammo: [],
    weapons: [],
    gear: [],
    attachments: []
};

// Item-type specific stat configuration
// Defines which stats are APPLICABLE (relevant) and which are DEFAULT ACTIVE for each item type
const ITEM_TYPE_STATS = {
    gear: {
        armor:       { applicable: ['armorClass', 'durability', 'ergoPenalty', 'speedPenalty', 'turnPenalty'], defaultActive: ['armorClass', 'durability'] },
        helmet:      { applicable: ['armorClass', 'durability', 'ergoPenalty', 'speedPenalty', 'turnPenalty', 'ricochetY'], defaultActive: ['armorClass', 'ricochetY'] },
        rig:         { applicable: ['capacity', 'ergoPenalty', 'speedPenalty'], defaultActive: ['capacity'] },
        armored_rig: { applicable: ['armorClass', 'durability', 'capacity', 'ergoPenalty', 'speedPenalty'], defaultActive: ['armorClass', 'capacity'] },
        backpack:    { applicable: ['capacity', 'speedPenalty'], defaultActive: ['capacity'] },
        headphones:  { applicable: ['ambientVol', 'distortion'], defaultActive: ['ambientVol'] },
    },
    attachments: {
        Magazines:        { applicable: ['magCapacity', 'ergoMod'], defaultActive: ['magCapacity'] },
        Scopes:           { applicable: ['zoomLevel', 'sightingRange', 'ergoMod'], defaultActive: ['zoomLevel'] },
        'Assault Scopes': { applicable: ['zoomLevel', 'sightingRange', 'ergoMod'], defaultActive: ['zoomLevel'] },
        'Reflex Sights':  { applicable: ['ergoMod', 'recoilMod'], defaultActive: ['ergoMod'] },
        'Iron Sights':    { applicable: ['ergoMod'], defaultActive: ['ergoMod'] },
        'Thermal/NV':     { applicable: ['zoomLevel', 'ergoMod'], defaultActive: ['zoomLevel'] },
        Suppressors:      { applicable: ['recoilMod', 'ergoMod'], defaultActive: ['recoilMod'] },
        Barrels:          { applicable: ['ergoMod', 'recoilMod', 'accMod'], defaultActive: ['ergoMod', 'recoilMod'] },
        'Muzzle Devices': { applicable: ['ergoMod', 'recoilMod', 'accMod'], defaultActive: ['recoilMod'] },
        'Pistol Grips':   { applicable: ['ergoMod', 'recoilMod'], defaultActive: ['ergoMod'] },
        Stocks:           { applicable: ['ergoMod', 'recoilMod'], defaultActive: ['ergoMod', 'recoilMod'] },
        Handguards:       { applicable: ['ergoMod', 'recoilMod'], defaultActive: ['ergoMod'] },
        Foregrips:        { applicable: ['ergoMod', 'recoilMod'], defaultActive: ['ergoMod', 'recoilMod'] },
        Mounts:           { applicable: ['ergoMod', 'recoilMod'], defaultActive: ['ergoMod'] },
        Flashlights:      { applicable: ['ergoMod'], defaultActive: ['ergoMod'] },
        Lasers:           { applicable: ['ergoMod'], defaultActive: ['ergoMod'] },
        'Light/Laser':    { applicable: ['ergoMod'], defaultActive: ['ergoMod'] },
        'Tactical Devices': { applicable: ['ergoMod'], defaultActive: ['ergoMod'] },
        Rails:            { applicable: ['ergoMod'], defaultActive: ['ergoMod'] },
        Receivers:        { applicable: ['ergoMod', 'recoilMod'], defaultActive: ['ergoMod'] },
        'Charging Handles': { applicable: ['ergoMod'], defaultActive: ['ergoMod'] },
        'Gas Blocks':     { applicable: ['ergoMod', 'recoilMod'], defaultActive: ['ergoMod'] },
        'Auxiliary Parts': { applicable: ['ergoMod', 'recoilMod'], defaultActive: ['ergoMod'] },
        Bipods:           { applicable: ['ergoMod', 'recoilMod'], defaultActive: ['recoilMod'] },
        Other:            { applicable: ['ergoMod', 'recoilMod', 'accMod'], defaultActive: ['ergoMod'] },
        _default:         { applicable: ['ergoMod', 'recoilMod', 'accMod'], defaultActive: ['ergoMod', 'recoilMod'] }
    },
    // Ammo and weapons don't need type-specific handling (all stats apply)
    ammo: {
        _default: { applicable: null, defaultActive: ['pen', 'dmg'] } // null = all stats applicable
    },
    weapons: {
        _default: { applicable: null, defaultActive: ['ergo', 'recoilVert'] }
    }
};

// Get applicable stats for an item type
function getApplicableStats(category, itemType) {
    const typeConfig = ITEM_TYPE_STATS[category];
    if (!typeConfig) return Object.keys(STAT_DEFINITIONS[category]);
    
    const config = typeConfig[itemType] || typeConfig._default;
    if (!config || config.applicable === null) {
        return Object.keys(STAT_DEFINITIONS[category]);
    }
    return config.applicable;
}

// Get default active stats for an item type
function getDefaultActiveStats(category, itemType) {
    const typeConfig = ITEM_TYPE_STATS[category];
    if (!typeConfig) return DEFAULT_ACTIVE_STATS[category];
    
    const config = typeConfig[itemType] || typeConfig._default;
    return config?.defaultActive || DEFAULT_ACTIVE_STATS[category];
}

// Build default thresholds from stat definitions
function buildDefaultThresholds(category) {
    const thresholds = {};
    for (const [statKey, statDef] of Object.entries(STAT_DEFINITIONS[category])) {
        thresholds[statKey] = { ...statDef.defaults };
    }
    return thresholds;
}

// Storage keys
const STORAGE_KEY_TIER_THRESHOLDS = 'tarkov_planner_thresholds_v2';
const STORAGE_KEY_TIER_OVERRIDES = 'tarkov_planner_overrides_v2';
const STORAGE_KEY_ACTIVE_STATS = 'tarkov_planner_active_stats_v2';
const STORAGE_KEY_WEAPONS = 'tarkov_planner_weapons_v1';
const STORAGE_KEY_GEAR = 'tarkov_planner_gear_v1';
const STORAGE_KEY_ATTACHMENTS = 'tarkov_planner_attachments_v1';

// Tier configuration
const TIER_NAMES = ['S', 'A', 'B', 'C', 'D', 'F'];
const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'F'];

// State
let mapInstance = null;
let currentMapLayer = null;
let imageBounds = null;
let allQuestsGlobal = [];
let questLocationsData = null;
let questMarkersLayer = null;
let currentMapHeight = 0;
let currentMapWidth = 0;
let currentMapOffsetX = 0; // viewBox minX offset
let currentMapOffsetY = 0; // viewBox minY offset
let selectedQuestNamesForMarkers = [];
let currentQuestGrouping = 'trader'; // 'trader' or 'map'
let selectedQuestsForMarkers = []; // Full quest objects for marker drawing
let requiredMapsForQuests = new Set();

// Unified tier system state
let tierThresholds = {
    ammo: buildDefaultThresholds('ammo'),
    weapons: buildDefaultThresholds('weapons'),
    gear: buildDefaultThresholds('gear'),
    attachments: buildDefaultThresholds('attachments')
};
let activeStats = JSON.parse(JSON.stringify(DEFAULT_ACTIVE_STATS));
let tierOverrides = { ammo: {}, weapons: {}, gear: {}, attachments: {} };
let keepTierThreshold = { ammo: 'B', weapons: 'B', gear: 'B', attachments: 'B' };

// Data state
let allAmmoData = null;
let ownedAmmo = new Set();
let allWeaponsData = null;
let ownedWeapons = new Set();
let allGearData = null;
let ownedGear = new Set();
let allAttachmentsData = null;
let ownedAttachments = new Set();

// Filter state
let weaponTypeFilter = 'ALL';
let weaponSearchQuery = '';
let gearTypeFilter = 'ALL';
let gearSearchQuery = '';
let attachmentTypeFilter = 'ALL';
let attachmentSearchQuery = '';

// ============================================================================
// STATUS INDICATOR
// ============================================================================

function updateStatus(connected, version = '1.0&beta;') {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (connected) {
        dot.classList.remove('offline');
        text.textContent = `v${version} connected`;
    } else {
        dot.classList.add('offline');
        text.textContent = 'Offline';
    }
}

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

// ============================================================================
// HIDEOUT TRACKER
// ============================================================================

const STORAGE_KEY_HIDEOUT = 'tarkov_planner_hideout_v1';
const HIDEOUT_GRAPHQL_URL = 'https://api.tarkov.dev/graphql';

let hideoutData = null;
let hideoutDataLoaded = false;
let hideoutProgress = {}; // stationId -> level completed

function getHideoutProgress() {
    const saved = localStorage.getItem(STORAGE_KEY_HIDEOUT);
    return saved ? JSON.parse(saved) : {};
}

function saveHideoutProgress() {
    localStorage.setItem(STORAGE_KEY_HIDEOUT, JSON.stringify(hideoutProgress));
}

function setStationLevel(stationId, level) {
    hideoutProgress[stationId] = level;
    saveHideoutProgress();
    renderHideoutList();
    updateHideoutStats();
}

async function loadHideoutData() {
    const loading = document.getElementById('hideout-loading');
    const content = document.getElementById('hideout-content');
    const error = document.getElementById('hideout-error');
    
    loading.classList.remove('d-none');
    content.classList.add('d-none');
    error.classList.add('d-none');
    
    try {
        const query = `{
            hideoutStations {
                id
                name
                normalizedName
                imageLink
                levels {
                    level
                    constructionTime
                    itemRequirements {
                        item {
                            id
                            name
                            shortName
                            iconLink
                        }
                        count
                        attributes {
                            type
                            value
                        }
                    }
                    stationLevelRequirements {
                        station {
                            id
                            name
                        }
                        level
                    }
                    traderRequirements {
                        trader {
                            name
                        }
                        level
                    }
                    skillRequirements {
                        name
                        level
                    }
                }
            }
        }`;
        
        const response = await fetch(HIDEOUT_GRAPHQL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        if (!response.ok) throw new Error('API error: ' + response.status);
        
        const result = await response.json();
        hideoutData = result.data.hideoutStations;
        hideoutProgress = getHideoutProgress();
        hideoutDataLoaded = true;
        
        console.log(`Loaded ${hideoutData.length} hideout stations`);
        
        renderHideoutList();
        updateHideoutStats();
        
        loading.classList.add('d-none');
        content.classList.remove('d-none');
        
    } catch (err) {
        console.error('Error loading hideout data:', err);
        error.innerHTML = `<strong>ERROR:</strong> ${err.message}`;
        error.classList.remove('d-none');
        loading.classList.add('d-none');
    }
}

function renderHideoutList() {
    if (!hideoutData) return;
    
    const container = document.getElementById('hideout-stations-list');
    const searchTerm = document.getElementById('hideoutSearch')?.value.toLowerCase() || '';
    const hideCompleted = document.getElementById('hideCompletedStations')?.checked || false;
    
    // Sort stations alphabetically
    const sortedStations = [...hideoutData].sort((a, b) => a.name.localeCompare(b.name));
    
    let html = '';
    let shoppingListItems = new Map(); // itemId -> { item, count, stations[] }
    
    sortedStations.forEach(station => {
        const maxLevel = station.levels.length;
        const currentLevel = hideoutProgress[station.id] || 0;
        const isMaxed = currentLevel >= maxLevel;
        
        // Filter by search
        if (searchTerm && !station.name.toLowerCase().includes(searchTerm)) return;
        
        // Filter by completion
        if (hideCompleted && isMaxed) return;
        
        // Collect items for shopping list (next level only)
        if (currentLevel < maxLevel) {
            const nextLevel = station.levels.find(l => l.level === currentLevel + 1);
            if (nextLevel && nextLevel.itemRequirements) {
                nextLevel.itemRequirements.forEach(req => {
                    const key = req.item.id;
                    const fir = isFoundInRaid(req.attributes);
                    if (shoppingListItems.has(key)) {
                        shoppingListItems.get(key).count += req.count;
                        shoppingListItems.get(key).stations.push(station.name);
                        // Mark as FIR if any requirement needs FIR
                        if (fir) shoppingListItems.get(key).fir = true;
                    } else {
                        shoppingListItems.set(key, {
                            item: req.item,
                            count: req.count,
                            stations: [station.name],
                            fir: fir
                        });
                    }
                });
            }
        }
        
        html += `
            <div class="hideout-station ${isMaxed ? 'maxed' : ''}" data-station-id="${station.id}">
                <div class="hideout-station-header" onclick="toggleHideoutStation('${station.id}')">
                    ${station.imageLink ? `<img src="${station.imageLink}" alt="${station.name}">` : '<div style="width:48px;height:48px;background:var(--bg-dark);"></div>'}
                    <div class="station-info">
                        <div class="station-name">${station.name}</div>
                        <div class="station-level">Level <span class="current">${currentLevel}</span> / ${maxLevel}</div>
                    </div>
                    <span class="badge-tarkov ${isMaxed ? 'badge-active' : ''}">${isMaxed ? '✓ MAXED' : `${maxLevel - currentLevel} to go`}</span>
                </div>
                <div class="hideout-station-levels" id="levels-${station.id}">
                    ${renderStationLevels(station, currentLevel)}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html || '<div class="text-sub text-center p-3">No stations found</div>';
    
    // Render shopping list
    renderShoppingList(shoppingListItems);
}

function renderStationLevels(station, currentLevel) {
    let html = '';
    
    station.levels.forEach(level => {
        const isCompleted = currentLevel >= level.level;
        const isNext = level.level === currentLevel + 1;
        
        html += `
            <div class="hideout-level ${isCompleted ? 'completed' : ''} ${isNext ? 'current-target' : ''}">
                <div class="hideout-level-header">
                    <h6>Level ${level.level}</h6>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="level-status ${isCompleted ? 'done' : 'locked'}">${isCompleted ? '✓ Done' : 'Locked'}</span>
                        <button class="level-complete-btn ${isCompleted ? 'completed' : ''}" 
                                onclick="event.stopPropagation(); toggleStationLevel('${station.id}', ${level.level}, ${isCompleted})">
                            ${isCompleted ? '↩ Undo' : '✓ Complete'}
                        </button>
                    </div>
                </div>
                <div class="hideout-requirements">
                    ${renderLevelRequirements(level)}
                </div>
            </div>
        `;
    });
    
    return html;
}

function isFoundInRaid(attributes) {
    if (!attributes || !Array.isArray(attributes)) return false;
    return attributes.some(attr => 
        attr.type === 'foundInRaid' && (attr.value === 'true' || attr.value === true)
    );
}

function renderLevelRequirements(level) {
    let html = '';
    
    // Item requirements
    if (level.itemRequirements && level.itemRequirements.length > 0) {
        html += `
            <div class="hideout-req-section">
                <div class="req-title">📦 Items Required</div>
                <div class="hideout-req-items">
                    ${level.itemRequirements.map(req => {
                        const fir = isFoundInRaid(req.attributes);
                        return `
                        <div class="hideout-req-item ${fir ? 'fir-required' : ''}">
                            ${req.item.iconLink ? `<img src="${req.item.iconLink}" alt="${req.item.shortName}">` : ''}
                            <span class="item-count">${req.count}x</span>
                            <span class="item-name" title="${req.item.name}">${req.item.shortName || req.item.name}</span>
                            ${fir ? '<span class="fir-badge" title="Found in Raid required">FIR</span>' : ''}
                        </div>
                    `}).join('')}
                </div>
            </div>
        `;
    }
    
    // Station requirements
    if (level.stationLevelRequirements && level.stationLevelRequirements.length > 0) {
        html += `
            <div class="hideout-req-section">
                <div class="req-title">🏠 Station Requirements</div>
                <div class="hideout-req-items">
                    ${level.stationLevelRequirements.map(req => `
                        <div class="hideout-req-item">
                            <span class="item-name">${req.station.name} Lv${req.level}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Trader requirements
    if (level.traderRequirements && level.traderRequirements.length > 0) {
        html += `
            <div class="hideout-req-section">
                <div class="req-title">🤝 Trader Requirements</div>
                <div class="hideout-req-items">
                    ${level.traderRequirements.map(req => `
                        <div class="hideout-req-item">
                            <span class="item-name">${req.trader.name} LL${req.level}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Skill requirements
    if (level.skillRequirements && level.skillRequirements.length > 0) {
        html += `
            <div class="hideout-req-section">
                <div class="req-title">📈 Skill Requirements</div>
                <div class="hideout-req-items">
                    ${level.skillRequirements.map(req => `
                        <div class="hideout-req-item">
                            <span class="item-name">${req.name} Lv${req.level}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Construction time
    if (level.constructionTime > 0) {
        const hours = Math.floor(level.constructionTime / 3600);
        const minutes = Math.floor((level.constructionTime % 3600) / 60);
        html += `
            <div class="hideout-req-section">
                <div class="req-title">⏱️ Build Time: ${hours}h ${minutes}m</div>
            </div>
        `;
    }
    
    return html || '<div class="text-sub small">No requirements</div>';
}

function renderShoppingList(itemsMap) {
    const container = document.getElementById('hideout-shopping-list');
    
    if (itemsMap.size === 0) {
        container.innerHTML = '<div class="text-sub text-center p-3">All next levels have no item requirements!</div>';
        return;
    }
    
    // Sort by count (most needed first)
    const sortedItems = [...itemsMap.values()].sort((a, b) => b.count - a.count);
    
    let html = '';
    sortedItems.forEach(data => {
        html += `
            <div class="shopping-item ${data.fir ? 'fir-required' : ''}">
                ${data.item.iconLink ? `<img src="${data.item.iconLink}" alt="${data.item.shortName}">` : ''}
                <div class="item-info">
                    <div class="item-name">${data.item.shortName || data.item.name} ${data.fir ? '<span class="fir-badge">FIR</span>' : ''}</div>
                    <div class="item-for">For: ${data.stations.slice(0, 2).join(', ')}${data.stations.length > 2 ? ` +${data.stations.length - 2} more` : ''}</div>
                </div>
                <span class="item-count">${data.count}x</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function toggleHideoutStation(stationId) {
    const levelsEl = document.getElementById('levels-' + stationId);
    if (levelsEl) {
        levelsEl.classList.toggle('show');
    }
}

function toggleStationLevel(stationId, level, isCurrentlyCompleted) {
    if (isCurrentlyCompleted) {
        // Undo: set to level - 1
        setStationLevel(stationId, level - 1);
    } else {
        // Complete: set to this level
        setStationLevel(stationId, level);
    }
}

function filterHideoutStations() {
    renderHideoutList();
}

function updateHideoutStats() {
    if (!hideoutData) return;
    
    let totalLevels = 0;
    let completedLevels = 0;
    let stationsMaxed = 0;
    let stationsInProgress = 0;
    let stationsNotStarted = 0;
    
    hideoutData.forEach(station => {
        const maxLevel = station.levels.length;
        const currentLevel = hideoutProgress[station.id] || 0;
        
        totalLevels += maxLevel;
        completedLevels += currentLevel;
        
        if (currentLevel >= maxLevel) {
            stationsMaxed++;
        } else if (currentLevel > 0) {
            stationsInProgress++;
        } else {
            stationsNotStarted++;
        }
    });
    
    // Update progress bar
    const progressPercent = totalLevels > 0 ? (completedLevels / totalLevels) * 100 : 0;
    document.getElementById('hideout-progress-fill').style.width = progressPercent + '%';
    document.getElementById('hideout-progress-text').textContent = `${completedLevels} / ${totalLevels} Levels`;
    
    // Update stats
    document.getElementById('stat-stations-count').textContent = hideoutData.length;
    document.getElementById('stat-completed-count').textContent = stationsMaxed;
    document.getElementById('stat-inprogress-count').textContent = stationsInProgress;
    document.getElementById('stat-notstarted-count').textContent = stationsNotStarted;
}

function getWikiUrl(questName) {
    return 'https://escapefromtarkov.fandom.com/wiki/' + encodeURIComponent(questName.replace(/ /g, '_'));
}

async function loadQuests() {
    const loading = document.getElementById('quest-loading');
    const list = document.getElementById('quest-list');
    const error = document.getElementById('quest-error');
    
    try {
        const response = await fetch(API_BASE + '/quests/ALL');
        if (!response.ok) throw new Error('Server error: ' + response.status);
        const data = await response.json();
        
        // Handle both array and object response
        allQuestsGlobal = Array.isArray(data) ? data : (data.quests || []);
        
        // Update connection status
        updateStatus(true, '1.0&beta;');
        
        // Render quest list
        renderQuestList();
        
        list.classList.remove('d-none');
        loading.classList.add('d-none');
        
    } catch (err) {
        updateStatus(false);
        error.innerHTML = `<strong>ERROR:</strong> ${err.message}<br><small>Make sure the backend is running</small>`;
        error.classList.remove('d-none');
        loading.classList.add('d-none');
    }
}

function setQuestGrouping(grouping) {
    currentQuestGrouping = grouping;
    
    // Update button states
    document.getElementById('groupByTrader').style.background = grouping === 'trader' ? 'var(--eft-gold)' : 'transparent';
    document.getElementById('groupByTrader').style.color = grouping === 'trader' ? '#000' : 'var(--text-sub)';
    document.getElementById('groupByMap').style.background = grouping === 'map' ? 'var(--eft-gold)' : 'transparent';
    document.getElementById('groupByMap').style.color = grouping === 'map' ? '#000' : 'var(--text-sub)';
    
    // Re-render quest list
    renderQuestList();
}

function renderQuestList() {
    const list = document.getElementById('quest-list');
    const savedQuests = getSavedQuests();
    const completedQuests = getCompletedQuests();
    
    if (!allQuestsGlobal || allQuestsGlobal.length === 0) {
        list.innerHTML = '<div class="text-sub text-center p-3">No tasks loaded</div>';
        return;
    }
    
    let html = '';
    
    if (currentQuestGrouping === 'trader') {
        // Group by trader
        const byTrader = {};
        allQuestsGlobal.forEach(q => {
            const trader = q.trader?.name || 'Unknown';
            if (!byTrader[trader]) byTrader[trader] = { quests: [], image: q.trader?.imageLink };
            byTrader[trader].quests.push(q);
        });
        
        for (const [trader, data] of Object.entries(byTrader)) {
            const groupId = 'trader-' + trader.replace(/\s+/g, '-');
            html += `
                <div class="trader-group">
                    <div class="trader-header" onclick="toggleTrader('${groupId}')" id="btn-${groupId}" data-total="${data.quests.length}">
                        ${data.image ? `<img src="${data.image}" alt="${trader}">` : ''}
                        <h6>${trader}</h6>
                        <span class="badge-tarkov">${data.quests.length} Tasks</span>
                    </div>
                    <div class="trader-quests" id="${groupId}">
            `;
            
            data.quests.forEach(q => {
                const isSelected = savedQuests.has(q.id);
                const isCompleted = completedQuests.has(q.id);
                const prereqs = getQuestPrereqs(q);
                const prereqsHtml = renderPrereqsHtml(prereqs);
                const questLevel = q.minPlayerLevel || 1;
                
                html += `
                    <div class="quest-row ${isSelected ? 'selected' : ''} ${isCompleted ? 'completed' : ''}" onclick="toggleSelection('${q.id}', this, event)" data-quest-id="${q.id}" data-quest-level="${questLevel}">
                        <input type="checkbox" id="cb-${q.id}" ${isSelected ? 'checked' : ''} data-parent-group="${groupId}" data-quest-name="${q.name}">
                        <button class="complete-btn" onclick="toggleQuestCompleted('${q.id}', event)" title="${isCompleted ? 'Mark as not done' : 'Mark as done'}">${isCompleted ? '✓' : '○'}</button>
                        <div class="quest-info">
                            <div class="quest-name">
                                <a href="${getWikiUrl(q.name)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${q.name}</a>
                            </div>
                            <div class="quest-meta">
                                <span>${q.map?.name || 'Any'}</span>
                                <span>Lvl ${q.minPlayerLevel || '?'}</span>
                            </div>
                            ${prereqsHtml}
                        </div>
                    </div>
                `;
            });
            
            html += '</div></div>';
        }
        
        list.innerHTML = html;
        
        // Update badges
        for (const trader of Object.keys(byTrader)) {
            const groupId = 'trader-' + trader.replace(/\s+/g, '-');
            updateTraderBadge(groupId);
        }
        
    } else {
        // Group by map
        const byMap = {};
        allQuestsGlobal.forEach(q => {
            const mapName = q.map?.name || 'Any';
            if (!byMap[mapName]) byMap[mapName] = [];
            byMap[mapName].push(q);
        });
        
        // Sort maps alphabetically, but put "Any" at the end
        const mapNames = Object.keys(byMap).sort((a, b) => {
            if (a === 'Any') return 1;
            if (b === 'Any') return -1;
            return a.localeCompare(b);
        });
        
        for (const mapName of mapNames) {
            const quests = byMap[mapName];
            const groupId = 'map-' + mapName.replace(/\s+/g, '-');
            const mapKey = mapNameToKey(mapName);
            
            // Map icons
            const mapIcons = {
                'Customs': '🏭', 'Woods': '🌲', 'Shoreline': '🏖️', 'Interchange': '🛒',
                'Reserve': '🏰', 'Lighthouse': '🗼', 'Streets of Tarkov': '🏙️',
                'Ground Zero': '☢️', 'Factory': '🏗️', 'The Lab': '🔬', 'Any': '🌍'
            };
            const icon = mapIcons[mapName] || '📍';
            
            html += `
                <div class="trader-group">
                    <div class="trader-header" onclick="toggleTrader('${groupId}')" id="btn-${groupId}" data-total="${quests.length}">
                        <span style="font-size: 1.5rem; margin-right: 8px;">${icon}</span>
                        <h6>${mapName}</h6>
                        <span class="badge-tarkov">${quests.length} Tasks</span>
                    </div>
                    <div class="trader-quests" id="${groupId}">
            `;
            
            quests.forEach(q => {
                const isSelected = savedQuests.has(q.id);
                const isCompleted = completedQuests.has(q.id);
                const prereqs = getQuestPrereqs(q);
                const prereqsHtml = renderPrereqsHtml(prereqs);
                const questLevel = q.minPlayerLevel || 1;
                
                html += `
                    <div class="quest-row ${isSelected ? 'selected' : ''} ${isCompleted ? 'completed' : ''}" onclick="toggleSelection('${q.id}', this, event)" data-quest-id="${q.id}" data-quest-level="${questLevel}">
                        <input type="checkbox" id="cb-${q.id}" ${isSelected ? 'checked' : ''} data-parent-group="${groupId}" data-quest-name="${q.name}">
                        <button class="complete-btn" onclick="toggleQuestCompleted('${q.id}', event)" title="${isCompleted ? 'Mark as not done' : 'Mark as done'}">${isCompleted ? '✓' : '○'}</button>
                        <div class="quest-info">
                            <div class="quest-name">
                                <a href="${getWikiUrl(q.name)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${q.name}</a>
                            </div>
                            <div class="quest-meta">
                                <span>${q.trader?.name || 'Unknown'}</span>
                                <span>Lvl ${q.minPlayerLevel || '?'}</span>
                            </div>
                            ${prereqsHtml}
                        </div>
                    </div>
                `;
            });
            
            html += '</div></div>';
        }
        
        list.innerHTML = html;
        
        // Update badges
        for (const mapName of mapNames) {
            const groupId = 'map-' + mapName.replace(/\s+/g, '-');
            updateTraderBadge(groupId);
        }
    }
    
    // Update selected quest count
    updateSelectedQuestCount();
}

function toggleTrader(groupId) {
    document.getElementById(groupId).classList.toggle('show');
}

function toggleSelection(questId, div, ev) {
    const cb = document.getElementById('cb-' + questId);
    if (ev.target !== cb && ev.target.tagName !== 'A') {
        cb.checked = !cb.checked;
    }
    cb.checked ? div.classList.add('selected') : div.classList.remove('selected');
    saveQuestState(questId, cb.checked);
    
    const groupId = cb.getAttribute('data-parent-group');
    if (groupId) updateTraderBadge(groupId);
    
    // Update map selection based on selected quests
    updateMapSelection();
}

function updateMapSelection() {
    const savedQuests = getSavedQuests();
    const selectedQuests = allQuestsGlobal.filter(q => savedQuests.has(q.id));
    const mapSelect = document.getElementById('mapSelect');
    const mapHint = document.getElementById('mapHint');
    
    if (selectedQuests.length === 0) {
        // No quests selected - enable all maps, hide hint
        Array.from(mapSelect.options).forEach(opt => opt.disabled = false);
        mapHint.style.display = 'none';
        requiredMapsForQuests = new Set();
        return;
    }
    
    // Collect required maps from API quest data AND tarkovdata locations
    requiredMapsForQuests = new Set();
    
    selectedQuests.forEach(q => {
        // Get the authoritative map from API (if specific, not "any")
        const apiMapKey = (q.map?.name && q.map.name.toLowerCase() !== 'any') 
            ? mapNameToKey(q.map.name) 
            : null;
        
        // If API specifies a map, that's the primary source
        if (apiMapKey) {
            requiredMapsForQuests.add(apiMapKey);
        }
        
        // From tarkovdata GPS locations - but validate against API map
        if (questLocationsData) {
            const questTitle = q.name.toLowerCase().trim();
            const locations = questLocationsData.byQuestName[questTitle] || [];
            locations.forEach(loc => {
                if (loc.mapKey) {
                    // If quest has specific API map, only add GPS locations that match
                    // This filters out erroneous location IDs in tarkovdata
                    if (apiMapKey) {
                        if (loc.mapKey === apiMapKey) {
                            requiredMapsForQuests.add(loc.mapKey);
                        }
                        // Silently ignore mismatched GPS locations (data error in tarkovdata)
                    } else {
                        // Quest is "any" map - trust GPS locations
                        requiredMapsForQuests.add(loc.mapKey);
                    }
                }
            });
        }
    });
    
    // If no specific maps found (all "any" quests), enable all
    if (requiredMapsForQuests.size === 0) {
        Array.from(mapSelect.options).forEach(opt => opt.disabled = false);
        mapHint.textContent = 'Selected tasks can be completed on any map';
        mapHint.className = 'map-hint';
        mapHint.style.display = 'block';
        return;
    }
    
    // Enable/disable map options
    const mapNames = [];
    Array.from(mapSelect.options).forEach(opt => {
        const isRequired = requiredMapsForQuests.has(opt.value);
        opt.disabled = !isRequired;
        if (isRequired) {
            mapNames.push(opt.textContent);
        }
    });
    
    // Sort alphabetically and select first
    mapNames.sort();
    const sortedMaps = Array.from(requiredMapsForQuests).sort();
    
    // Auto-select first available map if current selection is disabled
    const currentSelected = mapSelect.value;
    if (!requiredMapsForQuests.has(currentSelected)) {
        mapSelect.value = sortedMaps[0];
    }
    
    // Show hint
    if (requiredMapsForQuests.size === 1) {
        mapHint.textContent = `Task location: ${mapNames[0]}`;
        mapHint.className = 'map-hint';
    } else {
        mapHint.textContent = `Tasks require ${requiredMapsForQuests.size} maps: ${mapNames.join(', ')}`;
        mapHint.className = 'map-hint warning';
    }
    mapHint.style.display = 'block';
}

function mapNameToKey(mapName) {
    const nameMap = {
        'customs': 'customs',
        'woods': 'woods',
        'shoreline': 'shoreline',
        'interchange': 'interchange',
        'reserve': 'reserve',
        'lighthouse': 'lighthouse',
        'streets of tarkov': 'streets',
        'streets': 'streets',
        'ground zero': 'groundzero',
        'factory': 'factory',
        'the lab': 'labs',
        'laboratory': 'labs',
        'labs': 'labs'
    };
    return nameMap[mapName.toLowerCase()] || null;
}

function updateTraderBadge(groupId) {
    const btn = document.getElementById('btn-' + groupId);
    if (!btn) return;
    const count = document.querySelectorAll(`input[data-parent-group="${groupId}"]:checked`).length;
    const badge = btn.querySelector('.badge-tarkov');
    badge.textContent = count > 0 ? count + ' Active' : btn.dataset.total + ' Tasks';
    badge.classList.toggle('badge-active', count > 0);
}

function filterQuests() {
    const search = document.getElementById('questSearch').value.toLowerCase();
    const hideCompleted = document.getElementById('hideCompletedToggle')?.checked || false;
    const maxLevel = parseInt(document.getElementById('levelFilter')?.value) || 0;
    const completedQuests = getCompletedQuests();
    
    // Filter individual quest rows
    document.querySelectorAll('.quest-row').forEach(row => {
        const name = row.querySelector('.quest-name').textContent.toLowerCase();
        const questId = row.dataset.questId;
        const questLevel = parseInt(row.dataset.questLevel) || 1;
        const matchesSearch = name.includes(search);
        const isCompleted = questId && completedQuests.has(questId);
        const matchesLevel = maxLevel === 0 || questLevel <= maxLevel;
        
        // Show if: matches search AND matches level AND (not hiding completed OR not completed)
        const shouldShow = matchesSearch && matchesLevel && (!hideCompleted || !isCompleted);
        row.style.display = shouldShow ? '' : 'none';
    });
    
    // Hide/show groups based on whether they have visible quests
    document.querySelectorAll('.trader-group').forEach(group => {
        const allRows = group.querySelectorAll('.quest-row');
        let hasVisible = false;
        
        allRows.forEach(row => {
            if (row.style.display !== 'none') {
                hasVisible = true;
            }
        });
        
        group.style.display = hasVisible ? '' : 'none';
        
        // Auto-expand groups that have matches when searching
        if (search && hasVisible) {
            const questsContainer = group.querySelector('.trader-quests');
            if (questsContainer) questsContainer.classList.add('show');
        }
        
        // Collapse groups when search is cleared
        if (!search) {
            const questsContainer = group.querySelector('.trader-quests');
            if (questsContainer) questsContainer.classList.remove('show');
        }
    });
}

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
        
        // Create custom pane for SVG map with low z-index
        if (!mapInstance.getPane('svgMapPane')) {
            mapInstance.createPane('svgMapPane');
            mapInstance.getPane('svgMapPane').style.zIndex = 200;
            mapInstance.getPane('svgMapPane').style.pointerEvents = 'none';
        }
        
        // Use L.svgOverlay for DOM access - put it in custom pane so it's below other layers
        currentMapLayer = L.svgOverlay(svgElement, imageBounds, { 
            pane: 'svgMapPane',
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

// ============================================================================
// RAID PLANNING
// ============================================================================

async function planRaid() {
    const resultBox = document.getElementById('planning-result');
    const mapSelect = document.getElementById('mapSelect');
    const savedQuests = getSavedQuests();
    
    if (savedQuests.size === 0) {
        alert('No tasks selected. Please select at least one task.');
        return;
    }
    
    const selectedQuests = allQuestsGlobal.filter(q => savedQuests.has(q.id));
    
    // Store selected quest names and full objects for markers
    selectedQuestNamesForMarkers = selectedQuests.map(q => q.name);
    selectedQuestsForMarkers = selectedQuests;
    
    // Analyze which maps are needed for selected quests
    const mapAnalysis = analyzeQuestMaps(selectedQuests);
    
    // Setup multi-map tabs if multiple maps needed
    if (mapAnalysis.maps.length > 1) {
        setupMultiMapTabs(mapAnalysis.maps, mapAnalysis.questsByMap);
    } else {
        resetMultiMapMode();
    }
    
    resultBox.style.display = 'block';
    resultBox.scrollIntoView({ behavior: 'smooth' });
    
    // Determine which map to show
    let mapName;
    if (multiMapMode && mapAnalysis.maps.length > 0) {
        mapName = mapAnalysis.maps[0]; // First required map
    } else {
        mapName = mapSelect.value;
    }
    
    // Initialize map with selected quest markers
    await initMap(mapName, selectedQuestNamesForMarkers, selectedQuestsForMarkers);
    
    // Render extract markers (new system)
    await renderExtractMarkers();
    // Render legacy overlay markers if any layers are enabled
    await renderOverlayMarkers();
    
    // Collect items provided by quest starts
    const providedItemIds = new Set();
    selectedQuests.forEach(q => {
        if (q.startRewards?.items) {
            q.startRewards.items.forEach(r => {
                if (r.item?.id) providedItemIds.add(r.item.id);
            });
        }
    });
    
    // Collect required keys, items, objectives, unlocks
    const neededKeys = new Map();
    const itemsMap = new Map();
    const objectives = [];
    const unlocks = [];
    
    // NEW: Quest Item Tracker - collect items grouped by quest with more details
    const questItemsData = [];
    
    selectedQuests.forEach(q => {
        if (q.neededKeys) {
            q.neededKeys.forEach(g => {
                if (g.keys?.length > 0) {
                    neededKeys.set(g.keys[0].name, g.keys[0]);
                }
            });
        }
        
        if (q.objectives) {
            q.objectives.forEach(o => {
                objectives.push({ quest: q.name, desc: o.description });
                
                const item = o.item || o.markerItem;
                if (item) {
                    const isProvided = providedItemIds.has(item.id);
                    if (!itemsMap.has(item.id)) {
                        itemsMap.set(item.id, { name: item.name, icon: item.iconLink, count: 0, isProvided });
                    }
                    itemsMap.get(item.id).count += (o.count || 1);
                    if (isProvided) itemsMap.get(item.id).isProvided = true;
                }
            });
        }
        
        // Collect and GROUP items for this quest (combine same items)
        const questItemsMap = new Map();
        if (q.objectives) {
            q.objectives.forEach(o => {
                const item = o.item || o.markerItem;
                if (item) {
                    const isProvided = providedItemIds.has(item.id);
                    const itemCount = o.count || 1;
                    
                    if (questItemsMap.has(item.id)) {
                        // Add to existing item count
                        questItemsMap.get(item.id).count += itemCount;
                    } else {
                        // New item entry
                        questItemsMap.set(item.id, {
                            id: item.id,
                            name: item.name,
                            shortName: item.shortName || item.name,
                            icon: item.iconLink,
                            count: itemCount,
                            type: o.type || 'giveItem',
                            // FIR only if EXPLICITLY true in API - markers etc. are NOT FIR
                            foundInRaid: o.foundInRaid === true,
                            isProvided: isProvided,
                            description: o.description
                        });
                    }
                }
            });
        }
        
        const questItems = Array.from(questItemsMap.values());
        
        if (questItems.length > 0) {
            questItemsData.push({
                questId: q.id,
                questName: q.name,
                trader: q.trader?.name || 'Unknown',
                items: questItems
            });
        }
        
        if (q.derived_unlocks) {
            q.derived_unlocks.forEach(u => unlocks.push({ from: q.name, ...u }));
        }
    });
    
    // Render results
    document.getElementById('required-keys').innerHTML = neededKeys.size > 0 
        ? Array.from(neededKeys.values()).map(k => `
            <div class="item-box">
                ${k.iconLink ? `<img src="${k.iconLink}">` : ''}
                <span>${k.shortName || k.name}</span>
            </div>
        `).join('') 
        : '<span class="text-sub p-2">None required.</span>';
    
    // NEW: Render Quest Item Tracker instead of simple required-items
    renderQuestItemTracker(questItemsData);
    
    // Group objectives by quest for better readability
    const objectivesByQuest = {};
    selectedQuests.forEach(q => {
        if (q.objectives) {
            objectivesByQuest[q.name] = q.objectives.map(o => o.description);
        }
    });
    
    let objectivesHtml = '';
    Object.entries(objectivesByQuest).forEach(([questName, objs], index) => {
        const color = QUEST_COLORS[index % QUEST_COLORS.length];
        objectivesHtml += `
            <div class="quest-objectives-group">
                <div class="quest-objectives-header">
                    <div class="legend-color" style="background: ${color.fill}; border-color: ${color.border}; width: 14px; height: 14px;"></div>
                    <span>${questName}</span>
                </div>
                <ul class="quest-objectives-list">
                    ${objs.map((desc, i) => `<li><span class="obj-index">${i + 1}.</span> ${desc}</li>`).join('')}
                </ul>
            </div>
        `;
    });
    document.getElementById('mission-steps').innerHTML = objectivesHtml;
    
    document.getElementById('progression-list').innerHTML = unlocks.length > 0 
        ? unlocks.map(u => `
            <div class="unlock-card">
                <div style="font-size: 0.8rem; color: var(--text-sub);">From ${u.from}:</div>
                <div class="fw-bold">
                    <a href="${getWikiUrl(u.name)}" target="_blank" rel="noopener noreferrer" class="unlock-link">${u.name}</a>
                </div>
                <div class="small text-sub">${u.map} | ${u.trader}</div>
            </div>
        `).join('') 
        : '<div class="text-sub p-2">No immediate unlocks.</div>';
}

// ============================================================================
// RAID PLAN SHARING
// ============================================================================

function showRaidExportModal() {
    const savedQuests = getSavedQuests();
    
    if (savedQuests.size === 0) {
        alert('No tasks selected. Select some tasks first, then click "Plan Raid" before sharing.');
        return;
    }
    
    const selectedQuests = allQuestsGlobal.filter(q => savedQuests.has(q.id));
    const currentMap = document.getElementById('mapSelect')?.value || 'customs';
    
    // Build raid plan data
    const raidPlan = {
        v: 1, // version
        m: currentMap,
        q: selectedQuests.map(q => ({ id: q.id, n: q.name }))
    };
    
    // Encode as Base64
    const json = JSON.stringify(raidPlan);
    const code = btoa(unescape(encodeURIComponent(json)));
    
    // Build summary
    const mapNames = {
        customs: 'Customs', factory: 'Factory', groundzero: 'Ground Zero',
        interchange: 'Interchange', labs: 'The Lab', lighthouse: 'Lighthouse',
        reserve: 'Reserve', shoreline: 'Shoreline', streets: 'Streets of Tarkov', woods: 'Woods'
    };
    
    const summary = `
        <div style="color: var(--eft-gold); margin-bottom: 8px;">🗺️ ${mapNames[currentMap] || currentMap}</div>
        <div style="color: var(--text-beige);">${selectedQuests.length} Tasks:</div>
        <ul style="margin: 5px 0 0 20px; padding: 0; color: var(--text-sub); font-size: 0.8rem;">
            ${selectedQuests.slice(0, 5).map(q => `<li>${q.name}</li>`).join('')}
            ${selectedQuests.length > 5 ? `<li>... and ${selectedQuests.length - 5} more</li>` : ''}
        </ul>
    `;
    
    // Build Discord text
    const neededKeys = new Set();
    const neededItems = new Map();
    
    selectedQuests.forEach(q => {
        // Collect keys
        if (q.neededKeys) {
            q.neededKeys.forEach(g => {
                if (g.keys?.length > 0) {
                    neededKeys.add(g.keys[0].name);
                }
            });
        }
        // Collect items from objectives
        if (q.objectives) {
            q.objectives.forEach(o => {
                const item = o.item || o.markerItem;
                if (item) {
                    const count = o.count || 1;
                    if (neededItems.has(item.name)) {
                        neededItems.set(item.name, neededItems.get(item.name) + count);
                    } else {
                        neededItems.set(item.name, count);
                    }
                }
            });
        }
    });
    
    let discordText = `🎯 **${mapNames[currentMap] || currentMap} Raid Plan**\n`;
    discordText += `━━━━━━━━━━━━━━━━━━━━━\n`;
    discordText += `📋 **${selectedQuests.length} Tasks:**\n`;
    selectedQuests.forEach(q => {
        discordText += `• ${q.name}\n`;
    });
    
    if (neededKeys.size > 0) {
        discordText += `\n🔑 **Keys Needed:**\n`;
        [...neededKeys].forEach(k => {
            discordText += `• ${k}\n`;
        });
    }
    
    if (neededItems.size > 0) {
        discordText += `\n📦 **Items to Bring:**\n`;
        [...neededItems.entries()].forEach(([name, count]) => {
            discordText += `• ${count}x ${name}\n`;
        });
    }
    
    discordText += `━━━━━━━━━━━━━━━━━━━━━\n`;
    discordText += `📥 Import: \`${code.substring(0, 30)}...\``;
    
    document.getElementById('raidShareSummary').innerHTML = summary;
    document.getElementById('raidShareCode').value = code;
    document.getElementById('raidShareText').value = discordText;
    document.getElementById('raidShareModal').style.display = 'flex';
}

function hideRaidShareModal() {
    document.getElementById('raidShareModal').style.display = 'none';
}

function copyRaidCode() {
    const input = document.getElementById('raidShareCode');
    input.select();
    document.execCommand('copy');
    navigator.clipboard.writeText(input.value).catch(() => {});
    
    // Visual feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied!';
    btn.style.background = 'var(--eft-green)';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 2000);
}

function copyRaidText() {
    const textarea = document.getElementById('raidShareText');
    textarea.select();
    document.execCommand('copy');
    navigator.clipboard.writeText(textarea.value).catch(() => {});
    
    // Visual feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied to clipboard!';
    btn.style.background = 'var(--eft-green)';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 2000);
}

function showRaidImportModal() {
    document.getElementById('raidImportCode').value = '';
    document.getElementById('raidImportPreview').style.display = 'none';
    document.getElementById('raidImportModal').style.display = 'flex';
    document.getElementById('raidImportCode').focus();
    
    // Add input listener for preview
    document.getElementById('raidImportCode').oninput = previewRaidImport;
}

function hideRaidImportModal() {
    document.getElementById('raidImportModal').style.display = 'none';
}

function previewRaidImport() {
    const code = document.getElementById('raidImportCode').value.trim();
    const preview = document.getElementById('raidImportPreview');
    
    if (!code) {
        preview.style.display = 'none';
        return;
    }
    
    try {
        const json = decodeURIComponent(escape(atob(code)));
        const raidPlan = JSON.parse(json);
        
        if (!raidPlan.q || !Array.isArray(raidPlan.q)) {
            throw new Error('Invalid raid plan format');
        }
        
        const mapNames = {
            customs: 'Customs', factory: 'Factory', groundzero: 'Ground Zero',
            interchange: 'Interchange', labs: 'The Lab', lighthouse: 'Lighthouse',
            reserve: 'Reserve', shoreline: 'Shoreline', streets: 'Streets of Tarkov', woods: 'Woods'
        };
        
        preview.innerHTML = `
            <div style="color: var(--eft-green); margin-bottom: 5px;">✓ Valid raid plan</div>
            <div style="color: var(--eft-gold);">🗺️ ${mapNames[raidPlan.m] || raidPlan.m || 'Unknown'}</div>
            <div style="color: var(--text-beige);">${raidPlan.q.length} Tasks</div>
        `;
        preview.style.display = 'block';
        
    } catch (e) {
        preview.innerHTML = `<div style="color: var(--eft-red);">⚠ Invalid code</div>`;
        preview.style.display = 'block';
    }
}

async function importRaidPlan() {
    const code = document.getElementById('raidImportCode').value.trim();
    
    if (!code) {
        alert('Please paste a raid code first.');
        return;
    }
    
    try {
        const json = decodeURIComponent(escape(atob(code)));
        const raidPlan = JSON.parse(json);
        
        if (!raidPlan.q || !Array.isArray(raidPlan.q)) {
            throw new Error('Invalid raid plan format');
        }
        
        // Clear current selection
        localStorage.setItem(STORAGE_KEY_QUESTS, JSON.stringify([]));
        
        // Select the imported quests
        const questIds = raidPlan.q.map(q => q.id);
        localStorage.setItem(STORAGE_KEY_QUESTS, JSON.stringify(questIds));
        
        // Set map if provided
        if (raidPlan.m) {
            const mapSelect = document.getElementById('mapSelect');
            if (mapSelect) {
                mapSelect.value = raidPlan.m;
            }
        }
        
        // Re-render quest list with new selection
        renderQuestList();
        updateSelectedQuestCount();
        
        // Close modal
        hideRaidImportModal();
        
        // Auto-plan the raid
        await planRaid();
        
        // Show success message
        const questNames = raidPlan.q.map(q => q.n).slice(0, 3).join(', ');
        const moreText = raidPlan.q.length > 3 ? ` +${raidPlan.q.length - 3} more` : '';
        alert(`Raid plan loaded!\n\nTasks: ${questNames}${moreText}`);
        
    } catch (e) {
        alert('Error importing raid plan: ' + e.message);
    }
}

// ============================================================================
// AMMO MANAGEMENT
// ============================================================================

function loadSavedAmmo() {
    const saved = localStorage.getItem(STORAGE_KEY_AMMO);
    ownedAmmo = saved ? new Set(JSON.parse(saved)) : new Set();
}

function saveOwnedAmmo() {
    localStorage.setItem(STORAGE_KEY_AMMO, JSON.stringify([...ownedAmmo]));
}

async function loadAmmoData() {
    const loading = document.getElementById('ammo-loading');
    const content = document.getElementById('ammo-content');
    const error = document.getElementById('ammo-error');
    const btn = document.getElementById('btn-load-ammo');
    
    content.classList.add('d-none');
    loading.classList.remove('d-none');
    error.classList.add('d-none');
    
    try {
        const response = await fetch(API_BASE + '/ammo');
        if (!response.ok) throw new Error('Server error: ' + response.status);
        
        allAmmoData = await response.json();
        
        const caliberSelect = document.getElementById('caliberFilter');
        caliberSelect.innerHTML = '<option value="ALL">All Calibers</option>';
        allAmmoData.calibers.forEach(cal => {
            caliberSelect.innerHTML += `<option value="${cal}">${cal}</option>`;
        });
        
        document.getElementById('ammo-count').textContent = allAmmoData.all.length + ' types';
        renderAmmoList();
        
        content.classList.remove('d-none');
        btn.textContent = '🔄 Refresh Data';
        btn.style.display = 'block';
        
    } catch (err) {
        error.innerHTML = `<strong>ERROR:</strong> ${err.message}`;
        error.classList.remove('d-none');
        btn.textContent = '🔄 Retry';
        btn.style.display = 'block';
    } finally {
        loading.classList.add('d-none');
        btn.disabled = false;
    }
}

function filterAmmoByCaliber() { renderAmmoList(); }
function filterAmmoBySearch() { renderAmmoList(); }

function updateTierThreshold() {
    const value = parseInt(document.getElementById('tierSlider').value);
    currentTierThreshold = TIER_NAMES[value];
    document.getElementById('tierDisplay').textContent = 'Keep ' + currentTierThreshold + '-Tier+';
    updateAmmoAnalysis();
}

function renderAmmoList() {
    if (!allAmmoData) return;
    
    const container = document.getElementById('ammo-list');
    const caliberFilter = document.getElementById('caliberFilter').value;
    const searchFilter = document.getElementById('ammoSearch').value.toLowerCase();
    
    let html = '';
    
    if (caliberFilter === 'ALL') {
        for (const [caliber, ammos] of Object.entries(allAmmoData.byCaliber)) {
            const filtered = ammos.filter(a => 
                a.name.toLowerCase().includes(searchFilter) || 
                a.shortName.toLowerCase().includes(searchFilter)
            );
            if (filtered.length > 0) {
                html += renderCaliberGroup(caliber, filtered);
            }
        }
    } else {
        const ammos = allAmmoData.byCaliber[caliberFilter] || [];
        const filtered = ammos.filter(a => 
            a.name.toLowerCase().includes(searchFilter) || 
            a.shortName.toLowerCase().includes(searchFilter)
        );
        html += renderCaliberGroup(caliberFilter, filtered);
    }
    
    container.innerHTML = html;
    updateAmmoAnalysis();
}

function renderCaliberGroup(caliber, ammos) {
    let html = `
        <div class="caliber-group">
            <div class="caliber-header">${caliber} <span class="text-sub small">(${ammos.length})</span></div>
    `;
    
    ammos.forEach(a => {
        const isOwned = ownedAmmo.has(a.id);
        const tierInfo = getAmmoTier(a);
        const displayTier = tierInfo.tier;
        const tierSource = tierInfo.source;
        const isOverridden = tierOverrides.ammo[a.id] !== undefined;
        const sourceClass = tierSource.includes('+') ? 'source-both' : 'source-pen';
        const isBulkSelected = bulkSelected.ammo.has(a.id);
        
        html += `
            <div class="ammo-card ${isOwned ? 'owned' : ''} ${isOverridden ? 'overridden' : ''} ${isBulkSelected ? 'bulk-selected' : ''}" 
                 data-id="${a.id}"
                 onclick="${bulkMode.ammo ? `toggleBulkItem('ammo', '${a.id}', event)` : `toggleAmmoOwned('${a.id}')`}">
                <input type="checkbox" class="item-checkbox" ${isBulkSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleBulkItem('ammo', '${a.id}', event)">
                <span class="tier-badge tier-${displayTier}">${displayTier}</span>
                ${a.iconLink ? `<img src="${a.iconLink}">` : ''}
                <div class="flex-grow-1">
                    <div class="fw-bold" style="color: var(--text-main);">${a.shortName}</div>
                    <div class="ammo-stats">
                        <span class="stat-dmg">DMG ${a.damage}</span>
                        <span class="stat-pen">PEN ${a.penetration}</span>
                        ${a.sellPrice > 0 ? `<span class="stat-price">${a.sellPrice.toLocaleString()} RUB</span>` : ''}
                    </div>
                </div>
                <span class="tier-source ${sourceClass}">${tierSource}</span>
                ${isOwned ? '<span class="badge-tarkov badge-active">OWNED</span>' : ''}
                <select class="tier-select-mini" onclick="event.stopPropagation()" onchange="setTierOverride('${a.id}', this.value)">
                    <option value="" ${!isOverridden ? 'selected' : ''}>Auto</option>
                    ${TIER_NAMES.map(t => `<option value="${t}" ${tierOverrides.ammo[a.id] === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>
        `;
    });
    
    return html + '</div>';
}

function getAmmoTier(ammo) {
    return getItemTier('ammo', ammo.id, {
        pen: ammo.penetration,
        dmg: ammo.damage,
        armorDmg: ammo.armorDamage || 0,
        fragChance: (ammo.fragmentationChance || 0) * 100,
        initialSpeed: ammo.initialSpeed || 0,
        projCount: ammo.projectileCount || 1,
        accMod: (ammo.accuracyModifier || 0) * 100,
        recoilMod: (ammo.recoilModifier || 0) * 100,
        lightBleed: (ammo.lightBleedModifier || 0) * 100,
        heavyBleed: (ammo.heavyBleedModifier || 0) * 100
    });
}

function setTierOverride(ammoId, tier) {
    setItemTierOverride('ammo', ammoId, tier);
    renderAmmoList();
}

// ============================================================================
// GENERIC TIER SYSTEM
// ============================================================================

function getItemTier(category, itemId, statValues, itemType = null) {
    // Check for manual override first
    if (tierOverrides[category][itemId]) {
        return { tier: tierOverrides[category][itemId], source: 'CUSTOM' };
    }
    
    const categoryStats = STAT_DEFINITIONS[category];
    const categoryThresholds = tierThresholds[category];
    
    // Use item-type-specific stats if itemType provided, otherwise global activeStats
    let statsToCheck;
    if (itemType && ITEM_TYPE_STATS[category]) {
        // Get the applicable stats for this item type
        const applicable = getApplicableStats(category, itemType);
        // Intersect with user's active stats selection
        statsToCheck = activeStats[category].filter(s => applicable.includes(s));
        // If no intersection, use the default active stats for this type
        if (statsToCheck.length === 0) {
            statsToCheck = getDefaultActiveStats(category, itemType);
        }
    } else {
        statsToCheck = activeStats[category];
    }
    
    // Check each tier level
    for (const tier of ['S', 'A', 'B', 'C', 'D']) {
        const metStats = [];
        
        for (const statKey of statsToCheck) {
            const statDef = categoryStats[statKey];
            const threshold = categoryThresholds[statKey]?.[tier];
            const value = statValues[statKey];
            
            if (threshold === undefined || value === undefined) continue;
            
            let met = false;
            if (statDef.direction === 'higher') {
                met = value >= threshold;
            } else {
                met = value <= threshold;
            }
            
            if (met) {
                metStats.push(statDef.label.split(' ')[0].toUpperCase().substring(0, 4));
            }
        }
        
        if (metStats.length > 0) {
            const source = metStats.length > 2 ? metStats.slice(0, 2).join('+') + '+' : metStats.join('+');
            return { tier, source };
        }
    }
    
    return { tier: 'F', source: '-' };
}

function setItemTierOverride(category, itemId, tier) {
    if (tier === '') {
        delete tierOverrides[category][itemId];
    } else {
        tierOverrides[category][itemId] = tier;
    }
    saveTierData();
}

function toggleStatActive(category, statKey) {
    const idx = activeStats[category].indexOf(statKey);
    if (idx >= 0) {
        activeStats[category].splice(idx, 1);
    } else {
        activeStats[category].push(statKey);
    }
    saveTierData();
    renderStatCheckboxes(category);
    renderCategoryList(category);
}

function updateThresholdValue(category, statKey, tier, value) {
    tierThresholds[category][statKey][tier] = parseFloat(value) || 0;
    saveTierData();
    renderCategoryList(category);
}

function renderStatCheckboxes(category) {
    const container = document.getElementById(`${category}StatCheckboxes`);
    const select = document.getElementById(`${category}StatSelect`);
    const stats = STAT_DEFINITIONS[category];
    
    // Get the current filter for this category to determine applicable stats
    let currentFilterType = null;
    if (category === 'gear') {
        const filterValue = document.getElementById('gearTypeFilter')?.value;
        if (filterValue && filterValue !== 'ALL') {
            // Map filter value to ITEM_TYPE_STATS key
            const filterMap = { 'armor': 'armor', 'helmet': 'helmet', 'rig': 'rig', 'backpack': 'backpack', 'headphones': 'headphones' };
            currentFilterType = filterMap[filterValue];
        }
    } else if (category === 'attachments') {
        const filterValue = document.getElementById('attachmentTypeFilter')?.value;
        if (filterValue && filterValue !== 'ALL') {
            currentFilterType = filterValue; // Already matches ITEM_TYPE_STATS keys
        }
    }
    
    // Get applicable stats for the current filter
    const applicableStats = currentFilterType ? getApplicableStats(category, currentFilterType) : null;
    
    // Checkboxes - grey out non-applicable stats
    container.innerHTML = Object.entries(stats).map(([key, def]) => {
        const isActive = activeStats[category].includes(key);
        const isApplicable = !applicableStats || applicableStats.includes(key);
        const disabledClass = !isApplicable ? 'disabled' : '';
        const disabledAttr = !isApplicable ? 'style="opacity: 0.4; pointer-events: none;"' : '';
        
        return `<div class="stat-checkbox ${isActive ? 'active' : ''} ${disabledClass}" 
            ${isApplicable ? `onclick="toggleStatActive('${category}', '${key}')"` : ''}
            ${disabledAttr}
            title="${!isApplicable ? 'Not applicable for selected type' : def.label}">
            <input type="checkbox" ${isActive ? 'checked' : ''} ${!isApplicable ? 'disabled' : ''}>
            ${def.label}
        </div>`;
    }).join('');
    
    // Dropdown - also filter to applicable stats
    select.innerHTML = Object.entries(stats).map(([key, def]) => {
        const isApplicable = !applicableStats || applicableStats.includes(key);
        return `<option value="${key}" ${!isApplicable ? 'disabled style="color: #666;"' : ''}>${def.label}${!isApplicable ? ' (N/A)' : ''}</option>`;
    }).join('');
    
    renderThresholdEditor(category);
}

function renderThresholdEditor(category) {
    const select = document.getElementById(`${category}StatSelect`);
    const grid = document.getElementById(`${category}ThresholdGrid`);
    const directionEl = document.getElementById(`${category}StatDirection`);
    
    const statKey = select.value;
    const statDef = STAT_DEFINITIONS[category][statKey];
    const thresholds = tierThresholds[category][statKey];
    
    if (!statDef || !thresholds) return;
    
    directionEl.textContent = statDef.direction === 'higher' ? '→ higher = better' : '↓ lower = better';
    directionEl.className = `threshold-direction ${statDef.direction}`;
    
    grid.innerHTML = ['S', 'A', 'B', 'C', 'D'].map(tier => `
        <div class="threshold-item">
            <span class="tier-badge tier-${tier}">${tier}</span>
            <input type="number" value="${thresholds[tier]}" step="any"
                onchange="updateThresholdValue('${category}', '${statKey}', '${tier}', this.value)">
        </div>
    `).join('');
}

function resetCategoryConfig(category) {
    tierThresholds[category] = buildDefaultThresholds(category);
    activeStats[category] = [...DEFAULT_ACTIVE_STATS[category]];
    saveTierData();
    renderStatCheckboxes(category);
    renderCategoryList(category);
}

function clearCategoryOverrides(category) {
    tierOverrides[category] = {};
    saveTierData();
    renderCategoryList(category);
}

function updateKeepThreshold(category) {
    const val = parseInt(document.getElementById(`${category}TierSlider`).value);
    keepTierThreshold[category] = TIER_ORDER[val];
    document.getElementById(`${category}TierDisplay`).textContent = `Keep ${keepTierThreshold[category]}-Tier+`;
    updateCategoryAnalysis(category);
}

function renderCategoryList(category) {
    switch(category) {
        case 'ammo': renderAmmoList(); break;
        case 'weapons': renderWeaponsList(); break;
        case 'gear': renderGearList(); break;
        case 'attachments': renderAttachmentsList(); break;
    }
}

function updateCategoryAnalysis(category) {
    switch(category) {
        case 'ammo': updateAmmoAnalysis(); break;
        case 'weapons': updateWeaponAnalysis(); break;
        case 'gear': updateGearAnalysis(); break;
        case 'attachments': updateAttachmentAnalysis(); break;
    }
}

// Save/Load tier data
function saveTierData() {
    localStorage.setItem(STORAGE_KEY_TIER_THRESHOLDS, JSON.stringify(tierThresholds));
    localStorage.setItem(STORAGE_KEY_TIER_OVERRIDES, JSON.stringify(tierOverrides));
    localStorage.setItem(STORAGE_KEY_ACTIVE_STATS, JSON.stringify(activeStats));
}

function loadTierData() {
    const savedThresholds = localStorage.getItem(STORAGE_KEY_TIER_THRESHOLDS);
    const savedOverrides = localStorage.getItem(STORAGE_KEY_TIER_OVERRIDES);
    const savedActive = localStorage.getItem(STORAGE_KEY_ACTIVE_STATS);
    
    if (savedThresholds) {
        const parsed = JSON.parse(savedThresholds);
        // Merge with defaults to handle new stats
        for (const cat of ['ammo', 'weapons', 'gear', 'attachments']) {
            if (parsed[cat]) {
                tierThresholds[cat] = { ...buildDefaultThresholds(cat), ...parsed[cat] };
            }
        }
    }
    if (savedOverrides) tierOverrides = JSON.parse(savedOverrides);
    if (savedActive) {
        const parsed = JSON.parse(savedActive);
        for (const cat of ['ammo', 'weapons', 'gear', 'attachments']) {
            if (parsed[cat]) activeStats[cat] = parsed[cat];
        }
    }
}

// ============================================================================
// EXPORT/IMPORT CONFIGURATION
// ============================================================================

function exportConfig() {
    // Show export modal with options
    const config = {
        version: '1.1-beta',
        exportDate: new Date().toISOString(),
        tierThresholds: tierThresholds,
        activeStats: activeStats,
        tierOverrides: tierOverrides,
        ownedItems: {
            ammo: [...ownedAmmo],
            weapons: [...ownedWeapons],
            gear: [...ownedGear],
            attachments: [...ownedAttachments]
        },
        collectedQuestItems: collectedQuestItems,
        completedQuests: [...getCompletedQuests()],
        hideoutProgress: hideoutProgress
    };
    
    const json = JSON.stringify(config);
    const base64 = btoa(unescape(encodeURIComponent(json)));
    
    // Store for modal use
    window._exportData = { json, base64, config };
    
    document.getElementById('exportModal').style.display = 'flex';
    document.getElementById('exportCode').value = base64;
}

function downloadExportFile() {
    if (!window._exportData) return;
    
    const json = JSON.stringify(window._exportData.config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `tarkov-planner-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    hideExportModal();
}

function copyExportCode() {
    const textarea = document.getElementById('exportCode');
    textarea.select();
    document.execCommand('copy');
    
    // Also try modern API
    navigator.clipboard.writeText(textarea.value).catch(() => {});
    
    // Visual feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied!';
    btn.style.background = 'var(--eft-green)';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 2000);
}

function showExportModal() {
    exportConfig();
}

function hideExportModal() {
    document.getElementById('exportModal').style.display = 'none';
    window._exportData = null;
}

function showImportModal() {
    document.getElementById('importModal').style.display = 'flex';
    document.getElementById('importTextarea').value = '';
}

function hideImportModal() {
    document.getElementById('importModal').style.display = 'none';
}

function importFromText() {
    const text = document.getElementById('importTextarea').value.trim();
    if (!text) {
        alert('Please paste configuration JSON first.');
        return;
    }
    applyImportedConfig(text);
}

function importFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        applyImportedConfig(e.target.result);
    };
    reader.readAsText(file);
}

function applyImportedConfig(input) {
    try {
        let jsonString = input;
        
        // Check if input is Base64 encoded (no whitespace, no braces at start)
        if (!input.startsWith('{') && !input.includes(' ') && !input.includes('\n')) {
            try {
                jsonString = decodeURIComponent(escape(atob(input)));
            } catch (e) {
                // Not valid Base64, treat as JSON
            }
        }
        
        const config = JSON.parse(jsonString);
        
        // Validate basic structure
        if (!config.tierThresholds && !config.activeStats && !config.tierOverrides && !config.ownedItems) {
            throw new Error('Invalid configuration format');
        }
        
        // Apply tier thresholds
        if (config.tierThresholds) {
            for (const cat of ['ammo', 'weapons', 'gear', 'attachments']) {
                if (config.tierThresholds[cat]) {
                    tierThresholds[cat] = { ...buildDefaultThresholds(cat), ...config.tierThresholds[cat] };
                }
            }
        }
        
        // Apply active stats
        if (config.activeStats) {
            for (const cat of ['ammo', 'weapons', 'gear', 'attachments']) {
                if (config.activeStats[cat]) {
                    activeStats[cat] = config.activeStats[cat];
                }
            }
        }
        
        // Apply tier overrides
        if (config.tierOverrides) {
            for (const cat of ['ammo', 'weapons', 'gear', 'attachments']) {
                if (config.tierOverrides[cat]) {
                    tierOverrides[cat] = config.tierOverrides[cat];
                }
            }
        }
        
        // Apply owned items
        if (config.ownedItems) {
            if (config.ownedItems.ammo) {
                ownedAmmo = new Set(config.ownedItems.ammo);
                saveOwnedAmmo();
            }
            if (config.ownedItems.weapons) {
                ownedWeapons = new Set(config.ownedItems.weapons);
                saveOwnedWeapons();
            }
            if (config.ownedItems.gear) {
                ownedGear = new Set(config.ownedItems.gear);
                saveOwnedGear();
            }
            if (config.ownedItems.attachments) {
                ownedAttachments = new Set(config.ownedItems.attachments);
                saveOwnedAttachments();
            }
        }
        
        // Apply collected quest items
        if (config.collectedQuestItems) {
            collectedQuestItems = config.collectedQuestItems;
            saveCollectedQuestItems();
        }
        
        // Apply completed quests
        if (config.completedQuests) {
            const completed = new Set(config.completedQuests);
            localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify([...completed]));
            // Re-render quest list if loaded
            if (allQuestsGlobal && allQuestsGlobal.length > 0) {
                renderQuestList();
            }
        }
        
        // Apply hideout progress
        if (config.hideoutProgress) {
            hideoutProgress = config.hideoutProgress;
            saveHideoutProgress();
            // Re-render hideout list if loaded
            if (hideoutDataLoaded) {
                renderHideoutList();
                updateHideoutStats();
            }
        }
        
        // Save and refresh UI
        saveTierData();
        initTierConfigUI();
        
        // Refresh lists if data is loaded
        if (allAmmoData) renderAmmoList();
        if (allWeaponsData) renderWeaponsList();
        if (allGearData) renderGearList();
        if (allAttachmentsData) renderAttachmentsList();
        
        hideImportModal();
        alert(`Configuration imported successfully!\nVersion: ${config.version || 'unknown'}\nExport date: ${config.exportDate || 'unknown'}`);
        
    } catch (e) {
        alert('Error importing configuration: ' + e.message);
    }
}

function initTierConfigUI() {
    for (const category of ['ammo', 'weapons', 'gear', 'attachments']) {
        renderStatCheckboxes(category);
    }
}

function toggleAmmoOwned(id) {
    ownedAmmo.has(id) ? ownedAmmo.delete(id) : ownedAmmo.add(id);
    saveOwnedAmmo();
    renderAmmoList();
    updateDashboard();
}

function updateAmmoAnalysis() {
    if (!allAmmoData) return;
    
    const keepList = document.getElementById('ammo-keep-list');
    const sellList = document.getElementById('ammo-sell-list');
    const keepCount = document.getElementById('ammo-keep-count');
    const sellCount = document.getElementById('ammo-sell-count');
    const totalValue = document.getElementById('ammo-total-sell-value');
    
    const tierIndex = TIER_ORDER.indexOf(keepTierThreshold.ammo);
    const keepTiers = TIER_ORDER.slice(0, tierIndex + 1);
    
    const owned = allAmmoData.all.filter(a => ownedAmmo.has(a.id));
    const keep = owned.filter(a => keepTiers.includes(getAmmoTier(a).tier));
    const sell = owned.filter(a => !keepTiers.includes(getAmmoTier(a).tier));
    
    keepCount.textContent = keep.length;
    sellCount.textContent = sell.length;
    
    keepList.innerHTML = keep.length > 0 
        ? keep.map(a => renderAnalysisItem(a, 'keep', 'ammo')).join('') 
        : '<div class="text-sub p-2 small">No ammo to keep marked.</div>';
    
    sellList.innerHTML = sell.length > 0 
        ? sell.map(a => renderAnalysisItem(a, 'sell', 'ammo')).join('') 
        : '<div class="text-sub p-2 small">No ammo to sell.</div>';
    
    totalValue.textContent = sell.reduce((sum, a) => sum + (a.sellPrice || 0), 0).toLocaleString() + ' RUB';
}

function renderAnalysisItem(item, type, category) {
    const tierInfo = category === 'ammo' ? getAmmoTier(item) : 
                     category === 'weapons' ? getWeaponTier(item) :
                     category === 'gear' ? getGearTier(item) : getAttachmentTier(item);
    const displayTier = tierInfo.tier;
    const subText = item.caliber || item.gearType || item.attachType || '';
    return `
        <div class="item-box ${type === 'keep' ? 'status-provided' : 'status-acquire'} w-100 mb-1">
            <span class="tier-badge tier-${displayTier}" style="width:24px;height:24px;line-height:24px;font-size:0.75rem;">${displayTier}</span>
            ${item.iconLink ? `<img src="${item.iconLink}" style="width:28px;height:28px;">` : ''}
            <div class="flex-grow-1">
                <div style="font-size:0.85rem;">${item.shortName}</div>
                <div style="font-size:0.7rem;color:var(--text-sub);">${subText}</div>
            </div>
            ${type === 'sell' && item.sellPrice > 0 ? `<span class="stat-price small">${item.sellPrice.toLocaleString()} RUB</span>` : ''}
        </div>
    `;
}

// ============================================================================
// WEAPONS MANAGER
// ============================================================================

async function loadWeaponsData() {
    const loading = document.getElementById('weapons-loading');
    const content = document.getElementById('weapons-content');
    const error = document.getElementById('weapons-error');
    const btn = document.getElementById('btn-load-weapons');
    
    loading.classList.remove('d-none');
    content.classList.add('d-none');
    error.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Loading...';
    
    try {
        const query = `{
            items(types: [gun]) {
                id
                name
                shortName
                iconLink
                avg24hPrice
                sellFor { price vendor { name } }
                types
                properties {
                    ... on ItemPropertiesWeapon {
                        caliber
                        fireRate
                        ergonomics
                        recoilVertical
                        recoilHorizontal
                        effectiveDistance
                        convergence
                        cameraRecoil
                        deviationCurve
                        deviationMax
                        repairCost
                        sightingRange
                    }
                }
            }
        }`;
        
        const response = await fetch('https://api.tarkov.dev/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        const data = await response.json();
        
        if (data.errors) throw new Error(data.errors[0].message);
        
        // Process weapons
        const weapons = data.data.items.map(w => {
            const props = w.properties || {};
            const bestSell = w.sellFor?.reduce((best, s) => s.price > best.price ? s : best, { price: 0 }) || { price: 0 };
            return {
                id: w.id,
                name: w.name,
                shortName: w.shortName,
                iconLink: w.iconLink,
                caliber: props.caliber || 'Unknown',
                fireRate: props.fireRate || 0,
                ergonomics: props.ergonomics || 0,
                recoilVertical: props.recoilVertical || 0,
                recoilHorizontal: props.recoilHorizontal || 0,
                totalRecoil: (props.recoilVertical || 0) + (props.recoilHorizontal || 0),
                effectiveDistance: props.effectiveDistance || 0,
                convergence: props.convergence || 0,
                cameraRecoil: props.cameraRecoil || 0,
                deviationCurve: props.deviationCurve || 0,
                deviationMax: props.deviationMax || 0,
                sightingRange: props.sightingRange || 0,
                sellPrice: bestSell.price,
                sellTo: bestSell.vendor?.name || 'Fence',
                types: w.types || []
            };
        }).filter(w => w.ergonomics > 0); // Filter out items without weapon stats
        
        // Group by caliber
        const byCaliber = {};
        weapons.forEach(w => {
            const cal = w.caliber || 'Other';
            if (!byCaliber[cal]) byCaliber[cal] = [];
            byCaliber[cal].push(w);
        });
        
        // Sort within each caliber by tier
        Object.values(byCaliber).forEach(arr => {
            arr.sort((a, b) => {
                const tierA = TIER_ORDER.indexOf(getWeaponTier(a).tier);
                const tierB = TIER_ORDER.indexOf(getWeaponTier(b).tier);
                return tierA - tierB;
            });
        });
        
        allWeaponsData = { all: weapons, byCaliber };
        
        // Populate type filter
        const typeFilter = document.getElementById('weaponTypeFilter');
        const calibers = Object.keys(byCaliber).sort();
        typeFilter.innerHTML = '<option value="ALL">All Calibers (' + weapons.length + ')</option>' +
            calibers.map(c => `<option value="${c}">${c} (${byCaliber[c].length})</option>`).join('');
        
        document.getElementById('weapon-count').textContent = weapons.length;
        
        loading.classList.add('d-none');
        content.classList.remove('d-none');
        btn.textContent = '🔄 Refresh Data';
        btn.style.display = 'block';
        btn.disabled = false;
        
        loadOwnedWeapons();
        renderWeaponsList();
        
    } catch (err) {
        loading.classList.add('d-none');
        error.classList.remove('d-none');
        error.textContent = 'Error loading weapons: ' + err.message;
        btn.textContent = '🔄 Retry';
        btn.style.display = 'block';
        btn.disabled = false;
    }
}

function renderWeaponsList() {
    if (!allWeaponsData) return;
    
    const container = document.getElementById('weapons-list');
    let html = '';
    
    const calibers = weaponTypeFilter === 'ALL' 
        ? Object.keys(allWeaponsData.byCaliber).sort()
        : [weaponTypeFilter];
    
    calibers.forEach(cal => {
        let weapons = allWeaponsData.byCaliber[cal] || [];
        
        // Apply search filter
        if (weaponSearchQuery) {
            const q = weaponSearchQuery.toLowerCase();
            weapons = weapons.filter(w => 
                w.name.toLowerCase().includes(q) || 
                w.shortName.toLowerCase().includes(q)
            );
        }
        
        if (weapons.length === 0) return;
        
        html += `<div class="caliber-group mb-3">
            <div class="caliber-header">${cal} (${weapons.length})</div>
            <div class="ammo-grid">`;
        
        weapons.forEach(w => {
            const isOwned = ownedWeapons.has(w.id);
            const tierInfo = getWeaponTier(w);
            const isOverridden = tierOverrides.weapons[w.id] !== undefined;
            const sourceClass = tierInfo.source.includes('+') ? 'source-both' : 'source-pen';
            const isBulkSelected = bulkSelected.weapons.has(w.id);
            
            html += `
                <div class="ammo-card weapon-card ${isOwned ? 'owned' : ''} ${isOverridden ? 'overridden' : ''} ${isBulkSelected ? 'bulk-selected' : ''}" 
                     data-id="${w.id}"
                     onclick="${bulkMode.weapons ? `toggleBulkItem('weapons', '${w.id}', event)` : `toggleWeaponOwned('${w.id}')`}">
                    <input type="checkbox" class="item-checkbox" ${isBulkSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleBulkItem('weapons', '${w.id}', event)">
                    <span class="tier-badge tier-${tierInfo.tier}">${tierInfo.tier}</span>
                    ${w.iconLink ? `<img src="${w.iconLink}">` : ''}
                    <div class="flex-grow-1">
                        <div class="fw-bold" style="color: var(--text-main);">${w.shortName}</div>
                        <div class="ammo-stats">
                            <span class="stat-pen">ERG ${w.ergonomics}</span>
                            <span class="stat-dmg">V.REC ${w.recoilVertical}</span>
                            ${w.sellPrice > 0 ? `<span class="stat-price">${w.sellPrice.toLocaleString()}</span>` : ''}
                        </div>
                    </div>
                    <span class="tier-source ${sourceClass}">${tierInfo.source}</span>
                    ${isOwned ? '<span class="badge-tarkov badge-active">OWNED</span>' : ''}
                    <select class="tier-select-mini" onclick="event.stopPropagation()" onchange="setWeaponTierOverride('${w.id}', this.value)">
                        <option value="" ${!isOverridden ? 'selected' : ''}>Auto</option>
                        ${TIER_NAMES.map(t => `<option value="${t}" ${tierOverrides.weapons[w.id] === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </div>
            `;
        });
        
        html += '</div></div>';
    });
    
    container.innerHTML = html || '<div class="text-sub p-3">No weapons match your filter.</div>';
    updateWeaponAnalysis();
}

function getWeaponTier(weapon) {
    return getItemTier('weapons', weapon.id, {
        ergo: weapon.ergonomics,
        recoilVert: weapon.recoilVertical,
        recoilHoriz: weapon.recoilHorizontal,
        fireRate: weapon.fireRate,
        effectiveDist: weapon.effectiveDistance,
        convergence: weapon.convergence || 0,
        cameraRecoil: weapon.cameraRecoil || 0,
        deviationCurve: weapon.deviationCurve || 0,
        deviationMax: weapon.deviationMax || 0,
        sightingRange: weapon.sightingRange || 0
    });
}

function filterWeapons() {
    weaponTypeFilter = document.getElementById('weaponTypeFilter').value;
    weaponSearchQuery = document.getElementById('weaponSearch').value;
    renderWeaponsList();
}

function toggleWeaponOwned(id) {
    ownedWeapons.has(id) ? ownedWeapons.delete(id) : ownedWeapons.add(id);
    saveOwnedWeapons();
    renderWeaponsList();
    updateDashboard();
}

function setWeaponTierOverride(id, tier) {
    setItemTierOverride('weapons', id, tier);
    renderWeaponsList();
}

function updateWeaponAnalysis() {
    if (!allWeaponsData) return;
    
    const tierIndex = TIER_ORDER.indexOf(keepTierThreshold.weapons);
    const keepTiers = TIER_ORDER.slice(0, tierIndex + 1);
    
    const owned = allWeaponsData.all.filter(w => ownedWeapons.has(w.id));
    const keep = owned.filter(w => keepTiers.includes(getWeaponTier(w).tier));
    const sell = owned.filter(w => !keepTiers.includes(getWeaponTier(w).tier));
    
    document.getElementById('weapons-keep-count').textContent = keep.length;
    document.getElementById('weapons-sell-count').textContent = sell.length;
    
    document.getElementById('weapons-keep-list').innerHTML = keep.length > 0
        ? keep.map(w => renderAnalysisItem(w, 'keep', 'weapons')).join('')
        : '<div class="text-sub p-2 small">No weapons to keep marked.</div>';
    
    document.getElementById('weapons-sell-list').innerHTML = sell.length > 0
        ? sell.map(w => renderAnalysisItem(w, 'sell', 'weapons')).join('')
        : '<div class="text-sub p-2 small">No weapons to sell.</div>';
    
    document.getElementById('weapons-total-sell-value').textContent = 
        sell.reduce((sum, w) => sum + (w.sellPrice || 0), 0).toLocaleString() + ' RUB';
}

function saveOwnedWeapons() { localStorage.setItem(STORAGE_KEY_WEAPONS, JSON.stringify([...ownedWeapons])); }
function loadOwnedWeapons() { const s = localStorage.getItem(STORAGE_KEY_WEAPONS); if (s) ownedWeapons = new Set(JSON.parse(s)); }

// ============================================================================
// GEAR MANAGER
// ============================================================================

async function loadGearData() {
    const loading = document.getElementById('gear-loading');
    const content = document.getElementById('gear-content');
    const error = document.getElementById('gear-error');
    const btn = document.getElementById('btn-load-gear');
    
    loading.classList.remove('d-none');
    content.classList.add('d-none');
    error.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Loading...';
    
    try {
        const query = `{
            items(types: [armor, helmet, rig, backpack, headphones]) {
                id
                name
                shortName
                iconLink
                avg24hPrice
                sellFor { price vendor { name } }
                types
                properties {
                    ... on ItemPropertiesArmor {
                        class
                        durability
                        material { name }
                        ergoPenalty
                        speedPenalty
                        turnPenalty
                    }
                    ... on ItemPropertiesHelmet {
                        class
                        durability
                        material { name }
                        ergoPenalty
                        speedPenalty
                        turnPenalty
                        ricochetY
                    }
                    ... on ItemPropertiesChestRig {
                        class
                        durability
                        material { name }
                        capacity
                    }
                    ... on ItemPropertiesBackpack {
                        capacity
                        speedPenalty
                    }
                    ... on ItemPropertiesHeadphone {
                        ambientVolume
                        distortion
                    }
                }
            }
        }`;
        
        const response = await fetch('https://api.tarkov.dev/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        const data = await response.json();
        if (data.errors) throw new Error(data.errors[0].message);
        
        const gear = data.data.items.map(g => {
            const props = g.properties || {};
            const bestSell = g.sellFor?.reduce((best, s) => s.price > best.price ? s : best, { price: 0 }) || { price: 0 };
            
            // Determine gear type
            let gearType = 'other';
            if (g.types?.includes('armor')) gearType = 'armor';
            else if (g.types?.includes('helmet')) gearType = 'helmet';
            else if (g.types?.includes('backpack')) gearType = 'backpack';
            else if (g.types?.includes('rig')) gearType = 'rig';
            else if (g.types?.includes('headphones')) gearType = 'headphones';
            
            return {
                id: g.id,
                name: g.name,
                shortName: g.shortName,
                iconLink: g.iconLink,
                gearType,
                armorClass: props.class || 0,
                durability: props.durability || 0,
                material: props.material?.name || '',
                capacity: props.capacity || 0,
                ergoPenalty: props.ergoPenalty || 0,
                speedPenalty: props.speedPenalty || 0,
                turnPenalty: props.turnPenalty || 0,
                ricochetY: props.ricochetY || 0,
                ambientVolume: props.ambientVolume || 0,
                distortion: props.distortion || 0,
                sellPrice: bestSell.price,
                sellTo: bestSell.vendor?.name || 'Fence'
            };
        });
        
        // Group by type
        const byType = {};
        gear.forEach(g => {
            if (!byType[g.gearType]) byType[g.gearType] = [];
            byType[g.gearType].push(g);
        });
        
        // Sort by tier
        Object.values(byType).forEach(arr => {
            arr.sort((a, b) => TIER_ORDER.indexOf(getGearTier(a).tier) - TIER_ORDER.indexOf(getGearTier(b).tier));
        });
        
        allGearData = { all: gear, byType };
        document.getElementById('gear-count').textContent = gear.length;
        
        loading.classList.add('d-none');
        content.classList.remove('d-none');
        btn.textContent = '🔄 Refresh Data';
        btn.style.display = 'block';
        btn.disabled = false;
        
        loadOwnedGear();
        renderGearList();
        
    } catch (err) {
        loading.classList.add('d-none');
        error.classList.remove('d-none');
        error.textContent = 'Error loading gear: ' + err.message;
        btn.textContent = '🔄 Retry';
        btn.style.display = 'block';
        btn.disabled = false;
    }
}

function renderGearList() {
    if (!allGearData) return;
    
    const container = document.getElementById('gear-list');
    let html = '';
    
    const typeLabels = { armor: 'Body Armor', helmet: 'Helmets', rig: 'Tactical Rigs', backpack: 'Backpacks', headphones: 'Headsets' };
    const types = gearTypeFilter === 'ALL' ? Object.keys(allGearData.byType) : [gearTypeFilter];
    
    types.forEach(type => {
        let items = allGearData.byType[type] || [];
        
        if (gearSearchQuery) {
            const q = gearSearchQuery.toLowerCase();
            items = items.filter(g => g.name.toLowerCase().includes(q) || g.shortName.toLowerCase().includes(q));
        }
        
        if (items.length === 0) return;
        
        html += `<div class="caliber-group mb-3">
            <div class="caliber-header">${typeLabels[type] || type} (${items.length})</div>
            <div class="ammo-grid">`;
        
        items.forEach(g => {
            const isOwned = ownedGear.has(g.id);
            const tierInfo = getGearTier(g);
            const isOverridden = tierOverrides.gear[g.id] !== undefined;
            const sourceClass = tierInfo.source.includes('+') ? 'source-both' : 'source-pen';
            const isBulkSelected = bulkSelected.gear.has(g.id);
            
            // Show relevant stats based on type
            let statsHtml = '';
            if (g.armorClass > 0) {
                statsHtml += `<span class="stat-pen">CL ${g.armorClass}</span>`;
                statsHtml += `<span class="stat-dmg">DUR ${g.durability}</span>`;
            } else if (g.gearType === 'backpack') {
                statsHtml += `<span class="stat-pen">CAP ${g.capacity}</span>`;
            } else if (g.gearType === 'headphones') {
                statsHtml += `<span class="stat-pen">VOL ${g.ambientVolume}</span>`;
            }
            if (g.sellPrice > 0) statsHtml += `<span class="stat-price">${g.sellPrice.toLocaleString()}</span>`;
            
            html += `
                <div class="ammo-card gear-card ${isOwned ? 'owned' : ''} ${isOverridden ? 'overridden' : ''} ${isBulkSelected ? 'bulk-selected' : ''}" 
                     data-id="${g.id}"
                     onclick="${bulkMode.gear ? `toggleBulkItem('gear', '${g.id}', event)` : `toggleGearOwned('${g.id}')`}">
                    <input type="checkbox" class="item-checkbox" ${isBulkSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleBulkItem('gear', '${g.id}', event)">
                    <span class="tier-badge tier-${tierInfo.tier}">${tierInfo.tier}</span>
                    ${g.iconLink ? `<img src="${g.iconLink}">` : ''}
                    <div class="flex-grow-1">
                        <div class="fw-bold" style="color: var(--text-main);">${g.shortName}</div>
                        <div class="ammo-stats">${statsHtml}</div>
                    </div>
                    <span class="tier-source ${sourceClass}">${tierInfo.source}</span>
                    ${isOwned ? '<span class="badge-tarkov badge-active">OWNED</span>' : ''}
                    <select class="tier-select-mini" onclick="event.stopPropagation()" onchange="setGearTierOverride('${g.id}', this.value)">
                        <option value="" ${!isOverridden ? 'selected' : ''}>Auto</option>
                        ${TIER_NAMES.map(t => `<option value="${t}" ${tierOverrides.gear[g.id] === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </div>
            `;
        });
        
        html += '</div></div>';
    });
    
    container.innerHTML = html || '<div class="text-sub p-3">No gear matches your filter.</div>';
    updateGearAnalysis();
}

function getGearTier(gear) {
    // For armored rigs, use special type
    let effectiveType = gear.gearType;
    if (gear.gearType === 'rig' && gear.armorClass > 0) {
        effectiveType = 'armored_rig';
    }
    
    return getItemTier('gear', gear.id, {
        armorClass: gear.armorClass,
        durability: gear.durability,
        ergoPenalty: gear.ergoPenalty,
        speedPenalty: gear.speedPenalty,
        turnPenalty: gear.turnPenalty || 0,
        ricochetY: gear.ricochetY || 0,
        capacity: gear.capacity,
        ambientVol: gear.ambientVolume || 0,
        distortion: gear.distortion || 0
    }, effectiveType);
}

function filterGear() {
    gearTypeFilter = document.getElementById('gearTypeFilter').value;
    gearSearchQuery = document.getElementById('gearSearch').value;
    renderGearList();
    // Update stat checkboxes to reflect applicable stats for filtered type
    renderStatCheckboxes('gear');
}

function toggleGearOwned(id) {
    ownedGear.has(id) ? ownedGear.delete(id) : ownedGear.add(id);
    saveOwnedGear();
    renderGearList();
    updateDashboard();
}

function setGearTierOverride(id, tier) {
    setItemTierOverride('gear', id, tier);
    renderGearList();
}

function updateGearAnalysis() {
    if (!allGearData) return;
    
    const tierIndex = TIER_ORDER.indexOf(keepTierThreshold.gear);
    const keepTiers = TIER_ORDER.slice(0, tierIndex + 1);
    
    const owned = allGearData.all.filter(g => ownedGear.has(g.id));
    const keep = owned.filter(g => keepTiers.includes(getGearTier(g).tier));
    const sell = owned.filter(g => !keepTiers.includes(getGearTier(g).tier));
    
    document.getElementById('gear-keep-count').textContent = keep.length;
    document.getElementById('gear-sell-count').textContent = sell.length;
    
    document.getElementById('gear-keep-list').innerHTML = keep.length > 0
        ? keep.map(g => renderAnalysisItem(g, 'keep', 'gear')).join('')
        : '<div class="text-sub p-2 small">No gear to keep marked.</div>';
    
    document.getElementById('gear-sell-list').innerHTML = sell.length > 0
        ? sell.map(g => renderAnalysisItem(g, 'sell', 'gear')).join('')
        : '<div class="text-sub p-2 small">No gear to sell.</div>';
    
    document.getElementById('gear-total-sell-value').textContent =
        sell.reduce((sum, g) => sum + (g.sellPrice || 0), 0).toLocaleString() + ' RUB';
}

function saveOwnedGear() { localStorage.setItem(STORAGE_KEY_GEAR, JSON.stringify([...ownedGear])); }
function loadOwnedGear() { const s = localStorage.getItem(STORAGE_KEY_GEAR); if (s) ownedGear = new Set(JSON.parse(s)); }

// ============================================================================
// ATTACHMENTS MANAGER
// ============================================================================

async function loadAttachmentsData() {
    const loading = document.getElementById('attachments-loading');
    const content = document.getElementById('attachments-content');
    const error = document.getElementById('attachments-error');
    const btn = document.getElementById('btn-load-attachments');
    
    loading.classList.remove('d-none');
    content.classList.add('d-none');
    error.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Loading...';
    
    try {
        const query = `{
            items(types: [mods]) {
                id
                name
                shortName
                iconLink
                avg24hPrice
                sellFor { price vendor { name } }
                types
                categories {
                    name
                    normalizedName
                }
                properties {
                    ... on ItemPropertiesMagazine {
                        capacity
                        ergonomics
                        recoilModifier
                    }
                    ... on ItemPropertiesBarrel {
                        ergonomics
                        recoilModifier
                        accuracyModifier
                    }
                    ... on ItemPropertiesScope {
                        ergonomics
                        recoilModifier
                        zoomLevels
                        sightingRange
                    }
                    ... on ItemPropertiesWeaponMod {
                        ergonomics
                        recoilModifier
                        accuracyModifier
                    }
                }
            }
        }`;
        
        const response = await fetch('https://api.tarkov.dev/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        const data = await response.json();
        if (data.errors) throw new Error(data.errors[0].message);
        
        // Debug: Log first few items to see category structure
        console.log('Sample attachment categories:', data.data.items.slice(0, 5).map(i => ({
            name: i.name,
            types: i.types,
            categories: i.categories?.map(c => c.normalizedName)
        })));
        
        const attachments = data.data.items.map(a => {
            const props = a.properties || {};
            const bestSell = a.sellFor?.reduce((best, s) => s.price > best.price ? s : best, { price: 0 }) || { price: 0 };
            
            // Use categories (more detailed) to determine attachment type
            const categoryNames = a.categories?.map(c => c.normalizedName?.toLowerCase()) || [];
            const categoryLabels = a.categories?.map(c => c.name) || [];
            
            // Category mapping - order matters (more specific first)
            const categoryMap = {
                'compact-reflex-sights': 'Reflex Sights',
                'reflex-sights': 'Reflex Sights',
                'iron-sights': 'Iron Sights',
                'assault-scopes': 'Assault Scopes',
                'optic-scopes': 'Scopes',
                'special-scopes': 'Scopes',
                'scopes': 'Scopes',
                'night-vision-and-thermal-scopes': 'Thermal/NV',
                'thermal-vision': 'Thermal/NV',
                'night-vision': 'Thermal/NV',
                'stocks': 'Stocks',
                'pistol-grips': 'Pistol Grips',
                'foregrips': 'Foregrips',
                'muzzle-adapters': 'Muzzle Devices',
                'muzzle-devices': 'Muzzle Devices',
                'flash-hiders-and-muzzle-brakes': 'Muzzle Devices',
                'suppressors': 'Suppressors',
                'silencers': 'Suppressors',
                'barrels': 'Barrels',
                'handguards': 'Handguards',
                'magazines': 'Magazines',
                'mounts': 'Mounts',
                'auxiliary-parts': 'Auxiliary Parts',
                'bipods': 'Bipods',
                'flashlights': 'Flashlights',
                'tactical-combo-devices': 'Tactical Devices',
                'laser-target-pointers': 'Lasers',
                'charging-handles': 'Charging Handles',
                'receivers-and-slides': 'Receivers',
                'gas-blocks': 'Gas Blocks',
                'rails': 'Rails',
                'light-laser-devices': 'Light/Laser'
            };
            
            let attachType = 'Other';
            
            // Check categories first (most reliable)
            for (const [catKey, label] of Object.entries(categoryMap)) {
                if (categoryNames.some(c => c && c.includes(catKey))) {
                    attachType = label;
                    break;
                }
            }
            
            // Fallback: use first category name if available
            if (attachType === 'Other' && categoryLabels.length > 0) {
                // Find the most specific (non-generic) category
                const specificCat = categoryLabels.find(c => 
                    c && !['Mods', 'Weapon mods', 'Gear mods', 'Functional mods', 'Master mods'].includes(c)
                );
                if (specificCat) {
                    attachType = specificCat;
                }
            }
            
            return {
                id: a.id,
                name: a.name,
                shortName: a.shortName,
                iconLink: a.iconLink,
                attachType,
                ergonomics: props.ergonomics || 0,
                recoilModifier: props.recoilModifier || 0,
                accuracyModifier: props.accuracyModifier || 0,
                capacity: props.capacity || 0,
                checkTimeModifier: props.checkTimeModifier || 0,
                loadModifier: props.loadModifier || 0,
                zoomLevels: props.zoomLevels || [],
                sightingRange: props.sightingRange || 0,
                centerOfImpact: props.centerOfImpact || 0,
                deviationCurve: props.deviationCurve || 0,
                deviationMax: props.deviationMax || 0,
                sellPrice: bestSell.price,
                sellTo: bestSell.vendor?.name || 'Fence'
            };
        });
        
        // Group by type
        const byType = {};
        attachments.forEach(a => {
            if (!byType[a.attachType]) byType[a.attachType] = [];
            byType[a.attachType].push(a);
        });
        
        // Log category distribution
        console.log('Attachment categories:', Object.entries(byType).map(([k, v]) => `${k}: ${v.length}`).join(', '));
        
        // Sort by tier
        Object.values(byType).forEach(arr => {
            arr.sort((a, b) => TIER_ORDER.indexOf(getAttachmentTier(a).tier) - TIER_ORDER.indexOf(getAttachmentTier(b).tier));
        });
        
        allAttachmentsData = { all: attachments, byType };
        
        // Populate type filter
        const typeFilter = document.getElementById('attachmentTypeFilter');
        const types = Object.keys(byType).sort();
        typeFilter.innerHTML = '<option value="ALL">All Types (' + attachments.length + ')</option>' +
            types.map(t => `<option value="${t}">${t} (${byType[t].length})</option>`).join('');
        
        document.getElementById('attachment-count').textContent = attachments.length;
        
        loading.classList.add('d-none');
        content.classList.remove('d-none');
        btn.textContent = '🔄 Refresh Data';
        btn.style.display = 'block';
        btn.disabled = false;
        
        loadOwnedAttachments();
        renderAttachmentsList();
        
    } catch (err) {
        loading.classList.add('d-none');
        error.classList.remove('d-none');
        error.textContent = 'Error loading attachments: ' + err.message;
        btn.textContent = '🔄 Retry';
        btn.style.display = 'block';
        btn.disabled = false;
    }
}

function renderAttachmentsList() {
    if (!allAttachmentsData) return;
    
    const container = document.getElementById('attachments-list');
    let html = '';
    
    const types = attachmentTypeFilter === 'ALL'
        ? Object.keys(allAttachmentsData.byType).sort()
        : [attachmentTypeFilter];
    
    types.forEach(type => {
        let items = allAttachmentsData.byType[type] || [];
        
        if (attachmentSearchQuery) {
            const q = attachmentSearchQuery.toLowerCase();
            items = items.filter(a => a.name.toLowerCase().includes(q) || a.shortName.toLowerCase().includes(q));
        }
        
        if (items.length === 0) return;
        
        html += `<div class="caliber-group mb-3">
            <div class="caliber-header">${type} (${items.length})</div>
            <div class="ammo-grid">`;
        
        items.forEach(a => {
            const isOwned = ownedAttachments.has(a.id);
            const tierInfo = getAttachmentTier(a);
            const isOverridden = tierOverrides.attachments[a.id] !== undefined;
            const sourceClass = tierInfo.source.includes('+') ? 'source-both' : 'source-pen';
            const isBulkSelected = bulkSelected.attachments.has(a.id);
            
            const ergoDisplay = a.ergonomics >= 0 ? `+${a.ergonomics}` : a.ergonomics;
            const recoilDisplay = a.recoilModifier >= 0 ? `+${a.recoilModifier}%` : `${a.recoilModifier}%`;
            
            html += `
                <div class="ammo-card attachment-card ${isOwned ? 'owned' : ''} ${isOverridden ? 'overridden' : ''} ${isBulkSelected ? 'bulk-selected' : ''}" 
                     data-id="${a.id}"
                     onclick="${bulkMode.attachments ? `toggleBulkItem('attachments', '${a.id}', event)` : `toggleAttachmentOwned('${a.id}')`}">
                    <input type="checkbox" class="item-checkbox" ${isBulkSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleBulkItem('attachments', '${a.id}', event)">
                    <span class="tier-badge tier-${tierInfo.tier}">${tierInfo.tier}</span>
                    ${a.iconLink ? `<img src="${a.iconLink}">` : ''}
                    <div class="flex-grow-1">
                        <div class="fw-bold" style="color: var(--text-main);">${a.shortName}</div>
                        <div class="ammo-stats">
                            <span class="stat-pen">ERG ${ergoDisplay}</span>
                            <span class="stat-dmg">REC ${recoilDisplay}</span>
                            ${a.sellPrice > 0 ? `<span class="stat-price">${a.sellPrice.toLocaleString()}</span>` : ''}
                        </div>
                    </div>
                    <span class="tier-source ${sourceClass}">${tierInfo.source}</span>
                    ${isOwned ? '<span class="badge-tarkov badge-active">OWNED</span>' : ''}
                    <select class="tier-select-mini" onclick="event.stopPropagation()" onchange="setAttachmentTierOverride('${a.id}', this.value)">
                        <option value="" ${!isOverridden ? 'selected' : ''}>Auto</option>
                        ${TIER_NAMES.map(t => `<option value="${t}" ${tierOverrides.attachments[a.id] === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </div>
            `;
        });
        
        html += '</div></div>';
    });
    
    container.innerHTML = html || '<div class="text-sub p-3">No attachments match your filter.</div>';
    updateAttachmentAnalysis();
}

function getAttachmentTier(attach) {
    return getItemTier('attachments', attach.id, {
        ergoMod: attach.ergonomics,
        recoilMod: attach.recoilModifier,
        accMod: attach.accuracyModifier || 0,
        magCapacity: attach.capacity || 0,
        sightingRange: attach.sightingRange || 0,
        zoomLevel: (attach.zoomLevels?.length > 0 ? Math.max(...attach.zoomLevels) : 1)
    }, attach.attachType);
}

function filterAttachments() {
    attachmentTypeFilter = document.getElementById('attachmentTypeFilter').value;
    attachmentSearchQuery = document.getElementById('attachmentSearch').value;
    renderAttachmentsList();
    // Update stat checkboxes to reflect applicable stats for filtered type
    renderStatCheckboxes('attachments');
}

function toggleAttachmentOwned(id) {
    ownedAttachments.has(id) ? ownedAttachments.delete(id) : ownedAttachments.add(id);
    saveOwnedAttachments();
    renderAttachmentsList();
    updateDashboard();
}

function setAttachmentTierOverride(id, tier) {
    setItemTierOverride('attachments', id, tier);
    renderAttachmentsList();
}

function updateAttachmentAnalysis() {
    if (!allAttachmentsData) return;
    
    const tierIndex = TIER_ORDER.indexOf(keepTierThreshold.attachments);
    const keepTiers = TIER_ORDER.slice(0, tierIndex + 1);
    
    const owned = allAttachmentsData.all.filter(a => ownedAttachments.has(a.id));
    const keep = owned.filter(a => keepTiers.includes(getAttachmentTier(a).tier));
    const sell = owned.filter(a => !keepTiers.includes(getAttachmentTier(a).tier));
    
    document.getElementById('attachments-keep-count').textContent = keep.length;
    document.getElementById('attachments-sell-count').textContent = sell.length;
    
    document.getElementById('attachments-keep-list').innerHTML = keep.length > 0
        ? keep.map(a => renderAnalysisItem(a, 'keep', 'attachments')).join('')
        : '<div class="text-sub p-2 small">No attachments to keep marked.</div>';
    
    document.getElementById('attachments-sell-list').innerHTML = sell.length > 0
        ? sell.map(a => renderAnalysisItem(a, 'sell', 'attachments')).join('')
        : '<div class="text-sub p-2 small">No attachments to sell.</div>';
    
    document.getElementById('attachments-total-sell-value').textContent =
        sell.reduce((sum, a) => sum + (a.sellPrice || 0), 0).toLocaleString() + ' RUB';
}

function saveOwnedAttachments() { localStorage.setItem(STORAGE_KEY_ATTACHMENTS, JSON.stringify([...ownedAttachments])); }
function loadOwnedAttachments() { const s = localStorage.getItem(STORAGE_KEY_ATTACHMENTS); if (s) ownedAttachments = new Set(JSON.parse(s)); }

// ============================================================================
// SHARED EQUIPMENT ANALYSIS RENDERER
// ============================================================================

function renderEquipmentAnalysisItem(item, type, tierInfo) {
    return `
        <div class="item-box ${type === 'keep' ? 'status-provided' : 'status-acquire'} w-100 mb-1">
            <span class="tier-badge tier-${tierInfo.tier}" style="width:24px;height:24px;line-height:24px;font-size:0.75rem;">${tierInfo.tier}</span>
            ${item.iconLink ? `<img src="${item.iconLink}" style="width:28px;height:28px;">` : ''}
            <div class="flex-grow-1">
                <div style="font-size:0.85rem;">${item.shortName}</div>
                <div style="font-size:0.7rem;color:var(--text-sub);">${item.caliber || item.gearType || item.attachType || ''}</div>
            </div>
            ${type === 'sell' && item.sellPrice > 0 ? `<span class="stat-price small">${item.sellPrice.toLocaleString()} RUB</span>` : ''}
        </div>
    `;
}

// ============================================================================
// PENETRATION MATRIX
// ============================================================================

function renderPenMatrix() {
    if (!allAmmoData) {
        document.getElementById('pen-loading').classList.remove('d-none');
        document.getElementById('pen-matrix-container').classList.add('d-none');
        return;
    }
    
    document.getElementById('pen-loading').classList.add('d-none');
    document.getElementById('pen-matrix-container').classList.remove('d-none');
    
    // Populate caliber filter if not done
    const caliberSelect = document.getElementById('penCaliberFilter');
    if (caliberSelect.options.length <= 1) {
        allAmmoData.calibers.forEach(cal => {
            caliberSelect.innerHTML += `<option value="${cal}">${cal}</option>`;
        });
    }
    
    const caliberFilter = document.getElementById('penCaliberFilter').value;
    const sortBy = document.getElementById('penSortBy').value;
    const showOnlyOwned = document.getElementById('penShowOwned').checked;
    
    // Filter ammo
    let ammoList = allAmmoData.all;
    if (caliberFilter !== 'ALL') {
        ammoList = ammoList.filter(a => a.caliber === caliberFilter);
    }
    if (showOnlyOwned) {
        ammoList = ammoList.filter(a => ownedAmmo.has(a.id));
    }
    
    // Sort
    ammoList = [...ammoList].sort((a, b) => {
        if (sortBy === 'pen') return b.penetration - a.penetration;
        if (sortBy === 'damage') return b.damage - a.damage;
        return a.name.localeCompare(b.name);
    });
    
    // Build matrix
    const armorClasses = [1, 2, 3, 4, 5, 6];
    
    let html = '<table class="pen-matrix"><thead><tr>';
    html += '<th class="ammo-name">Ammo</th>';
    html += '<th class="ammo-pen">PEN</th>';
    armorClasses.forEach(ac => {
        html += `<th>Class ${ac}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    // Group by caliber for better readability
    const byCaliber = {};
    ammoList.forEach(a => {
        if (!byCaliber[a.caliber]) byCaliber[a.caliber] = [];
        byCaliber[a.caliber].push(a);
    });
    
    for (const [caliber, ammos] of Object.entries(byCaliber)) {
        if (caliberFilter === 'ALL' && ammos.length > 0) {
            html += `<tr><td colspan="${armorClasses.length + 2}" class="caliber-header">${caliber}</td></tr>`;
        }
        
        ammos.forEach(a => {
            html += '<tr>';
            html += `<td class="ammo-name">${a.shortName}</td>`;
            html += `<td class="ammo-pen">${a.penetration}</td>`;
            
            armorClasses.forEach(ac => {
                const pen = a.penetration;
                // Simplified penetration effectiveness calculation
                // Based on armor class thresholds
                const classThreshold = ac * 10;
                let penClass, penText;
                
                if (pen >= classThreshold + 10) {
                    penClass = 'pen-high';
                    penText = '✓✓✓';
                } else if (pen >= classThreshold) {
                    penClass = 'pen-high';
                    penText = '✓✓';
                } else if (pen >= classThreshold - 10) {
                    penClass = 'pen-mid';
                    penText = '✓';
                } else if (pen >= classThreshold - 20) {
                    penClass = 'pen-low';
                    penText = '~';
                } else {
                    penClass = 'pen-none';
                    penText = '✗';
                }
                
                html += `<td class="pen-cell ${penClass}">${penText}</td>`;
            });
            
            html += '</tr>';
        });
    }
    
    html += '</tbody></table>';
    document.getElementById('pen-matrix-container').innerHTML = html;
}

// ============================================================================
// INVENTORY DASHBOARD
// ============================================================================

let dashboardCollapsed = false;

function toggleDashboard() {
    dashboardCollapsed = !dashboardCollapsed;
    document.getElementById('dashboardContent').classList.toggle('collapsed', dashboardCollapsed);
    document.getElementById('dashboardArrow').textContent = dashboardCollapsed ? 'â–¶' : '▼';
}

function updateDashboard() {
    const stats = {
        ammo: { owned: ownedAmmo.size, total: allAmmoData?.all?.length || 0, value: 0 },
        weapons: { owned: ownedWeapons.size, total: allWeaponsData?.all?.length || 0, value: 0 },
        gear: { owned: ownedGear.size, total: allGearData?.all?.length || 0, value: 0 },
        attachments: { owned: ownedAttachments.size, total: allAttachmentsData?.all?.length || 0, value: 0 }
    };
    
    // Calculate values
    if (allAmmoData) {
        allAmmoData.all.filter(a => ownedAmmo.has(a.id)).forEach(a => stats.ammo.value += a.sellPrice || 0);
    }
    if (allWeaponsData) {
        allWeaponsData.all.filter(w => ownedWeapons.has(w.id)).forEach(w => stats.weapons.value += w.sellPrice || 0);
    }
    if (allGearData) {
        allGearData.all.filter(g => ownedGear.has(g.id)).forEach(g => stats.gear.value += g.sellPrice || 0);
    }
    if (allAttachmentsData) {
        allAttachmentsData.all.filter(a => ownedAttachments.has(a.id)).forEach(a => stats.attachments.value += a.sellPrice || 0);
    }
    
    // Update UI
    for (const [cat, s] of Object.entries(stats)) {
        document.getElementById(`dash-${cat}-count`).textContent = `${s.owned}/${s.total}`;
        document.getElementById(`dash-${cat}-pct`).textContent = s.total > 0 ? `${Math.round(s.owned / s.total * 100)}%` : '-';
        document.getElementById(`dash-${cat}-value`).textContent = s.value.toLocaleString() + ' ₽';
    }
    
    // Totals
    const totalOwned = stats.ammo.owned + stats.weapons.owned + stats.gear.owned + stats.attachments.owned;
    const totalItems = stats.ammo.total + stats.weapons.total + stats.gear.total + stats.attachments.total;
    const totalValue = stats.ammo.value + stats.weapons.value + stats.gear.value + stats.attachments.value;
    
    document.getElementById('dash-total-count').textContent = totalOwned;
    document.getElementById('dash-total-pct').textContent = totalItems > 0 ? `${Math.round(totalOwned / totalItems * 100)}%` : '-';
    document.getElementById('dash-total-value').textContent = totalValue.toLocaleString() + ' ₽';
}


// ============================================================================
// MAP OVERLAY SYSTEM
// ============================================================================

// Overlay data cache per map
let mapOverlayData = {};
let allMapsCache = null;

// Overlay state
// Simplified extract markers system
let extractsEnabled = false;
let extractMarkers = [];

// Legacy overlay layers (kept for compatibility but deprecated)
let overlayLayers = {
    extracts_pmc: { enabled: false, markers: [] },
    extracts_scav: { enabled: false, markers: [] },
    hazards: { enabled: false, markers: [] },
    locks: { enabled: false, markers: [] }
};

// Currently active map in multi-map mode
let activeMapTab = null;
let multiMapMode = false;
let requiredMaps = [];

// Preload all extract data at startup
async function preloadAllExtractData() {
    console.log('Preloading all extract data...');
    
    const query = `{
        maps {
            name
            normalizedName
            extracts {
                name
                faction
                position { x y z }
                outline { x y z }
                top
                bottom
                switches {
                    name
                    position { x y z }
                }
            }
            hazards {
                name
                position { x y z }
                outline { x y z }
                top
                bottom
            }
            locks {
                lockType
                key {
                    name
                    shortName
                }
                needsPower
                position { x y z }
                outline { x y z }
                top
                bottom
            }
        }
    }`;
    
    try {
        const response = await fetch('https://api.tarkov.dev/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        const data = await response.json();
        
        if (data.errors) {
            console.error('GraphQL errors during preload:', data.errors);
            return;
        }
        
        allMapsCache = data?.data?.maps || [];
        console.log('Preloaded', allMapsCache.length, 'maps with extract data');
        
        // Pre-process all maps so they're ready instantly
        const mapKeys = ['customs', 'woods', 'shoreline', 'interchange', 'reserve', 'lighthouse', 'streets', 'groundzero', 'factory', 'labs'];
        for (const mapKey of mapKeys) {
            await loadMapOverlayData(mapKey);
        }
        
        console.log('All map overlay data pre-processed');
        
    } catch (err) {
        console.error('Error preloading extract data:', err);
    }
}

async function loadMapOverlayData(mapName) {
    // Check cache first
    if (mapOverlayData[mapName]) {
        console.log('Using cached overlay data for:', mapName);
        return mapOverlayData[mapName];
    }
    
    // Map key to API name mapping
    const apiMapNames = {
        customs: 'Customs',
        woods: 'Woods',
        shoreline: 'Shoreline',
        interchange: 'Interchange',
        reserve: 'Reserve',
        lighthouse: 'Lighthouse',
        streets: 'Streets of Tarkov',
        groundzero: 'Ground Zero',
        factory: 'Factory',
        labs: 'The Lab'
    };
    
    const apiMapName = apiMapNames[mapName] || mapName;
    console.log('Loading overlay data for:', mapName);
    
    try {
        // Use cached all-maps data or fetch new
        let allMaps;
        if (allMapsCache) {
            allMaps = allMapsCache;
        } else {
            const query = `{
                maps {
                    name
                    normalizedName
                    extracts {
                        name
                        faction
                        position { x y z }
                        outline { x y z }
                        top
                        bottom
                        switches {
                            name
                            position { x y z }
                        }
                    }
                    hazards {
                        name
                        position { x y z }
                        outline { x y z }
                        top
                        bottom
                    }
                    locks {
                        lockType
                        key {
                            name
                            shortName
                        }
                        needsPower
                        position { x y z }
                        outline { x y z }
                        top
                        bottom
                    }
                }
            }`;
            
            const response = await fetch('https://api.tarkov.dev/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            
            if (!response.ok) {
                console.error('API error:', response.status);
                return null;
            }
            
            const data = await response.json();
            if (data.errors) {
                console.error('GraphQL errors:', data.errors);
                return null;
            }
            
            allMaps = data?.data?.maps || [];
            if (allMaps.length > 0) {
                allMapsCache = allMaps;
                console.log('Loaded', allMaps.length, 'maps from API');
            }
        }
        
        // Find the correct map
        const mapData = allMaps.find(m => 
            m.normalizedName === mapName || 
            m.name.toLowerCase() === apiMapName.toLowerCase()
        );
        
        if (!mapData) {
            console.warn('Map not found:', mapName);
            return null;
        }
        
        // Process overlay data
        const processed = {
            extracts_pmc: [],
            extracts_scav: [],
            extracts_shared: [],  // Co-Op extracts
            hazards: [],
            locks: []
        };
        
        // Process extracts
        if (mapData.extracts) {
            mapData.extracts.forEach(extract => {
                const pos = extract.position || (extract.outline && extract.outline[0]);
                if (!pos) return;
                
                const extractInfo = {
                    name: extract.name,
                    faction: extract.faction,
                    x: pos.x,
                    y: pos.z,
                    switches: extract.switches || []
                };
                
                // Categorize by faction
                if (extract.faction === 'shared') {
                    // Co-Op extracts (requires both PMC and Scav)
                    processed.extracts_shared.push(extractInfo);
                } else if (extract.faction === 'pmc') {
                    processed.extracts_pmc.push(extractInfo);
                } else if (extract.faction === 'scav') {
                    processed.extracts_scav.push(extractInfo);
                } else if (extract.faction === 'all') {
                    // Available to both - add to PMC list (they're usually the same spots)
                    processed.extracts_pmc.push({...extractInfo, faction: 'pmc'});
                    processed.extracts_scav.push({...extractInfo, faction: 'scav'});
                }
            });
        }
        
        // Process hazards
        if (mapData.hazards) {
            mapData.hazards.forEach(hazard => {
                const pos = hazard.position || (hazard.outline && hazard.outline[0]);
                if (!pos) return;
                
                processed.hazards.push({
                    name: hazard.name,
                    x: pos.x,
                    y: pos.z
                });
            });
        }
        
        // Process locks
        if (mapData.locks) {
            mapData.locks.forEach(lock => {
                const pos = lock.position || (lock.outline && lock.outline[0]);
                if (!pos) return;
                
                processed.locks.push({
                    name: lock.key?.name || 'Unknown',
                    shortName: lock.key?.shortName || '',
                    lockType: lock.lockType,
                    needsPower: lock.needsPower,
                    x: pos.x,
                    y: pos.z
                });
            });
        }
        
        mapOverlayData[mapName] = processed;
        console.log('Overlay data for', mapName, '- PMC Exits:', processed.extracts_pmc.length, 
            'Scav Exits:', processed.extracts_scav.length,
            'Co-Op Exits:', processed.extracts_shared.length,
            'Hazards:', processed.hazards.length, 
            'Locks:', processed.locks.length);
            
        return processed;
        
    } catch (err) {
        console.error('Error loading overlay data:', err);
        return null;
    }
}

// New simplified toggle for all extracts
async function toggleExtracts() {
    const checkbox = document.getElementById('showExtractsToggle');
    const legend = document.getElementById('extractLegend');
    extractsEnabled = checkbox?.checked || false;
    
    // Show/hide legend
    if (legend) {
        legend.style.display = extractsEnabled ? 'inline-flex' : 'none';
    }
    
    console.log('toggleExtracts:', extractsEnabled);
    await renderExtractMarkers();
}

// New simplified render function for extracts only
// Extract correction system
let extractCorrectionsCache = null;
let extractCorrectionsCacheLoaded = false;
let pendingExtractCorrection = null;
let extractCorrectionMode = 'single'; // 'single' or 'all'

async function loadExtractCorrections(mapKey) {
    if (extractCorrectionsCacheLoaded && extractCorrectionsCache) {
        return extractCorrectionsCache;
    }
    
    if (!supabaseClient) {
        console.log('Supabase not available, skipping extract corrections load');
        return {};
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('extract_corrections')
            .select('*');
        
        if (error) throw error;
        
        // Build cache keyed by map_key|extract_name or map_key (for global offsets)
        extractCorrectionsCache = {};
        (data || []).forEach(row => {
            if (row.extract_name) {
                // Single extract correction
                const key = `${row.map_key}|${row.extract_name}`;
                extractCorrectionsCache[key] = row;
            } else {
                // Global map offset
                const key = `${row.map_key}|__GLOBAL__`;
                extractCorrectionsCache[key] = row;
            }
        });
        
        extractCorrectionsCacheLoaded = true;
        console.log('Loaded extract corrections:', Object.keys(extractCorrectionsCache).length);
        return extractCorrectionsCache;
    } catch (err) {
        console.error('Error loading extract corrections:', err);
        return {};
    }
}

function clearExtractCorrectionsCache() {
    extractCorrectionsCache = null;
    extractCorrectionsCacheLoaded = false;
}

async function renderExtractMarkers() {
    const currentMap = activeMapTab || document.getElementById('mapSelect')?.value || 'customs';
    console.log('renderExtractMarkers for map:', currentMap);
    
    // Clear existing extract markers
    extractMarkers.forEach(m => m.remove());
    extractMarkers = [];
    
    if (!extractsEnabled) {
        updateMarkerCount();
        return;
    }
    
    // Load overlay data for current map
    const overlays = await loadMapOverlayData(currentMap);
    if (!overlays) {
        console.warn('No overlay data for:', currentMap);
        updateMarkerCount();
        return;
    }
    
    if (!mapInstance) {
        console.warn('Map not ready');
        return;
    }
    
    // Load corrections from Supabase
    const corrections = await loadExtractCorrections(currentMap);
    const globalCorrection = corrections[`${currentMap}|__GLOBAL__`];
    const globalOffsetX = globalCorrection?.offset_x || 0;
    const globalOffsetY = globalCorrection?.offset_y || 0;
    
    // Combine all extracts with their faction info
    const allExtracts = [
        ...(overlays.extracts_pmc || []).map(e => ({ ...e, faction: 'pmc' })),
        ...(overlays.extracts_scav || []).map(e => ({ ...e, faction: 'scav' })),
        ...(overlays.extracts_shared || []).map(e => ({ ...e, faction: 'shared' }))
    ];
    
    console.log('Total extracts to render:', allExtracts.length, 'Global offset:', globalOffsetX, globalOffsetY);
    
    // Check if user is logged in (for potential drag functionality)
    const canEdit = !!currentUser;
    
    allExtracts.forEach((extract) => {
        const coords = convertGameCoordsToMap(extract.x, extract.y, currentMap);
        if (!coords) return;
        
        // Apply global offset
        let finalX = coords.x + globalOffsetX;
        let finalY = coords.y + globalOffsetY;
        
        // Check for individual correction
        const singleCorrection = corrections[`${currentMap}|${extract.name}`];
        if (singleCorrection) {
            finalX += singleCorrection.offset_x || 0;
            finalY += singleCorrection.offset_y || 0;
        }
        
        // Determine marker class based on faction and conditions
        let markerClass = 'overlay-marker';
        let typeClass = extract.faction;
        let typeName = extract.faction === 'pmc' ? 'PMC' : 
                       extract.faction === 'scav' ? 'Scav' : 'Co-Op';
        
        // Check for conditions that make this a "restricted" extract
        const hasSwitches = extract.switches?.length > 0;
        
        if (hasSwitches) {
            markerClass += ' extract-restricted';
            typeClass = 'restricted';
            typeName += ' (Restricted)';
        } else if (extract.faction === 'shared') {
            markerClass += ' extract-shared';
        } else if (extract.faction === 'pmc') {
            markerClass += ' extract-pmc';
        } else {
            markerClass += ' extract-scav';
        }
        
        // Add draggable class only if in edit mode
        if (isEditMode) {
            markerClass += ' extract-marker-draggable';
        }
        
        const icon = L.divIcon({
            html: '🚪',
            className: markerClass,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
        
        // Create marker - always with draggable:true so we can enable/disable later
        // But start with dragging disabled
        const marker = L.marker([finalY, finalX], { 
            icon,
            draggable: canEdit
        }).addTo(mapInstance);
        
        // Disable dragging by default - will be enabled via toggleEditMode
        if (marker.dragging && !isEditMode) {
            marker.dragging.disable();
        }
        
        // Store extract data on marker for correction dialog
        marker._extractData = {
            name: extract.name,
            faction: extract.faction,
            mapKey: currentMap,
            originalX: finalX,
            originalY: finalY,
            baseX: coords.x,  // Position before any corrections
            baseY: coords.y
        };
        
        // Handle drag end (event registered even if dragging disabled)
        if (canEdit) {
            marker.on('dragend', (e) => {
                showExtractCorrectionDialog(marker, e);
            });
        }
        
        // Get custom note for this extract
        const extractNoteKey = `extract|${currentMap}|${extract.name}`;
        const customNote = getMarkerNote('extract', `${currentMap}|${extract.name}`);
        
        // Build popup
        let popupHtml = `<div class="overlay-popup">
            <h6>🚪 ${extract.name}</h6>
            <span class="overlay-type ${typeClass}">${typeName}</span>`;
        
        if (hasSwitches) {
            popupHtml += `<div class="overlay-detail" style="margin-top: 6px;">⚡ Requires switch activation</div>`;
        }
        
        // Show custom note if exists
        if (customNote) {
            popupHtml += `<div class="overlay-detail" style="margin-top: 8px; padding: 6px 8px; background: rgba(158, 143, 107, 0.15); border-left: 2px solid var(--eft-gold);">📝 ${customNote}</div>`;
        }
        
        // Show edit button in edit mode
        if (isEditMode) {
            const escapedName = extract.name.replace(/'/g, "\\'");
            popupHtml += `<div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-dark);">
                <button onclick="showMarkerNoteDialog('extract', '${currentMap}|${escapedName}', '${escapedName}', 'Extract - ${currentMap}')" 
                        class="btn-tarkov" style="width: 100%; padding: 4px 8px; font-size: 0.75rem;">
                    📝 ${customNote ? 'Edit Note' : 'Add Note'}
                </button>
            </div>`;
        }
        
        popupHtml += '</div>';
        
        // Build tooltip - include note if exists
        let tooltipText = `${extract.name} (${typeName})`;
        if (customNote) {
            tooltipText += ` - 📝 ${customNote}`;
        }
        
        marker.bindPopup(popupHtml, { className: 'tarkov-popup', maxWidth: 300 });
        marker.bindTooltip(tooltipText, { direction: 'auto', className: 'tarkov-tooltip' });
        
        extractMarkers.push(marker);
    });
    
    updateMarkerCount();
}

function setExtractCorrectionMode(mode) {
    extractCorrectionMode = mode;
    document.getElementById('extractModeSingle').classList.toggle('active', mode === 'single');
    document.getElementById('extractModeAll').classList.toggle('active', mode === 'all');
    document.getElementById('extractMoveAllInfo').style.display = mode === 'all' ? 'block' : 'none';
}

function showExtractCorrectionDialog(marker, dragEvent) {
    const data = marker._extractData;
    if (!data) return;
    
    const newLatLng = marker.getLatLng();
    const deltaX = newLatLng.lng - data.originalX;
    const deltaY = newLatLng.lat - data.originalY;
    
    pendingExtractCorrection = {
        marker,
        extractName: data.name,
        mapKey: data.mapKey,
        deltaX: Math.round(deltaX),
        deltaY: Math.round(deltaY),
        baseX: data.baseX,
        baseY: data.baseY
    };
    
    document.getElementById('extractCorrectionName').textContent = data.name;
    document.getElementById('extractCorrectionMap').textContent = `Map: ${data.mapKey.charAt(0).toUpperCase() + data.mapKey.slice(1)}`;
    document.getElementById('extractCorrectionDelta').textContent = `(${deltaX >= 0 ? '+' : ''}${Math.round(deltaX)}, ${deltaY >= 0 ? '+' : ''}${Math.round(deltaY)})`;
    
    // Reset mode to single
    setExtractCorrectionMode('single');
    
    document.getElementById('extractCorrectionDialogOverlay').style.display = 'block';
}

function cancelExtractCorrection() {
    // Reset marker to original position
    if (pendingExtractCorrection?.marker) {
        const data = pendingExtractCorrection.marker._extractData;
        pendingExtractCorrection.marker.setLatLng([data.originalY, data.originalX]);
    }
    pendingExtractCorrection = null;
    document.getElementById('extractCorrectionDialogOverlay').style.display = 'none';
}

async function saveExtractCorrection() {
    if (!pendingExtractCorrection || !currentUser || !supabaseClient) {
        alert('Unable to save correction. Please ensure you are logged in.');
        return;
    }
    
    const btn = document.getElementById('saveExtractCorrectionBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
        // Use __GLOBAL__ for all-extracts mode (NULL doesn't work with ON CONFLICT)
        const extractName = extractCorrectionMode === 'all' 
            ? '__GLOBAL__' 
            : pendingExtractCorrection.extractName;
        
        const correctionData = {
            map_key: pendingExtractCorrection.mapKey,
            extract_name: extractName,
            offset_x: pendingExtractCorrection.deltaX,
            offset_y: pendingExtractCorrection.deltaY,
            corrected_by: currentUser.id
        };
        
        const { data, error } = await supabaseClient
            .from('extract_corrections')
            .upsert(correctionData, { 
                onConflict: 'map_key,extract_name'
            });
        
        if (error) throw error;
        
        console.log('Extract correction saved:', correctionData);
        
        // Clear cache and re-render
        clearExtractCorrectionsCache();
        await renderExtractMarkers();
        
        pendingExtractCorrection = null;
        document.getElementById('extractCorrectionDialogOverlay').style.display = 'none';
        
    } catch (error) {
        console.error('Error saving extract correction:', error);
        alert('Failed to save correction: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 Save Correction';
    }
}

// ============================================================================
// MARKER NOTES SYSTEM
// ============================================================================

let markerNotesCache = null;
let markerNotesCacheLoaded = false;
let pendingMarkerNote = null;

async function loadMarkerNotes() {
    if (markerNotesCacheLoaded && markerNotesCache) {
        return markerNotesCache;
    }
    
    if (!supabaseClient) {
        console.log('Supabase not available, skipping marker notes load');
        return {};
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('marker_notes')
            .select('*');
        
        if (error) throw error;
        
        // Build cache keyed by marker_type|marker_id
        markerNotesCache = {};
        (data || []).forEach(row => {
            const key = `${row.marker_type}|${row.marker_id}`;
            markerNotesCache[key] = row;
        });
        
        markerNotesCacheLoaded = true;
        console.log('Loaded marker notes:', Object.keys(markerNotesCache).length);
        return markerNotesCache;
    } catch (err) {
        console.error('Error loading marker notes:', err);
        return {};
    }
}

function clearMarkerNotesCache() {
    markerNotesCache = null;
    markerNotesCacheLoaded = false;
}

function getMarkerNote(markerType, markerId) {
    if (!markerNotesCache) return null;
    const key = `${markerType}|${markerId}`;
    return markerNotesCache[key]?.note_text || null;
}

function showMarkerNoteDialog(markerType, markerId, markerName, typeLabel) {
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    const existingNote = getMarkerNote(markerType, markerId);
    
    pendingMarkerNote = {
        markerType,
        markerId,
        markerName
    };
    
    document.getElementById('markerNoteName').textContent = markerName;
    document.getElementById('markerNoteType').textContent = typeLabel;
    document.getElementById('markerNoteText').value = existingNote || '';
    document.getElementById('deleteMarkerNoteBtn').style.display = existingNote ? 'block' : 'none';
    
    document.getElementById('markerNotesDialogOverlay').style.display = 'block';
    document.getElementById('markerNoteText').focus();
}

function cancelMarkerNote() {
    pendingMarkerNote = null;
    document.getElementById('markerNotesDialogOverlay').style.display = 'none';
}

async function saveMarkerNote() {
    if (!pendingMarkerNote || !currentUser || !supabaseClient) {
        alert('Unable to save note. Please ensure you are logged in.');
        return;
    }
    
    const noteText = document.getElementById('markerNoteText').value.trim();
    
    const btn = document.getElementById('saveMarkerNoteBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
        if (noteText) {
            // Save or update note
            const noteData = {
                marker_type: pendingMarkerNote.markerType,
                marker_id: pendingMarkerNote.markerId,
                note_text: noteText,
                created_by: currentUser.id
            };
            
            const { data, error } = await supabaseClient
                .from('marker_notes')
                .upsert(noteData, { 
                    onConflict: 'marker_type,marker_id'
                });
            
            if (error) throw error;
            console.log('Marker note saved:', noteData);
        } else {
            // Delete note if empty
            await deleteMarkerNoteInternal();
        }
        
        // Clear cache and re-render
        clearMarkerNotesCache();
        await loadMarkerNotes();
        
        // Re-render markers to show updated notes
        if (extractsEnabled) {
            await renderExtractMarkers();
        }
        // Re-render quest markers to show updated notes
        await refreshQuestMarkers();
        
        pendingMarkerNote = null;
        document.getElementById('markerNotesDialogOverlay').style.display = 'none';
        
    } catch (error) {
        console.error('Error saving marker note:', error);
        alert('Failed to save note: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 Save Note';
    }
}

async function deleteMarkerNote() {
    if (!pendingMarkerNote || !currentUser || !supabaseClient) {
        return;
    }
    
    if (!confirm('Delete this note?')) return;
    
    await deleteMarkerNoteInternal();
    
    clearMarkerNotesCache();
    await loadMarkerNotes();
    
    if (extractsEnabled) {
        await renderExtractMarkers();
    }
    // Re-render quest markers to show updated notes
    await refreshQuestMarkers();
    
    pendingMarkerNote = null;
    document.getElementById('markerNotesDialogOverlay').style.display = 'none';
}

async function deleteMarkerNoteInternal() {
    if (!pendingMarkerNote || !supabaseClient) return;
    
    try {
        const { error } = await supabaseClient
            .from('marker_notes')
            .delete()
            .eq('marker_type', pendingMarkerNote.markerType)
            .eq('marker_id', pendingMarkerNote.markerId);
        
        if (error) throw error;
        console.log('Marker note deleted');
    } catch (err) {
        console.error('Error deleting marker note:', err);
    }
}

// Legacy toggle function (deprecated, kept for compatibility)
async function toggleMapOverlay(overlayType) {
    const checkbox = document.getElementById('overlay-' + overlayType.replace('_', '-'));
    overlayLayers[overlayType].enabled = checkbox?.checked || false;
    
    console.log(`toggleMapOverlay: ${overlayType} = ${overlayLayers[overlayType].enabled}`);
    
    await renderOverlayMarkers();
}

async function renderOverlayMarkers() {
    const currentMap = activeMapTab || document.getElementById('mapSelect')?.value || 'customs';
    console.log('renderOverlayMarkers for map:', currentMap);
    
    // Clear existing overlay markers
    Object.values(overlayLayers).forEach(layer => {
        layer.markers.forEach(m => m.remove());
        layer.markers = [];
    });
    
    // Check if any overlays are enabled
    const anyEnabled = Object.values(overlayLayers).some(l => l.enabled);
    if (!anyEnabled) {
        console.log('No overlays enabled');
        updateMarkerCount();
        return;
    }
    
    // Load overlay data for current map
    const overlays = await loadMapOverlayData(currentMap);
    if (!overlays) {
        console.warn('No overlay data for:', currentMap);
        updateMarkerCount();
        return;
    }
    
    if (!mapInstance) {
        console.warn('Map not ready');
        return;
    }
    
    // Render each enabled overlay
    for (const [overlayType, layer] of Object.entries(overlayLayers)) {
        if (!layer.enabled) continue;
        
        const points = overlays[overlayType] || [];
        console.log(`${overlayType}: ${points.length} points`);
        
        points.forEach((point, idx) => {
            // Convert game coordinates to map coordinates
            const coords = convertGameCoordsToMap(point.x, point.y, currentMap);
            if (!coords) return;
            
            // Create marker icon based on type
            const icon = createOverlayIcon(overlayType, point);
            
            const marker = L.marker([coords.y, coords.x], { icon })
                .addTo(mapInstance);
            
            // Build popup content
            let popupHtml = '<div class="overlay-popup">';
            
            if (overlayType === 'extracts_pmc') {
                popupHtml += `<h6>🚪 ${point.name}</h6>`;
                popupHtml += `<span class="overlay-type pmc">PMC Exit</span>`;
                if (point.switches?.length > 0) {
                    popupHtml += `<div class="overlay-detail">⚡ Requires switch activation</div>`;
                }
            } else if (overlayType === 'extracts_scav') {
                popupHtml += `<h6>🚪 ${point.name}</h6>`;
                popupHtml += `<span class="overlay-type scav">Scav Exit</span>`;
            } else if (overlayType === 'hazards') {
                popupHtml += `<h6>⚠️ ${point.name}</h6>`;
                popupHtml += `<span class="overlay-type hazard">Hazard Zone</span>`;
            } else if (overlayType === 'locks') {
                popupHtml += `<h6>🔐 ${point.shortName || point.name}</h6>`;
                popupHtml += `<span class="overlay-type lock">${point.lockType || 'Locked'}</span>`;
                if (point.needsPower) {
                    popupHtml += `<div class="overlay-detail">⚡ Requires power</div>`;
                }
                popupHtml += `<div class="overlay-detail">Key: ${point.name}</div>`;
            }
            
            popupHtml += '</div>';
            
            marker.bindPopup(popupHtml, {
                className: 'tarkov-popup',
                maxWidth: 250
            });
            
            // Add tooltip
            marker.bindTooltip(point.name || overlayType, {
                direction: 'auto',
                className: 'tarkov-tooltip'
            });
            
            layer.markers.push(marker);
        });
    }
    
    updateMarkerCount();
}

function createOverlayIcon(type, point) {
    let html = '';
    let className = 'overlay-marker';
    
    switch(type) {
        case 'extracts_pmc':
            html = '🚪';
            className += ' extract-pmc';
            break;
        case 'extracts_scav':
            html = '🚪';
            className += ' extract-scav';
            break;
        case 'hazards':
            html = '⚠️';
            className += ' hazard';
            break;
        case 'locks':
            html = '🔐';
            className += ' lock';
            break;
    }
    
    return L.divIcon({
        html: html,
        className: className,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

function convertGameCoordsToMap(gameX, gameZ, mapKey) {
    // Convert game coordinates (in meters) to map pixel coordinates
    // flipX: true - mirrors left/right
    // flipZ: false - y = currentMapHeight - pixelY handles vertical flip for Leaflet
    // Note: Fine-tuning offsets are now loaded from Supabase extract_corrections table
    const mapBounds = {
        shoreline: { minX: -1100, maxX: 600, minZ: -200, maxZ: 700, flipX: true, flipZ: false },
        customs: { minX: -300, maxX: 500, minZ: -200, maxZ: 350, flipX: true, flipZ: false },
        woods: { minX: -600, maxX: 600, minZ: -800, maxZ: 400, flipX: true, flipZ: false },
        interchange: { minX: -200, maxX: 300, minZ: -300, maxZ: 200, flipX: true, flipZ: false },
        reserve: { minX: -350, maxX: 250, minZ: -350, maxZ: 250, flipX: true, flipZ: false },
        lighthouse: { minX: -300, maxX: 600, minZ: -500, maxZ: 200, flipX: true, flipZ: false },
        streets: { minX: -350, maxX: 450, minZ: -400, maxZ: 400, flipX: true, flipZ: false },
        groundzero: { minX: -200, maxX: 200, minZ: -200, maxZ: 200, flipX: true, flipZ: false },
        factory: { minX: -60, maxX: 60, minZ: -60, maxZ: 60, flipX: true, flipZ: false },
        labs: { minX: -200, maxX: 200, minZ: -200, maxZ: 200, flipX: true, flipZ: false }
    };
    
    const bounds = mapBounds[mapKey];
    if (!bounds) {
        console.warn('No bounds defined for map:', mapKey);
        return null;
    }
    
    // Normalize to 0-1 range
    let normalizedX = (gameX - bounds.minX) / (bounds.maxX - bounds.minX);
    let normalizedZ = (gameZ - bounds.minZ) / (bounds.maxZ - bounds.minZ);
    
    // Apply flips if needed
    if (bounds.flipX) normalizedX = 1 - normalizedX;
    if (bounds.flipZ) normalizedZ = 1 - normalizedZ;
    
    // Clamp to 0-1 range
    normalizedX = Math.max(0, Math.min(1, normalizedX));
    normalizedZ = Math.max(0, Math.min(1, normalizedZ));
    
    // Convert to pixel coordinates
    const pixelX = normalizedX * currentMapWidth;
    const pixelY = normalizedZ * currentMapHeight;
    
    // For Leaflet with CRS.Simple, Y increases downward from top
    return {
        x: pixelX,
        y: currentMapHeight - pixelY
    };
}

// ============================================================================
// MULTI-MAP TAB SYSTEM
// ============================================================================

function analyzeQuestMaps(selectedQuests) {
    const mapSet = new Set();
    const questsByMap = {};
    
    selectedQuests.forEach(quest => {
        // Check quest's main map - use mapNameToKey to normalize
        const questMapName = quest.map?.name;
        const questMapKey = questMapName ? mapNameToKey(questMapName) : null;
        
        // Check objectives for specific map requirements
        if (quest.objectives) {
            quest.objectives.forEach(obj => {
                if (obj.maps && obj.maps.length > 0) {
                    obj.maps.forEach(m => {
                        const mapKey = m.normalizedName || mapNameToKey(m.name);
                        if (mapKey && mapKey !== 'any') {
                            mapSet.add(mapKey);
                            if (!questsByMap[mapKey]) questsByMap[mapKey] = [];
                            if (!questsByMap[mapKey].includes(quest.name)) {
                                questsByMap[mapKey].push(quest.name);
                            }
                        }
                    });
                }
            });
        }
        
        // If quest has a specific map (not "any"), add it
        if (questMapKey && questMapKey !== 'any') {
            mapSet.add(questMapKey);
            if (!questsByMap[questMapKey]) questsByMap[questMapKey] = [];
            if (!questsByMap[questMapKey].includes(quest.name)) {
                questsByMap[questMapKey].push(quest.name);
            }
        }
    });
    
    console.log('Map analysis:', { maps: Array.from(mapSet), questsByMap });
    
    return {
        maps: Array.from(mapSet),
        questsByMap: questsByMap
    };
}

function setupMultiMapTabs(maps, questsByMap) {
    const tabsContainer = document.getElementById('multiMapTabs');
    const tabsInner = document.getElementById('mapTabsContainer');
    const mapSelect = document.getElementById('mapSelect');
    const mapHint = document.getElementById('mapHint');
    
    console.log('setupMultiMapTabs:', maps, questsByMap);
    
    if (maps.length <= 1) {
        // Single map mode - hide tabs, show dropdown
        tabsContainer.style.display = 'none';
        mapSelect.closest('.col-md-6')?.style.setProperty('display', '');
        if (mapHint) mapHint.style.display = 'block';
        multiMapMode = false;
        requiredMaps = [];
        return;
    }
    
    // Multi-map mode
    multiMapMode = true;
    requiredMaps = maps;
    tabsContainer.style.display = 'block';
    
    // Hide map dropdown and mapHint in multi-map mode
    mapSelect.closest('.col-md-6')?.style.setProperty('display', 'none');
    if (mapHint) mapHint.style.display = 'none';
    
    // Build tabs HTML
    const mapLabels = {
        customs: 'Customs',
        woods: 'Woods',
        shoreline: 'Shoreline',
        interchange: 'Interchange',
        reserve: 'Reserve',
        lighthouse: 'Lighthouse',
        streets: 'Streets',
        groundzero: 'Ground Zero',
        factory: 'Factory',
        labs: 'Labs'
    };
    
    let tabsHtml = '';
    maps.forEach((mapKey, idx) => {
        const questCount = questsByMap[mapKey]?.length || 0;
        const isActive = idx === 0;
        tabsHtml += `
            <div class="map-tab ${isActive ? 'active' : ''}" data-map="${mapKey}" onclick="switchMapTab('${mapKey}')">
                ${mapLabels[mapKey] || mapKey}
                <span class="tab-quest-count">${questCount}</span>
            </div>
        `;
        
        // Initialize per-map layer settings
        if (!perMapLayerSettings[mapKey]) {
            perMapLayerSettings[mapKey] = { scav: false, sniper: false, pmc: false, boss: false };
        }
    });
    
    tabsInner.innerHTML = tabsHtml;
    
    // Set first map as active
    activeMapTab = maps[0];
    
    // Show "Apply to All" button
    const applyAllBtn = document.querySelector('.btn-apply-all');
    if (applyAllBtn) applyAllBtn.style.display = 'none'; // Hidden until user changes settings
}

async function switchMapTab(mapKey) {
    // Update tab UI
    document.querySelectorAll('.map-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.map === mapKey);
    });
    
    activeMapTab = mapKey;
    
    // Restore overlay settings for this map
    if (perMapLayerSettings[mapKey]) {
        Object.entries(perMapLayerSettings[mapKey]).forEach(([overlay, enabled]) => {
            if (overlayLayers[overlay]) {
                overlayLayers[overlay].enabled = enabled;
                const checkbox = document.getElementById('overlay-' + overlay.replace('_', '-'));
                if (checkbox) checkbox.checked = enabled;
            }
        });
    }
    
    // Reload map with new content
    await initMap(mapKey, selectedQuestNamesForMarkers, selectedQuestsForMarkers);
    
    // Render extract markers (new system)
    await renderExtractMarkers();
    // Render legacy overlay markers for new map
    await renderOverlayMarkers();
}

function resetMultiMapMode() {
    multiMapMode = false;
    activeMapTab = null;
    requiredMaps = [];
    perMapLayerSettings = {};
    
    const tabsContainer = document.getElementById('multiMapTabs');
    if (tabsContainer) tabsContainer.style.display = 'none';
    
    const mapSelect = document.getElementById('mapSelect');
    mapSelect?.closest('.col-md-6')?.style.setProperty('display', '');
    
    // Show mapHint again in single-map mode
    const mapHint = document.getElementById('mapHint');
    if (mapHint) mapHint.style.display = 'block';
    
    // Hide "Apply to All" button
    const applyAllBtn = document.querySelector('.btn-apply-all');
    if (applyAllBtn) applyAllBtn.style.display = 'none';
    
    // Reset extract toggle (new system)
    extractsEnabled = false;
    const extractToggle = document.getElementById('showExtractsToggle');
    if (extractToggle) extractToggle.checked = false;
    const extractLegend = document.getElementById('extractLegend');
    if (extractLegend) extractLegend.style.display = 'none';
    
    // Reset legacy overlay toggles
    Object.keys(overlayLayers).forEach(overlay => {
        overlayLayers[overlay].enabled = false;
        const checkbox = document.getElementById('overlay-' + overlay.replace('_', '-'));
        if (checkbox) checkbox.checked = false;
    });
}

// ============================================================================
// QUEST ITEM TRACKER
// ============================================================================

// Storage for collected quest items: { "questId:itemId": collectedCount }
let collectedQuestItems = {};

function loadCollectedQuestItems() {
    const saved = localStorage.getItem(STORAGE_KEY_QUEST_ITEMS);
    collectedQuestItems = saved ? JSON.parse(saved) : {};
}

function saveCollectedQuestItems() {
    localStorage.setItem(STORAGE_KEY_QUEST_ITEMS, JSON.stringify(collectedQuestItems));
}

function getCollectedCount(questId, itemId) {
    const key = `${questId}:${itemId}`;
    return collectedQuestItems[key] || 0;
}

function setCollectedCount(questId, itemId, count, maxCount) {
    const key = `${questId}:${itemId}`;
    const clampedCount = Math.max(0, Math.min(count, maxCount));
    collectedQuestItems[key] = clampedCount;
    saveCollectedQuestItems();
    return clampedCount;
}

function toggleItemCollected(questId, itemId, maxCount) {
    const current = getCollectedCount(questId, itemId);
    const newCount = current >= maxCount ? 0 : maxCount;
    setCollectedCount(questId, itemId, newCount, maxCount);
    updateTrackerItem(questId, itemId, newCount, maxCount);
    updateTrackerProgress();
}

function updateCollectedInput(questId, itemId, value, maxCount) {
    const newCount = setCollectedCount(questId, itemId, parseInt(value) || 0, maxCount);
    updateTrackerItem(questId, itemId, newCount, maxCount);
    updateTrackerProgress();
}

function updateTrackerItem(questId, itemId, collected, maxCount) {
    const itemEl = document.querySelector(`[data-tracker-item="${questId}:${itemId}"]`);
    if (itemEl) {
        const isComplete = collected >= maxCount;
        itemEl.classList.toggle('collected', isComplete);
        
        const checkbox = itemEl.querySelector('.item-checkbox');
        if (checkbox) checkbox.checked = isComplete;
        
        const input = itemEl.querySelector('.collected-input input');
        if (input) input.value = collected;
    }
    
    // Update quest group header count
    updateQuestGroupProgress(questId);
}

function updateQuestGroupProgress(questId) {
    const groupEl = document.querySelector(`[data-quest-group="${questId}"]`);
    if (!groupEl) return;
    
    const items = groupEl.querySelectorAll('.tracker-item');
    let completed = 0;
    let total = items.length;
    
    items.forEach(item => {
        if (item.classList.contains('collected')) completed++;
    });
    
    const countEl = groupEl.querySelector('.quest-item-count');
    if (countEl) {
        countEl.textContent = `${completed}/${total}`;
        countEl.style.color = completed === total ? 'var(--eft-green)' : 'var(--text-sub)';
    }
}

function updateTrackerProgress() {
    const container = document.getElementById('quest-item-tracker');
    if (!container) return;
    
    const allItems = container.querySelectorAll('.tracker-item');
    let completed = 0;
    let total = allItems.length;
    
    allItems.forEach(item => {
        if (item.classList.contains('collected')) completed++;
    });
    
    document.getElementById('tracker-progress').textContent = `${completed}/${total}`;
    document.getElementById('tracker-progress-bar').style.width = total > 0 ? `${(completed / total) * 100}%` : '0%';
}

function toggleQuestItemsGroup(questId) {
    const groupEl = document.querySelector(`[data-quest-group="${questId}"]`);
    if (!groupEl) return;
    
    const listEl = groupEl.querySelector('.quest-items-list');
    if (listEl) {
        listEl.classList.toggle('collapsed');
    }
}

function renderQuestItemTracker(questItemsData) {
    const container = document.getElementById('quest-item-tracker');
    const section = document.getElementById('quest-item-tracker-section');
    
    // Load saved progress
    loadCollectedQuestItems();
    
    if (!questItemsData || questItemsData.length === 0) {
        // Hide entire section when no items needed
        if (section) section.style.display = 'none';
        return;
    }
    
    // Show section
    if (section) section.style.display = '';
    
    let html = '';
    let totalItems = 0;
    let totalCompleted = 0;
    
    questItemsData.forEach((quest, qIndex) => {
        const color = QUEST_COLORS[qIndex % QUEST_COLORS.length];
        
        // Calculate quest completion
        let questCompleted = 0;
        quest.items.forEach(item => {
            const collected = getCollectedCount(quest.questId, item.id);
            if (collected >= item.count) questCompleted++;
        });
        
        totalItems += quest.items.length;
        totalCompleted += questCompleted;
        
        html += `
            <div class="quest-items-group" data-quest-group="${quest.questId}">
                <div class="quest-items-header" onclick="toggleQuestItemsGroup('${quest.questId}')">
                    <div class="quest-color" style="background: ${color.fill}; border-color: ${color.border};"></div>
                    <span class="quest-name">${quest.questName}</span>
                    <span class="quest-item-count" style="color: ${questCompleted === quest.items.length ? 'var(--eft-green)' : 'var(--text-sub)'}">
                        ${questCompleted}/${quest.items.length}
                    </span>
                </div>
                <div class="quest-items-list">
        `;
        
        quest.items.forEach(item => {
            const collected = getCollectedCount(quest.questId, item.id);
            const isComplete = collected >= item.count;
            
            // Determine badge type
            let badgeHtml = '';
            if (item.isProvided) {
                badgeHtml = '<span class="given-badge">GIVEN</span>';
            } else if (item.foundInRaid) {
                badgeHtml = '<span class="fir-badge">FIR</span>';
            } else {
                badgeHtml = '<span class="handover-badge">HAND-OVER</span>';
            }
            
            html += `
                <div class="tracker-item ${isComplete ? 'collected' : ''}" data-tracker-item="${quest.questId}:${item.id}">
                    <input type="checkbox" class="item-checkbox" 
                        ${isComplete ? 'checked' : ''} 
                        ${item.isProvided ? 'disabled' : ''}
                        onchange="toggleItemCollected('${quest.questId}', '${item.id}', ${item.count})">
                    ${item.icon ? `<img src="${item.icon}" alt="${item.shortName}">` : ''}
                    <div class="item-info">
                        <div class="item-name">${item.shortName}</div>
                        <div class="item-meta">
                            ${badgeHtml}
                            <span class="item-count">${item.count}x needed</span>
                        </div>
                    </div>
                    ${!item.isProvided ? `
                        <div class="collected-input">
                            <input type="number" min="0" max="${item.count}" value="${collected}" 
                                onchange="updateCollectedInput('${quest.questId}', '${item.id}', this.value, ${item.count})"
                                onclick="event.stopPropagation()">
                            <span>/ ${item.count}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div></div>';
    });
    
    container.innerHTML = html;
    
    // Update global progress
    document.getElementById('tracker-progress').textContent = `${totalCompleted}/${totalItems}`;
    document.getElementById('tracker-progress-bar').style.width = totalItems > 0 ? `${(totalCompleted / totalItems) * 100}%` : '0%';
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

let shortcutsHelpVisible = false;

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        // Tab switching: 1-6
        if (e.key >= '1' && e.key <= '6' && !e.ctrlKey && !e.altKey) {
            const tabs = ['planner', 'penetration', 'ammo', 'weapons', 'gear', 'attachments'];
            const tabIndex = parseInt(e.key) - 1;
            if (tabIndex < tabs.length) {
                switchTab(tabs[tabIndex]);
                e.preventDefault();
            }
        }
        
        // Ctrl+E: Export
        if (e.key === 'e' && e.ctrlKey) {
            exportConfig();
            e.preventDefault();
        }
        
        // Ctrl+I: Import
        if (e.key === 'i' && e.ctrlKey) {
            showImportModal();
            e.preventDefault();
        }
        
        // Ctrl+F: Focus search
        if (e.key === 'f' && e.ctrlKey) {
            const activeTab = document.querySelector('.tab-content.active');
            const searchInput = activeTab?.querySelector('input[type="text"][placeholder*="earch"]');
            if (searchInput) {
                searchInput.focus();
                e.preventDefault();
            }
        }
        
        // ?: Toggle shortcuts help
        if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
            toggleShortcutsHelp();
            e.preventDefault();
        }
        
        // Ctrl+Shift+E: Toggle Edit Mode
        if (e.key === 'E' && e.ctrlKey && e.shiftKey) {
            toggleEditMode();
            e.preventDefault();
        }
        
        // Escape: Close modals
        if (e.key === 'Escape') {
            hideExportModal();
            hideImportModal();
            hideLoginModal();
            hideShortcutsHelp();
        }
    });
}

function toggleShortcutsHelp() {
    let help = document.getElementById('shortcutsHelp');
    if (!help) {
        help = document.createElement('div');
        help.id = 'shortcutsHelp';
        help.className = 'shortcuts-help';
        help.innerHTML = `
            <div style="margin-bottom: 5px; color: var(--text-beige); display: flex; justify-content: space-between; align-items: center;">
                <span>⌨️ Shortcuts</span>
                <span onclick="toggleShortcutsHelp()" style="cursor: pointer; opacity: 0.6; font-size: 1rem;">✕</span>
            </div>
            <div><kbd>1</kbd>-<kbd>6</kbd> Switch tabs</div>
            <div><kbd>Ctrl</kbd>+<kbd>E</kbd> Export</div>
            <div><kbd>Ctrl</kbd>+<kbd>I</kbd> Import</div>
            <div><kbd>Ctrl</kbd>+<kbd>F</kbd> Search</div>
            <div><kbd>?</kbd> Toggle this help</div>
        `;
        document.body.appendChild(help);
    }
    shortcutsHelpVisible = !shortcutsHelpVisible;
    help.style.display = shortcutsHelpVisible ? 'block' : 'none';
}

function initShortcutsHelp() {
    // Create and show shortcuts help on load
    toggleShortcutsHelp();
}

function hideShortcutsHelp() {
    const help = document.getElementById('shortcutsHelp');
    if (help) help.style.display = 'none';
    shortcutsHelpVisible = false;
}

// ============================================================================
// BULK SELECT MODE
// ============================================================================

let bulkMode = { ammo: false, weapons: false, gear: false, attachments: false };
let bulkSelected = { ammo: new Set(), weapons: new Set(), gear: new Set(), attachments: new Set() };

function toggleBulkMode(category) {
    bulkMode[category] = !bulkMode[category];
    bulkSelected[category].clear();
    
    const container = document.getElementById(`tab-${category}`);
    container.classList.toggle('bulk-mode', bulkMode[category]);
    
    // Update button text
    const btn = document.getElementById(`bulk-toggle-${category}`);
    if (btn) btn.textContent = bulkMode[category] ? 'Exit Bulk Select' : 'Bulk Select';
    
    renderCategoryList(category);
}

function toggleBulkItem(category, id, event) {
    if (event) event.stopPropagation();
    
    if (bulkSelected[category].has(id)) {
        bulkSelected[category].delete(id);
    } else {
        bulkSelected[category].add(id);
    }
    
    updateBulkCount(category);
}

function updateBulkCount(category) {
    const countEl = document.getElementById(`bulk-count-${category}`);
    if (countEl) countEl.textContent = bulkSelected[category].size + ' selected';
}

function bulkMarkOwned(category) {
    const ownedSet = category === 'ammo' ? ownedAmmo : 
                    category === 'weapons' ? ownedWeapons :
                    category === 'gear' ? ownedGear : ownedAttachments;
    
    bulkSelected[category].forEach(id => ownedSet.add(id));
    bulkSelected[category].clear();
    
    // Save
    if (category === 'ammo') saveOwnedAmmo();
    if (category === 'weapons') saveOwnedWeapons();
    if (category === 'gear') saveOwnedGear();
    if (category === 'attachments') saveOwnedAttachments();
    
    renderCategoryList(category);
    updateDashboard();
}

function bulkUnmarkOwned(category) {
    const ownedSet = category === 'ammo' ? ownedAmmo : 
                    category === 'weapons' ? ownedWeapons :
                    category === 'gear' ? ownedGear : ownedAttachments;
    
    bulkSelected[category].forEach(id => ownedSet.delete(id));
    bulkSelected[category].clear();
    
    // Save
    if (category === 'ammo') saveOwnedAmmo();
    if (category === 'weapons') saveOwnedWeapons();
    if (category === 'gear') saveOwnedGear();
    if (category === 'attachments') saveOwnedAttachments();
    
    renderCategoryList(category);
    updateDashboard();
}

function bulkSelectAll(category) {
    const data = category === 'ammo' ? allAmmoData?.all :
                category === 'weapons' ? allWeaponsData?.all :
                category === 'gear' ? allGearData?.all : allAttachmentsData?.all;
    
    if (data) {
        // Select all visible items (apply current filters)
        const visibleItems = document.querySelectorAll(`#tab-${category} .ammo-card, #tab-${category} .weapon-card, #tab-${category} .gear-card, #tab-${category} .attachment-card`);
        visibleItems.forEach(el => {
            const id = el.dataset.id || el.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (id) bulkSelected[category].add(id);
        });
    }
    updateBulkCount(category);
    renderCategoryList(category);
}

function bulkDeselectAll(category) {
    bulkSelected[category].clear();
    updateBulkCount(category);
    renderCategoryList(category);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// ============================================================================
// APP INITIALIZATION WITH LOADING SCREEN
// ============================================================================

async function initApp() {
    const loadingScreen = document.getElementById('globalLoadingScreen');
    const loadingStatus = document.getElementById('loadingStatus');
    const loadingProgress = document.getElementById('loadingProgressBar');
    const loadingDetails = document.getElementById('loadingDetails');
    
    const tasks = [
        { name: 'Authentication', fn: initAuth },
        { name: 'Configuration', fn: async () => { loadTierData(); initTierConfigUI(); } },
        { name: 'Shortcuts', fn: async () => { initKeyboardShortcuts(); initShortcutsHelp(); } },
        { name: 'Local Data', fn: async () => { loadSavedAmmo(); loadCollectedQuestItems(); } },
        { name: 'Quest Locations', fn: loadQuestLocationsData },
        { name: 'Quests', fn: loadQuests },
        { name: 'Hideout Data', fn: loadHideoutData },
        { name: 'Extract Data', fn: preloadAllExtractData },
        { name: 'Marker Notes', fn: loadMarkerNotes },
        { name: 'Hidden Markers', fn: loadHiddenApiMarkers },
        { name: 'Ammo Database', fn: loadAmmoData },
        { name: 'Weapons Database', fn: loadWeaponsData },
        { name: 'Gear Database', fn: loadGearData },
        { name: 'Attachments Database', fn: loadAttachmentsData },
    ];
    
    let completed = 0;
    const total = tasks.length;
    
    for (const task of tasks) {
        try {
            loadingStatus.textContent = `Loading ${task.name}...`;
            loadingDetails.innerHTML = `<span class="loading-item active">⏳ ${task.name}</span>`;
            
            await task.fn();
            
            completed++;
            const progress = Math.round((completed / total) * 100);
            loadingProgress.style.width = progress + '%';
            
            loadingDetails.innerHTML = `<span class="loading-item done">✓ ${task.name}</span>`;
        } catch (err) {
            console.error(`Error loading ${task.name}:`, err);
            loadingDetails.innerHTML = `<span class="loading-item error">✗ ${task.name} (failed)</span>`;
            // Continue with other tasks even if one fails
            completed++;
            const progress = Math.round((completed / total) * 100);
            loadingProgress.style.width = progress + '%';
        }
    }
    
    // Final setup
    loadingStatus.textContent = 'Initializing map...';
    updateMapSelection();
    await initMap('customs', []);
    updateDashboard();
    
    // Show refresh buttons
    document.getElementById('btn-load-ammo').style.display = 'block';
    document.getElementById('btn-load-weapons').style.display = 'block';
    document.getElementById('btn-load-gear').style.display = 'block';
    document.getElementById('btn-load-attachments').style.display = 'block';
    
    // Hide loading screen
    loadingProgress.style.width = '100%';
    loadingStatus.textContent = 'Ready!';
    
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }, 300);
}

document.addEventListener('DOMContentLoaded', initApp);