from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
import json

app = FastAPI(title="Tarkov Helper API", version="0.9.0")

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TARKOV_API_URL = "https://api.tarkov.dev/graphql"

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

def run_query(query: str):
    headers = {"Content-Type": "application/json"}
    # Timeout 30s
    response = requests.post(TARKOV_API_URL, json={'query': query}, headers=headers, timeout=30)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"API Request failed with code {response.status_code}")

def get_all_quests_query():
    # 'questItems' entfernt (gab es nicht). 
    # Dafür 'startRewards' hinzugefügt für Initial-Items (Marker, Poster etc.)
    return """
    {
        tasks {
            id
            name
            wikiLink
            minPlayerLevel
            map {
                name
            }
            trader {
                name
                imageLink
            }
            neededKeys {
                keys {
                    name
                    shortName
                    iconLink
                }
            }
            startRewards {
                items {
                    item {
                        name
                        iconLink
                    }
                    count
                }
            }
            objectives {
                description
                type
                ... on TaskObjectiveItem {
                    item {
                        name
                        iconLink
                    }
                    count
                    foundInRaid
                }
            }
        }
    }
    """

@app.get("/quests/{map_name}")
def get_quests(map_name: str):
    try:
        # 1. Alle Quests holen
        query = get_all_quests_query()
        result = run_query(query)
        
        if "errors" in result:
            print(f"API ERROR: {json.dumps(result['errors'], indent=2)}")
            raise HTTPException(status_code=500, detail=f"Tarkov API Error: {result['errors'][0]['message']}")

        # 2. Ziel-Map bestimmen
        target_map = MAP_MAPPING.get(map_name, map_name)
        
        filtered_tasks = []
        all_tasks = result.get("data", {}).get("tasks", [])
        
        print(f"DEBUG: Habe {len(all_tasks)} Quests geladen. Filter nach: '{target_map}'")

        # 3. Filtern in Python
        for task in all_tasks:
            # Sicherheitscheck: Hat die Quest eine Map?
            if task.get('map') and task['map'].get('name') == target_map:
                filtered_tasks.append(task)
        
        print(f"SUCCESS: {len(filtered_tasks)} Quests für {target_map} gefunden.")
        return filtered_tasks

    except Exception as e:
        print(f"CRITICAL SERVER ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))