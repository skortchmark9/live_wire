// Ensure the API URL has the correct protocol
export const getApiBaseUrl = () => {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  
  // If the URL doesn't start with http:// or https://, use current protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
    return `${protocol}//${url}`;
  }
  
  return url;
};

const API_BASE_URL = getApiBaseUrl();

// Custom error type for SWR
export class FetchError extends Error {
  status: number;
  info: unknown;

  constructor(message: string, status: number, info: unknown) {
    super(message);
    this.status = status;
    this.info = info;
  }
}

// SWR fetcher function
export const fetcher = async (path: string) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include', // Include cookies for session management
  });

  if (!response.ok) {
    const info = await response.json().catch(() => ({}));
    throw new FetchError(`Error fetching ${path}`, response.status, info);
  }

  return response.json();
};

// POST fetcher for mutations (login, MFA, etc.)
export const postFetcher = async (path: string, data: unknown) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const info = await response.json().catch(() => ({}));
    throw new FetchError(`Error posting to ${path}`, response.status, info);
  }
  return response.json();
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