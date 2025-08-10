'use client';

interface ProgressUpdate {
  step: string;
  message: string;
  progress: number;
}

interface RateCalculationProgressProps {
  progress: ProgressUpdate;
}

const stepIcons = {
  initializing: '🔧',
  downloading_template: '📥',
  authenticating_coned: '🔐',
  fetching_account: '👤',
  fetching_usage: '⚡',
  filling_template: '📊',
  uploading: '☁️',
  calculating_rates: '🧮',
  completed: '✅',
  error: '❌',
};

const stepLabels = {
  initializing: 'Initializing',
  downloading_template: 'Downloading Template',
  authenticating_coned: 'Connecting to ConEd',
  fetching_account: 'Getting Account Info',
  fetching_usage: 'Fetching Usage Data',
  filling_template: 'Processing Data',
  uploading: 'Uploading to Drive',
  calculating_rates: 'Calculating Rates',
  completed: 'Complete',
  error: 'Error',
};

export function RateCalculationProgress({ progress }: RateCalculationProgressProps) {
  const { step, message, progress: progressPercent } = progress;
  
  console.log('RateCalculationProgress rendering with:', {
    step,
    message,
    progressPercent,
    timestamp: new Date().toISOString()
  });
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="text-center mb-8">
        <div className="text-4xl mb-4">
          {stepIcons[step as keyof typeof stepIcons] || '⚙️'}
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {stepLabels[step as keyof typeof stepLabels] || 'Processing'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {message}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
        <div 
          className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.max(progressPercent, 5)}%` }}
        />
      </div>
      
      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-6">
        <span>Progress</span>
        <span>{progressPercent}%</span>
      </div>

      {/* Step Progress Indicators */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {Object.entries(stepLabels).slice(0, -2).map(([stepKey, label]) => {
          const isActive = stepKey === step;
          const isCompleted = getStepOrder(stepKey) < getStepOrder(step);
          
          return (
            <div
              key={stepKey}
              className={`text-center p-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : isCompleted
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-gray-100 dark:bg-gray-700/30 text-gray-500 dark:text-gray-500'
              }`}
            >
              <div className="text-lg mb-1">
                {isCompleted ? '✅' : stepIcons[stepKey as keyof typeof stepIcons] || '⚙️'}
              </div>
              <div className="text-xs font-medium">
                {label.split(' ').map((word, i) => (
                  <div key={i}>{word}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <div className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400 mr-2"></div>
          Please keep this page open while we process your data
        </div>
      </div>
    </div>
  );
}

function getStepOrder(step: string): number {
  const order = [
    'initializing',
    'downloading_template', 
    'authenticating_coned',
    'fetching_account',
    'fetching_usage',
    'filling_template',
    'uploading',
    'calculating_rates'
  ];
  return order.indexOf(step);
}