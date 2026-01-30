// ============================================================================
// HIDEOUT - Hideout Tracker and Upgrades
// ============================================================================

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

