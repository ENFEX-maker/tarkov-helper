from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
import json

app = FastAPI(title="Tarkov Helper API", version="0.6.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TARKOV_API_URL = "https://api.tarkov.dev/graphql"

# Mapping ist immer noch gut, um später saubere Namen zu haben
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
    # Timeout auf 30s lassen, sicher ist sicher
    response = requests.post(TARKOV_API_URL, json={'query': query}, headers=headers, timeout=30)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"API Request failed with code {response.status_code}")

def get_all_quests_query():
    # WICHTIG: Keine Argumente mehr bei tasks()! Wir laden alles.
    # Wir holen 'map { name }' um selbst zu filtern.
    return """
    {
        tasks {
            id
            name
            wikiLink
            minPlayerLevel
            # Hier holen wir die Map Info direkt vom Task
            map {
                name
            }
            trader {
                name
            }
            neededKeys {
                keys {
                    name
                    shortName
                }
            }
            objectives {
                description
                type
                # Wir entfernen TaskObjectiveZone (das gab den Fehler)
                # und nehmen nur Items, das ist stabil.
                ... on TaskObjectiveItem {
                    item {
                        name
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
        # 1. Wir holen ALLE Quests (egal welche Map)
        query = get_all_quests_query()
        result = run_query(query)
        
        # API Fehler abfangen
        if "errors" in result:
            print(f"API ERROR: {json.dumps(result['errors'], indent=2)}")
            raise HTTPException(status_code=500, detail=f"Tarkov API Error: {result['errors'][0]['message']}")

        # 2. Wir filtern JETZT hier in Python (viel robuster!)
        target_map = MAP_MAPPING.get(map_name, map_name) # z.B. "Streets"
        
        filtered_tasks = []
        all_tasks = result.get("data", {}).get("tasks", [])
        
        print(f"DEBUG: Habe {len(all_tasks)} Quests geladen. Suche nach Map: '{target_map}'")

        for task in all_tasks:
            # Manchmal ist task['map'] null (für Quests die überall gehen), die ignorieren wir hier
            if task.get('map') and task['map'].get('name') == target_map:
                filtered_tasks.append(task)
        
        print(f"SUCCESS: {len(filtered_tasks)} Quests für {target_map} gefunden.")
        return filtered_tasks

    except Exception as e:
        print(f"CRITICAL SERVER ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))