import { APIClient } from './api';

// SWR fetcher function
export const fetcher = async (url: string) => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  
  // Map SWR keys to our API client methods
  switch (url) {
    case '/api/electricity-data':
      return APIClient.getElectricityData();
    case '/api/weather-data':
      return fetch(`${baseUrl}/api/weather-data`, { credentials: 'include' }).then(res => {
        if (!res.ok) throw new Error('Failed to fetch weather data');
        return res.json();
      });
    case '/api/predictions':
      return fetch(`${baseUrl}/api/predictions`, { credentials: 'include' }).then(res => {
        if (!res.ok) throw new Error('Failed to fetch predictions');
        return res.json();
      });
    default:
      throw new Error(`Unknown API endpoint: ${url}`);
  }
};

// SWR configuration
export const swrConfig = {
  fetcher,
  revalidateOnFocus: false, // Don't refetch when window regains focus
  revalidateOnReconnect: true, // Refetch when network reconnects
  dedupingInterval: 5000, // Dedupe requests within 5 seconds
  errorRetryCount: 3, // Retry failed requests 3 times
  errorRetryInterval: 1000, // Wait 1 second between retries
};