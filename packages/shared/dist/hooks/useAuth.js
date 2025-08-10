"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAuth = useAuth;
const react_1 = require("react");
const swr_1 = __importDefault(require("swr"));
const swr_2 = require("../lib/swr");
// Helper function to extract session from cookies
const getSessionFromCookie = () => {
    if (typeof document === 'undefined')
        return null;
    const hasSessionCookie = document.cookie.includes('user_session=');
    if (hasSessionCookie) {
        // Extract session ID from cookie
        const match = document.cookie.match(/user_session=([^;]+)/);
        return match ? match[1] : null;
    }
    return null;
};
function useAuth(options) {
    const { onNavigate } = options || {};
    const [sessionId, setSessionId] = (0, react_1.useState)(null);
    const [isLoggingIn, setIsLoggingIn] = (0, react_1.useState)(false);
    const [isMFASubmitting, setIsMFASubmitting] = (0, react_1.useState)(false);
    const [authError, setAuthError] = (0, react_1.useState)(null);
    const [initialized, setInitialized] = (0, react_1.useState)(false);
    // Initialize session from cookies on client side only
    (0, react_1.useEffect)(() => {
        if (!initialized) {
            const sessionFromCookie = getSessionFromCookie();
            console.log('useAuth: Checking cookies on init, found:', sessionFromCookie);
            if (sessionFromCookie) {
                setSessionId(sessionFromCookie);
            }
            else {
                // Set a sentinel value to trigger the 404 path
                setSessionId('no-session');
            }
            setInitialized(true);
        }
    }, [initialized]);
    // Use SWR to poll auth status (only when sessionId exists, including sentinel)
    const { data: authStatus, error: statusError, mutate } = (0, swr_1.default)(sessionId ? `/api/auth/status/${sessionId}` : null, swr_2.fetcher, {
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
    });
    const login = (0, react_1.useCallback)(async (username, password) => {
        setIsLoggingIn(true);
        setAuthError(null);
        try {
            const result = await (0, swr_2.postFetcher)('/api/auth/login', {
                username,
                password,
            });
            setSessionId(result.session_id);
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Login failed';
            setAuthError(errorMessage);
            throw error;
        }
        finally {
            setIsLoggingIn(false);
        }
    }, []);
    const submitMFA = (0, react_1.useCallback)(async (mfaCode) => {
        if (!sessionId) {
            throw new Error('No session ID available');
        }
        setIsMFASubmitting(true);
        setAuthError(null);
        try {
            const result = await (0, swr_2.postFetcher)('/api/auth/mfa', {
                session_id: sessionId,
                mfa_code: mfaCode,
            });
            // Trigger immediate revalidation of auth status after MFA
            mutate();
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'MFA submission failed';
            setAuthError(errorMessage);
            throw error;
        }
        finally {
            setIsMFASubmitting(false);
        }
    }, [sessionId, mutate]);
    const demoLogin = (0, react_1.useCallback)(async () => {
        setIsLoggingIn(true);
        setAuthError(null);
        try {
            await (0, swr_2.postFetcher)('/api/auth/demo', {});
            // Use callback for navigation instead of router.push
            if (onNavigate) {
                onNavigate('/');
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Demo login failed';
            setAuthError(errorMessage);
            throw error;
        }
        finally {
            setIsLoggingIn(false);
        }
    }, [onNavigate]);
    const clearInvalidSession = (0, react_1.useCallback)(() => {
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
    const reset = (0, react_1.useCallback)(() => {
        setSessionId(null);
        setAuthError(null);
        setIsLoggingIn(false);
        setIsMFASubmitting(false);
        // Clear SWR cache for this session
        mutate(undefined, false);
    }, [mutate]);
    const logout = (0, react_1.useCallback)(() => {
        // Clear the cookie
        if (typeof document !== 'undefined') {
            document.cookie = 'user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        }
        // Reset all state to initial values
        setSessionId('no-session'); // Set to sentinel value to trigger proper state
        setAuthError(null);
        setIsLoggingIn(false);
        setIsMFASubmitting(false);
        // Clear SWR cache
        mutate(undefined, false);
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
    }
    else if (statusError && statusError.status === 404) {
        // Session doesn't exist (includes our 'no-session' sentinel)
        status = 'failed';
    }
    else {
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
