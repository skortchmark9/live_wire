'use client';

interface RateResultsProps {
  results: {
    costs: Record<string, number>;
    best_rate: string;
    best_rate_cost: number;
    worst_rate: string;
    worst_rate_cost: number;
    potential_savings: number;
    spreadsheet_url: string;
    data_points_count: number;
    filled_rows: number;
  };
  onReset: () => void;
}

export function RateResults({ results, onReset }: RateResultsProps) {
  const {
    costs,
    best_rate,
    best_rate_cost,
    spreadsheet_url,
    data_points_count,
  } = results;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Assume user is currently on EL1 plan
  const currentPlan = 'EL1';
  const currentPlanCost = costs[currentPlan] || 0;
  const savingsFromCurrent = currentPlanCost - best_rate_cost;
  const savingsPercentageFromCurrent = currentPlanCost > 0 ? (savingsFromCurrent / currentPlanCost) * 100 : 0;

  // Sort rates by cost (best to worst)
  const sortedRates = Object.entries(costs).sort(([, a], [, b]) => a - b);

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
          Analyzed {data_points_count.toLocaleString()} data points from your current {currentPlan} plan and compared {Object.keys(costs).length} rate options.
        </p>
      </div>

      {/* Key Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6">
          <div className="text-center">
            <div className="text-2xl mb-2">📊</div>
            <div className="text-sm text-orange-600 dark:text-orange-400 font-medium mb-1">
              YOUR CURRENT PLAN
            </div>
            <div className="text-lg font-bold text-orange-800 dark:text-orange-200">
              {currentPlan}
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
              BEST AVAILABLE RATE
            </div>
            <div className="text-lg font-bold text-blue-800 dark:text-blue-200">
              {best_rate}
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-2">
              {formatCurrency(best_rate_cost)}
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
              YOUR POTENTIAL SAVINGS
            </div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-100 mt-2">
              {savingsFromCurrent > 0 ? formatCurrency(savingsFromCurrent) : '$0.00'}
            </div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              {savingsFromCurrent > 0 ? `${savingsPercentageFromCurrent.toFixed(1)}% reduction` : 'Already on best plan!'}
            </div>
          </div>
        </div>
      </div>

      {/* Rate Comparison Table */}
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
                  vs Your Current Plan
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Ranking
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {sortedRates.map(([rateName, cost], index) => {
                const isRecommended = rateName === best_rate;
                const isCurrentPlan = rateName === currentPlan;
                const differenceFromCurrent = cost - currentPlanCost;
                
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
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                            Current Plan
                          </span>
                        )}
                        {isRecommended && !isCurrentPlan && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Recommended
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(cost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {differenceFromCurrent === 0 ? (
                        <span className="text-orange-600 dark:text-orange-400 font-medium">Current</span>
                      ) : differenceFromCurrent < 0 ? (
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          {formatCurrency(Math.abs(differenceFromCurrent))} savings
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">
                          +{formatCurrency(differenceFromCurrent)} more
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900 dark:text-white">
                      #{index + 1}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <a
          href={spreadsheet_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
        >
          <span className="mr-2">📊</span>
          View Detailed Spreadsheet
        </a>
        
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