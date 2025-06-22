const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export interface LoginResponse {
  session_id: string;
  message: string;
}

export interface AuthStatus {
  status: 'authenticating' | 'mfa_required' | 'success' | 'failed' | 'timeout';
  error?: string;
  data?: unknown;
}

export class APIClient {
  static async login(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }

    return response.json();
  }

  static async submitMFA(sessionId: string, mfaCode: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/mfa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ session_id: sessionId, mfa_code: mfaCode }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'MFA submission failed');
    }

    return response.json();
  }

  static async checkAuthStatus(sessionId: string): Promise<AuthStatus> {
    const response = await fetch(`${API_BASE_URL}/api/auth/status/${sessionId}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to check auth status');
    }

    return response.json();
  }

  static async getElectricityData(): Promise<unknown> {
    const response = await fetch(`${API_BASE_URL}/api/electricity-data`, {
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Not authenticated');
      }
      throw new Error('Failed to fetch electricity data');
    }

    return response.json();
  }
}