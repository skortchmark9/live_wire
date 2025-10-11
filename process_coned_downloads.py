#!/usr/bin/env python3
"""
Process downloaded ConEd files - unpack ZIP and parse PDF bills
"""
import os
import sys
from pathlib import Path

# Add path for browser automation
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from browser_automation.data_processor import ConEdDataProcessor


def main():
    print("ConEd Downloads Processor")
    print("=" * 40)

    # Initialize processor
    download_dir = "./coned_downloads"
    processor = ConEdDataProcessor(download_dir=download_dir)

    # Check if download directory exisst
    if not os.path.exists(download_dir):
        print(f"❌ Download directory not found: {download_dir}")
        print("Run the browser automation test first to download files.")
        return

    # Find the most recent files
    pdf_files = []
    zip_files = []

    for filename in os.listdir(download_dir):
        filepath = os.path.join(download_dir, filename)
        if os.path.isfile(filepath):
            if filename.startswith("coned_bill_") and filename.endswith(".pdf"):
                pdf_files.append(filepath)
            elif filename.startswith("coned_usage_") and filename.endswith(".zip"):
                zip_files.append(filepath)

    # Sort by modification time (newest first)
    pdf_files.sort(key=os.path.getmtime, reverse=True)
    zip_files.sort(key=os.path.getmtime, reverse=True)

    print(f"\nFound {len(pdf_files)} PDF bills and {len(zip_files)} usage ZIP files")

    # Get the most recent files
    latest_pdf = pdf_files[0] if pdf_files else None
    latest_zip = zip_files[0] if zip_files else None

    if latest_pdf:
        print(f"Latest PDF: {os.path.basename(latest_pdf)}")
    if latest_zip:
        print(f"Latest ZIP: {os.path.basename(latest_zip)}")

    if not latest_pdf and not latest_zip:
        print("❌ No ConEd files found to process")
        return

    # Process the files
    print("\n" + "=" * 40)
    print("Processing Files...")
    print("=" * 40)

    results = processor.process_downloads(
        bill_pdf_path=latest_pdf,
        usage_zip_path=latest_zip
    )

    # Save parsed data
    if results['bill_data'] or results['usage_data']:
        saved_path = processor.save_parsed_data(results)
        print(f"\n✅ All processed data saved to: {saved_path}")

        # Print summary
        print("\n" + "=" * 40)
        print("PROCESSING SUMMARY")
        print("=" * 40)

        if results['bill_data']:
            bill_data = results['bill_data']
            print("📄 BILL DATA:")
            for key, value in bill_data.items():
                if key not in ['file_path', 'parsed_date']:
                    print(f"  {key}: {value}")

        if results['usage_data'] is not None:
            df = results['usage_data']
            print(f"\n📊 USAGE DATA:")
            print(f"  Rows: {len(df)}")
            print(f"  Columns: {list(df.columns)}")
            if len(df) > 0:
                print(f"  Date range: {df.iloc[0].get('Date', 'N/A')} to {df.iloc[-1].get('Date', 'N/A')}")


    else:
        print("⚠️ No data was successfully processed")


if __name__ == "__main__":
    main()