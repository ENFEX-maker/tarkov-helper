from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx  # Ersetzt requests für Async Support
import json
import time

app = FastAPI(title="Tarkov Helper API", version="0.9.1")

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TARKOV_API_URL = "https://api.tarkov.dev/graphql"
CACHE_TTL = 300  # Cache für 5 Minuten (300 Sekunden) speichern
last_fetch_time = 0
cached_data = None

# Mapping: Frontend-Name -> API-Name
MAP_MAPPING = {
    "Customs": "Customs",
    "Factory": "Factory",
    "Woods": "Woods",
    "Interchange": "Interchange",
    "Shoreline": "Shoreline",
    "Reserve": "Reserve",
    "Lighthouse": "Lighthouse",
    "Streets of Tarkov": "Streets",
    "Ground Zero": "GroundZero",
    "Labs": "Laboratory"
}

# Die GraphQL Query ausgelagert für bessere Lesbarkeit
QUESTS_QUERY = """
{
    tasks {
        id
        name
        wikiLink
        minPlayerLevel
        map { name }
        trader { name, imageLink }
        neededKeys {
            keys { name, shortName, iconLink }
        }
        startRewards {
            items {
                item { name, iconLink },
                count
            }
        }
        objectives {
            description
            type
            ... on TaskObjectiveItem {
                item { name, iconLink }
                count
                foundInRaid
            }
        }
    }
}
"""

async def fetch_tarkov_data():
    """Holt Daten von der Tarkov API oder aus dem Cache."""
    global last_fetch_time, cached_data
    
    current_time = time.time()
    
    # Prüfen, ob Cache noch gültig ist
    if cached_data and (current_time - last_fetch_time < CACHE_TTL):
        print("DEBUG: Lade Quests aus dem Cache (Kein API Call).")
        return cached_data

    print("DEBUG: Cache abgelaufen oder leer. Frage Tarkov API ab...")
    headers = {"Content-Type": "application/json"}
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                TARKOV_API_URL, 
                json={'query': QUESTS_QUERY}, 
                headers=headers, 
                timeout=30.0
            )
            response.raise_for_status() # Wirft Fehler bei 4xx/5xx
            
            data = response.json()
            
            if "errors" in data:
                print(f"API ERROR: {json.dumps(data['errors'], indent=2)}")
                raise Exception(f"Tarkov API Error: {data['errors'][0]['message']}")
            
            # Cache aktualisieren
            cached_data = data
            last_fetch_time = current_time
            return data
            
        except httpx.HTTPStatusError as e:
            raise Exception(f"HTTP Error: {e.response.status_code}")
        except httpx.RequestError as e:
            raise Exception(f"Connection Error: {e}")

@app.get("/quests/{map_name}")
async def get_quests(map_name: str):
    """
    Lädt Quests für eine spezifische Map.
    Nutzt 'async', um den Server nicht zu blockieren.
    """
    try:
        # 1. Daten holen (Async + Cache)
        result = await fetch_tarkov_data()

        # 2. Ziel-Map bestimmen
        target_map = MAP_MAPPING.get(map_name, map_name)
        
        all_tasks = result.get("data", {}).get("tasks", [])
        filtered_tasks = []
        
        # 3. Filtern
        for task in all_tasks:
            # Sicherheitscheck: Hat die Quest eine Map?
            if task.get('map') and task['map'].get('name') == target_map:
                filtered_tasks.append(task)
        
        print(f"SUCCESS: {len(filtered_tasks)} Quests für {target_map} geliefert.")
        return filtered_tasks

    except Exception as e:
        print(f"CRITICAL SERVER ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))