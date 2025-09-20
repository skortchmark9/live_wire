"""
Data processor for ConEd downloads - unpack ZIP and parse PDF bills
"""
import os
import zipfile
import pandas as pd
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import PyPDF2
import re
from datetime import datetime


class ConEdDataProcessor:
    def __init__(self, download_dir: str = None):
        self.download_dir = download_dir or str(Path.home() / "Downloads" / "coned_bills")

    def parse_usage_zip(self, zip_path: str) -> Optional[pd.DataFrame]:
        """Parse usage data directly from ZIP file in memory"""
        print(f"Processing ZIP file: {zip_path}")

        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # Find CSV files in the ZIP
            csv_files = [f for f in zip_ref.namelist() if f.lower().endswith('.csv') and not f.startswith('__MACOSX')]

            if not csv_files:
                print("No CSV files found in ZIP")
                return None

            # Process the first CSV file found
            csv_filename = csv_files[0]
            print(f"Found CSV: {csv_filename}")

            # Read CSV content directly from ZIP
            with zip_ref.open(csv_filename) as csv_file:
                return self._parse_csv_content(csv_file, csv_filename)

    def _parse_csv_content(self, csv_file, filename: str) -> pd.DataFrame:
        """Parse CSV content from file-like object"""
        print(f"Parsing CSV: {filename}")

        # Try different encodings
        encodings = ['utf-8', 'latin-1', 'cp1252']

        for encoding in encodings:
            try:
                # Reset file pointer
                csv_file.seek(0)

                # Read all lines
                lines = csv_file.read().decode(encoding).splitlines()
                print(f"Successfully read CSV with {encoding} encoding")
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("Could not read CSV with any supported encoding")

        # Find the row that starts with "TYPE" (the actual header)
        data_start_row = None
        for i, line in enumerate(lines):
            if line.strip().startswith('TYPE'):
                data_start_row = i
                break

        if data_start_row is None:
            raise ValueError("Could not find data table header (TYPE column)")

        # Create StringIO from the data portion
        from io import StringIO
        csv_data = '\n'.join(lines[data_start_row:])
        df = pd.read_csv(StringIO(csv_data))

        print(f"✅ Parsed usage data: {len(df)} rows, {len(df.columns)} columns")
        print(f"Columns: {list(df.columns)}")

        # Show first few rows for verification
        if len(df) > 0:
            print("\nFirst few rows:")
            print(df.head())

        return df

    def parse_usage_csv(self, csv_path: str) -> pd.DataFrame:
        """Parse usage CSV data into DataFrame"""
        print(f"Parsing usage CSV: {os.path.basename(csv_path)}")

        # Try different encodings in case of encoding issues
        encodings = ['utf-8', 'latin-1', 'cp1252']

        # First, read all lines to find where the data table starts
        lines = []
        for encoding in encodings:
            try:
                with open(csv_path, 'r', encoding=encoding) as f:
                    lines = f.readlines()
                print(f"Successfully read CSV with {encoding} encoding")
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("Could not read CSV with any supported encoding")

        # Find the row that starts with "TYPE" (the actual header)
        data_start_row = None
        for i, line in enumerate(lines):
            if line.strip().startswith('TYPE'):
                data_start_row = i
                break

        if data_start_row is None:
            raise ValueError("Could not find data table header (TYPE column)")

        # Read the CSV starting from the data table
        df = pd.read_csv(csv_path, encoding=encoding, skiprows=data_start_row)

        print(f"✅ Parsed usage data: {len(df)} rows, {len(df.columns)} columns")
        print(f"Columns: {list(df.columns)}")

        # Show first few rows for verification
        if len(df) > 0:
            print("\nFirst few rows:")
            print(df.head())

        return df

    def extract_bill_text(self, pdf_path: str) -> str:
        """Extract text content from PDF bill"""
        print(f"Extracting text from PDF: {os.path.basename(pdf_path)}")

        text_content = ""
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)

            for page_num, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text()
                text_content += f"\n--- Page {page_num + 1} ---\n"
                text_content += page_text

        print(f"✅ Extracted text from {len(pdf_reader.pages)} pages")
        return text_content

    def parse_bill_data(self, pdf_path: str) -> Dict:
        """Parse key information from PDF bill"""
        print(f"Parsing bill data from: {os.path.basename(pdf_path)}")

        text = self.extract_bill_text(pdf_path)
        if not text:
            return {}

        # Dictionary to store parsed data
        bill_data = {
            'file_path': pdf_path,
            'parsed_date': datetime.now().isoformat()
        }

        # Extract account info from page 1
        account_match = re.search(r'Account:\s*(.+?)(?:\n|$)', text, re.IGNORECASE)
        if account_match:
            bill_data['account'] = account_match.group(1).strip()

        # Extract service delivery address from page 1
        service_match = re.search(r'Service delivered to:\s*(.+?)(?:\n|$)', text, re.IGNORECASE)
        if service_match:
            bill_data['service_delivered_to'] = service_match.group(1).strip()

        # Extract electricity breakdown from page 2
        breakdown_match = re.search(r'Your electricity breakdown:\s*(.+?)(?:\n|$)', text, re.IGNORECASE)
        if breakdown_match:
            bill_data['electricity_breakdown'] = breakdown_match.group(1).strip()

        # Check for Merchant Function Charge on page 2
        merchant_charge_present = bool(re.search(r'Merchant Function Charge', text, re.IGNORECASE))
        bill_data['has_merchant_function_charge'] = merchant_charge_present

        print(f"✅ Parsed bill data: {len(bill_data)} fields")
        for key, value in bill_data.items():
            if key not in ['file_path', 'parsed_date']:
                print(f"  {key}: {value}")

        return bill_data

    def process_downloads(self, bill_pdf_path: str = None, usage_zip_path: str = None) -> Dict:
        """Process both bill PDF and usage ZIP if provided"""
        results = {
            'bill_data': None,
            'usage_data': None
        }

        # Process bill PDF
        if bill_pdf_path and os.path.exists(bill_pdf_path):
            print("\n📄 Processing Bill PDF...")
            results['bill_data'] = self.parse_bill_data(bill_pdf_path)

        # Process usage ZIP directly in memory
        if usage_zip_path and os.path.exists(usage_zip_path):
            print("\n📊 Processing Usage ZIP...")
            results['usage_data'] = self.parse_usage_zip(usage_zip_path)

        return results

    def save_parsed_data(self, data: Dict, output_dir: str = None) -> str:
        """Save parsed data to JSON file"""
        if output_dir is None:
            output_dir = self.download_dir

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = os.path.join(output_dir, f"parsed_data_{timestamp}.json")

        # Convert DataFrame to dict if present
        data_to_save = data.copy()
        if data_to_save.get('usage_data') is not None:
            df = data_to_save['usage_data']
            data_to_save['usage_data'] = {
                'shape': df.shape,
                'columns': list(df.columns),
                'data': df.to_dict('records')[:100]  # Limit to first 100 rows for JSON
            }

        import json
        with open(output_path, 'w') as f:
            json.dump(data_to_save, f, indent=2, default=str)

        print(f"✅ Saved parsed data to: {output_path}")
        return output_path