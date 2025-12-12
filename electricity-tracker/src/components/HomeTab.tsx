'use client';

import { useState, useEffect } from 'react';
import { calculateUsageCost, calculateBaseline, detectACEvents, classifyHVACEvent, useBillingProjection, useWeatherData, downsampleWeatherTo15Minutes, ActiveTab, ElectricityDataPoint, HVACEventType } from '@electricity-tracker/shared';

interface HomeTabProps {
  electricityData: ElectricityDataPoint[];
  setActiveTab: (tab: ActiveTab) => void;
}

export default function HomeTab({ electricityData, setActiveTab }: HomeTabProps) {
  const [displayUnit, setDisplayUnit] = useState<'$' | 'kWh'>('$');
  const [yesterdayUsage, setYesterdayUsage] = useState<number>(0);
  const [hvacCostKwh, setHvacCostKwh] = useState<number>(0);
  const [dominantType, setDominantType] = useState<HVACEventType>('unknown');

  // Use the shared billing projection context
  const { projection } = useBillingProjection();
  const { data: weatherData } = useWeatherData();

  useEffect(() => {
    if (!electricityData || electricityData.length === 0) return;

    // Calculate yesterday's usage
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);

    const yesterdayData = electricityData.filter(item => {
      const startTime = new Date(item.start_time);
      return startTime >= yesterday && startTime < yesterdayEnd;
    });

    const totalYesterdayKwh = yesterdayData.reduce((sum, item) => sum + (item.consumption_kwh || 0), 0);
    setYesterdayUsage(totalYesterdayKwh);

    // Calculate HVAC cost for yesterday - exact same logic as LoadDisaggregation
    const recentData = electricityData
      .filter(d => {
        if (d.consumption_kwh === null) return false;
        const startTime = new Date(d.start_time);
        return startTime >= yesterday && startTime < yesterdayEnd;
      })
      .map(d => ({
        timestamp: d.start_time,
        watts: (d.consumption_kwh! * 1000) / 0.25, // Convert kWh to W (15min intervals)
        kwh: d.consumption_kwh!
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (recentData.length > 0) {
      // Get extended data for baseline calculation (last 7 days)
      const extendedCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const extendedData = electricityData
        .filter(d => {
          if (d.consumption_kwh === null) return false;
          const startTime = new Date(d.start_time);
          return startTime >= extendedCutoff;
        })
        .map(d => ({
          timestamp: d.start_time,
          watts: (d.consumption_kwh! * 1000) / 0.25,
          kwh: d.consumption_kwh!
        }))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Calculate baseline usage with extended data
      const baseline = calculateBaseline(recentData, extendedData);

      // Detect HVAC usage
      const hvacEvents = detectACEvents(recentData, baseline);

      // Build weather lookup for type classification
      const weatherMap = new Map<number, number>();
      if (weatherData?.data) {
        const downsampledWeather = downsampleWeatherTo15Minutes(weatherData.data);
        downsampledWeather.forEach(w => {
          const timeMs = new Date(w.timestamp).getTime();
          weatherMap.set(timeMs, w.temperature_f);
        });
      }

      // Convert events to kWh and track types
      let heatingKwh = 0;
      let coolingKwh = 0;
      let unknownKwh = 0;

      hvacEvents.forEach(event => {
        const duration = event.endIndex - event.startIndex + 1;
        const estimatedKwh = (event.avgExcessWatts * duration * 0.25) / 1000;

        // Get temperature for this event to classify it
        const eventTimeMs = new Date(recentData[event.startIndex].timestamp).getTime();
        const temperature = weatherMap.get(eventTimeMs);
        const type = classifyHVACEvent(temperature);

        if (type === 'heating') {
          heatingKwh += estimatedKwh;
        } else if (type === 'cooling') {
          coolingKwh += estimatedKwh;
        } else {
          unknownKwh += estimatedKwh;
        }
      });

      const totalHvacKwh = heatingKwh + coolingKwh + unknownKwh;
      setHvacCostKwh(totalHvacKwh);

      // Determine dominant type - only show specific type if ALL events are that type
      if (heatingKwh > 0 && coolingKwh === 0 && unknownKwh === 0) {
        setDominantType('heating');
      } else if (coolingKwh > 0 && heatingKwh === 0 && unknownKwh === 0) {
        setDominantType('cooling');
      } else {
        setDominantType('unknown');
      }
    } else {
      setHvacCostKwh(0);
      setDominantType('unknown');
    }
  }, [electricityData, weatherData]);

  const formatValue = (kwh: number, forceUnit?: '$' | 'kWh') => {
    const unit = forceUnit || displayUnit;
    if (unit === '$') {
      const cost = calculateUsageCost(kwh);
      return `$${cost.toFixed(2)}`;
    }
    return `${kwh.toFixed(2)} kWh`;
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(2)}`;
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          Trace your electricity usage!
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-2xl p-6 text-center">
          <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
            Yesterday&apos;s Electricity
          </div>
          <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
            {formatValue(yesterdayUsage)}
          </div>
        </div>

        <button onClick={() => setActiveTab('cost')}
              className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-2xl p-6 text-center">
          <div className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
            {displayUnit === '$' ? 'Projected Bill' : 'Projected Usage'}
          </div>
          <div className="text-3xl font-bold text-green-900 dark:text-green-100">
            {displayUnit === '$' 
              ? formatCost(projection?.projectedMonthlyCost || 0)
              : `${(projection?.totalProjectedUsage || 0).toFixed(0)} kWh`
            }
          </div>
        </button>

        <button onClick={() => setActiveTab('disaggregation')}
            className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-2xl p-6 text-center">
          <div className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-2">
            {dominantType === 'heating' ? 'Heating' : dominantType === 'cooling' ? 'Cooling' : 'Heating / Cooling'} {displayUnit === '$' ? 'Cost' : 'Usage'} Yesterday
          </div>
          <div className="text-3xl font-bold text-orange-900 dark:text-orange-100">
            {formatValue(hvacCostKwh)}
          </div>
          {yesterdayUsage > 0 && (
            <div className="text-sm text-orange-700 dark:text-orange-300 mt-1">
              ({((hvacCostKwh / yesterdayUsage) * 100).toFixed(1)}% of total)
            </div>
          )}
        </button>
      </div>

      <div className="flex items-center justify-center">
        <button
          onClick={() => setDisplayUnit(displayUnit === '$' ? 'kWh' : '$')}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Show in {displayUnit === '$' ? 'kWh' : 'Dollars'}
          </span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </button>
      </div>
    </div>
  );
}