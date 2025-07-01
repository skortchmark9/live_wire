"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swrConfig = exports.postFetcher = exports.fetcher = exports.FetchError = exports.getApiBaseUrl = void 0;
// Ensure the API URL has the correct protocol
const getApiBaseUrl = () => {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    // If the URL doesn't start with http:// or https://, use current protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
        return `${protocol}//${url}`;
    }
    return url;
};
exports.getApiBaseUrl = getApiBaseUrl;
const API_BASE_URL = (0, exports.getApiBaseUrl)();
// Custom error type for SWR
class FetchError extends Error {
    constructor(message, status, info) {
        super(message);
        this.status = status;
        this.info = info;
    }
}
exports.FetchError = FetchError;
// SWR fetcher function
const fetcher = async (path) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        credentials: 'include', // Include cookies for session management
    });
    if (!response.ok) {
        // Handle 401 authentication errors by redirecting to login
        if (response.status === 401) {
            // Clear session cookie
            if (typeof document !== 'undefined') {
                document.cookie = 'user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                window.location.href = '/login';
            }
            return; // Don't throw error, just redirect
        }
        const info = await response.json().catch((e) => ({ ...e }));
        throw new FetchError(`Error fetching ${path}`, response.status, info);
    }
    return response.json();
};
exports.fetcher = fetcher;
// POST fetcher for mutations (login, MFA, etc.)
const postFetcher = async (path, data) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        // Handle 401 authentication errors by redirecting to login
        if (response.status === 401) {
            // Clear session cookie
            if (typeof document !== 'undefined') {
                document.cookie = 'user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                window.location.href = '/login';
            }
            return; // Don't throw error, just redirect
        }
        const info = await response.json().catch(() => ({}));
        throw new FetchError(`Error posting to ${path}`, response.status, info);
    }
    return response.json();
};
exports.postFetcher = postFetcher;
// SWR configuration
exports.swrConfig = {
    fetcher: exports.fetcher,
    revalidateOnFocus: false, // Don't refetch when window regains focus
    revalidateOnReconnect: true, // Refetch when network reconnects
    dedupingInterval: 5000, // Dedupe requests within 5 seconds
    errorRetryCount: 3, // Retry failed requests 3 times
    errorRetryInterval: 1000, // Wait 1 second between retries
};
