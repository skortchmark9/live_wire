export interface DataPoint {
  timestamp: string;
  watts: number;
  kwh?: number;
}

export function calculateBaseline(data: DataPoint[]): number {
  if (data.length === 0) return 0;
  
  // Calculate baseline usage (25th percentile)
  const allWatts = data.map(d => d.watts);
  const sortedWatts = [...allWatts].sort((a, b) => a - b);
  const baselineWatts = sortedWatts[Math.floor(sortedWatts.length * 0.15)];
  
  return baselineWatts;
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