import useSWR from 'swr';
import { swrConfig } from '@/lib/swr';

interface WeatherData {
  data: Array<{
    timestamp: string;
    temperature: number;
    humidity: number;
    // Add other weather fields as needed
  }>;
  metadata: any;
  count: number;
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
    error: error?.message || null,
    refetch: mutate,
  };
}