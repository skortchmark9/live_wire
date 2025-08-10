"""
Region Detection Module
Determines ConEd rate region (WC = Westchester, NYC = New York City) based on customer address
"""
from typing import Dict, Optional


class RegionDetector:
    """Detect ConEd rate region based on customer address"""
    
    # NYC zip codes (partial list of common ones, can be expanded)
    NYC_ZIP_CODES = {
        # Manhattan
        '10001', '10002', '10003', '10004', '10005', '10006', '10007', '10009', 
        '10010', '10011', '10012', '10013', '10014', '10016', '10017', '10018',
        '10019', '10020', '10021', '10022', '10023', '10024', '10025', '10026',
        '10027', '10028', '10029', '10030', '10031', '10032', '10033', '10034',
        '10035', '10036', '10037', '10038', '10039', '10040', '10044', '10065',
        '10069', '10075', '10128', '10162', '10280', '10282',
        
        # Bronx
        '10451', '10452', '10453', '10454', '10455', '10456', '10457', '10458',
        '10459', '10460', '10461', '10462', '10463', '10464', '10465', '10466',
        '10467', '10468', '10469', '10470', '10471', '10472', '10473', '10474',
        '10475',
    }
    
    # Westchester County zip codes (partial list, can be expanded)
    WESTCHESTER_ZIP_CODES = {
        '10501', '10502', '10503', '10504', '10505', '10506', '10507', '10510',
        '10511', '10514', '10516', '10517', '10518', '10520', '10521', '10522',
        '10523', '10524', '10526', '10527', '10528', '10530', '10532', '10533',
        '10535', '10536', '10537', '10538', '10540', '10541', '10543', '10545',
        '10546', '10547', '10548', '10549', '10550', '10551', '10552', '10553',
        '10560', '10562', '10566', '10567', '10570', '10571', '10572', '10573',
        '10576', '10577', '10578', '10579', '10580', '10583', '10587', '10588',
        '10589', '10590', '10591', '10594', '10595', '10596', '10597', '10598',
        '10601', '10602', '10603', '10604', '10605', '10606', '10607', '10610',
        '10701', '10702', '10703', '10704', '10705', '10706', '10707', '10708',
        '10709', '10710', '10801', '10802', '10803', '10804', '10805',
    }
    
    @staticmethod
    def detect_region(address: Dict) -> Optional[str]:
        """
        Detect ConEd rate region based on address
        
        Args:
            address: Address dictionary with postal code, city, state information
            
        Returns:
            'NYC' for New York City rates
            'WC' for Westchester County rates
            None if region cannot be determined
        """
        if not address:
            return None
        
        # Primary detection: postal code
        postal_code = address.get('postalCode', '').strip()
        if postal_code in RegionDetector.NYC_ZIP_CODES:
            return 'NYC'
        elif postal_code in RegionDetector.WESTCHESTER_ZIP_CODES:
            return 'WC'
        
        # Secondary detection: city name
        city = address.get('city', '').upper().strip()
        state = address.get('state', '').upper().strip()
        
        if state == 'NY':
            if city in ['NEW YORK', 'NEW YORK CITY', 'NYC', 'MANHATTAN', 'BRONX']:
                return 'NYC'
            elif city in ['WHITE PLAINS', 'YONKERS', 'NEW ROCHELLE', 'MOUNT VERNON',
                         'SCARSDALE', 'RYE', 'MAMARONECK', 'LARCHMONT', 'PELHAM',
                         'HARRISON', 'PORT CHESTER', 'TARRYTOWN', 'DOBBS FERRY']:
                return 'WC'
        
        # If we can't determine, log the address for debugging
        print(f"⚠️  Could not determine region for address: {address}")
        return None
    
    @staticmethod
    def get_region_description(region_code: Optional[str]) -> str:
        """Get human-readable description of region code"""
        if region_code == 'NYC':
            return 'New York City'
        elif region_code == 'WC':
            return 'Westchester County'
        else:
            return 'Unknown Region'