interface ElectricityData {
    usage_data: Array<{
        start_time: string;
        end_time: string;
        consumption_kwh: number;
        provided_cost?: number;
    }>;
    forecast_data: Array<{
        bill_start_date: string;
        bill_end_date: string;
        current_date: string;
        unit_of_measure: string;
        usage_to_date: number;
        cost_to_date: number;
        forecasted_usage: number;
        forecasted_cost: number;
        typical_usage: number;
        typical_cost: number;
        account_id: string;
    }>;
    metadata: unknown;
    usage_count: number;
    forecast_count: number;
}
export declare function useElectricityData(): {
    data: ElectricityData | null;
    isLoading: boolean;
    error: any;
    refetch: import("swr").KeyedMutator<ElectricityData>;
};
export {};
//# sourceMappingURL=useElectricityData.d.ts.map