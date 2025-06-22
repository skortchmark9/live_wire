import { useState, useEffect, useCallback } from 'react';
import { APIClient, AuthStatus } from '@/lib/api';

export interface AuthState {
  sessionId: string | null;
  status: AuthStatus['status'] | null;
  error: string | null;
  isLoading: boolean;
  data: unknown | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    sessionId: null,
    status: null,
    error: null,
    isLoading: false,
    data: null,
  });

  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const login = useCallback(async (username: string, password: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await APIClient.login(username, password);
      setAuthState(prev => ({
        ...prev,
        sessionId: response.session_id,
        status: 'authenticating',
        isLoading: false,
      }));

      // Start polling for auth status
      startPolling(response.session_id);
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed',
      }));
    }
  }, []);

  const submitMFA = useCallback(async (mfaCode: string) => {
    if (!authState.sessionId) return;

    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await APIClient.submitMFA(authState.sessionId, mfaCode);
      // Continue polling - the status will update automatically
      setAuthState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'MFA submission failed',
      }));
    }
  }, [authState.sessionId]);

  const checkStatus = useCallback(async (sessionId: string) => {
    if (!sessionId) return;

    console.log('Checking auth status for session:', sessionId);
    try {
      const status = await APIClient.checkAuthStatus(sessionId);
      console.log('Status response:', status);
      setAuthState(prev => ({
        ...prev,
        status: status.status,
        error: status.error || null,
        data: status.data || null,
      }));

      // Stop polling if we're in a terminal state
      if (['success', 'failed', 'timeout'].includes(status.status)) {
        console.log('Terminal status reached, stopping polling');
        stopPolling();
      }
    } catch (error) {
      console.error('Status check error:', error);
      setAuthState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Status check failed',
      }));
      stopPolling();
    }
  }, []);

  const startPolling = useCallback((sessionId: string) => {
    // Clear any existing interval
    setPollInterval(prev => {
      if (prev) {
        clearInterval(prev);
      }
      return null;
    });

    // Poll every 2 seconds
    const interval = setInterval(() => {
      checkStatus(sessionId);
    }, 2000);

    setPollInterval(interval);

    // Also check immediately
    checkStatus(sessionId);
  }, [checkStatus]);

  const stopPolling = useCallback(() => {
    setPollInterval(prev => {
      if (prev) {
        clearInterval(prev);
      }
      return null;
    });
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setAuthState({
      sessionId: null,
      status: null,
      error: null,
      isLoading: false,
      data: null,
    });
  }, [stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);

  return {
    ...authState,
    login,
    submitMFA,
    reset,
  };
}