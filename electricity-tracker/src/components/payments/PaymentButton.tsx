'use client';

import { useState } from 'react';
// import { loadStripe } from '@stripe/stripe-js';

interface PaymentButtonProps {
  productType: string;
  productName: string;
  productDescription: string;
  priceAmount: number; // in cents
  className?: string;
  children?: React.ReactNode;
  userSessionId?: string;
}

// Initialize Stripe - this will be loaded from environment variable
// const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

export default function PaymentButton({
  productType,
  productName,
  productDescription,
  priceAmount,
  className = '',
  children,
  userSessionId
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get user session from props or cookie
      let sessionId = userSessionId;
      if (!sessionId) {
        const cookies = document.cookie.split(';');
        const sessionCookie = cookies.find(c => c.trim().startsWith('user_session='));
        if (sessionCookie) {
          sessionId = sessionCookie.split('=')[1];
        }
      }
      
      if (!sessionId) {
        setError('Please login first');
        setLoading(false);
        return;
      }

      // Create checkout session
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/payments/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          session_id: sessionId,
          product_type: productType,
          product_name: productName,
          product_description: productDescription,
          price_amount: priceAmount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create payment session');
      }

      const { checkout_url } = await response.json();

      // Redirect to Stripe Checkout
      if (checkout_url) {
        window.location.href = checkout_url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : 'Payment failed');
      setLoading(false);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  return (
    <div className="payment-button-container">
      <button
        onClick={handlePayment}
        disabled={loading}
        className={`bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition-colors ${className}`}
      >
        {loading ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </span>
        ) : (
          children || `Pay ${formatPrice(priceAmount)}`
        )}
      </button>
      {error && (
        <div className="mt-2 text-red-600 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}