#!/usr/bin/env python3
"""
Weather data collector using free weather APIs.
Collects historical weather data for NYC to correlate with electricity usage.
"""

import sys
from pathlib import Path

# Import the weather collector module
from data_collectors.weather_collector import collect_weather_data_full


def main():
    # Output file path
    output_file = Path("electricity-tracker/public/data/weather_data.json")
    
    try:
        result = collect_weather_data_full(output_file)
        
        if result["status"] == "success":
            print(f"✅ Weather collection completed successfully!")
            print(f"Total records: {result['total_records']}")
            print(f"Historical records: {result['historical_records']}")
            print(f"Current/forecast records: {result['current_forecast_records']}")
            print(f"Date range: {result['date_range']}")
            print(f"Data saved to: {result['output_file']}")
        else:
            print(f"❌ Weather collection failed: {result.get('error', 'Unknown error')}")
            sys.exit(1)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()