// ============================================================================
// RAIDS - Raid Planning and Sharing
// ============================================================================

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

