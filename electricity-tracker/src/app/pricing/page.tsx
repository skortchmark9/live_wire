'use client';

import { useEffect, useState } from 'react';
import PaymentButton from '@/components/payments/PaymentButton';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number; // in cents
}

export default function PricingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSessionId, setUserSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Get user session from cookie
    const cookies = document.cookie.split(';');
    const sessionCookie = cookies.find(c => c.trim().startsWith('user_session='));
    if (sessionCookie) {
      const sessionId = sessionCookie.split('=')[1];
      setUserSessionId(sessionId);
    }
    
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/payments/products`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setProducts(data.products);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getFeatures = (productId: string) => {
    const features: { [key: string]: string[] } = {
      'rate_analysis': [
        'Comprehensive electricity usage analysis',
        'Rate comparison across all ConEd plans',
        'Personalized savings recommendations',
        'Downloadable detailed report',
        'Valid for 12 months of data'
      ],
      'premium_report': [
        'Everything in Rate Analysis',
        'Peak usage patterns identification',
        'Seasonal trend analysis',
        'Energy efficiency recommendations',
        'Carbon footprint calculation',
        'Priority email support'
      ],
      'consultation': [
        'Everything in Premium Report',
        '1-hour video consultation',
        'Custom energy optimization plan',
        'Equipment upgrade recommendations',
        'Follow-up email support for 30 days',
        'Quarterly check-in calls'
      ]
    };
    return features[productId] || [];
  };

  const getPopularBadge = (productId: string) => {
    return productId === 'premium_report';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p>Loading pricing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Energy Savings Plan
          </h1>
          <p className="text-xl text-gray-600">
            Optimize your electricity costs with our comprehensive analysis tools
          </p>
        </div>

        {!userSessionId && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
            <p className="text-yellow-800">
              Please <a href="/login" className="font-medium underline">login</a> to make a purchase.
            </p>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-8">
          {products.map((product) => (
            <div
              key={product.id}
              className={`relative bg-white rounded-lg shadow-lg overflow-hidden ${
                getPopularBadge(product.id) ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              {getPopularBadge(product.id) && (
                <div className="absolute top-0 right-0 bg-blue-500 text-white px-4 py-1 text-sm font-semibold">
                  Most Popular
                </div>
              )}
              
              <div className="p-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {product.name}
                </h3>
                <p className="text-gray-600 mb-4">
                  {product.description}
                </p>
                
                <div className="mb-6">
                  <span className="text-4xl font-bold text-gray-900">
                    {formatPrice(product.price)}
                  </span>
                  <span className="text-gray-600 ml-2">one-time</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {getFeatures(product.id).map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <svg
                        className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-gray-700 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <PaymentButton
                  productType={product.id}
                  productName={product.name}
                  productDescription={product.description}
                  priceAmount={product.price}
                  userSessionId={userSessionId || undefined}
                  className="w-full"
                >
                  Get Started
                </PaymentButton>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">
            All plans include:
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-gray-700">Secure payment via Stripe</span>
            </div>
            <div className="flex items-center">
              <svg className="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-gray-700">Instant access</span>
            </div>
            <div className="flex items-center">
              <svg className="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-gray-700">30-day money back guarantee</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}