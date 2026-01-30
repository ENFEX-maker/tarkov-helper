// ============================================================================
// ITEMS - Ammo, Weapons, Gear, Attachments Management
// ============================================================================

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
