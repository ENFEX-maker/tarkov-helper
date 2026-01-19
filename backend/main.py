from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import json
import time

# Version Bump auf 1.1.2 (Bugfix Release)
app = FastAPI(title="Tarkov Helper API", version="1.1.2-STABLE")

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
                item { id, name, iconLink },
                count
            }
        }
        objectives {
            description
            type
            ... on TaskObjectiveItem {
                item { id, name, iconLink }
                count
                foundInRaid
            }
            ... on TaskObjectiveMark {
                markerItem { id, name, iconLink }
            }
        }
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
    
    # Cache nur nutzen, wenn er existiert
    if cached_data and (current_time - last_fetch_time < CACHE_TTL):
        return cached_data

    headers = {"Content-Type": "application/json"}
    async with httpx.AsyncClient() as client:
        try:
            print("DEBUG: Fetching data from Tarkov API...")
            response = await client.post(TARKOV_API_URL, json={'query': QUESTS_QUERY}, headers=headers, timeout=30.0)
            data = response.json()
            
            if "errors" in data:
                print(f"API ERROR: {data['errors'][0]['message']}")
                raise Exception(data['errors'][0]['message'])
            
            # --- LOGIK: Reverse Lookup (Unlocks) ---
            # FIX: Wir nutzen .get('tasks') OR [], falls 'tasks' null ist
            all_tasks = data.get("data", {}).get("tasks") or []
            unlocks_map = {}

            for child_task in all_tasks:
                # CRITICAL FIX: 'taskRequirements' kann null sein!
                # 'or []' verhindert den Crash, wenn die API null sendet.
                reqs = child_task.get("taskRequirements") or []
                
                for req in reqs:
                    parent = req.get("task")
                    if parent:
                        p_id = parent["id"]
                        if p_id not in unlocks_map:
                            unlocks_map[p_id] = []
                        
                        unlocks_map[p_id].append({
                            "name": child_task.get("name", "Unknown"),
                            "map": child_task["map"]["name"] if child_task.get("map") else "Any/Global",
                            "trader": child_task["trader"]["name"] if child_task.get("trader") else "?"
                        })
            
            # Die berechneten Unlocks in die Tasks einfügen
            for task in all_tasks:
                task_id = task.get("id")
                task["derived_unlocks"] = unlocks_map.get(task_id, [])

            cached_data = data
            last_fetch_time = current_time
            return data

        except Exception as e:
            print(f"FETCH EXCEPTION: {e}")
            raise e

@app.get("/quests/{map_name}")
async def get_quests(map_name: str):
    try:
        result = await fetch_tarkov_data()
        target_map = MAP_MAPPING.get(map_name, map_name)
        
        # Auch hier: Sicherstellen, dass es eine Liste ist
        all_tasks = result.get("data", {}).get("tasks") or []
        filtered = []
        
        for task in all_tasks:
            t_map = task.get('map')
            if target_map == "Any":
                if t_map is None: filtered.append(task)
            else:
                if t_map and t_map.get('name') == target_map: filtered.append(task)
        
        # Sortieren (mit Fallback falls Name fehlt, zur Sicherheit)
        filtered.sort(key=lambda x: x.get('name', ''))
        return filtered

    except Exception as e:
        print(f"CRITICAL SERVER ERROR: {e}") # Damit wir es im Log sehen
        raise HTTPException(status_code=500, detail=str(e))