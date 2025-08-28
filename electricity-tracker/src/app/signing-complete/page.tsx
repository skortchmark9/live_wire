'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SigningStatus {
  switch_purchased: boolean;
  loa_signed: boolean;
  signed_at: string | null;
  switch_status: string;
  next_step: string;
}

export default function SigningCompletePage() {
  const router = useRouter();
  const [signingStatus, setSigningStatus] = useState<SigningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSigningStatus();
  }, []);

  const fetchSigningStatus = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/documents/signing-status`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to get signing status');
      }

      const status = await response.json();
      setSigningStatus(status);
    } catch (err) {
      console.error('Error fetching signing status:', err);
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Confirming signature...</p>
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
            <h1 className="text-2xl font-bold text-red-800 mb-2">Error</h1>
            <p className="text-red-600 mb-4">{error}</p>
            <button 
              onClick={() => router.push('/switch-success')}
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Switch Details
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!signingStatus?.loa_signed) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <div className="text-yellow-500 text-4xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-yellow-800 mb-2">Document Not Signed</h1>
            <p className="text-yellow-600 mb-4">We couldn&apos;t find a signed authorization document.</p>
            <button 
              onClick={() => router.push('/sign-authorization')}
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors mr-4"
            >
              Sign Document
            </button>
            <button 
              onClick={() => router.push('/switch-success')}
              className="inline-block bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Back to Switch Details
            </button>
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
              Document Signed Successfully!
            </h1>
            <p className="text-green-700 text-lg">
              Your Letter of Authorization has been electronically signed and processed.
            </p>
            {signingStatus.signed_at && (
              <p className="text-green-600 text-sm mt-2">
                Signed on {formatDate(signingStatus.signed_at)}
              </p>
            )}
          </div>
        </div>

        {/* Status Summary */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
          <div className="px-6 py-4 bg-blue-50 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Process Status</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-green-600 font-semibold text-sm">✓</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Plan Switch Service Purchased</p>
                  <p className="text-gray-600 text-sm">Payment confirmed and processed</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-green-600 font-semibold text-sm">✓</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Authorization Document Signed</p>
                  <p className="text-gray-600 text-sm">Electronic signature captured and verified</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-yellow-600 font-semibold text-sm">⏳</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Document Submission</p>
                  <p className="text-gray-600 text-sm">Next: Submit authorization to Con Edison</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-blue-800 mb-4">What Happens Next?</h2>
          <div className="space-y-3">
            <div className="flex items-start">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm mr-3">1</span>
              <div>
                <p className="font-medium text-blue-800">Document Processing</p>
                <p className="text-blue-700 text-sm">We&apos;ll prepare your signed authorization for submission to Con Edison.</p>
              </div>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm mr-3">2</span>
              <div>
                <p className="font-medium text-blue-800">Submission to Con Edison</p>
                <p className="text-blue-700 text-sm">Your authorization will be sent to Con Edison to initiate the plan switch.</p>
              </div>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm mr-3">3</span>
              <div>
                <p className="font-medium text-blue-800">Plan Switch Completion</p>
                <p className="text-blue-700 text-sm">Your new rate plan will take effect within 1-2 billing cycles.</p>
              </div>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm mr-3">4</span>
              <div>
                <p className="font-medium text-blue-800">Start Saving</p>
                <p className="text-blue-700 text-sm">You&apos;ll begin seeing savings on your electricity bill!</p>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-yellow-800 mb-3">📋 Important Notes</h3>
          <ul className="space-y-2 text-yellow-700 text-sm">
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>You will receive email updates as we progress through each step</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>The plan switch process typically takes 1-2 billing cycles to complete</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Your electricity service will not be interrupted during the switch</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Contact us if you have questions about the process</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="text-center space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
          <button
            onClick={() => router.push('/')}
            className="w-full sm:w-auto inline-block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Return to Dashboard
          </button>
          <button
            onClick={() => router.push('/rates')}
            className="w-full sm:w-auto inline-block bg-gray-600 text-white px-8 py-3 rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Run Another Analysis
          </button>
        </div>

        {/* Support */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 text-sm">
            Need help? Contact our support team at support@livewire.energy
          </p>
        </div>
      </div>
    </div>
  );
}