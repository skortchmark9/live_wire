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
export declare function useAuth(options?: UseAuthOptions): {
    sessionId: string | null;
    status: "authenticating" | "mfa_required" | "success" | "failed" | "timeout" | null;
    error: string | null;
    isLoading: boolean;
    data: {} | null;
    login: (username: string, password: string) => Promise<LoginResponse>;
    submitMFA: (mfaCode: string) => Promise<any>;
    demoLogin: () => Promise<void>;
    reset: () => void;
};
//# sourceMappingURL=useAuth.d.ts.map