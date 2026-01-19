from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import json
import time

app = FastAPI(title="Tarkov Helper API", version="0.9.5")

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TARKOV_API_URL = "https://api.tarkov.dev/graphql"
CACHE_TTL = 300  # 5 Minuten Cache
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
    "Labs": "Laboratory",
    "Any": "Any" # NEU: Für globale Quests
}

# Erweiterte Query inkl. Follow-up Quests (unlocksTask)
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
        unlocksTask {
            id
            name
            minPlayerLevel
            map { name }
            trader { name }
        }
    }
}
"""

async def fetch_tarkov_data():
    global last_fetch_time, cached_data
    current_time = time.time()
    
    if cached_data and (current_time - last_fetch_time < CACHE_TTL):
        return cached_data

    print("DEBUG: Cache abgelaufen. Frage Tarkov API ab...")
    headers = {"Content-Type": "application/json"}
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                TARKOV_API_URL, 
                json={'query': QUESTS_QUERY}, 
                headers=headers, 
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            
            if "errors" in data:
                raise Exception(f"Tarkov API Error: {data['errors'][0]['message']}")
            
            cached_data = data
            last_fetch_time = current_time
            return data
        except Exception as e:
            print(f"API ERROR: {e}")
            raise e

@app.get("/quests/{map_name}")
async def get_quests(map_name: str):
    try:
        result = await fetch_tarkov_data()
        target_map = MAP_MAPPING.get(map_name, map_name)
        
        all_tasks = result.get("data", {}).get("tasks", [])
        filtered_tasks = []
        
        for task in all_tasks:
            task_map = task.get('map')
            
            # Logik für "Any" (Quests ohne Map) vs spezifische Map
            if target_map == "Any":
                # Nimm Quests, die KEINE Map haben (Global)
                if task_map is None:
                    filtered_tasks.append(task)
            else:
                # Nimm Quests, die exakt zur Map passen
                if task_map and task_map.get('name') == target_map:
                    filtered_tasks.append(task)
        
        return filtered_tasks

    except Exception as e:
        print(f"CRITICAL SERVER ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))