interface PredictionsData {
    predictions: Array<{
        date: string;
        predicted_usage: number;
        confidence: number;
    }>;
    metadata: unknown;
    count: number;
}
export declare function usePredictionsData(): {
    data: PredictionsData | null;
    isLoading: boolean;
    error: any;
    refetch: import("swr").KeyedMutator<PredictionsData>;
};
export {};
//# sourceMappingURL=usePredictionsData.d.ts.map