import useSWR from 'swr';
import { swrConfig } from '../lib/swr';

interface WeatherData {
  data: Array<{
    timestamp: string;
    temperature_f: number;
    humidity_percent: number;
  }>;
  metadata: unknown;
  count: number;
}

interface WeatherDataPoint {
  timestamp: string;
  temperature_f: number;
  humidity_percent: number;
}

export function downsampleWeatherTo15Minutes(hourlyData: WeatherDataPoint[]): WeatherDataPoint[] {
  if (!hourlyData || hourlyData.length === 0) return [];
  
  const downsampled: WeatherDataPoint[] = [];
  
  // Sort data by timestamp
  const sortedData = [...hourlyData].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  // Helper to format timestamp with NYC timezone offset
  const formatWithTimezone = (date: Date): string => {
    let isoString = date.toISOString();
    // remove millis
    isoString = isoString.replace('.000', '');
    // Replace Z with -04:00 (NYC EDT offset)
    return isoString.replace('Z', '-04:00');
  };
  
  for (let i = 0; i < sortedData.length; i++) {
    const currentPoint = sortedData[i];
    const currentTime = new Date(currentPoint.timestamp);
    const nextPoint = sortedData[i + 1];
    
    // Add the exact hour point with timezone
    downsampled.push({
      ...currentPoint,
      timestamp: formatWithTimezone(currentTime)
    });
    
    // If there's a next point, interpolate values for 15, 30, and 45 minutes
    if (nextPoint) {
      const nextTime = new Date(nextPoint.timestamp);
      const tempDiff = nextPoint.temperature_f - currentPoint.temperature_f;
      const humidityDiff = nextPoint.humidity_percent - currentPoint.humidity_percent;
      
      // Create 15-minute interval points
      for (let minutes = 15; minutes < 60; minutes += 15) {
        const interpolatedTime = new Date(currentTime);
        interpolatedTime.setMinutes(minutes, 0, 0);
        
        // Only add if this time is before the next data point
        if (interpolatedTime < nextTime) {
          const fraction = minutes / 60;
          downsampled.push({
            timestamp: formatWithTimezone(interpolatedTime),
            temperature_f: currentPoint.temperature_f + (tempDiff * fraction),
            humidity_percent: currentPoint.humidity_percent + (humidityDiff * fraction)
          });
        }
      }
    } else {
      // For the last point, extend with same values for remaining 15-minute intervals
      for (let minutes = 15; minutes < 60; minutes += 15) {
        const extendedTime = new Date(currentTime);
        extendedTime.setMinutes(minutes, 0, 0);
        downsampled.push({
          timestamp: formatWithTimezone(extendedTime),
          temperature_f: currentPoint.temperature_f,
          humidity_percent: currentPoint.humidity_percent
        });
      }
    }
  }
  
  return downsampled;
}

export function useWeatherData() {
  const { data, error, isLoading, mutate } = useSWR<WeatherData>(
    '/api/weather-data',
    swrConfig.fetcher,
    {
      ...swrConfig,
      refreshInterval: 0,
      revalidateIfStale: false,
    }
  );

  return {
    data: data || null,
    isLoading,
    error,
    refetch: mutate,
  };
}