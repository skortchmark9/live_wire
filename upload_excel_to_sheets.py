#!/usr/bin/env python3
"""
Script to directly upload Excel file to Google Sheets and get calculated rate costs
"""
import os
import sys
from pathlib import Path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload
import time

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file']

def authenticate_google():
    """Authenticate and return Google Sheets and Drive services"""
    creds = None
    
    # Token file stores the user's access and refresh tokens
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    
    # If there are no (valid) credentials available, let the user log in
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists('credentials.json'):
                print("❌ Error: credentials.json not found!")
                return None, None
                
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Save the credentials for the next run
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    
    try:
        sheets_service = build('sheets', 'v4', credentials=creds)
        drive_service = build('drive', 'v3', credentials=creds)
        return sheets_service, drive_service
    except HttpError as err:
        print(f"❌ Error building service: {err}")
        return None, None

def upload_excel_to_drive(drive_service, file_path, title, folder_id=None):
    """Upload Excel file to Google Drive and convert to Google Sheets"""
    print(f"Uploading {file_path} to Google Drive...")
    
    file_metadata = {
        'name': title,
        'mimeType': 'application/vnd.google-apps.spreadsheet'  # Convert to Google Sheets
    }
    
    # Add to specific folder if provided
    if folder_id:
        file_metadata['parents'] = [folder_id]
        print(f"  Adding to folder: {folder_id}")
    
    media = MediaFileUpload(
        file_path,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        resumable=True
    )
    
    try:
        file = drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id,webViewLink'
        ).execute()
        
        spreadsheet_id = file.get('id')
        web_link = file.get('webViewLink')
        
        print(f"✅ Uploaded successfully!")
        print(f"📊 Spreadsheet URL: {web_link}")
        
        return spreadsheet_id
        
    except HttpError as err:
        print(f"❌ Error uploading file: {err}")
        return None

def get_calculated_rates(sheets_service, spreadsheet_id):
    """Get the calculated rate costs from Google Sheets"""
    print("\nWaiting for formulas to calculate...")
    time.sleep(5)  # Give Google Sheets time to calculate formulas
    
    print("Fetching calculated rate costs...")
    
    # Define the cells to read
    ranges = [
        'RATE SUMMARY!F17',  # EL1
        'RATE SUMMARY!I17',  # Time of Use
        'RATE SUMMARY!L17',  # Smart Energy Plan
        'RATE SUMMARY!O17',  # Select Pricing Plan
        'RATE SUMMARY!R17',  # Standby
    ]
    
    rate_names = ['EL1', 'Time of Use', 'Smart Energy Plan', 'Select Pricing Plan', 'Standby']
    
    try:
        # Batch get all values
        result = sheets_service.spreadsheets().values().batchGet(
            spreadsheetId=spreadsheet_id,
            ranges=ranges
        ).execute()
        
        print("\n" + "=" * 60)
        print("📊 CALCULATED RATE COSTS (from Google Sheets)")
        print("=" * 60)
        
        costs = {}
        for i, value_range in enumerate(result.get('valueRanges', [])):
            values = value_range.get('values', [[]])[0] if value_range.get('values') else []
            rate_name = rate_names[i]
            
            if values:
                try:
                    # Remove $ and commas if present
                    cost_str = str(values[0]).replace('$', '').replace(',', '')
                    cost = float(cost_str)
                    costs[rate_name] = cost
                    print(f"{rate_name:22} ${cost:,.2f}")
                except (ValueError, IndexError):
                    print(f"{rate_name:22} {values[0] if values else '(no value)'}")
            else:
                print(f"{rate_name:22} (no value)")
        
        print("=" * 60)
        
        # Find best rate
        if costs:
            best_rate = min(costs.items(), key=lambda x: x[1])
            worst_rate = max(costs.items(), key=lambda x: x[1])
            
            print(f"\n💰 BEST RATE:  {best_rate[0]} at ${best_rate[1]:,.2f}")
            print(f"💸 WORST RATE: {worst_rate[0]} at ${worst_rate[1]:,.2f}")
            
            savings = worst_rate[1] - best_rate[1]
            print(f"\n🎯 Potential savings: ${savings:,.2f} per year")
            print(f"   ({(savings/worst_rate[1]*100):.1f}% reduction from worst to best)")
        
        return costs
        
    except HttpError as err:
        print(f"❌ Error fetching rates: {err}")
        return None

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Upload Excel directly to Google Sheets')
    parser.add_argument('--file', default='demo_sheet_filled.xlsx',
                       help='Excel file to upload (default: demo_sheet_filled.xlsx)')
    parser.add_argument('--name', default=None,
                       help='Name for the Google Sheet (default: auto-generated)')
    parser.add_argument('--folder', default='1f86cWxqcSF57icLWyCStxgPWczz_FVvc',
                       help='Google Drive folder ID (default: 1f86cWxqcSF57icLWyCStxgPWczz_FVvc)')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.file):
        print(f"❌ Error: File {args.file} not found!")
        sys.exit(1)
    
    print("=" * 60)
    print("Excel to Google Sheets Direct Uploader")
    print("=" * 60)
    print()
    
    # Authenticate
    sheets_service, drive_service = authenticate_google()
    if not sheets_service or not drive_service:
        print("❌ Failed to authenticate with Google")
        sys.exit(1)
    
    # Upload Excel file directly
    sheet_name = args.name or f"ConEd Rates - {Path(args.file).stem}"
    spreadsheet_id = upload_excel_to_drive(drive_service, args.file, sheet_name, args.folder)
    
    if not spreadsheet_id:
        print("❌ Failed to upload spreadsheet")
        sys.exit(1)
    
    # Get calculated rates
    costs = get_calculated_rates(sheets_service, spreadsheet_id)
    
    if costs:
        print("\n✅ Complete! The rates have been calculated in Google Sheets.")
    else:
        print("\n⚠️ Data uploaded but couldn't fetch calculated rates")

if __name__ == "__main__":
    main()