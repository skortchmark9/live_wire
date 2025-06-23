'use client';

import { useForm } from 'react-hook-form';
import { useState, useEffect } from 'react';

interface MFAFormData {
  mfaCode: string;
}

interface MFAFormProps {
  onSubmit: (mfaCode: string) => void;
  onResend?: () => void;
  isLoading: boolean;
  error?: string | null;
}

export function MFAForm({ onSubmit, onResend, isLoading, error }: MFAFormProps) {
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MFAFormData>();

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFormSubmit = (data: MFAFormData) => {
    onSubmit(data.mfaCode);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 w-full max-w-sm">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">Two-Factor Authentication</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Please enter the verification code sent to your phone
        </p>
        {timeRemaining > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Time remaining: {formatTime(timeRemaining)}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Verification Code
        </label>
        <input
          id="mfaCode"
          type="text"
          autoComplete="one-time-code"
          {...register('mfaCode', { 
            required: 'Verification code is required',
            pattern: {
              value: /^\d{6}$/,
              message: 'Code must be 6 digits'
            }
          })}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-lg font-mono"
          placeholder="000000"
          disabled={isLoading || timeRemaining === 0}
          maxLength={6}
        />
        {errors.mfaCode && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.mfaCode.message}</p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {timeRemaining === 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-400 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400 px-4 py-3 rounded">
          The verification code has expired. Please log in again.
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading || timeRemaining === 0}
        className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Verifying...' : 'Verify Code'}
      </button>

      {onResend && timeRemaining > 0 && (
        <button
          type="button"
          onClick={onResend}
          className="w-full py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Resend Code
        </button>
      )}
    </form>
  );
}