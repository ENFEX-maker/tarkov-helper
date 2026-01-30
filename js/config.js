// ============================================================================
// CONFIGURATION - Global constants and state variables
// ============================================================================

// Supabase Configuration
const SUPABASE_URL = 'https://dpryrhcqeviyvssyiwdz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwcnlyaGNxZXZpeXZzc3lpd2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0OTg0MjEsImV4cCI6MjA4NTA3NDQyMX0.IiYyEjEjEOU1fSq8DN_7tG2oQPr6Iuft2zMC2TasMXSfI';

// API Configuration
const API_BASE = '/api';

// Global State - Supabase & Auth
let supabaseClient = null;
let currentUser = null;
let isEditMode = false;

// Global State - Map
let mapInstance = null;
let currentMapLayer = null;
let questMarkersLayer = null;
let mapAreasLayer = null;
let imageBounds = null;
let currentMapWidth = 1000;
let currentMapHeight = 1000;
let currentMapOffsetX = 0;
let currentMapOffsetY = 0;
let currentFloor = 'ground';
let currentSvgElement = null;
let activeMapTab = 'customs';

// Global State - Markers
let isMarkerCreatorActive = false;
let selectedObjectiveForPlacement = null;
let manualMarkersCache = null;
let manualMarkersCacheLoaded = false;
let hiddenApiMarkersCache = null;
let hiddenApiMarkersCacheLoaded = false;

// Global State - Areas
let mapAreasCache = null;
let mapAreasCacheLoaded = false;
let isAreaDrawingActive = false;
let currentAreaPoints = [];
let currentAreaPreviewLayer = null;

// Global State - Quests
let selectedQuestNamesForMarkers = [];
let selectedQuestsForMarkers = [];
let questLocationsData = null;
let allQuests = [];
let currentGrouping = 'trader';
let questCompletionCache = null;

// Global State - Marker Notes
let markerNotesCache = null;
let markerNotesCacheLoaded = false;

// Global State - Overlays
let extractMarkersLayer = null;
let overlayMarkersLayer = null;
let extractDataCache = {};
let lootContainerDataCache = {};
let overlaysEnabled = { extracts: false, spawns: false, bosses: false, containers: false };

// Global State - Items
let allAmmoData = [];
let allWeaponsData = [];
let allGearData = [];
let allAttachmentsData = [];

// Global State - Hideout
let hideoutData = [];
let craftData = [];
let hideoutLevels = {};

// Quest Colors for Map Markers
const QUEST_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FFD700'
];

// Map Configuration with Floor Layers
const MAP_CONFIG = {
    customs: { 
        file: 'maps/Customs.svg', 
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, 
        flipY: false, invertLeafletY: true,
        floors: [
            { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Level'] },
            { id: 'underground', label: 'Underground', short: 'U', svgLayers: ['Underground_Level'] },
            { id: 'floor_1', label: '1st Floor', short: '1', svgLayers: ['First_Floor'] },
            { id: 'floor_2', label: '2nd Floor', short: '2', svgLayers: ['Second_Floor'] },
            { id: 'floor_3', label: '3rd Floor', short: '3', svgLayers: ['Third_Floor'] }
        ]
    },
    woods: { 
        file: 'maps/Woods.svg', 
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, 
        flipY: false, invertLeafletY: true,
        floors: [
            { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: null }
        ]
    },
    shoreline: { 
        file: 'maps/Shoreline.svg', 
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, 
        flipY: false, invertLeafletY: true,
        floors: [
            { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Level'] },
            { id: 'underground', label: 'Underground', short: 'U', svgLayers: ['Underground_Level'] },
            { id: 'floor_1', label: 'Resort 1F', short: '1', svgLayers: ['First_Floor'] },
            { id: 'floor_2', label: 'Resort 2F', short: '2', svgLayers: ['Second_Floor'] },
            { id: 'floor_3', label: 'Resort 3F', short: '3', svgLayers: ['Third_Floor'] }
        ]
    },
    interchange: { 
        file: 'maps/Interchange.svg', 
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, 
        flipY: false, invertLeafletY: true,
        floors: [
            { id: 'ground', label: 'Ground/Parking', short: 'G', default: true, svgLayers: ['Ground_Level'] },
            { id: 'floor_1', label: '1st Floor', short: '1', svgLayers: ['First_Floor'] },
            { id: 'floor_2', label: '2nd Floor', short: '2', svgLayers: ['Second_Floor'] }
        ]
    },
    reserve: { 
        file: 'maps/Reserve.svg', 
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, 
        flipY: false, invertLeafletY: true,
        floors: [
            { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Level'] },
            { id: 'bunkers', label: 'Bunkers/D-2', short: 'BK', svgLayers: ['Bunkers'] }
        ]
    },
    lighthouse: { 
        file: 'maps/Lighthouse.svg', 
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, 
        flipY: false, invertLeafletY: true,
        floors: [
            { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: null }
        ]
    },
    streets: { 
        file: 'maps/StreetsOfTarkov.svg', 
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, 
        flipY: false, invertLeafletY: true,
        floors: [
            { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Level'] },
            { id: 'underground', label: 'Underground', short: 'U', svgLayers: ['Underground_Level'] },
            { id: 'floor_1', label: '1st Floor', short: '1', svgLayers: ['First_Floor'] },
            { id: 'floor_2', label: '2nd Floor', short: '2', svgLayers: ['Second_Floor'] },
            { id: 'floor_3', label: '3rd Floor', short: '3', svgLayers: ['Third_Floor'] },
            { id: 'floor_4', label: '4th Floor', short: '4', svgLayers: ['Fourth_Floor'] },
            { id: 'floor_5', label: '5th Floor', short: '5', svgLayers: ['Fifth_Floor'] }
        ]
    },
    groundzero: { 
        file: 'maps/GroundZero.svg', 
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, 
        flipY: false, invertLeafletY: true,
        floors: [
            { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Level'] },
            { id: 'underground', label: 'Underground', short: 'U', svgLayers: ['Underground_Level'] },
            { id: 'floor_1', label: '1st Floor', short: '1', svgLayers: ['First_Floor'] },
            { id: 'floor_2', label: '2nd Floor', short: '2', svgLayers: ['Second_Floor'] },
            { id: 'floor_3', label: '3rd Floor', short: '3', svgLayers: ['Third_Floor'] }
        ]
    },
    factory: { 
        file: 'maps/Factory.svg', 
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, 
        flipY: false, invertLeafletY: true,
        floors: [
            { id: 'ground', label: 'Ground', short: 'G', default: true, svgLayers: ['Ground_Floor'] },
            { id: 'floor_2', label: '2nd Floor', short: '2', svgLayers: ['Second_Floor'] },
            { id: 'floor_3', label: '3rd Floor', short: '3', svgLayers: ['Third_Floor'] },
            { id: 'basement', label: 'Basement/Tunnels', short: 'B', svgLayers: ['Basement'] }
        ]
    },
    labs: { 
        file: 'maps/Labs.svg', 
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, 
        flipY: false, invertLeafletY: true,
        floors: [
            { id: 'technical', label: 'Technical Level', short: 'T', default: true, svgLayers: ['Technical_Level'] },
            { id: 'floor_1', label: '1st Level', short: '1', svgLayers: ['First_Level'] },
            { id: 'floor_2', label: '2nd Level', short: '2', svgLayers: ['Second_Level'] }
        ]
    }
};

// Map Names for Display
const MAP_NAMES = {
    customs: 'Customs', factory: 'Factory', groundzero: 'Ground Zero',
    interchange: 'Interchange', labs: 'The Lab', lighthouse: 'Lighthouse',
    reserve: 'Reserve', shoreline: 'Shoreline', streets: 'Streets of Tarkov', woods: 'Woods'
};

// Trader Images
const TRADER_IMAGES = {
    'Prapor': 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/f/fc/Prapor_Portrait.png',
    'Therapist': 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/a/ab/Therapist_Portrait.png',
    'Skier': 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/e/eb/Skier_Portrait.png',
    'Peacekeeper': 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/a/a0/Peacekeeper_Portrait.png',
    'Mechanic': 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/d/dc/Mechanic_Portrait.png',
    'Ragman': 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/e/e4/Ragman_Portrait.png',
    'Jaeger': 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/4/43/Jaeger_Portrait.png',
    'Fence': 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/a/a1/Fence_Portrait.png',
    'Lightkeeper': 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/7/7d/Lightkeeper_portrait.png'
};

// Stat Definitions for Items
const STAT_DEFINITIONS = {
    ammo: {
        damage: { label: 'Damage', unit: '', higherBetter: true },
        penetrationPower: { label: 'Penetration', unit: '', higherBetter: true },
        armorDamage: { label: 'Armor Damage %', unit: '%', higherBetter: true },
        fragmentationChance: { label: 'Fragmentation', unit: '%', higherBetter: true, multiply: 100 },
        initialSpeed: { label: 'Velocity', unit: ' m/s', higherBetter: true },
        recoilModifier: { label: 'Recoil', unit: '%', higherBetter: false, multiply: 100, showSign: true },
        accuracyModifier: { label: 'Accuracy', unit: '%', higherBetter: true, multiply: 100, showSign: true },
        projectileCount: { label: 'Projectiles', unit: '', higherBetter: true },
        lightBleedModifier: { label: 'Light Bleed', unit: 'x', higherBetter: true },
        heavyBleedModifier: { label: 'Heavy Bleed', unit: 'x', higherBetter: true }
    },
    weapons: {
        fireRate: { label: 'Fire Rate', unit: ' RPM', higherBetter: true },
        ergonomics: { label: 'Ergonomics', unit: '', higherBetter: true },
        recoilVertical: { label: 'V. Recoil', unit: '', higherBetter: false },
        recoilHorizontal: { label: 'H. Recoil', unit: '', higherBetter: false },
        effectiveDistance: { label: 'Eff. Range', unit: 'm', higherBetter: true },
        velocity: { label: 'Velocity', unit: ' m/s', higherBetter: true },
        sightingRange: { label: 'Sighting', unit: 'm', higherBetter: true }
    },
    armor: {
        class: { label: 'Class', unit: '', higherBetter: true },
        durability: { label: 'Durability', unit: '', higherBetter: true },
        ergoPenalty: { label: 'Ergo Penalty', unit: '%', higherBetter: false },
        speedPenalty: { label: 'Speed Penalty', unit: '%', higherBetter: false },
        turnPenalty: { label: 'Turn Penalty', unit: '%', higherBetter: false },
        material: { label: 'Material', unit: '', higherBetter: null }
    }
};

// Helper function to initialize Supabase
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
