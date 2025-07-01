import { useState, useCallback } from 'react';
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

export function useAuth(options?: UseAuthOptions) {
  const { onNavigate } = options || {};
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isMFASubmitting, setIsMFASubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Use SWR to poll auth status (only when sessionId exists)
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
    }
  }, [onNavigate]);

  const reset = useCallback(() => {
    setSessionId(null);
    setAuthError(null);
    setIsLoggingIn(false);
    setIsMFASubmitting(false);
    // Clear SWR cache for this session
    mutate(undefined, false);
  }, [mutate]);

  // Determine overall loading state
  const isLoading = isLoggingIn || isMFASubmitting || (!!sessionId && !authStatus && !statusError);

  // Determine overall error state
  const error = authError || (statusError instanceof Error ? statusError.message : null);

  return {
    // State
    sessionId,
    status: authStatus?.status || null,
    error: error || authStatus?.error || null,
    isLoading,
    data: authStatus?.data || null,
    
    // Actions
    login,
    submitMFA,
    demoLogin,
    reset,
  };
}