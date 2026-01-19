from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import json
import time

# Version Bump
app = FastAPI(title="Tarkov Helper API", version="1.1.3-STABLE")

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
            
            # --- CRASH FIX: Sicheres Auslesen der Daten ---
            # data['data'] kann null sein, tasks kann null sein.
            data_content = data.get("data") or {}
            all_tasks = data_content.get("tasks") or []
            
            unlocks_map = {}

            for child_task in all_tasks:
                # CRASH FIX: taskRequirements kann null sein!
                reqs = child_task.get("taskRequirements") or []
                
                for req in reqs:
                    if not req: continue # Skip if req itself is weirdly null
                    
                    parent = req.get("task")
                    if parent:
                        p_id = parent["id"]
                        if p_id not in unlocks_map:
                            unlocks_map[p_id] = []
                        
                        # Sicheres Auslesen der Child-Infos
                        c_map = child_task.get("map")
                        c_trader = child_task.get("trader")
                        
                        unlocks_map[p_id].append({
                            "name": child_task.get("name", "Unknown"),
                            "map": c_map["name"] if c_map else "Any/Global",
                            "trader": c_trader["name"] if c_trader else "?"
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
        data_content = result.get("data") or {}
        all_tasks = data_content.get("tasks") or []
        
        filtered = []
        
        for task in all_tasks:
            t_map = task.get('map')
            if target_map == "Any":
                if t_map is None: filtered.append(task)
            else:
                if t_map and t_map.get('name') == target_map: filtered.append(task)
        
        # Sortieren (mit Fallback)
        filtered.sort(key=lambda x: x.get('name', ''))
        return filtered

    except Exception as e:
        print(f"CRITICAL SERVER ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))