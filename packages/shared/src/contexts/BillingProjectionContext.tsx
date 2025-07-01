'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { CombinedDataPoint, ConEdForecast } from '../types';
import { 
  createDailyDataBuckets, 
  getLastMonthData, 
  getBillingPeriodData, 
  calculateBillingProjection,
  OpenWeatherDataPoint,
  BillingProjection,
  BillingPeriodDay,
  DailyDataBucket
} from '../utils/billingProjections';

export interface BillingProjectionContextType {
  selectedModelDay: string;
  setSelectedModelDay: (day: string) => void;
  projection: BillingProjection | null;
  billingPeriodData: BillingPeriodDay[];
  lastMonthData: DailyDataBucket[];
  dailyDataBuckets: Map<string, CombinedDataPoint[]>;
  conedForecast: ConEdForecast | null;
}

const BillingProjectionContext = createContext<BillingProjectionContextType | undefined>(undefined);

interface BillingProjectionProviderProps {
  children: React.ReactNode;
  combinedData: CombinedDataPoint[];
  conedForecast: ConEdForecast | null;
  weatherData: OpenWeatherDataPoint[];
}

export function BillingProjectionProvider({ 
  children, 
  combinedData, 
  conedForecast, 
  weatherData 
}: BillingProjectionProviderProps) {
  
  // Initialize selectedModelDay to yesterday - this state is truly shared
  const [selectedModelDay, setSelectedModelDay] = useState<string>(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return format(yesterday, 'yyyy-MM-dd');
  });

  // Memoize daily data buckets to avoid repeated filtering
  const dailyDataBuckets = useMemo(() => {
    return createDailyDataBuckets(combinedData);
  }, [combinedData]);

  // Get last month data for model day selection
  const lastMonthData = useMemo(() => {
    return getLastMonthData(dailyDataBuckets);
  }, [dailyDataBuckets]);

  // Get the model day usage for predictions
  const modelDayUsage = useMemo(() => {
    const selectedDayData = dailyDataBuckets.get(selectedModelDay) || [];
    return selectedDayData.reduce((sum, d) => sum + d.consumption_kwh, 0);
  }, [selectedModelDay, dailyDataBuckets]);

  // Calculate billing period data
  const billingPeriodData = useMemo(() => {
    if (!conedForecast) return [];
    
    return getBillingPeriodData(
      conedForecast,
      dailyDataBuckets,
      weatherData,
      modelDayUsage
    );
  }, [dailyDataBuckets, conedForecast, weatherData, modelDayUsage]);

  // Calculate the billing projection
  const projection = useMemo(() => {
    if (!conedForecast || !combinedData.length) return null;
    
    return calculateBillingProjection(conedForecast, combinedData, billingPeriodData);
  }, [conedForecast, combinedData, billingPeriodData]);

  // Auto-update selectedModelDay if it's not available in the data
  useEffect(() => {
    if (lastMonthData.length > 0 && !lastMonthData.find(d => d.date === selectedModelDay)) {
      // If selected model day is not in the data, use yesterday or the most recent day
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = format(yesterday, 'yyyy-MM-dd');
      const fallbackDay = lastMonthData.find(d => d.date === yesterdayKey) || lastMonthData[lastMonthData.length - 1];
      
      if (fallbackDay) {
        setSelectedModelDay(fallbackDay.date);
      }
    }
  }, [lastMonthData, selectedModelDay]);

  const value = {
    selectedModelDay,
    setSelectedModelDay,
    projection,
    billingPeriodData,
    lastMonthData,
    dailyDataBuckets,
    conedForecast
  };

  return (
    <BillingProjectionContext.Provider value={value}>
      {children}
    </BillingProjectionContext.Provider>
  );
}

export function useBillingProjection() {
  const context = useContext(BillingProjectionContext);
  if (context === undefined) {
    throw new Error('useBillingProjection must be used within a BillingProjectionProvider');
  }
  return context;
}