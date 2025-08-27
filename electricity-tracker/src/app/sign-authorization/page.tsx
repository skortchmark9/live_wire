'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SignatureCanvas from '@/components/documents/SignatureCanvas';

interface LOAPreview {
  html_content: string;
  customer_name: string;
  account_number: string;
  date: string;
}

export default function SignAuthorizationPage() {
  const router = useRouter();
  const [loaPreview, setLoaPreview] = useState<LOAPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchLOAPreview();
  }, []);

  const fetchLOAPreview = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/documents/loa-preview`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to load document');
      }

      const preview = await response.json();
      setLoaPreview(preview);
    } catch (err) {
      console.error('Error fetching LOA preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
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

      const result = await response.json();
      
      // Redirect to completion page
      router.push('/signing-complete');

    } catch (err) {
      console.error('Error submitting signature:', err);
      alert(err instanceof Error ? err.message : 'Failed to submit signature');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading authorization document...</p>
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
            <h1 className="text-2xl font-bold text-red-800 mb-2">Unable to Load Document</h1>
            <p className="text-red-600 mb-4">{error}</p>
            <button 
              onClick={() => router.back()}
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!loaPreview) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <div className="text-yellow-500 text-4xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-yellow-800 mb-2">Document Not Available</h1>
            <p className="text-yellow-600 mb-4">The authorization document could not be loaded.</p>
            <button 
              onClick={() => router.back()}
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Authorization Document
          </h1>
          <p className="text-gray-600">
            Please review and sign the Letter of Authorization to complete your plan switch
          </p>
        </div>

        {/* Document Preview */}
        <div className="bg-white rounded-lg shadow-lg mb-8">
          <div className="px-6 py-4 bg-blue-50 border-b border-gray-200 rounded-t-lg">
            <h2 className="text-xl font-semibold text-gray-900">Document Preview</h2>
            <p className="text-sm text-gray-600 mt-1">
              Customer: {loaPreview.customer_name} | Account: {loaPreview.account_number}
            </p>
          </div>
          
          <div className="p-6">
            <div 
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: loaPreview.html_content }}
            />
          </div>
        </div>

        {/* Signature Section */}
        <div className="bg-white rounded-lg shadow-lg mb-8">
          <div className="px-6 py-4 bg-green-50 border-b border-gray-200 rounded-t-lg">
            <h2 className="text-xl font-semibold text-gray-900">Electronic Signature</h2>
            <p className="text-sm text-gray-600 mt-1">
              Sign below to authorize the plan switch
            </p>
          </div>
          
          <div className="p-6">
            <SignatureCanvas
              onSignatureChange={setSignature}
              className="mb-6"
            />
            
            {/* Agreement Checkbox */}
            <div className="flex items-start space-x-3 mb-6">
              <input
                type="checkbox"
                id="agreement"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="agreement" className="text-sm text-gray-700 leading-5">
                I hereby authorize Live Wire Energy Solutions to act as my agent for the purpose of 
                switching my electricity rate plan as described in this Letter of Authorization. 
                I understand this authorization allows them to communicate with Con Edison on my behalf 
                and request changes to my rate plan.
              </label>
            </div>

            {/* Submit Section */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center pt-6 border-t border-gray-200">
              <button
                onClick={() => router.back()}
                className="w-full sm:w-auto px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              
              <button
                onClick={handleSubmitSignature}
                disabled={!signature || !agreed || submitting}
                className="w-full sm:w-auto px-8 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    Submitting...
                  </>
                ) : (
                  'Sign & Submit Authorization'
                )}
              </button>
            </div>
            
            {(!signature || !agreed) && (
              <p className="text-sm text-gray-500 mt-2 text-center">
                {!signature && !agreed ? 'Please sign the document and check the agreement box to continue' :
                 !signature ? 'Please sign the document above to continue' :
                 'Please check the agreement box to continue'}
              </p>
            )}
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-sm text-blue-700">
            🔒 Your signature is encrypted and stored securely. This document serves as legal authorization 
            for your electricity plan switch.
          </p>
        </div>
      </div>
    </div>
  );
}