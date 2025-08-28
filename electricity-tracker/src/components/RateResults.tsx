'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface RateResultsProps {
  results: {
    // These fields are always present
    current_plan_cost?: number;
    savings_amount?: number;
    data_points_count: number;
    filled_rows?: number;
    has_savings?: boolean;
    switch_purchased?: boolean;
    
    // These fields only present after payment
    costs?: Record<string, number>;
    best_rate?: string;
    best_rate_cost?: number;
    worst_rate?: string;
    worst_rate_cost?: number;
    current_plan?: string;
    potential_savings?: number;
    spreadsheet_url?: string;
  };
  onReset: () => void;
}

function RateResultsContent({ results, onReset }: RateResultsProps) {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [switchDetails, setSwitchDetails] = useState<{
    best_rate: string;
    best_rate_cost: number;
    current_plan: string;
    current_plan_cost: number;
    savings_amount: number;
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const searchParams = useSearchParams();
  
  // Check if payment was just completed
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success' && !results.switch_purchased) {
      // Payment just completed, fetch switch details
      fetchSwitchDetails();
    } else if (results.switch_purchased && !switchDetails) {
      // Already purchased, fetch details
      fetchSwitchDetails();
    }
  }, [searchParams, results.switch_purchased, switchDetails]);

  const fetchSwitchDetails = async () => {
    setIsLoadingDetails(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/rates/get-switch-details`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const details = await response.json();
        setSwitchDetails(details);
      }
    } catch (error) {
      console.error('Error fetching switch details:', error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handlePurchaseSwitch = async () => {
    setIsPurchasing(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/rates/purchase-switch`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create payment session');
      }

      const { checkout_url } = await response.json();
      
      // Redirect to Stripe Checkout
      if (checkout_url) {
        window.location.href = checkout_url;
      }
    } catch (error) {
      console.error('Error purchasing switch service:', error);
      alert(error instanceof Error ? error.message : 'Failed to start payment');
    } finally {
      setIsPurchasing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Determine what data to show
  const hasPurchased = results.switch_purchased || !!switchDetails;
  const showFullDetails = hasPurchased && (switchDetails || results.costs);
  const savingsAmount = switchDetails?.savings_amount ?? results.savings_amount ?? 0;
  const currentPlanCost = switchDetails?.current_plan_cost ?? results.current_plan_cost ?? 0;
  
  // Use switch details if available, otherwise fall back to results
  const displayData = switchDetails || results;

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mr-3">
            <span className="text-green-600 dark:text-green-400 text-xl">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-green-800 dark:text-green-200">
            Rate Analysis Complete!
          </h2>
        </div>
        <p className="text-green-700 dark:text-green-300">
          Analyzed {results.data_points_count.toLocaleString()} data points from your electricity usage.
        </p>
      </div>

      {isLoadingDetails ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : showFullDetails ? (
        // PAID USER VIEW - Show everything
        <>
          {/* Key Insights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6">
              <div className="text-center">
                <div className="text-2xl mb-2">📊</div>
                <div className="text-sm text-orange-600 dark:text-orange-400 font-medium mb-1">
                  YOUR CURRENT PLAN
                </div>
                <div className="text-lg font-bold text-orange-800 dark:text-orange-200">
                  {displayData.current_plan || 'EL1'}
                </div>
                <div className="text-2xl font-bold text-orange-900 dark:text-orange-100 mt-2">
                  {formatCurrency(currentPlanCost)}
                </div>
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  per year
                </div>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <div className="text-center">
                <div className="text-2xl mb-2">💰</div>
                <div className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">
                  RECOMMENDED PLAN
                </div>
                <div className="text-lg font-bold text-blue-800 dark:text-blue-200">
                  {displayData.best_rate}
                </div>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-2">
                  {formatCurrency(displayData.best_rate_cost || 0)}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  per year
                </div>
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
              <div className="text-center">
                <div className="text-2xl mb-2">🎯</div>
                <div className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">
                  YOUR ANNUAL SAVINGS
                </div>
                <div className="text-2xl font-bold text-green-900 dark:text-green-100 mt-2">
                  {formatCurrency(savingsAmount)}
                </div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                  every year
                </div>
              </div>
            </div>
          </div>

          {/* Success message for purchased users */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">
              ✅ Plan Switch Service Purchased!
            </h3>
            <p className="text-blue-700 dark:text-blue-300">
              Thank you for your purchase! We recommend switching to the <strong>{displayData.best_rate}</strong> plan 
              to save <strong>{formatCurrency(savingsAmount)}</strong> per year.
            </p>
            <p className="text-blue-600 dark:text-blue-400 mt-2 text-sm">
              Next steps: We&apos;ll send you instructions to complete your plan switch.
            </p>
          </div>

          {/* Rate Comparison Table (only for paid users) */}
          {('costs' in displayData) && displayData.costs && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Complete Rate Comparison
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Rate Plan
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Annual Cost
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        vs Current
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {Object.entries(displayData.costs)
                      .sort(([, a], [, b]) => (a as number) - (b as number))
                      .map(([rateName, cost]) => {
                        const isRecommended = rateName === displayData.best_rate;
                        const isCurrentPlan = rateName === displayData.current_plan;
                        const difference = (cost as number) - currentPlanCost;
                        
                        return (
                          <tr key={rateName} className={
                            isCurrentPlan ? 'bg-orange-50 dark:bg-orange-900/10' : 
                            isRecommended ? 'bg-green-50 dark:bg-green-900/10' : ''
                          }>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {rateName}
                                </div>
                                {isCurrentPlan && (
                                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                    Current
                                  </span>
                                )}
                                {isRecommended && !isCurrentPlan && (
                                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Best
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                              {formatCurrency(cost as number)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                              {difference === 0 ? (
                                <span className="text-gray-500">-</span>
                              ) : difference < 0 ? (
                                <span className="text-green-600 font-medium">
                                  -{formatCurrency(Math.abs(difference))}
                                </span>
                              ) : (
                                <span className="text-red-600">
                                  +{formatCurrency(difference)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        // FREE USER VIEW - Only show savings amount
        <>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-8">
            <div className="text-center">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-2xl font-bold text-yellow-800 dark:text-yellow-200 mb-4">
                You&apos;re Overpaying by {formatCurrency(savingsAmount)} Per Year!
              </h3>
              <p className="text-yellow-700 dark:text-yellow-300 mb-6 max-w-2xl mx-auto">
                We&apos;ve identified a better electricity rate plan that could save you money. 
                Get our plan switching service to unlock your savings.
              </p>
              
              {results.has_savings && savingsAmount > 0 ? (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-auto">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                      What You Get for $50:
                    </h4>
                    <ul className="text-left space-y-2 text-sm text-gray-700 dark:text-gray-300">
                      <li className="flex items-start">
                        <span className="text-green-500 mr-2">✓</span>
                        Your optimal rate plan recommendation
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-500 mr-2">✓</span>
                        We handle the entire switch process
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-500 mr-2">✓</span>
                        Save {formatCurrency(savingsAmount)} every year
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-500 mr-2">✓</span>
                        One-time fee, lifetime savings
                      </li>
                    </ul>
                  </div>
                  
                  <button
                    onClick={handlePurchaseSwitch}
                    disabled={isPurchasing}
                    className="px-8 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold text-lg rounded-lg transition-colors"
                  >
                    {isPurchasing ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      `Get Your Plan Switch - Just $50`
                    )}
                  </button>
                  
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    30-day money-back guarantee • Secure payment via Stripe
                  </p>
                </div>
              ) : (
                <p className="text-yellow-700 dark:text-yellow-300">
                  You&apos;re already on an optimal plan or savings are minimal.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div className="flex justify-center">
        <button
          onClick={onReset}
          className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          <span className="mr-2">🔄</span>
          Run New Analysis
        </button>
      </div>
    </div>
  );
}

export function RateResults({ results, onReset }: RateResultsProps) {
  return (
    <Suspense fallback={
      <div className="text-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading results...</p>
      </div>
    }>
      <RateResultsContent results={results} onReset={onReset} />
    </Suspense>
  );
}