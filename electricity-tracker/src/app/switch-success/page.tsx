'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface SwitchDetails {
  best_rate: string;
  best_rate_cost: number;
  current_plan: string;
  current_plan_cost: number;
  savings_amount: number;
  switch_purchased: boolean;
}

export default function SwitchSuccessPage() {
  const searchParams = useSearchParams();
  const stripeSessionId = searchParams.get('session_id');
  const [switchDetails, setSwitchDetails] = useState<SwitchDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stripeSessionId) {
      fetchSwitchDetails();
    } else {
      setError('No payment session found');
      setLoading(false);
    }
  }, [stripeSessionId]);

  const fetchSwitchDetails = async () => {
    try {
      // First verify the payment
      const paymentResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/payments/verify/${stripeSessionId}`,
        { credentials: 'include' }
      );

      if (!paymentResponse.ok) {
        throw new Error('Payment verification failed');
      }

      // Then get the switch details
      const detailsResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/rates/get-switch-details`,
        { credentials: 'include' }
      );

      if (detailsResponse.ok) {
        const details = await detailsResponse.json();
        setSwitchDetails(details);
      } else {
        throw new Error('Failed to get switch details');
      }
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Confirming your plan switch purchase...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div className="text-red-500 text-4xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-red-800 mb-2">Something went wrong</h1>
            <p className="text-red-600 mb-4">{error}</p>
            <a 
              href="/rates" 
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Rate Analysis
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!switchDetails) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <div className="text-yellow-500 text-4xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-yellow-800 mb-2">No switch details found</h1>
            <p className="text-yellow-600 mb-4">We couldn't find your plan switch information.</p>
            <a 
              href="/rates" 
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Rate Analysis
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Success Header */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 mb-8">
          <div className="text-center">
            <div className="text-green-500 text-6xl mb-4">✅</div>
            <h1 className="text-3xl font-bold text-green-800 mb-2">
              Payment Successful!
            </h1>
            <p className="text-green-700 text-lg">
              Thank you for purchasing our plan switching service.
            </p>
          </div>
        </div>

        {/* Switch Details */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
          <div className="px-6 py-4 bg-blue-50 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Your Plan Switch Details</h2>
          </div>
          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Current Plan</h3>
                  <div className="mt-1">
                    <p className="text-2xl font-bold text-orange-600">{switchDetails.current_plan}</p>
                    <p className="text-gray-600">{formatCurrency(switchDetails.current_plan_cost)}/year</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Recommended Plan</h3>
                  <div className="mt-1">
                    <p className="text-2xl font-bold text-blue-600">{switchDetails.best_rate}</p>
                    <p className="text-gray-600">{formatCurrency(switchDetails.best_rate_cost)}/year</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-green-50 rounded-lg p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-green-800 mb-2">Annual Savings</h3>
                <p className="text-4xl font-bold text-green-600">
                  {formatCurrency(switchDetails.savings_amount)}
                </p>
                <p className="text-green-700 mt-2">Every year after switching</p>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-blue-800 mb-4">What happens next?</h2>
          <div className="space-y-3">
            <div className="flex items-start">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm mr-3">1</span>
              <div>
                <p className="font-medium text-blue-800">Document Preparation</p>
                <p className="text-blue-700 text-sm">We'll prepare your plan switch authorization documents.</p>
              </div>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm mr-3">2</span>
              <div>
                <p className="font-medium text-blue-800">Electronic Signature</p>
                <p className="text-blue-700 text-sm">You'll receive an email with a DocuSign document to authorize the switch.</p>
              </div>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm mr-3">3</span>
              <div>
                <p className="font-medium text-blue-800">Plan Switch Submission</p>
                <p className="text-blue-700 text-sm">We'll submit your signed authorization to ConEd on your behalf.</p>
              </div>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm mr-3">4</span>
              <div>
                <p className="font-medium text-blue-800">Confirmation & Savings</p>
                <p className="text-blue-700 text-sm">Your new rate takes effect within 1-2 billing cycles, and you start saving!</p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Questions?</h3>
          <p className="text-gray-600 mb-4">
            We'll keep you updated via email throughout the process. If you have any questions, feel free to reach out.
          </p>
          <div className="space-y-2 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
            <a 
              href="/rates" 
              className="inline-block bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Run Another Analysis
            </a>
            <a 
              href="/" 
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}