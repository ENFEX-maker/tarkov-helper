from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
import json # Für schönes Logging

app = FastAPI(title="Tarkov Helper API", version="0.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TARKOV_API_URL = "https://api.tarkov.dev/graphql"

# --- WICHTIG: Übersetzungstabelle für Map-Namen ---
# Links: Was dein Frontend sendet. Rechts: Was die API verlangt.
MAP_MAPPING = {
    "Customs": "Customs",
    "Factory": "Factory",
    "Woods": "Woods",
    "Interchange": "Interchange",
    "Shoreline": "Shoreline",
    "Reserve": "Reserve",
    "Lighthouse": "Lighthouse",
    "Streets of Tarkov": "Streets", # API nennt es nur "Streets"
    "Ground Zero": "GroundZero",    # API schreibt es zusammen
    "Labs": "Laboratory"            # Falls du Labs mal brauchst
}

def run_query(query: str):
    headers = {"Content-Type": "application/json"}
    # Timeout auf 30s lassen, das war gut!
    response = requests.post(TARKOV_API_URL, json={'query': query}, headers=headers, timeout=30)
    
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"API Request failed with code {response.status_code}")

def get_quests_query(map_enum: str):
    # Hier nutzen wir den sauberen API-Namen (z.B. "Streets")
    return f"""
    {{
        tasks(map: {map_enum}) {{
            id
            name
            wikiLink
            minPlayerLevel
            trader {{
                name
            }}
            neededKeys {{
                keys {{
                    name
                    shortName
                }}
            }}
            objectives {{
                description
                type
                ... on TaskObjectiveItem {{
                    item {{
                        name
                    }}
                    count
                    foundInRaid
                }}
                ... on TaskObjectiveZone {{
                    zone {{
                        id
                    }}
                }}
            }}
        }}
    }}
    """

@app.get("/quests/{map_name}")
def get_quests(map_name: str):
    try:
        # 1. Map Namen übersetzen
        # Wenn der Name nicht in der Liste ist, nehmen wir ihn so wie er ist (Fallback)
        api_map_name = MAP_MAPPING.get(map_name, map_name)
        
        print(f"DEBUG: Frontend fragt '{map_name}', wir fragen API nach '{api_map_name}'")

        query = get_quests_query(api_map_name)
        result = run_query(query)
        
        # 2. Fehlerprüfung (Ganz wichtig!)
        if "errors" in result:
            print(f"API ERROR: {json.dumps(result['errors'], indent=2)}")
            # Wir werfen den Fehler, damit du ihn im Browser siehst (statt "Keine Quests")
            raise HTTPException(status_code=500, detail=f"Tarkov API Error: {result['errors'][0]['message']}")

        # 3. Datenprüfung
        if "data" in result and result["data"]["tasks"]:
            tasks = result["data"]["tasks"]
            print(f"SUCCESS: {len(tasks)} Quests gefunden.")
            return tasks
        else:
            print("WARNING: API lieferte 200 OK, aber keine Tasks (leere Liste).")
            return []
            
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"CRITICAL SERVER ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))