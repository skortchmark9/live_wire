'use client';

import { useAuth } from '@/hooks/useAuth';
import { LoginForm } from './LoginForm';
import { MFAForm } from './MFAForm';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Image from 'next/image';

export function AuthFlow() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard on successful authentication
    if (auth.status === 'success') {
      // Give a moment for the data to be fetched
      setTimeout(() => {
        router.push('/');
      }, 2000);
    }
  }, [auth.status, router]);

  const handleLogin = async (data: { username: string; password: string }) => {
    await auth.login(data.username, data.password);
  };

  const handleMFA = async (mfaCode: string) => {
    await auth.submitMFA(mfaCode);
  };

  // Show loading spinner while authenticating
  if (auth.status === 'authenticating') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Connecting to ConEd...</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">This may take a moment while we check if MFA is required</p>
        </div>
      </div>
    );
  }

  // Show success state
  if (auth.status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Authentication Successful!</h2>
          <p className="text-gray-600 dark:text-gray-400">Fetching your electricity data...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (auth.status === 'failed' || auth.status === 'timeout') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="max-w-sm w-full">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
            <p className="font-semibold">Authentication Failed</p>
            <p className="text-sm mt-1">{auth.error || 'An error occurred during authentication'}</p>
          </div>
          <button
            onClick={auth.reset}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Image src="/logo.svg" alt="tracy.ac" width={48} height={48} className="w-12 h-12" />
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">tracy.ac</h1>
        </div>
        <p className="text-xl text-gray-700 dark:text-gray-300 mb-2">Trace your electricity usage!</p>
        <p className="text-gray-600 dark:text-gray-400">Log in with your ConEd account to get started</p>
      </div>

      {auth.status === null ? (
        <LoginForm
          onSubmit={handleLogin}
          isLoading={auth.isLoading}
          error={auth.error}
        />
      ) : auth.status === 'mfa_required' ? (
        <MFAForm
          onSubmit={handleMFA}
          isLoading={auth.isLoading}
          error={auth.error}
        />
      ) : null}
    </div>
  );
}