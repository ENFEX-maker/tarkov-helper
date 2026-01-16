from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests

app = FastAPI(title="Tarkov Helper API", version="0.3.0")

# --- CORS KONFIGURATION ---
# Erlaubt Zugriff vom Frontend (inkl. Cookies/Credentials)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://tarkov.marcel-kopplin.de", "http://localhost"], # Localhost für Tests erlaubt
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Die URL der Tarkov Community API
TARKOV_API_URL = "https://api.tarkov.dev/graphql"

def run_query(query: str):
    headers = {"Content-Type": "application/json"}
    response = requests.post(TARKOV_API_URL, json={'query': query}, headers=headers)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Query failed to run by returning code of {response.status_code}. {query}")

# --- NEUE, MÄCHTIGE QUERY ---
def get_quests_query(map_name: str):
    # Wir holen jetzt:
    # 1. neededKeys: Welche Schlüssel brauche ich?
    # 2. objectives: Wo muss ich hin (Zones) und was muss ich holen (Items)?
    # 3. minPlayerLevel: Ab wann kann ich das machen?
    return f"""
    {{
        tasks(map: {map_name}) {{
            id
            name
            minPlayerLevel
            wikiLink
            trader {{
                name
            }}
            # Was brauche ich dafür? (Schlüssel)
            neededKeys {{
                keys {{
                    name
                    shortName
                    iconLink
                }}
            }}
            # Was muss ich tun? (Töten, Finden, Markieren)
            objectives {{
                description
                type
                # Wenn es ein Ort ist (für deine Karte später)
                ... on TaskObjectiveZone {{
                    zone {{
                        position {{
                            x
                            y
                            z
                        }}
                    }}
                }}
                # Wenn wir ein Item brauchen (Found in Raid etc.)
                ... on TaskObjectiveItem {{
                    item {{
                        name
                        iconLink
                    }}
                    count
                    foundInRaid
                }}
                # Wenn wir was markieren müssen
                ... on TaskObjectiveMark {{
                    markerItem {{
                        name
                    }}
                }}
            }}
        }}
    }}
    """

@app.get("/quests/{map_name}")
def get_quests(map_name: str):
    # API nutzt teils spezifische Namen, wir reichen den String direkt durch
    # (Frontend muss "Customs", "Factory" etc. sauber senden)
    query = get_quests_query(map_name)
    
    try:
        result = run_query(query)
        # Kleiner Check, ob die API Daten liefert
        if "data" not in result or "tasks" not in result["data"]:
             return []
        return result["data"]["tasks"]
    except Exception as e:
        print(f"Error fetching quests: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Health Check (immer gut zu haben)
@app.get("/")
def read_root():
    return {"status": "ok", "version": "0.3.0 - Data Upgrade"}