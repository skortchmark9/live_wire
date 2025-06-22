import logging
from datetime import datetime, timedelta, date

logger = logging.getLogger(__name__)


# Shared weather data store
weather_data_store = {
    "data": None,
    "last_updated": None,
    "update_interval_hours": 6,
    "is_updating": False
}


async def update_weather_data():
    """Background task to update weather data"""
    global weather_data_store
    
    if weather_data_store["is_updating"]:
        logger.info("Weather update already in progress")
        return
    
    weather_data_store["is_updating"] = True
    logger.info("Updating weather data...")
    from data_collectors.weather_collector import collect_weather_data_full

    try:
        result = collect_weather_data_full()
        weather_data_store["last_updated"] = datetime.now()
        weather_data_store["data"] = result
    finally:
        weather_data_store["is_updating"] = False

    return weather_data_store['update_interval_hours']

def get_stored_weather_data():
    """Get the current stored weather data"""
    global weather_data_store
    return weather_data_store["data"] if weather_data_store["data"] else None
