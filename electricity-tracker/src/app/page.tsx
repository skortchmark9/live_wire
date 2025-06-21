'use client';

import ElectricityDashboard from '@/components/ElectricityDashboard'
import { LogoutButton } from '@/components/auth/LogoutButton';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APIClient } from '@/lib/api';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check if user has valid session cookie
    const checkAuth = async () => {
      // Check if user_session cookie exists
      const hasSessionCookie = document.cookie.includes('user_session=');
      
      if (!hasSessionCookie) {
        setIsAuthenticated(false);
        router.push('/login');
        return;
      }

      try {
        // Try to fetch data - if it works, we're authenticated
        await APIClient.getElectricityData();
        setIsAuthenticated(true);
      } catch (error) {
        // If 401 or error, redirect to login
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
    <main className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Electricity Usage Dashboard</h1>
        <LogoutButton />
      </div>
      <ElectricityDashboard />
    </main>
  )
}
