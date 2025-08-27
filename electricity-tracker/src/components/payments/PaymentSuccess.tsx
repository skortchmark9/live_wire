'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface PaymentDetails {
  payment_status: string;
  amount: number;
  currency: string;
  customer_email: string;
  product_type: string;
}

export default function PaymentSuccess() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('No payment session ID found');
      setLoading(false);
      return;
    }

    verifyPayment(sessionId);
  }, [sessionId]);

  const verifyPayment = async (stripeSessionId: string) => {
    try {
      // Get user session from cookie
      let userSessionId = null;
      const cookies = document.cookie.split(';');
      const sessionCookie = cookies.find(c => c.trim().startsWith('user_session='));
      if (sessionCookie) {
        userSessionId = sessionCookie.split('=')[1];
      }
      
      const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/payments/verify/${stripeSessionId}`);
      
      if (userSessionId) {
        url.searchParams.append('user_session_id', userSessionId);
      }

      const response = await fetch(url.toString(), {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to verify payment');
      }

      const data = await response.json();
      setPaymentDetails(data);
    } catch (err) {
      console.error('Error verifying payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to verify payment');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const getProductName = (productType: string) => {
    const products: { [key: string]: string } = {
      'rate_analysis': 'Electricity Rate Analysis',
      'premium_report': 'Premium Energy Report',
      'consultation': 'Energy Consultation',
    };
    return products[productType] || productType;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-8 p-6 bg-red-50 rounded-lg">
        <div className="text-center">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-2xl font-bold text-red-700 mb-2">Payment Verification Failed</h2>
          <p className="text-red-600">{error}</p>
          <a href="/pricing" className="mt-4 inline-block text-blue-600 hover:text-blue-800">
            Return to Pricing
          </a>
        </div>
      </div>
    );
  }

  if (paymentDetails?.payment_status !== 'paid') {
    return (
      <div className="max-w-md mx-auto mt-8 p-6 bg-yellow-50 rounded-lg">
        <div className="text-center">
          <svg className="w-16 h-16 text-yellow-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-2xl font-bold text-yellow-700 mb-2">Payment Pending</h2>
          <p className="text-yellow-600">Your payment is still being processed. Please check back later.</p>
          <a href="/" className="mt-4 inline-block text-blue-600 hover:text-blue-800">
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-green-50 rounded-lg">
      <div className="text-center">
        <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="text-2xl font-bold text-green-700 mb-2">Payment Successful!</h2>
        <p className="text-green-600 mb-6">Thank you for your purchase.</p>
        
        <div className="bg-white p-4 rounded-md border border-green-200 text-left">
          <h3 className="font-semibold text-gray-800 mb-2">Order Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Product:</span>
              <span className="font-medium">{getProductName(paymentDetails.product_type)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Amount:</span>
              <span className="font-medium">{formatAmount(paymentDetails.amount, paymentDetails.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Email:</span>
              <span className="font-medium">{paymentDetails.customer_email}</span>
            </div>
          </div>
        </div>
        
        <p className="text-gray-600 mt-6 text-sm">
          A receipt has been sent to your email address.
        </p>
        
        <div className="mt-6 space-x-4">
          <a href="/" className="inline-block bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors">
            Return to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}