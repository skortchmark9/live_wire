'use client';

import ElectricityDashboard from '@/components/ElectricityDashboard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAuth } from '@electricity-tracker/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useCallback } from 'react';

export default function Home() {
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
    <main className="container mx-auto p-2 sm:p-4">
      <ErrorBoundary>
        <ElectricityDashboard />
      </ErrorBoundary>
    </main>
  )
}
