// ============================================================================
// APP - Application Initialization
// ============================================================================

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
    </script>
</body>
</html>
