'use client';

import { useState } from 'react';

interface RateCalculationFormProps {
  onStart: (startDate: string, endDate: string) => void;
}

export function RateCalculationForm({ onStart }: RateCalculationFormProps) {
  const [startDate, setStartDate] = useState('2024-08-01');
  const [endDate, setEndDate] = useState('2025-07-31');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await onStart(startDate, endDate);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateExpectedDataPoints = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return days * 96; // 96 15-minute intervals per day
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Rate Calculation Settings
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>
          
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              End Date
            </label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start">
            <div className="w-5 h-5 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mr-3 mt-0.5">
              <span className="text-blue-600 dark:text-blue-400 text-xs">ℹ</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                What This Does
              </h3>
              <div className="text-blue-700 dark:text-blue-300 text-sm mt-1 space-y-2">
                <p>This analysis will:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Download your usage data from ConEd for the selected period</li>
                  <li>Calculate costs under 5 different ConEd rate structures</li>
                  <li>Show you which rate plan would save you the most money</li>
                  <li>Generate a detailed spreadsheet with all calculations</li>
                </ul>
                <p className="mt-2">
                  Expected data points: ~{calculateExpectedDataPoints().toLocaleString()} 
                  (15-minute intervals)
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  ⏱️ This process typically takes 2-5 minutes depending on the date range
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-8 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Starting...
              </div>
            ) : (
              'Start Rate Analysis'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}