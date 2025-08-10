#!/usr/bin/env python3
"""
Main script for ConEd Rate Calculator
Downloads template, fetches ConEd data, fills template, uploads to Google Drive
"""
import asyncio
import argparse
import getpass
import os
from datetime import datetime
from pathlib import Path

# from coned_client import ConEdClient  # Not used - using rates_api.py instead
from google_drive_client import GoogleDriveClient
from excel_processor import ExcelProcessor
from rate_calculator import RateCalculator


async def process_coned_rates(
    username: str,
    password: str,
    template_id: str,
    folder_id: str,
    start_date: datetime,
    end_date: datetime,
    output_name: str = None
):
    """Main processing function"""
    
    # Initialize Google Drive client
    print("=" * 60)
    print("ConEd Rate Calculator")
    print("=" * 60)
    print("\nInitializing Google Drive client...")
    google_client = GoogleDriveClient()
    
    # Download template
    print(f"\nDownloading template from Google Drive...")
    template_path = "template.xlsx"
    if not google_client.download_sheet_as_excel(template_id, template_path):
        raise Exception("Failed to download template")
    
    # Fetch ConEd data
    print("\n" + "=" * 40)
    print("STEP 1: Fetching ConEd Data")
    print("=" * 40)
    
    async with ConEdClient(username, password) as coned:
        await coned.authenticate()
        account, account_id = await coned.get_electric_account()
        data_points = await coned.fetch_usage_data(account, start_date, end_date)
    
    if not data_points:
        raise Exception("Failed to fetch ConEd data")
    
    # Fill template with data
    print("\n" + "=" * 40)
    print("STEP 2: Filling Template")
    print("=" * 40)
    
    output_path = "filled_rates.xlsx"
    filled_count = ExcelProcessor.fill_template(
        template_path, 
        output_path, 
        data_points, 
        username, 
        account_id
    )
    
    # Upload to Google Drive
    print("\n" + "=" * 40)
    print("STEP 3: Uploading to Google Drive")
    print("=" * 40)
    
    sheet_name = output_name or f"ConEd Rates - {username} - {datetime.now().strftime('%Y-%m-%d')}"
    spreadsheet_id = google_client.upload_excel_as_sheet(output_path, sheet_name, folder_id)
    
    if not spreadsheet_id:
        raise Exception("Failed to upload to Google Drive")
    
    # Get calculated rates
    print("\n" + "=" * 40)
    print("STEP 4: Getting Calculated Rates")
    print("=" * 40)
    
    costs = RateCalculator.get_calculated_rates(google_client, spreadsheet_id)
    
    # Clean up temporary files
    if os.path.exists(template_path):
        os.remove(template_path)
    if os.path.exists(output_path):
        os.remove(output_path)
    
    print("\n" + "=" * 60)
    print("✅ COMPLETE!")
    print(f"Fetched {len(data_points)} data points")
    print(f"Filled {filled_count} rows in Excel")
    print("=" * 60)
    
    return costs


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(description='ConEd Rate Calculator - Full Pipeline')
    parser.add_argument('--template-id', default='1O08jgc4Zmg0UACKCK_j-9xzcnPdAMy9BOlA21Gzbm1k',
                       help='Google Drive file ID of the template sheet (default: your template)')
    parser.add_argument('--folder-id', default='1f86cWxqcSF57icLWyCStxgPWczz_FVvc',
                       help='Google Drive folder ID for output (default: your folder)')
    parser.add_argument('--start-date', default='2024-08-01',
                       help='Start date for data (YYYY-MM-DD, default: 2024-08-01)')
    parser.add_argument('--end-date', default='2025-07-31',
                       help='End date for data (YYYY-MM-DD, default: 2025-07-31)')
    parser.add_argument('--output-name', default=None,
                       help='Name for output sheet (default: auto-generated)')
    
    args = parser.parse_args()
    
    # Parse dates
    start_date = datetime.strptime(args.start_date, '%Y-%m-%d')
    end_date = datetime.strptime(args.end_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
    
    print("=" * 60)
    print("ConEd Rate Calculator - Full Pipeline")
    print("=" * 60)
    print(f"\nTemplate ID: {args.template_id}")
    print(f"Output Folder: {args.folder_id}")
    print(f"Date Range: {start_date.date()} to {end_date.date()}")
    print(f"Expected data points: ~{(end_date - start_date).days * 96} (96 per day)")
    
    # Get ConEd credentials
    username = input("\nEnter ConEd username: ")
    password = getpass.getpass("Enter ConEd password: ")
    
    # Run the async process
    try:
        asyncio.run(process_coned_rates(
            username,
            password,
            args.template_id,
            args.folder_id,
            start_date,
            end_date,
            args.output_name
        ))
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())