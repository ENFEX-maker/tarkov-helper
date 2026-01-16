from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests

app = FastAPI(title="Tarkov Helper API", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    # HIER BITTE DEINE DOMAIN EINTRAGEN WENN FINAL, SONST "*"
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TARKOV_API_URL = "https://api.tarkov.dev/graphql"

def run_query(query: str):
    headers = {"Content-Type": "application/json"}
    # Achte auf das Komma nach headers und die schließende Klammer am Ende!
    response = requests.post(TARKOV_API_URL, json={'query': query}, headers=headers, timeout=30)
    
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Query failed: {response.status_code}")

def get_quests_query(map_name: str):
    # Map-Name Mapping (API erwartet Enum, meistens Großbuchstaben am Anfang)
    # Wir machen es sicherheitshalber robust.
    return f"""
    {{
        tasks(map: {map_name}) {{
            id
            name
            wikiLink
            minPlayerLevel
            trader {{
                name
            }}
            # Schlüssel, die man BRAUCHT (nicht optional)
            neededKeys {{
                keys {{
                    name
                    shortName
                }}
            }}
            # Ziele (Töten, Finden, Platzieren)
            objectives {{
                description
                type
                # Wir holen nur Items und Zonen, das ist stabil
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
        # Sicherstellen, dass Map-Name passt (Customs -> Customs)
        clean_map_name = map_name.capitalize() 
        query = get_quests_query(clean_map_name)
        
        result = run_query(query)
        
        if "data" in result and result["data"]["tasks"]:
            return result["data"]["tasks"]
        else:
            # Fallback: Leere Liste statt Fehler, damit Frontend nicht crasht
            return []
            
    except Exception as e:
        print(f"Server Error: {e}")
        # Wichtig: Wir geben trotzdem eine leere Liste zurück, oder eine definierte Fehlermeldung
        # Damit dein Frontend nicht "undefined" bekommt.
        raise HTTPException(status_code=500, detail=str(e))