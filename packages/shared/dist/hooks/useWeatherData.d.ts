interface WeatherData {
    data: Array<{
        timestamp: string;
        temperature_f: number;
        humidity_percent: number;
    }>;
    metadata: unknown;
    count: number;
}
interface WeatherDataPoint {
    timestamp: string;
    temperature_f: number;
    humidity_percent: number;
}
export declare function downsampleWeatherTo15Minutes(hourlyData: WeatherDataPoint[]): WeatherDataPoint[];
export declare function useWeatherData(): {
    data: WeatherData | null;
    isLoading: boolean;
    error: any;
    refetch: import("swr").KeyedMutator<WeatherData>;
};
export {};
//# sourceMappingURL=useWeatherData.d.ts.map