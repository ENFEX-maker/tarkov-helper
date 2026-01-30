// ============================================================================
// UI - Status, Stats, UI Helper Functions  
// ============================================================================

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

