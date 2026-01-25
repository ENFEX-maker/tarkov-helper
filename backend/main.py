from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import time
from typing import Optional

# ============================================================================
# TARKOV RAID PLANNER - Backend v3.0
# ============================================================================
# Endpoints:
#   GET /              - Health check
#   GET /quests/{map}  - Quest data (map_name or "ALL")
#   GET /map/{map}     - Map data proxy (extracts, spawns, bosses, loot)
#   GET /ammo          - All ammunition data with stats
# ============================================================================

app = FastAPI(title="Tarkov Raid Planner API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# CONFIGURATION
# ============================================================================

TARKOV_API_URL = "https://api.tarkov.dev/graphql"
CACHE_TTL = 300  # 5 minutes

# Cache storage
cache = {
    "quests": {"data": None, "timestamp": 0},
    "ammo": {"data": None, "timestamp": 0},
    "maps": {}  # keyed by map name
}

# Map name normalization
MAP_MAPPING = {
    "customs": "Customs",
    "factory": "Factory",
    "woods": "Woods",
    "interchange": "Interchange",
    "shoreline": "Shoreline",
    "reserve": "Reserve",
    "lighthouse": "Lighthouse",
    "streets of tarkov": "Streets of Tarkov",
    "streets": "Streets of Tarkov",
    "ground zero": "Ground Zero",
    "groundzero": "Ground Zero",
    "labs": "The Lab",
    "the lab": "The Lab",
    "any": "Any"
}

# ============================================================================
# GRAPHQL QUERIES
# ============================================================================

QUESTS_QUERY = """
{
    tasks {
        id
        name
        minPlayerLevel
        map { name }
        trader { name imageLink }
        neededKeys {
            keys { name shortName iconLink }
        }
        startRewards {
            items {
                item { id name iconLink }
                count
            }
        }
        objectives {
            description
            type
            ... on TaskObjectiveItem {
                item { id name iconLink }
                count
                foundInRaid
            }
            ... on TaskObjectiveMark {
                markerItem { id name iconLink }
            }
        }
        taskRequirements {
            task { id name }
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

AMMO_QUERY = """
{
    ammo {
        item {
            id
            name
            shortName
            iconLink
            avg24hPrice
            sellFor {
                price
                vendor { name }
            }
        }
        caliber
        damage
        penetrationPower
        armorDamage
        fragmentationChance
        ricochetChance
        tracer
        tracerColor
        projectileCount
    }
}
"""

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_http_client():
    """Create httpx client with robust settings for Tarkov API."""
    return httpx.AsyncClient(
        http2=False,  # Important: Tarkov API has issues with HTTP/2
        timeout=httpx.Timeout(60.0, connect=20.0, read=60.0),
        headers={
            "Content-Type": "application/json",
            "Accept-Encoding": "gzip, deflate",
            "User-Agent": "TarkovRaidPlanner/3.0"
        }
    )


def normalize_map_name(name: str) -> str:
    """Normalize map name to API-expected format."""
    lower = name.lower().strip()
    return MAP_MAPPING.get(lower, name)


def is_cache_valid(cache_entry: dict) -> bool:
    """Check if cache entry is still valid."""
    return (
        cache_entry.get("data") is not None and 
        (time.time() - cache_entry.get("timestamp", 0)) < CACHE_TTL
    )


# ============================================================================
# ENDPOINTS
# ============================================================================

@app.get("/")
def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "3.0.0",
        "message": "Tarkov Raid Planner Backend is running",
        "endpoints": ["/quests/{map}", "/map/{map}", "/ammo"]
    }


@app.get("/quests/{map_name}")
async def get_quests(map_name: str):
    """
    Get quests filtered by map.
    
    Args:
        map_name: Map name or "ALL" for all quests
    
    Returns:
        List of quest objects with derived_unlocks
    """
    try:
        # Check cache
        if is_cache_valid(cache["quests"]):
            all_tasks = cache["quests"]["data"]
            print(f"[QUESTS] Cache hit, {len(all_tasks)} tasks")
        else:
            print("[QUESTS] Fetching from Tarkov API...")
            async with get_http_client() as client:
                response = await client.post(
                    TARKOV_API_URL,
                    json={"query": QUESTS_QUERY}
                )
                response.raise_for_status()
                data = response.json()
                
                if "errors" in data:
                    raise Exception(data["errors"][0]["message"])
                
                all_tasks = data.get("data", {}).get("tasks", [])
                
                # Build unlocks map
                unlocks_map = {}
                for child_task in all_tasks:
                    reqs = child_task.get("taskRequirements") or []
                    for req in reqs:
                        if not req:
                            continue
                        parent = req.get("task")
                        if parent:
                            p_id = parent["id"]
                            if p_id not in unlocks_map:
                                unlocks_map[p_id] = []
                            
                            c_map = child_task.get("map")
                            c_trader = child_task.get("trader")
                            
                            unlocks_map[p_id].append({
                                "name": child_task.get("name", "Unknown"),
                                "map": c_map["name"] if c_map else "Global",
                                "trader": c_trader["name"] if c_trader else "?"
                            })
                
                # Add derived_unlocks to each task
                for task in all_tasks:
                    task["derived_unlocks"] = unlocks_map.get(task.get("id"), [])
                
                # Update cache
                cache["quests"]["data"] = all_tasks
                cache["quests"]["timestamp"] = time.time()
                print(f"[QUESTS] Fetched {len(all_tasks)} tasks")
        
        # Filter by map
        if map_name.upper() == "ALL":
            result = all_tasks
        else:
            target_map = normalize_map_name(map_name)
            result = []
            for task in all_tasks:
                t_map = task.get("map")
                if target_map == "Any":
                    if t_map is None:
                        result.append(task)
                else:
                    if t_map and t_map.get("name") == target_map:
                        result.append(task)
                    elif t_map is None:  # Global quests available on all maps
                        result.append(task)
        
        result.sort(key=lambda x: x.get("name", ""))
        return result
        
    except httpx.TimeoutException:
        print("[QUESTS] Timeout error")
        raise HTTPException(status_code=504, detail="Tarkov API timeout")
    except Exception as e:
        print(f"[QUESTS] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/map/{map_name}")
async def get_map_data(map_name: str):
    """
    Get map data (extracts, spawns, bosses, loot, hazards).
    
    Args:
        map_name: Map name to fetch
    
    Returns:
        Map data object with all POI information
    """
    try:
        normalized = normalize_map_name(map_name)
        cache_key = normalized.lower()
        
        # Check cache
        if cache_key in cache["maps"] and is_cache_valid(cache["maps"][cache_key]):
            print(f"[MAP] Cache hit for {normalized}")
            return cache["maps"][cache_key]["data"]
        
        print(f"[MAP] Fetching {normalized} from Tarkov API...")
        async with get_http_client() as client:
            response = await client.post(
                TARKOV_API_URL,
                json={
                    "query": MAP_QUERY,
                    "variables": {"name": [normalized]}
                }
            )
            response.raise_for_status()
            data = response.json()
            
            if "errors" in data:
                raise Exception(data["errors"][0]["message"])
            
            maps_data = data.get("data", {}).get("maps", [])
            
            if not maps_data:
                # Return empty structure if not found
                return {
                    "name": map_name,
                    "extracts": [],
                    "spawns": [],
                    "bosses": [],
                    "lootContainers": [],
                    "hazards": []
                }
            
            result = maps_data[0]
            
            # Update cache
            cache["maps"][cache_key] = {
                "data": result,
                "timestamp": time.time()
            }
            print(f"[MAP] Fetched {normalized}: {len(result.get('extracts', []))} extracts, {len(result.get('bosses', []))} bosses")
            
            return result
            
    except httpx.TimeoutException:
        print(f"[MAP] Timeout for {map_name}")
        raise HTTPException(status_code=504, detail="Tarkov API timeout")
    except Exception as e:
        print(f"[MAP] Error: {e}")
        # Return empty structure on error to prevent frontend crash
        return {
            "name": map_name,
            "extracts": [],
            "spawns": [],
            "bosses": [],
            "lootContainers": [],
            "hazards": []
        }


@app.get("/ammo")
async def get_ammo():
    """
    Get all ammunition data with stats.
    
    Returns:
        List of ammo objects grouped by caliber with tier calculations
    """
    try:
        # Check cache
        if is_cache_valid(cache["ammo"]):
            print("[AMMO] Cache hit")
            return cache["ammo"]["data"]
        
        print("[AMMO] Fetching from Tarkov API...")
        async with get_http_client() as client:
            response = await client.post(
                TARKOV_API_URL,
                json={"query": AMMO_QUERY}
            )
            response.raise_for_status()
            data = response.json()
            
            if "errors" in data:
                raise Exception(data["errors"][0]["message"])
            
            ammo_list = data.get("data", {}).get("ammo", [])
            
            # Calculate tier for each ammo based on penetration
            def calculate_tier(pen: int) -> str:
                if pen >= 55:
                    return "S"
                elif pen >= 45:
                    return "A"
                elif pen >= 35:
                    return "B"
                elif pen >= 25:
                    return "C"
                elif pen >= 15:
                    return "D"
                else:
                    return "F"
            
            # Process and enrich ammo data
            processed = []
            for ammo in ammo_list:
                if not ammo.get("item"):
                    continue
                    
                pen = ammo.get("penetrationPower", 0) or 0
                dmg = ammo.get("damage", 0) or 0
                
                # Get best sell price
                sell_for = ammo["item"].get("sellFor", []) or []
                best_price = 0
                best_vendor = "None"
                for sale in sell_for:
                    if sale.get("price", 0) > best_price:
                        best_price = sale["price"]
                        best_vendor = sale.get("vendor", {}).get("name", "Unknown")
                
                processed.append({
                    "id": ammo["item"]["id"],
                    "name": ammo["item"]["name"],
                    "shortName": ammo["item"].get("shortName", ammo["item"]["name"]),
                    "iconLink": ammo["item"].get("iconLink"),
                    "caliber": ammo.get("caliber", "Unknown"),
                    "damage": dmg,
                    "penetration": pen,
                    "armorDamage": ammo.get("armorDamage", 0) or 0,
                    "fragChance": ammo.get("fragmentationChance", 0) or 0,
                    "tracer": ammo.get("tracer", False),
                    "tracerColor": ammo.get("tracerColor"),
                    "projectileCount": ammo.get("projectileCount", 1) or 1,
                    "tier": calculate_tier(pen),
                    "price": ammo["item"].get("avg24hPrice", 0) or 0,
                    "sellPrice": best_price,
                    "sellVendor": best_vendor
                })
            
            # Sort by caliber, then by penetration (descending)
            processed.sort(key=lambda x: (x["caliber"], -x["penetration"]))
            
            # Group by caliber
            caliber_groups = {}
            for ammo in processed:
                cal = ammo["caliber"]
                if cal not in caliber_groups:
                    caliber_groups[cal] = []
                caliber_groups[cal].append(ammo)
            
            result = {
                "all": processed,
                "byCaliber": caliber_groups,
                "calibers": sorted(caliber_groups.keys()),
                "tierThresholds": {
                    "S": {"min": 55, "label": "S-Tier (55+ pen)", "color": "#ffd700"},
                    "A": {"min": 45, "label": "A-Tier (45-54 pen)", "color": "#c0c0c0"},
                    "B": {"min": 35, "label": "B-Tier (35-44 pen)", "color": "#cd7f32"},
                    "C": {"min": 25, "label": "C-Tier (25-34 pen)", "color": "#4a9e4a"},
                    "D": {"min": 15, "label": "D-Tier (15-24 pen)", "color": "#4a7a9e"},
                    "F": {"min": 0, "label": "F-Tier (<15 pen)", "color": "#9e4a4a"}
                }
            }
            
            # Update cache
            cache["ammo"]["data"] = result
            cache["ammo"]["timestamp"] = time.time()
            print(f"[AMMO] Fetched {len(processed)} ammo types in {len(caliber_groups)} calibers")
            
            return result
            
    except httpx.TimeoutException:
        print("[AMMO] Timeout error")
        raise HTTPException(status_code=504, detail="Tarkov API timeout")
    except Exception as e:
        print(f"[AMMO] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CACHE MANAGEMENT
# ============================================================================

@app.post("/cache/clear")
async def clear_cache():
    """Clear all caches."""
    global cache
    cache = {
        "quests": {"data": None, "timestamp": 0},
        "ammo": {"data": None, "timestamp": 0},
        "maps": {}
    }
    return {"status": "ok", "message": "Cache cleared"}
