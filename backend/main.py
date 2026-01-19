from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import json
import time

app = FastAPI(title="Tarkov Helper API", version="0.9.9-LOGIC")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TARKOV_API_URL = "https://api.tarkov.dev/graphql"
CACHE_TTL = 300
last_fetch_time = 0
cached_data = None

MAP_MAPPING = {
    "Customs": "Customs", "Factory": "Factory", "Woods": "Woods",
    "Interchange": "Interchange", "Shoreline": "Shoreline", "Reserve": "Reserve",
    "Lighthouse": "Lighthouse", "Streets of Tarkov": "Streets",
    "Ground Zero": "GroundZero", "Labs": "Laboratory", "Any": "Any"
}

# Wir holen Requirements, um die Abhängigkeiten selbst zu berechnen
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
        # Das hier ist der Schlüssel: Was braucht diese Quest als Voraussetzung?
        taskRequirements {
            task {
                id
                name
            }
        }
    }
}
"""

async def fetch_tarkov_data():
    global last_fetch_time, cached_data
    current_time = time.time()
    
    if cached_data and (current_time - last_fetch_time < CACHE_TTL):
        return cached_data

    headers = {"Content-Type": "application/json"}
    async with httpx.AsyncClient() as client:
        try:
            print("DEBUG: Fetching raw data from Tarkov...")
            response = await client.post(TARKOV_API_URL, json={'query': QUESTS_QUERY}, headers=headers, timeout=30.0)
            data = response.json()
            if "errors" in data:
                raise Exception(data['errors'][0]['message'])
            
            # --- LOGIK: Reverse Lookup bauen ---
            # Wir bauen eine Map: { Parent_ID: [Child_Quest1, Child_Quest2] }
            all_tasks = data.get("data", {}).get("tasks", [])
            unlocks_map = {}

            for child_task in all_tasks:
                reqs = child_task.get("taskRequirements", [])
                for req in reqs:
                    parent = req.get("task")
                    if parent:
                        p_id = parent["id"]
                        if p_id not in unlocks_map:
                            unlocks_map[p_id] = []
                        
                        # Wir speichern die Infos der Child-Quest beim Parent
                        unlocks_map[p_id].append({
                            "name": child_task["name"],
                            "map": child_task["map"]["name"] if child_task.get("map") else "Any/Global",
                            "trader": child_task["trader"]["name"] if child_task.get("trader") else "?"
                        })
            
            # Jetzt fügen wir das neue Feld "derived_unlocks" in jede Task ein
            for task in all_tasks:
                task_id = task["id"]
                if task_id in unlocks_map:
                    task["derived_unlocks"] = unlocks_map[task_id]
                else:
                    task["derived_unlocks"] = []

            # Cache speichern (mit den berechneten Daten)
            cached_data = data
            last_fetch_time = current_time
            return data

        except Exception as e:
            print(f"FETCH ERROR: {e}")
            raise e

@app.get("/quests/{map_name}")
async def get_quests(map_name: str):
    try:
        result = await fetch_tarkov_data()
        target_map = MAP_MAPPING.get(map_name, map_name)
        
        all_tasks = result.get("data", {}).get("tasks", [])
        filtered = []
        
        for task in all_tasks:
            t_map = task.get('map')
            if target_map == "Any":
                if t_map is None: filtered.append(task)
            else:
                if t_map and t_map.get('name') == target_map: filtered.append(task)
        return filtered

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))