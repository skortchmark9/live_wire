#!/usr/bin/env python3
"""
Weather data collector using free weather APIs.
Collects historical weather data for NYC to correlate with electricity usage.
"""

import json
import requests
from datetime import datetime, timedelta, date
from pathlib import Path
import time


def get_historical_weather(start_date: date, end_date: date, latitude: float = 40.7589, longitude: float = -73.9851):
    """
    Get historical weather data for NYC using Open-Meteo API (free).
    
    Args:
        start_date: Start date for weather data
        end_date: End date for weather data
        latitude: Latitude for NYC (default: Central Park)
        longitude: Longitude for NYC (default: Central Park)
    
    Returns:
        List of weather data points
    """
    
    # Open-Meteo API - free historical weather data
    base_url = "https://archive-api.open-meteo.com/v1/archive"
    
    all_weather_data = []
    current_date = start_date
    
    # API allows up to 1 year of data per request, but we'll chunk by month for reliability
    while current_date < end_date:
        # Get one month at a time
        month_end = min(
            current_date.replace(day=28) + timedelta(days=4),  # End of month
            end_date
        )
        month_end = month_end.replace(day=min(month_end.day, 28))  # Handle month boundaries
        
        print(f"Collecting weather data from {current_date} to {month_end}")
        
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "start_date": current_date.isoformat(),
            "end_date": month_end.isoformat(),
            "hourly": [
                "temperature_2m",
                "relative_humidity_2m", 
                "apparent_temperature",
                "precipitation",
                "cloud_cover",
                "wind_speed_10m"
            ],
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "America/New_York"
        }
        
        try:
            response = requests.get(base_url, params=params)
            response.raise_for_status()
            data = response.json()
            
            # Process hourly data
            hourly = data.get("hourly", {})
            times = hourly.get("time", [])
            
            for i, time_str in enumerate(times):
                weather_point = {
                    "timestamp": time_str,
                    "temperature_f": hourly.get("temperature_2m", [])[i] if i < len(hourly.get("temperature_2m", [])) else None,
                    "apparent_temperature_f": hourly.get("apparent_temperature", [])[i] if i < len(hourly.get("apparent_temperature", [])) else None,
                    "humidity_percent": hourly.get("relative_humidity_2m", [])[i] if i < len(hourly.get("relative_humidity_2m", [])) else None,
                    "precipitation_inch": hourly.get("precipitation", [])[i] if i < len(hourly.get("precipitation", [])) else None,
                    "cloud_cover_percent": hourly.get("cloud_cover", [])[i] if i < len(hourly.get("cloud_cover", [])) else None,
                    "wind_speed_mph": hourly.get("wind_speed_10m", [])[i] if i < len(hourly.get("wind_speed_10m", [])) else None
                }
                all_weather_data.append(weather_point)
                
        except Exception as e:
            print(f"Error collecting weather data for {current_date} to {month_end}: {e}")
            
        # Move to next month
        current_date = month_end + timedelta(days=1)
        
        # Rate limiting - be nice to free API
        time.sleep(1)
    
    return all_weather_data


def main():
    # Date range should match electricity data collection
    START_DATE = date(2023, 1, 1)  # Adjust to match your electricity data
    END_DATE = date.today()
    
    print(f"Collecting weather data for NYC from {START_DATE} to {END_DATE}")
    
    try:
        weather_data = get_historical_weather(START_DATE, END_DATE)
        
        # Save to JSON file
        output_file = Path("electricity-tracker/public/data/weather_data.json")
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_file, 'w') as f:
            json.dump({
                "metadata": {
                    "collection_date": datetime.now().isoformat(),
                    "start_date": START_DATE.isoformat(),
                    "end_date": END_DATE.isoformat(),
                    "total_records": len(weather_data),
                    "location": "NYC (Central Park)",
                    "source": "Open-Meteo Archive API"
                },
                "data": weather_data
            }, f, indent=2)
        
        print(f"Successfully collected {len(weather_data)} weather data points")
        print(f"Data saved to {output_file}")
        
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()