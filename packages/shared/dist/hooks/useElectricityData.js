"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useElectricityData = useElectricityData;
const swr_1 = __importDefault(require("swr"));
const swr_2 = require("../lib/swr");
function useElectricityData() {
    const { data, error, isLoading, mutate } = (0, swr_1.default)('/api/electricity-data', swr_2.swrConfig.fetcher, {
        ...swr_2.swrConfig,
        // Cache for 5 minutes before considering stale
        refreshInterval: 0, // Don't auto-refresh
        revalidateIfStale: false, // Don't auto-revalidate stale data
    });
    return {
        data: data || null,
        isLoading,
        error,
        refetch: mutate, // SWR's mutate function for manual refetch
    };
}
