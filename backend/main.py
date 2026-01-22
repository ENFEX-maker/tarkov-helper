from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import json
import time

# MAJOR RELEASE: V1.0.1
app = FastAPI(title="Tarkov Raid Planner", version="1.0.0-GLOBAL")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {"status": "ok", "version": "v2.3-DEBUG", "message": "Backend is reachable"}

TARKOV_API_URL = "https://api.tarkov.dev/graphql"
CACHE_TTL = 300
last_fetch_time = 0
cached_data = None

# Mapping bleibt für spezifische Filterung, "ALL" wird im Code behandelt
MAP_MAPPING = {
    "Customs": "Customs", 
    "Factory": "Factory", 
    "Woods": "Woods",
    "Interchange": "Interchange", 
    "Shoreline": "Shoreline", 
    "Reserve": "Reserve",
    "Lighthouse": "Lighthouse", 
    "Streets of Tarkov": "Streets of Tarkov",
    "Ground Zero": "Ground Zero",
    "Labs": "The Lab",
    "Any": "Any"
}

QUESTS_QUERY = """
{
    tasks {
        id
        name
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

MAP_QUERY = """
query GetMapData($name: [String!]) {
    maps(name: $name) {
        id
        name
        normalizedName
        coordinateRotation
        players
        enemies
        raidDuration
        extracts {
            id
            name
            faction
            position { x y z }
        }
        spawns {
            zoneName
            position { x y z }
            sides
            categories
        }
        bosses {
            name
            spawnChance
            spawnLocations {
                name
                chance
                position { x y z }
            }
        }
        lootContainers {
            position { x y z }
            lootContainer { name normalizedName }
        }
        hazards {
            name
            hazardType
            position { x y z }
        }
    }
}
"""

async def fetch_tarkov_data():
    global last_fetch_time, cached_data
    current_time = time.time()
    
    if cached_data and (current_time - last_fetch_time < CACHE_TTL):
        return cached_data

    headers = {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate", 
        "User-Agent": "TarkovRaidPlanner/1.0"
    }

    timeout_config = httpx.Timeout(60.0, connect=20.0, read=60.0)

    async with httpx.AsyncClient(http2=False, timeout=timeout_config) as client:
        try:
            print("DEBUG: Fetching data from Tarkov API...")
            response = await client.post(TARKOV_API_URL, json={'query': QUESTS_QUERY}, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            if "errors" in data:
                raise Exception(data['errors'][0]['message'])
            
            data_content = data.get("data") or {}
            all_tasks = data_content.get("tasks") or []
            
            unlocks_map = {}

            for child_task in all_tasks:
                reqs = child_task.get("taskRequirements") or []
                for req in reqs:
                    if not req: continue
                    parent = req.get("task")
                    if parent:
                        p_id = parent["id"]
                        if p_id not in unlocks_map: unlocks_map[p_id] = []
                        
                        c_map = child_task.get("map")
                        c_trader = child_task.get("trader")
                        
                        unlocks_map[p_id].append({
                            "name": child_task.get("name", "Unknown"),
                            "map": c_map["name"] if c_map else "Global",
                            "trader": c_trader["name"] if c_trader else "?"
                        })
            
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
        
        # Mapping prüfen
        target_map = MAP_MAPPING.get(map_name, map_name)
        
        data_content = result.get("data") or {}
        all_tasks = data_content.get("tasks") or []
        
        # WICHTIG: Wenn "ALL" angefragt wird, geben wir ALLES zurück.
        # Das Frontend filtert dann.
        if map_name == "ALL":
            all_tasks.sort(key=lambda x: x.get('name', ''))
            return all_tasks

        # Fallback für alte Logik (Server-Side Filtering)
        filtered = []
        for task in all_tasks:
            t_map = task.get('map')
            if target_map == "Any":
                if t_map is None: filtered.append(task)
            else:
                if t_map and t_map.get('name') == target_map: 
                    filtered.append(task)
        
        filtered.sort(key=lambda x: x.get('name', ''))
        return filtered

    except Exception as e:
        print(f"SERVER ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/map-data/{map_name}")
async def get_map_data(map_name: str):
    """
    Proxy request to Tarkov API to get map data.
    Resolves CORS issues by making the request server-side.
    """
    try:
        headers = {
            "Content-Type": "application/json",
            "Accept-Encoding": "gzip, deflate", 
            "User-Agent": "TarkovRaidPlanner/2.1"
        }

        # Handle "The Lab" edge case for URL/Name matching if necessary, 
        # but the API usually expects specific names. 
        # The frontend sends the value from the select box.
        
        # Use the mapping to get the correct API name (e.g. "factory" -> "Factory", "the lab" -> "The Lab")
        api_map_name = MAP_MAPPING.get(map_name, map_name) # Fallback to original if not found
        
        # Robust normalization loop
        normalized_name = map_name
        for key, val in MAP_MAPPING.items():
            if key.lower() == map_name.lower():
                normalized_name = val
                break
        
        query_vars = {"name": [normalized_name]}
        
        timeout_config = httpx.Timeout(30.0, connect=10.0, read=30.0)

        async with httpx.AsyncClient(http2=False, timeout=timeout_config) as client:
            print(f"DEBUG: Fetching MAP data for {map_name}...")
            response = await client.post(
                TARKOV_API_URL, 
                json={'query': MAP_QUERY, 'variables': query_vars}, 
                headers=headers
            )
            response.raise_for_status()
            data = response.json()

            if "errors" in data:
                raise Exception(data['errors'][0]['message'])
            
            # Extract just the map data part
            maps_data = data.get("data", {}).get("maps", [])
            if not maps_data:
                # Return empty structure if not found/error-ish
                return {
                    "name": map_name,
                    "extracts": [],
                    "spawns": [],
                    "bosses": [],
                    "lootContainers": [],
                    "hazards": []
                }
            
            return maps_data[0]

    except Exception as e:
        print(f"MAP DATA ERROR: {e}")
        # Return empty structure on error to prevent frontend crash
        return {
            "name": map_name,
            "extracts": [],
            "spawns": [],
            "bosses": [],
            "lootContainers": [],
            "hazards": []
        }