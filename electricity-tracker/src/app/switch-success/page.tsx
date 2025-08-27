'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SignatureCanvas from '@/components/documents/SignatureCanvas';

interface SwitchDetails {
  best_rate: string;
  best_rate_cost: number;
  current_plan: string;
  current_plan_cost: number;
  savings_amount: number;
  switch_purchased: boolean;
}

interface LOAPreview {
  html_content: string;
  customer_name: string;
  account_number: string;
  date: string;
}

interface SigningStatus {
  switch_purchased: boolean;
  loa_signed: boolean;
  signed_at: string | null;
  switch_status: string;
  next_step: string;
}

export default function SwitchSuccessPage() {
  const searchParams = useSearchParams();
  const stripeSessionId = searchParams.get('session_id');
  const [switchDetails, setSwitchDetails] = useState<SwitchDetails | null>(null);
  const [loaPreview, setLoaPreview] = useState<LOAPreview | null>(null);
  const [signingStatus, setSigningStatus] = useState<SigningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Signature form state
  const [signature, setSignature] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (stripeSessionId) {
      fetchSwitchDetails();
      fetchLOAPreview();
      fetchSigningStatus();
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

  const fetchLOAPreview = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/documents/loa-preview`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const preview = await response.json();
        setLoaPreview(preview);
      }
    } catch (err) {
      console.error('Error fetching LOA preview:', err);
      // Non-critical error, don't fail the whole page
    }
  };

  const fetchSigningStatus = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/documents/signing-status`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const status = await response.json();
        setSigningStatus(status);
      }
    } catch (err) {
      console.error('Error fetching signing status:', err);
      // Non-critical error, don't fail the whole page
    }
  };

  const handleSubmitSignature = async () => {
    if (!signature || !agreed) {
      alert('Please sign the document and check the agreement box');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/documents/sign-loa`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            signature_data: signature,
            agreed: agreed
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to submit signature');
      }

      // Refresh signing status
      await fetchSigningStatus();

    } catch (err) {
      console.error('Error submitting signature:', err);
      alert(err instanceof Error ? err.message : 'Failed to submit signature');
    } finally {
      setSubmitting(false);
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Success Header */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
          <div className="text-center">
            <div className="text-green-500 text-4xl mb-2">✅</div>
            <h1 className="text-2xl font-bold text-green-800 mb-1">
              Payment Successful!
            </h1>
            <p className="text-green-700">
              Complete the authorization below to finalize your plan switch.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* LEFT SIDE: Plan Details */}
          <div className="space-y-6">
            {/* Switch Details */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="px-6 py-4 bg-blue-50 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Your Plan Switch</h2>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Current Plan</h3>
                    <div className="bg-orange-50 rounded-lg p-4">
                      <p className="text-xl font-bold text-orange-600">{switchDetails?.current_plan}</p>
                      <p className="text-gray-600">{formatCurrency(switchDetails?.current_plan_cost || 0)}/year</p>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl">⬇️</div>
                    <p className="text-sm text-gray-500">Switching to</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Recommended Plan</h3>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xl font-bold text-blue-600">{switchDetails?.best_rate}</p>
                      <p className="text-gray-600">{formatCurrency(switchDetails?.best_rate_cost || 0)}/year</p>
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <h3 className="text-sm font-medium text-green-600 uppercase tracking-wide mb-1">Annual Savings</h3>
                    <p className="text-3xl font-bold text-green-600">
                      {formatCurrency(switchDetails?.savings_amount || 0)}
                    </p>
                    <p className="text-green-700 text-sm">Every year after switching</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Process Status */}
            {signingStatus && (
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Process Status</h2>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mr-3">
                        <span className="text-green-600 font-semibold text-xs">✓</span>
                      </div>
                      <span className="text-gray-900">Payment Complete</span>
                    </div>
                    
                    <div className="flex items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${
                        signingStatus.loa_signed 
                          ? 'bg-green-100' 
                          : 'bg-yellow-100'
                      }`}>
                        <span className={`font-semibold text-xs ${
                          signingStatus.loa_signed 
                            ? 'text-green-600' 
                            : 'text-yellow-600'
                        }`}>
                          {signingStatus.loa_signed ? '✓' : '⏳'}
                        </span>
                      </div>
                      <span className="text-gray-900">Authorization Signed</span>
                    </div>
                    
                    <div className="flex items-center">
                      <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center mr-3">
                        <span className="text-gray-400 font-semibold text-xs">○</span>
                      </div>
                      <span className="text-gray-500">Submit to Con Edison</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT SIDE: Signing Form */}
          <div className="space-y-6">
            {signingStatus?.loa_signed ? (
              /* Already Signed */
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="px-6 py-4 bg-green-50 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">✅ Authorization Complete</h2>
                </div>
                <div className="p-6">
                  <p className="text-green-700 mb-4">
                    Thank you! Your Letter of Authorization has been signed and processed.
                  </p>
                  {signingStatus.signed_at && (
                    <p className="text-sm text-gray-600">
                      Signed on {new Date(signingStatus.signed_at).toLocaleString()}
                    </p>
                  )}
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-2">Next Steps:</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• We'll submit your authorization to Con Edison</li>
                      <li>• You'll receive email updates on progress</li>
                      <li>• Your new rate takes effect in 1-2 billing cycles</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              /* Signing Form */
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="px-6 py-4 bg-blue-50 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Sign Authorization</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Electronic signature required to complete your switch
                  </p>
                </div>
                <div className="p-6">
                  {loaPreview && (
                    <div className="mb-6">
                      <h3 className="font-semibold text-gray-900 mb-3">Document Preview</h3>
                      <div className="bg-gray-50 rounded-lg p-4 max-h-40 overflow-y-auto">
                        <div 
                          className="text-xs prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: loaPreview.html_content }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="font-semibold text-gray-900 mb-3">Your Signature</h3>
                    <SignatureCanvas
                      onSignatureChange={setSignature}
                      className="w-full"
                    />
                  </div>

                  <div className="mb-6">
                    <label className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5"
                      />
                      <span className="text-sm text-gray-700 leading-relaxed">
                        I hereby authorize Live Wire Energy Solutions to act as my agent 
                        for switching my electricity rate plan and communicating with Con Edison on my behalf.
                      </span>
                    </label>
                  </div>

                  <button
                    onClick={handleSubmitSignature}
                    disabled={!signature || !agreed || submitting}
                    className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      'Complete Plan Switch Authorization'
                    )}
                  </button>

                  {(!signature || !agreed) && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      {!signature && !agreed ? 'Please sign above and check the agreement box' :
                       !signature ? 'Please add your signature above' :
                       'Please check the agreement box'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 text-center space-x-4">
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
  );
}