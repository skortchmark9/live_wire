"""
Google Drive Client Module
"""
import os
import io
import json
from typing import Optional
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']


class GoogleDriveClient:
    """Client for Google Drive and Sheets operations with OAuth authentication"""
    
    def __init__(self, credentials_path: str = 'rates/credentials.json', token_path: str = 'rates/token.json'):
        """
        Initialize Google Drive client with OAuth authentication
        
        Args:
            credentials_path: Path to OAuth client credentials JSON file
            token_path: Path to token JSON file (for local development)
        """
        self.credentials_path = credentials_path
        self.token_path = token_path
        self.sheets_service = None
        self.drive_service = None
        self._authenticate()
    
    def _authenticate(self):
        """Authenticate and build Google services using OAuth"""
        creds = None
        
        # Check for Railway environment variables first
        refresh_token = os.getenv('GOOGLE_OAUTH_REFRESH_TOKEN')
        client_id = os.getenv('GOOGLE_CLIENT_ID')
        client_secret = os.getenv('GOOGLE_CLIENT_SECRET')
        
        if refresh_token and client_id and client_secret:
            # Railway/production environment - use environment variables
            print("Using OAuth credentials from environment variables")
            creds = Credentials(
                token=None,  # Will be refreshed
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret,
                scopes=SCOPES
            )
            # Refresh to get a valid access token
            creds.refresh(Request())
            
        else:
            # Local development - use file-based OAuth flow
            print("Using OAuth credentials from local files")
            
            # Load existing token if available
            if os.path.exists(self.token_path):
                creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
            
            # If there are no valid credentials, initiate the OAuth flow
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    print("Refreshing expired OAuth token...")
                    creds.refresh(Request())
                else:
                    if not os.path.exists(self.credentials_path):
                        raise FileNotFoundError(
                            f"OAuth credentials file not found: {self.credentials_path}. "
                            f"Either provide the file or set environment variables: "
                            f"GOOGLE_OAUTH_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET"
                        )
                    
                    print("Starting OAuth flow...")
                    flow = InstalledAppFlow.from_client_secrets_file(
                        self.credentials_path, SCOPES)
                    creds = flow.run_local_server(port=0)
                
                # Save the credentials for the next run
                with open(self.token_path, 'w') as token:
                    token.write(creds.to_json())
                    print(f"OAuth token saved to {self.token_path}")
        
        # Build services
        self.sheets_service = build('sheets', 'v4', credentials=creds)
        self.drive_service = build('drive', 'v3', credentials=creds)
        print("✅ Google API services initialized successfully")
    
    def download_sheet_as_excel(self, file_id: str, output_path: str) -> bool:
        """Download a Google Sheet as Excel file"""
        try:
            # First, try to get file metadata to check if we have access
            try:
                file_metadata = self.drive_service.files().get(fileId=file_id).execute()
                print(f"Found file: {file_metadata.get('name', 'Unknown')}")
            except HttpError as e:
                if e.resp.status == 404:
                    print(f"❌ File not found. Check if the file ID is correct: {file_id}")
                    print("Make sure the file is shared with your Google account or made public.")
                    return False
                raise
            
            # Export as Excel
            request = self.drive_service.files().export_media(
                fileId=file_id,
                mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            
            done = False
            while not done:
                status, done = downloader.next_chunk()
            
            # Write to file
            fh.seek(0)
            with open(output_path, 'wb') as f:
                f.write(fh.read())
            
            print(f"✅ Downloaded template to: {output_path}")
            return True
            
        except HttpError as error:
            print(f"❌ Error downloading file: {error}")
            if error.resp.status == 403:
                print("Permission denied. Make sure the file is shared with your Google account.")
            return False
    
    def upload_excel_as_sheet(self, file_path: str, title: str, folder_id: str) -> Optional[str]:
        """Upload Excel file to Google Drive and convert to Sheets"""
        print(f"Uploading {file_path} to Google Drive...")
        
        file_metadata = {
            'name': title,
            'mimeType': 'application/vnd.google-apps.spreadsheet',
            'parents': [folder_id]
        }
        
        media = MediaFileUpload(
            file_path,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            resumable=True
        )
        
        try:
            file = self.drive_service.files().create(
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
    
    def get_sheet_values(self, spreadsheet_id: str, ranges: list) -> dict:
        """Get values from multiple ranges in a Google Sheet"""
        try:
            result = self.sheets_service.spreadsheets().values().batchGet(
                spreadsheetId=spreadsheet_id,
                ranges=ranges
            ).execute()
            
            return result.get('valueRanges', [])
            
        except HttpError as err:
            print(f"❌ Error fetching values: {err}")
            return []