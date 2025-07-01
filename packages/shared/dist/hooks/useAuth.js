"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAuth = useAuth;
const react_1 = require("react");
const swr_1 = __importDefault(require("swr"));
const swr_2 = require("../lib/swr");
function useAuth(options) {
    const { onNavigate } = options || {};
    const [sessionId, setSessionId] = (0, react_1.useState)(null);
    const [isLoggingIn, setIsLoggingIn] = (0, react_1.useState)(false);
    const [isMFASubmitting, setIsMFASubmitting] = (0, react_1.useState)(false);
    const [authError, setAuthError] = (0, react_1.useState)(null);
    // Use SWR to poll auth status (only when sessionId exists)
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
    }, [onNavigate]);
    const reset = (0, react_1.useCallback)(() => {
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
