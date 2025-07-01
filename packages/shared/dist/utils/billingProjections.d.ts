import { CombinedDataPoint, ConEdForecast } from '../types';
export interface DailyDataBucket {
    date: string;
    displayDate: string;
    dayOfWeek: string;
    usage: number;
    cost: number;
    avgTemp: number | null;
    isToday: boolean;
    isYesterday: boolean;
}
export interface BillingPeriodDay extends DailyDataBucket {
    isFuture: boolean;
    isForecast: boolean;
    predictedUsage: number;
    similarDay: {
        date: string;
        similarityScore: number;
        tempDiff: number;
    } | null;
}
export interface SimilarWeatherDay {
    date: string;
    avgTemp: number;
    avgHumidity: number;
    totalUsage: number;
    dayOfWeek: number;
    data: CombinedDataPoint[];
    similarityScore: number;
    tempDiff: number;
}
export interface BillingProjection {
    monthToDateUsage: number;
    projectedRemainingUsage: number;
    totalProjectedUsage: number;
    projectedMonthlyCost: number;
    remainingDays: number;
    weatherBasedDays: number;
    simpleProjectionDays: number;
}
export interface OpenWeatherDataPoint {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
}
export declare function createDailyDataBuckets(combinedData: CombinedDataPoint[]): Map<string, CombinedDataPoint[]>;
export declare function getLastMonthData(dailyDataBuckets: Map<string, CombinedDataPoint[]>): DailyDataBucket[];
export declare function getCurrentMonthData(conedForecast: ConEdForecast | null, combinedData: CombinedDataPoint[]): CombinedDataPoint[];
export declare function findSimilarWeatherDay(targetTemp: number, targetHumidity: number | undefined, dayOfWeek: number | undefined, dailyDataBuckets: Map<string, CombinedDataPoint[]>): SimilarWeatherDay | null;
export declare function getBillingPeriodData(conedForecast: ConEdForecast | null, dailyDataBuckets: Map<string, CombinedDataPoint[]>, weatherData: OpenWeatherDataPoint[], modelDayUsage: number): BillingPeriodDay[];
export declare function calculateBillingProjection(conedForecast: ConEdForecast | null, combinedData: CombinedDataPoint[], billingPeriodData: BillingPeriodDay[]): BillingProjection;
//# sourceMappingURL=billingProjections.d.ts.map