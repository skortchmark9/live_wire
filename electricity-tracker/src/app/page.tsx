'use client';

import ElectricityDashboard from '@/components/ElectricityDashboard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
// import { APIClient } from '@/lib/api'; // unused import

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check if user has session cookie or demo mode cookie
    const checkAuth = () => {
      const hasSessionCookie = document.cookie.includes('user_session=');
      const hasDemoCookie = document.cookie.includes('demo_mode=true');
      
      if (hasSessionCookie || hasDemoCookie) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        router.push('/login');
      }
    };

    checkAuth();
  }, [router]);

  // Show loading while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Only show dashboard if authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="container mx-auto p-2 sm:p-4">
      <ErrorBoundary>
        <ElectricityDashboard />
      </ErrorBoundary>
    </main>
  )
}
