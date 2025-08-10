import { useState, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { postFetcher, fetcher } from '../lib/swr';

export interface LoginResponse {
  session_id: string;
  message: string;
}

export interface AuthStatus {
  status: 'authenticating' | 'mfa_required' | 'success' | 'failed' | 'timeout';
  error?: string;
  data?: unknown;
}

export interface UseAuthOptions {
  onNavigate?: (path: string) => void;
}

// Helper function to extract session from cookies
const getSessionFromCookie = (): string | null => {
  if (typeof document === 'undefined') return null;
  
  const hasSessionCookie = document.cookie.includes('user_session=');
  
  if (hasSessionCookie) {
    // Extract session ID from cookie
    const match = document.cookie.match(/user_session=([^;]+)/);
    return match ? match[1] : null;
  }
  return null;
};

export function useAuth(options?: UseAuthOptions) {
  const { onNavigate } = options || {};
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isMFASubmitting, setIsMFASubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Initialize session from cookies on client side only
  useEffect(() => {
    if (!initialized) {
      const sessionFromCookie = getSessionFromCookie();
      console.log('useAuth: Checking cookies on init, found:', sessionFromCookie);
      if (sessionFromCookie) {
        setSessionId(sessionFromCookie);
      } else {
        // Set a sentinel value to trigger the 404 path
        setSessionId('no-session');
      }
      setInitialized(true);
    }
  }, [initialized]);

  // Use SWR to poll auth status (only when sessionId exists, including sentinel)
  const { data: authStatus, error: statusError, mutate } = useSWR<AuthStatus>(
    sessionId ? `/api/auth/status/${sessionId}` : null,
    fetcher,
    {
      refreshInterval: (data) => {
        // Stop polling if we're in a terminal state
        if (data && ['success', 'failed', 'timeout'].includes(data.status)) {
          return 0; // Stop polling
        }
        return 2000; // Poll every 2 seconds
      },
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      errorRetryCount: 3,
      onError: (error) => {
        // Handle 404 errors as expired sessions
        if (error && error.status === 404) {
          console.log('Session not found (404), clearing cookies and resetting session');
          clearInvalidSession();
          onNavigate && onNavigate('/login');
        }
      }
    }
  );

  const login = useCallback(async (username: string, password: string) => {
    setIsLoggingIn(true);
    setAuthError(null);

    try {
      const result: LoginResponse = await postFetcher('/api/auth/login', {
        username,
        password,
      });
      setSessionId(result.session_id);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setAuthError(errorMessage);
      throw error;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const submitMFA = useCallback(async (mfaCode: string) => {
    if (!sessionId) {
      throw new Error('No session ID available');
    }

    setIsMFASubmitting(true);
    setAuthError(null);

    try {
      const result = await postFetcher('/api/auth/mfa', {
        session_id: sessionId,
        mfa_code: mfaCode,
      });
      // Trigger immediate revalidation of auth status after MFA
      mutate();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'MFA submission failed';
      setAuthError(errorMessage);
      throw error;
    } finally {
      setIsMFASubmitting(false);
    }
  }, [sessionId, mutate]);

  const demoLogin = useCallback(async () => {
    setIsLoggingIn(true);
    setAuthError(null);

    try {
      await postFetcher('/api/auth/demo', {});
      // Use callback for navigation instead of router.push
      if (onNavigate) {
        onNavigate('/');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Demo login failed';
      setAuthError(errorMessage);
      throw error;
    } finally {
      setIsLoggingIn(false);
    }
  }, [onNavigate]);

  const clearInvalidSession = useCallback(() => {
    // Clear cookies
    if (typeof document !== 'undefined') {
      document.cookie = 'user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
    
    // Reset state
    setSessionId(null);
    setAuthError(null);
    setIsLoggingIn(false);
    setIsMFASubmitting(false);
    
    // Clear SWR cache
    mutate(undefined, false);
  }, [mutate]);

  const reset = useCallback(() => {
    setSessionId(null);
    setAuthError(null);
    setIsLoggingIn(false);
    setIsMFASubmitting(false);
    // Clear SWR cache for this session
    mutate(undefined, false);
  }, [mutate]);

  const logout = useCallback(async () => {
    // Clear the cookie - try multiple domain variations to ensure it's cleared
    if (typeof document !== 'undefined') {
      // Clear for current domain
      document.cookie = 'user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      
      // Clear for parent domain (e.g., .tracy.ac)
      const hostname = window.location.hostname;
      if (hostname.includes('.')) {
        const parentDomain = hostname.substring(hostname.indexOf('.'));
        document.cookie = `user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${parentDomain};`;
      }
      
      // Clear with explicit domain
      document.cookie = `user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${hostname};`;
    }
    
    // Reset all state
    setSessionId(null);
    setAuthError(null);
    setIsLoggingIn(false);
    setIsMFASubmitting(false);
    setInitialized(false); // Reset initialized to trigger re-check on next mount
    
    // Clear SWR cache and wait for it to complete
    await mutate(undefined, false);
    
    // Small delay to ensure state is fully reset before navigation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Navigate to login if callback provided
    if (onNavigate) {
      onNavigate('/login');
    }
  }, [mutate, onNavigate]);

  // Determine overall loading state
  const isLoading = isLoggingIn || isMFASubmitting || (!!sessionId && !authStatus && !statusError);

  // Determine overall error state
  const error = authError || (statusError instanceof Error ? statusError.message : null);

  // Determine the final authentication status
  let status = null;
  
  if (!initialized) {
    // Still initializing - show loading state
    status = null;
  } else if (statusError && statusError.status === 404) {
    // Session doesn't exist (includes our 'no-session' sentinel)
    status = 'failed';
  } else {
    // We have a session, use the status from backend
    status = authStatus?.status || null;
  }

  // Don't show errors when still initializing or when using sentinel value
  const shouldShowError = initialized && sessionId !== null && sessionId !== 'no-session';

  return {
    // State
    sessionId,
    status,
    error: shouldShowError ? (error || authStatus?.error || null) : null,
    isLoading,
    data: authStatus?.data || null,
    
    // Actions
    login,
    submitMFA,
    demoLogin,
    reset,
    logout,
  };
}