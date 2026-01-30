// ============================================================================
// OVERLAYS - Extracts, Spawns, Loot Containers, Marker Notes
// ============================================================================


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

