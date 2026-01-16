from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
import json
import logging

# Logging Setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Tarkov Helper API", version="1.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TARKOV_API_URL = "https://api.tarkov.dev/graphql"

# Map Name Mapping (Frontend -> API Enum)
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
    try:
        # Timeout increased to 30s to prevent 502s on slow API
        response = requests.post(TARKOV_API_URL, json={'query': query}, headers=headers, timeout=30)
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"API Request failed with code {response.status_code}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Network error contacting Tarkov API: {e}")
        raise Exception("Failed to contact Tarkov API")

def get_all_quests_query():
    # Fetching all tasks + images
    return """
    {
        tasks {
            id
            name
            wikiLink
            minPlayerLevel
            map { name }
            trader { name imageLink }
            neededKeys {
                keys { name shortName iconLink }
            }
            objectives {
                description
                type
                ... on TaskObjectiveItem {
                    item { name iconLink }
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
        logger.info(f"Received request for map: {map_name}")
        
        # 1. Fetch ALL quests
        query = get_all_quests_query()
        result = run_query(query)
        
        # Check for GraphQL errors
        if "errors" in result:
            logger.error(f"GraphQL Error: {result['errors']}")
            raise HTTPException(status_code=500, detail="Tarkov API Error")

        # 2. Filter Logic
        target_map = MAP_MAPPING.get(map_name, map_name)
        
        filtered_tasks = []
        all_tasks = result.get("data", {}).get("tasks", [])
        
        logger.info(f"Loaded {len(all_tasks)} total quests. Filtering for: {target_map}")

        for task in all_tasks:
            # Check if task belongs to the requested map
            if task.get('map') and task['map'].get('name') == target_map:
                filtered_tasks.append(task)
        
        logger.info(f"Returning {len(filtered_tasks)} quests for {target_map}")
        return filtered_tasks

    except Exception as e:
        logger.error(f"CRITICAL SERVER ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))