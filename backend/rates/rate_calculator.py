"""
Rate Calculator Module
"""
import time
from typing import Dict, Optional


class RateCalculator:
    """Calculate and compare electricity rates"""
    
    @staticmethod
    def get_calculated_rates(google_client, spreadsheet_id: str) -> Optional[Dict]:
        """Get calculated rate costs from Google Sheets"""
        
        print("\nWaiting for formulas to calculate...")
        time.sleep(5)  # Give Google Sheets time to calculate
        
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
        
        value_ranges = google_client.get_sheet_values(spreadsheet_id, ranges)
        
        if not value_ranges:
            return None
        
        print("\n" + "=" * 60)
        print("📊 CALCULATED RATE COSTS")
        print("=" * 60)
        
        costs = {}
        for i, value_range in enumerate(value_ranges):
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
        
        # Find best and worst rates
        if costs:
            best_rate = min(costs.items(), key=lambda x: x[1])
            worst_rate = max(costs.items(), key=lambda x: x[1])
            
            print(f"\n💰 BEST RATE:  {best_rate[0]} at ${best_rate[1]:,.2f}")
            print(f"💸 WORST RATE: {worst_rate[0]} at ${worst_rate[1]:,.2f}")
            
            savings = worst_rate[1] - best_rate[1]
            print(f"\n🎯 Potential savings: ${savings:,.2f} per year")
            print(f"   ({(savings/worst_rate[1]*100):.1f}% reduction from worst to best)")
        
        return costs