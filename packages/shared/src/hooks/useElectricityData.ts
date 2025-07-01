import useSWR from 'swr';
import { swrConfig } from '../lib/swr';

interface ElectricityData {
  usage_data: Array<{
    start_time: string;
    end_time: string;
    consumption_kwh: number;
    provided_cost?: number;
  }>;
  forecast_data: Array<{
    bill_start_date: string;
    bill_end_date: string;
    current_date: string;
    unit_of_measure: string;
    usage_to_date: number;
    cost_to_date: number;
    forecasted_usage: number;
    forecasted_cost: number;
    typical_usage: number;
    typical_cost: number;
    account_id: string;
  }>;
  metadata: unknown;
  usage_count: number;
  forecast_count: number;
}

export function useElectricityData() {
  const { data, error, isLoading, mutate } = useSWR<ElectricityData>(
    '/api/electricity-data',
    swrConfig.fetcher,
    {
      ...swrConfig,
      // Cache for 5 minutes before considering stale
      refreshInterval: 0, // Don't auto-refresh
      revalidateIfStale: false, // Don't auto-revalidate stale data
    }
  );

  return {
    data: data || null,
    isLoading,
    error,
    refetch: mutate, // SWR's mutate function for manual refetch
  };
}