import React from 'react';
import { CombinedDataPoint, ConEdForecast } from '../types';
import { OpenWeatherDataPoint, BillingProjection, BillingPeriodDay, DailyDataBucket } from '../utils/billingProjections';
export interface BillingProjectionContextType {
    selectedModelDay: string;
    setSelectedModelDay: (day: string) => void;
    projection: BillingProjection | null;
    billingPeriodData: BillingPeriodDay[];
    lastMonthData: DailyDataBucket[];
    dailyDataBuckets: Map<string, CombinedDataPoint[]>;
    conedForecast: ConEdForecast | null;
}
interface BillingProjectionProviderProps {
    children: React.ReactNode;
    combinedData: CombinedDataPoint[];
    conedForecast: ConEdForecast | null;
    weatherData: OpenWeatherDataPoint[];
    initialDate?: string;
    onDateChange?: (date: string) => void;
}
export declare function BillingProjectionProvider({ children, combinedData, conedForecast, weatherData, initialDate, onDateChange }: BillingProjectionProviderProps): React.JSX.Element;
export declare function useBillingProjection(): BillingProjectionContextType;
export {};
//# sourceMappingURL=BillingProjectionContext.d.ts.map