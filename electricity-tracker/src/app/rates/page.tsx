'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@electricity-tracker/shared';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { AuthFlow } from '@/components/auth/AuthFlow';
import { RateCalculationFlow } from '@/components/RateCalculationFlow';

export default function RatesPage() {
  const router = useRouter();
  const onNavigate = (path: string) => router.push(path);
  const auth = useAuth({ onNavigate });
  
  // Check if user is authenticated
  if (auth.status === 'unauthenticated' || auth.status === 'authenticating' || auth.status === 'mfa_required') {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <Header />
        <div className="max-w-2xl mx-auto p-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              ConEd Rate Comparison
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Compare electricity rates across different ConEd pricing plans
            </p>
          </div>
          <AuthFlow />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Header />
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