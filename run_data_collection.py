#!/usr/bin/env python3
"""
Combined script to run both electricity and weather data collection.
This makes it easier to collect all the data needed for the dashboard.
"""

import subprocess
import sys
from pathlib import Path


def run_script(script_name: str, description: str):
    """Run a Python script and handle errors."""
    print(f"\n{'='*50}")
    print(f"Running {description}...")
    print(f"{'='*50}")
    
    try:
        result = subprocess.run([sys.executable, script_name], check=True, capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print("Warnings:", result.stderr)
        print(f"✅ {description} completed successfully!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed!")
        print("Error output:", e.stderr)
        print("Standard output:", e.stdout)
        return False


def main():
    print("🔌 Live Wire - Data Collection Runner")
    print("This script will collect both electricity usage and weather data.")
    
    # Check if scripts exist
    scripts = [
        ("data_collector.py", "Electricity Data Collection"),
        ("weather_collector.py", "Weather Data Collection")
    ]
    
    for script_name, description in scripts:
        if not Path(script_name).exists():
            print(f"❌ {script_name} not found!")
            sys.exit(1)
    
    print("\n📋 Found all required scripts. Starting data collection...")
    
    # Run data collection scripts
    success_count = 0
    for script_name, description in scripts:
        if run_script(script_name, description):
            success_count += 1
    
    print(f"\n{'='*50}")
    print(f"Data Collection Summary")
    print(f"{'='*50}")
    print(f"✅ Successful: {success_count}/{len(scripts)}")
    
    if success_count == len(scripts):
        print("🎉 All data collection completed successfully!")
        print("\nNext steps:")
        print("1. cd electricity-tracker")
        print("2. npm run dev")
        print("3. Open http://localhost:3000 to view your dashboard")
    else:
        print("⚠️  Some data collection failed. Check the error messages above.")
        sys.exit(1)


if __name__ == "__main__":
    main()