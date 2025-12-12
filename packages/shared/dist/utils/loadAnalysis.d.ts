import { ElectricityDataPoint, HVACEventType } from '../types';
/**
 * Classify an HVAC event as heating, cooling, or unknown based on temperature
 */
export declare function classifyHVACEvent(temperature: number | undefined): HVACEventType;
/**
 * Calculate confidence for an HVAC event based on temperature and power usage
 */
export declare function calculateHVACConfidence(type: HVACEventType, temperature: number | undefined, avgExcessWatts: number): number;
export interface DataPoint {
    timestamp: string;
    watts: number;
    kwh?: number;
}
export interface ACCalculationResult {
    totalKwh: number;
    totalCost: number;
    events: Array<{
        startTime: string;
        endTime: string;
        peakWatts: number;
        estimatedKwh: number;
        estimatedCost: number;
    }>;
}
export declare function calculateACUsageForPeriod(electricityData: ElectricityDataPoint[], startDate: Date, endDate: Date, allElectricityData?: ElectricityDataPoint[]): ACCalculationResult;
export declare function calculateBaseline(data: DataPoint[], extendedData?: DataPoint[]): number;
export interface ACUsageEvent {
    startIndex: number;
    endIndex: number;
    peakWatts: number;
    avgExcessWatts: number;
}
export declare function detectACEvents(data: DataPoint[], baseline: number, minExcessWatts?: number, dropoffThreshold?: number): ACUsageEvent[];
//# sourceMappingURL=loadAnalysis.d.ts.map