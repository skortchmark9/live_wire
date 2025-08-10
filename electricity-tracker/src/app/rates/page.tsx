'use client';

import React, { useEffect, useCallback } from 'react';
import { useAuth } from '@electricity-tracker/shared';
import { useRouter } from 'next/navigation';
import { RateCalculationFlow } from '@/components/RateCalculationFlow';

export default function RatesPage() {
  const router = useRouter();
  const onNavigate = useCallback((path: string) => router.push(path), [router]);
  const auth = useAuth({ onNavigate });

  useEffect(() => {
    if (auth.status !== null && auth.status !== 'success') {
      onNavigate('/login');
    }
  }, [auth.status, onNavigate])

  // Show loading while redirecting to login
  if (auth.status !== 'success') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            ConEd Rate Comparison
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Analyze your electricity usage across different ConEd pricing plans to find the best rate
          </p>
        </div>
        
        <RateCalculationFlow sessionId={auth.sessionId || ''} />
      </div>
    </div>
  );
}