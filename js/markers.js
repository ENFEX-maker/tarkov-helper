// ============================================================================
// MARKERS - Marker Creator System, Manual Markers, Hidden API Markers
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
    
    // Create custom pane for areas (between tiles and markers)
    if (!mapInstance.getPane('areasPane')) {
        mapInstance.createPane('areasPane');
        mapInstance.getPane('areasPane').style.zIndex = 550; // Above SVG overlay, below markers
        mapInstance.getPane('areasPane').style.pointerEvents = 'auto';
    }
    
    // Clear existing areas layer
    if (mapAreasLayer) {
        mapAreasLayer.clearLayers();
    } else {
        mapAreasLayer = L.layerGroup({ pane: 'areasPane' }).addTo(mapInstance);
    }
    
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
        
        // Points are stored as [x, y] (Leaflet lng, lat)
        // Leaflet needs [lat, lng] which is [y, x]
        const latLngs = points.map(p => {
            const x = parseFloat(p[0]);
            const y = parseFloat(p[1]);
            return [y, x]; // [lat, lng]
        });
        
        console.log(`renderMapAreas: Drawing "${area.area_name}" with ${points.length} points`);
        console.log(`  Raw points:`, JSON.stringify(points));
        console.log(`  LatLngs for Leaflet:`, JSON.stringify(latLngs));
        console.log(`  Map bounds: height=${currentMapHeight}, width=${currentMapWidth}`);
        
        const polygon = L.polygon(latLngs, {
            color: area.area_color || '#9E8F6B',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.35,
            floor: area.floor || 'ground',
            areaId: area.id,
            areaName: area.area_name,
            pane: 'areasPane'
        });
        
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
            permanent: false,
            direction: 'center',
            className: 'area-polygon-label'
        });
        
        mapAreasLayer.addLayer(polygon);
        console.log(`renderMapAreas: Added polygon for "${area.area_name}"`);
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

