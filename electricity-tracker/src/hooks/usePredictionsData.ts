import useSWR from 'swr';
import { swrConfig } from '@/lib/swr';

interface PredictionsData {
  predictions: Array<{
    // Add prediction fields as needed
    date: string;
    predicted_usage: number;
    confidence: number;
  }>;
  metadata: unknown;
  count: number;
}

export function usePredictionsData() {
  const { data, error, isLoading, mutate } = useSWR<PredictionsData>(
    '/api/predictions',
    swrConfig.fetcher,
    {
      ...swrConfig,
      refreshInterval: 0,
      revalidateIfStale: false,
      // Predictions might not exist, so don't retry aggressively
      errorRetryCount: 1,
      onError: (error) => {
        // Silently handle 404s for predictions since they might not exist
        if (error?.status === 404) {
          return;
        }
      }
    }
  );

  return {
    data: data || null,
    isLoading,
    error: error?.status === 404 ? null : (error?.message || null), // Don't treat 404 as error
    refetch: mutate,
  };
}