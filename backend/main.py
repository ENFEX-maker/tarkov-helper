from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware # <--- NEU
import requests

app = FastAPI(title="Tarkov Helper API", version="0.2.0")

# --- CORS KONFIGURATION (NEU) ---
# Das erlaubt Zugriff von überall (für Entwicklung okay).
# In Production würde man hier später nur die echte Domain eintragen.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In Produktion später auf deine Domain einschränken!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --------------------------------
# Die URL der Tarkov Community API
TARKOV_API_URL = "https://api.tarkov.dev/graphql"

def run_query(query: str):
    """
    Hilfsfunktion, die die Anfrage an Tarkov.dev schickt.
    """
    headers = {"Content-Type": "application/json"}
    response = requests.post(TARKOV_API_URL, headers=headers, json={'query': query})
    
    if response.status_code == 200:
        return response.json()
    else:
        # Falls die Tarkov-API down ist, werfen wir einen Fehler
        raise Exception(f"Query failed with code {response.status_code}")

@app.get("/")
def read_root():
    return {"Status": "Online", "Message": "Geh auf /docs für die API Dokumentation"}

@app.get("/quests/{map_name}")
def get_quests_by_map(map_name: str):
    """
    Holt alle Quests für eine bestimmte Map (z.B. 'Customs', 'Woods').
    """
    # GraphQL Query: Wir filtern NICHT hier (API kann das nur begrenzt), 
    # sondern holen Quests und filtern im Python-Code (einfacher für den Anfang).
    # Wir holen: Quest Name, Händler, Map und Wiki-Link.
    query = """
    {
        tasks(lang: en) {
            name
            trader {
                name
            }
            map {
                name
            }
            wikiLink
        }
    }
    """
    
    try:
        data = run_query(query)
        all_tasks = data["data"]["tasks"]
        
        # Jetzt filtern wir in Python nach der Map, die der User eingegeben hat.
        # Wir machen alles kleingeschrieben (.lower()), damit 'customs' und 'Customs' funktionieren.
        filtered_tasks = []
        
        for task in all_tasks:
            # Manche Quests haben keine Map (sind 'null'), die überspringen wir
            if task["map"] and task["map"]["name"].lower() == map_name.lower():
                filtered_tasks.append(task)
                
        return {
            "map": map_name,
            "count": len(filtered_tasks),
            "quests": filtered_tasks
        }

    except Exception as e:
        # HTTP 500 = Server Error
        raise HTTPException(status_code=500, detail=str(e))