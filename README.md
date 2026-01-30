# Tarkov Raid Planner v1.0 Beta

Ein umfassendes Planungstool für Escape from Tarkov mit Quest-Tracking, interaktiven Karten und Hideout-Management.

## 📁 Projektstruktur

```
tarkov-helper/
├── .github/
│   └── workflows/
│       └── docker-build.yml    # GitHub Actions für Docker Build
├── backend/
│   ├── Dockerfile
│   ├── main.py                 # Python FastAPI Backend
│   └── requirements.txt
├── frontend/
│   ├── Dockerfile              # nginx:alpine Container
│   ├── nginx.conf              # nginx Konfiguration mit Proxy
│   ├── favicon.svg
│   ├── index.html              # Haupt-HTML (~1060 Zeilen)
│   ├── css/
│   │   └── styles.css          # Alle Styles (~940 Zeilen)
│   ├── js/
│   │   └── main.js             # JavaScript (~7400 Zeilen)
│   └── maps/                   # SVG-Maps (10 Stück)
│       ├── Customs.svg
│       ├── Factory.svg
│       ├── GroundZero.svg
│       ├── Interchange.svg
│       ├── Labs.svg
│       ├── Lighthouse.svg
│       ├── Reserve.svg
│       ├── Shoreline.svg
│       ├── StreetsOfTarkov.svg
│       └── Woods.svg
├── docker-compose.yml
├── .gitignore
└── README.md
```

## 🚀 Quick Start

### Lokal mit Docker Compose

```bash
# Starten
docker-compose up -d

# Frontend: http://localhost:8080
# Backend API: http://localhost:8000
```

### Nur Frontend testen

```bash
cd frontend
python -m http.server 8080
# Öffne http://localhost:8080
```

## 🔧 Entwicklung

### Frontend ändern

1. Bearbeite `frontend/index.html`, `frontend/css/styles.css` oder `frontend/js/main.js`
2. Refresh im Browser

### Backend ändern

1. Bearbeite `backend/main.py`
2. Uvicorn reloaded automatisch (bei docker-compose)

## 📦 Deployment

### GitHub Actions

Bei jedem Push auf `main` werden automatisch zwei Docker Images gebaut:

- `ghcr.io/enfex-maker/tarkov-helper-backend:latest`
- `ghcr.io/enfex-maker/tarkov-helper-frontend:latest`

### Manueller Build

```bash
# Frontend
cd frontend
docker build -t tarkov-frontend .

# Backend
cd backend
docker build -t tarkov-backend .
```

## 🗄️ Datenbank (Supabase)

Benötigte Tabellen:
- `quest_marker_positions` - Manuelle Marker-Positionen
- `marker_corrections` - Korrigierte Marker-Positionen
- `hidden_api_markers` - Versteckte API-Marker
- `map_areas` - Benutzerdefinierte Kartenbereiche
- `marker_notes` - Notizen zu Markern
- `extract_corrections` - Korrigierte Extract-Positionen

## 🛠️ Features

- **Quest-Tracking**: Alle Quests mit Completion-Status
- **Interaktive Karten**: SVG-Maps mit Multi-Floor-Support
- **Marker-System**: Manuelles Platzieren von Quest-Markern
- **Area-Drawing**: Bereiche auf der Karte markieren
- **Hideout-Tracker**: Upgrade-Fortschritt verfolgen
- **Raid-Planung**: Quests für einen Raid planen
- **Item-Datenbanken**: Ammo, Waffen, Gear, Attachments

## 📋 Zukünftige Modularisierung

Die `main.js` kann bei Bedarf weiter aufgeteilt werden in:

| Modul | Beschreibung |
|-------|--------------|
| `config.js` | Konfigurationen, globale Variablen |
| `auth.js` | Login/Logout, Session |
| `map.js` | Leaflet-Map, Floor-System |
| `markers.js` | Marker-System, Areas |
| `quests.js` | Quest-Management |
| `hideout.js` | Hideout-Tracker |
| `items.js` | Ammo, Weapons, Gear |
| `overlays.js` | Extracts, Spawns |
| `app.js` | Initialisierung |

## 📝 Lizenz

MIT License
