# Tarkov Raid Planner v1.0 Beta

Ein umfassendes Planungstool für Escape from Tarkov mit Quest-Tracking, interaktiven Karten und Hideout-Management.

## 📁 Projektstruktur

```
tarkov-planner/
├── index.html              # Haupt-HTML (nur Struktur, ~1000 Zeilen)
├── css/
│   └── styles.css          # Alle Styles (~940 Zeilen)
├── js/
│   ├── config.js           # Konfiguration, globale Variablen, MAP_CONFIG
│   ├── auth.js             # Login/Logout, Supabase Auth
│   ├── ui.js               # UI-Helper, Status-Indicator
│   ├── markers.js          # Quest-Marker, Manual Markers, Areas
│   ├── quests.js           # Quest-Loading, Filtering, Completion
│   ├── hideout.js          # Hideout-Tracker
│   ├── map.js              # Leaflet Map, Floor-System, SVG-Layer
│   ├── raids.js            # Raid-Planung, Sharing
│   ├── items.js            # Ammo, Weapons, Gear, Attachments
│   ├── overlays.js         # Extracts, Spawns, Loot, Marker Notes
│   └── app.js              # Initialisierung
├── data/                   # (Optional) Lokale Daten
├── maps/                   # SVG-Maps
│   ├── Customs.svg
│   ├── Factory.svg
│   ├── GroundZero.svg
│   ├── Interchange.svg
│   ├── Labs.svg
│   ├── Lighthouse.svg
│   ├── Reserve.svg
│   ├── Shoreline.svg
│   ├── StreetsOfTarkov.svg
│   └── Woods.svg
└── README.md
```

## 🔧 Module-Übersicht

| Modul | Zeilen | Beschreibung |
|-------|--------|--------------|
| `config.js` | ~260 | Supabase-Config, MAP_CONFIG, globale Variablen |
| `auth.js` | ~170 | Login, Logout, Session-Management |
| `ui.js` | ~300 | Status-Indicator, UI-Helper |
| `markers.js` | ~1300 | Marker-System, Areas, Hidden Markers |
| `quests.js` | ~670 | Quest-Management, Completion-Tracking |
| `hideout.js` | ~770 | Hideout-Tracker, Upgrades |
| `map.js` | ~410 | Leaflet-Map, Floor-System |
| `raids.js` | ~440 | Raid-Planung, Discord-Export |
| `items.js` | ~1550 | Ammo, Weapons, Gear, Attachments |
| `overlays.js` | ~1710 | Extracts, Marker Notes |
| `app.js` | ~90 | Initialisierung |

**Gesamt: ~7.670 Zeilen JavaScript**

## 🚀 Features

- **Quest-Tracking**: Alle Quests mit Completion-Status
- **Interaktive Karten**: SVG-Maps mit Multi-Floor-Support
- **Marker-System**: Manuelles Platzieren von Quest-Markern
- **Area-Drawing**: Bereiche auf der Karte markieren
- **Hideout-Tracker**: Upgrade-Fortschritt verfolgen
- **Raid-Planung**: Quests für einen Raid planen
- **Item-Datenbanken**: Ammo, Waffen, Gear, Attachments

## 📦 Dependencies

- Bootstrap 5.3
- Leaflet 1.9.4
- Supabase JS Client
- Google Fonts (Rajdhani, Share Tech Mono)

## 🗄️ Datenbank (Supabase)

Benötigte Tabellen:
- `quest_marker_positions` - Manuelle Marker-Positionen
- `marker_corrections` - Korrigierte Marker-Positionen
- `hidden_api_markers` - Versteckte API-Marker
- `map_areas` - Benutzerdefinierte Kartenbereiche
- `marker_notes` - Notizen zu Markern
- `extract_corrections` - Korrigierte Extract-Positionen

## 🔄 Migration von Single-File

Das Projekt wurde von einer ~9.400 Zeilen Single-File HTML in diese modulare Struktur umgewandelt. Die Reihenfolge der Script-Includes in `index.html` ist wichtig!

```html
<script src="js/config.js"></script>     <!-- Zuerst: Globale Variablen -->
<script src="js/auth.js"></script>       <!-- Auth-Funktionen -->
<script src="js/ui.js"></script>         <!-- UI-Helper -->
<script src="js/markers.js"></script>    <!-- Marker-System -->
<script src="js/quests.js"></script>     <!-- Quest-Funktionen -->
<script src="js/hideout.js"></script>    <!-- Hideout -->
<script src="js/map.js"></script>        <!-- Map-Funktionen -->
<script src="js/raids.js"></script>      <!-- Raid-Planung -->
<script src="js/items.js"></script>      <!-- Item-Datenbanken -->
<script src="js/overlays.js"></script>   <!-- Overlays & Notes -->
<script src="js/app.js"></script>        <!-- Zuletzt: Initialisierung -->
```

## 📝 Lizenz

MIT License
