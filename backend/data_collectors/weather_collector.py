#!/usr/bin/env python3
"""
Weather data collection module using free weather APIs.
Collects historical weather data for NYC to correlate with electricity usage.
"""

import json
import requests
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import List, Dict
import time


def get_historical_weather(start_date: date, end_date: date, 
                         latitude: float = 40.7589, longitude: float = -73.9851) -> List[Dict]:
    """
    Get historical weather data for NYC using Open-Meteo API (free).
    Note: Archive API only goes up to ~7 days ago.
    
    Args:
        start_date: Start date for weather data
        end_date: End date for weather data (should be at least 7 days ago)
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


def get_current_and_forecast_weather(latitude: float = 40.7589, longitude: float = -73.9851) -> List[Dict]:
    """
    Get current weather (last 7 days) and forecast (next 7 days) using Open-Meteo API.
    
    Args:
        latitude: Latitude for NYC (default: Central Park)
        longitude: Longitude for NYC (default: Central Park)
    
    Returns:
        List of weather data points covering last 7 days + next 7 days
    """
    
    # Open-Meteo current + forecast API
    base_url = "https://api.open-meteo.com/v1/forecast"
    
    print("Collecting current weather and forecast data")
    
    params = {
        "latitude": latitude,
        "longitude": longitude,
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
        "timezone": "America/New_York",
        "past_days": 7,  # Include last 7 days
        "forecast_days": 30  # Include next 7 days
    }
    
    try:
        response = requests.get(base_url, params=params)
        response.raise_for_status()
        data = response.json()
        
        # Process hourly data
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        
        all_weather_data = []
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
            
        return all_weather_data
        
    except Exception as e:
        print(f"Error collecting current/forecast weather data: {e}")
        return []


def merge_weather_data(historical_data: List[Dict], current_forecast_data: List[Dict]) -> List[Dict]:
    """
    Merge historical and current/forecast weather data, removing duplicates.
    
    Args:
        historical_data: List of historical weather points
        current_forecast_data: List of current + forecast weather points
    
    Returns:
        Merged and deduplicated list of weather data points
    """
    
    # Create a set of existing timestamps from historical data
    historical_timestamps = {item['timestamp'] for item in historical_data}
    
    # Filter out duplicates from current/forecast data
    filtered_current = [
        item for item in current_forecast_data 
        if item['timestamp'] not in historical_timestamps
    ]
    
    # Merge and sort by timestamp
    all_data = historical_data + filtered_current
    all_data.sort(key=lambda x: x['timestamp'])
    
    return all_data


def collect_weather_data_full() -> Dict:
    """
    Full weather data collection including historical and current/forecast data.
    
    Returns:
        Dictionary with weather data and metadata
    """
    # Date range for recent data (last 30 days to current + forecast)
    start_date = (datetime.now() - timedelta(days=30)).date()
    historical_end_date = date.today() - timedelta(days=8)  # Stop 8 days ago for archive API
    
    print(f"Collecting weather data for NYC:")
    print(f"  Recent historical: {start_date} to {historical_end_date}")
    print(f"  Current + Forecast: last 7 days + next 7 days")
    
    try:
        # Get recent historical weather data
        historical_data = []
        if historical_end_date >= start_date:
            historical_data = get_historical_weather(start_date, historical_end_date)
            print(f"Collected {len(historical_data)} historical weather points")
        
        # Get current and forecast weather data (last 7 days + next 7 days)
        current_forecast_data = get_current_and_forecast_weather()
        print(f"Collected {len(current_forecast_data)} current/forecast weather points")
        
        # Merge the data
        all_weather_data = merge_weather_data(historical_data, current_forecast_data)
        
        # Calculate actual date range from merged data
        if all_weather_data:
            actual_start = min(item['timestamp'] for item in all_weather_data)[:10]  # YYYY-MM-DD
            actual_end = max(item['timestamp'] for item in all_weather_data)[:10]    # YYYY-MM-DD
        else:
            actual_start = start_date.isoformat()
            actual_end = date.today().isoformat()
        
        print(f"\nSuccessfully collected {len(all_weather_data)} total weather data points")
        print(f"Date range: {actual_start} to {actual_end}")
        
        return {
            "status": "success",
            "weather_data": all_weather_data,
            "metadata": {
                "collection_date": datetime.now().isoformat(),
                "start_date": actual_start,
                "end_date": actual_end,
                "total_records": len(all_weather_data),
                "location": "NYC (Central Park)",
                "sources": [
                    "Open-Meteo Archive API (historical)",
                    "Open-Meteo Forecast API (current + forecast)"
                ],
                "includes_forecast": True,
                "forecast_days": 7
            }
        }
        
    except Exception as e:
        print(f"Error: {e}")
        return {"status": "error", "error": str(e), "weather_data": []}