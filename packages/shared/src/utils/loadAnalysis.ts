import { ElectricityDataPoint } from '../types';
import { calculateUsageCost } from './costCalculations';

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

export function calculateACUsageForPeriod(
  electricityData: ElectricityDataPoint[],
  startDate: Date,
  endDate: Date,
  allElectricityData?: ElectricityDataPoint[]
): ACCalculationResult {
  // Filter data for the specified period
  const periodData = electricityData
    .filter(d => {
      if (d.consumption_kwh === null) return false;
      const startTime = new Date(d.start_time);
      return startTime >= startDate && startTime < endDate;
    })
    .map(d => ({
      timestamp: d.start_time,
      watts: (d.consumption_kwh! * 1000) / 0.25, // Convert kWh to W (15min intervals)
      kwh: d.consumption_kwh!
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (periodData.length === 0) {
    return { totalKwh: 0, totalCost: 0, events: [] };
  }

  // Get extended data for baseline calculation (last 7 days)
  const extendedData = (allElectricityData || electricityData)
    .filter(d => {
      if (d.consumption_kwh === null) return false;
      const startTime = new Date(d.start_time);
      const sevenDaysAgo = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      return startTime >= sevenDaysAgo;
    })
    .map(d => ({
      timestamp: d.start_time,
      watts: (d.consumption_kwh! * 1000) / 0.25,
      kwh: d.consumption_kwh!
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Calculate baseline usage with extended data
  const baseline = calculateBaseline(periodData, extendedData);
  
  // Detect AC usage
  const acEvents = detectACEvents(periodData, baseline);
  
  // Convert events to result format
  const events = acEvents.map(event => {
    const duration = event.endIndex - event.startIndex + 1;
    const estimatedKwh = (event.avgExcessWatts * duration * 0.25) / 1000; // 15-minute intervals
    const estimatedCost = calculateUsageCost(estimatedKwh);
    
    return {
      startTime: periodData[event.startIndex].timestamp,
      endTime: periodData[event.endIndex].timestamp,
      peakWatts: event.peakWatts,
      estimatedKwh,
      estimatedCost
    };
  });

  const totalKwh = events.reduce((sum, event) => sum + event.estimatedKwh, 0);
  const totalCost = events.reduce((sum, event) => sum + event.estimatedCost, 0);

  return { totalKwh, totalCost, events };
}

export function calculateBaseline(data: DataPoint[], extendedData?: DataPoint[]): number {
  // Use extended historical data if available, otherwise fall back to current data
  const dataToAnalyze = extendedData && extendedData.length > 0 ? extendedData : data;
  
  if (dataToAnalyze.length === 0) return 0;
  
  // Group data by hour blocks (4-hour windows) and find minimum for each
  const hourlyMinimums: number[] = [];
  const windowSize = 16; // 4 hours of 15-minute intervals
  
  for (let i = 0; i < dataToAnalyze.length - windowSize; i += windowSize) {
    const window = dataToAnalyze.slice(i, i + windowSize);
    const windowMin = Math.min(...window.map(d => d.watts));
    hourlyMinimums.push(windowMin);
  }
  
  if (hourlyMinimums.length === 0) {
    // Fallback to simple percentile if not enough data
    const sortedWatts = [...dataToAnalyze.map(d => d.watts)].sort((a, b) => a - b);
    return sortedWatts[Math.floor(sortedWatts.length * 0.10)];
  }
  
  // Sort the minimums and take the 25th percentile
  // This represents typical "minimum" usage periods
  const sortedMins = [...hourlyMinimums].sort((a, b) => a - b);
  const baseline = sortedMins[Math.floor(sortedMins.length * 0.25)];
  
  return baseline;
}

export interface ACUsageEvent {
  startIndex: number;
  endIndex: number;
  peakWatts: number;
  avgExcessWatts: number;
}

export function detectACEvents(
  data: DataPoint[], 
  baseline: number,
  minExcessWatts: number = 200,
  dropoffThreshold: number = 0.4
): ACUsageEvent[] {
  const events: ACUsageEvent[] = [];
  
  for (let i = 0; i < data.length - 2; i++) {
    const current = data[i].watts;
    const excess = current - baseline;
    
    // Look for significant spikes above baseline
    if (excess >= minExcessWatts) {
      // Find end of spike
      let endIndex = i;
      let peakWatts = current;
      let totalExcess = excess;
      let excessCount = 1;
      
      for (let j = i + 1; j < Math.min(i + 24, data.length); j++) { // Up to 6 hours
        const jWatts = data[j].watts;
        const jExcess = jWatts - baseline;
        
        if (jWatts > peakWatts) peakWatts = jWatts;
        
        // End detection: when usage drops below a percentage of minimum threshold
        if (jExcess < minExcessWatts * dropoffThreshold) {
          endIndex = j - 1;
          break;
        }
        
        totalExcess += jExcess;
        excessCount++;
        endIndex = j;
      }
      
      if (endIndex > i) { // At least 15 minutes
        events.push({
          startIndex: i,
          endIndex: endIndex,
          peakWatts: peakWatts,
          avgExcessWatts: totalExcess / excessCount
        });
        
        i = endIndex; // Skip ahead
      }
    }
  }
  
  return events;
}