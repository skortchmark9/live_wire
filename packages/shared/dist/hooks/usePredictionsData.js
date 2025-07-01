"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePredictionsData = usePredictionsData;
const swr_1 = __importDefault(require("swr"));
const swr_2 = require("../lib/swr");
function usePredictionsData() {
    const { data, error, isLoading, mutate } = (0, swr_1.default)('/api/predictions', swr_2.swrConfig.fetcher, {
        ...swr_2.swrConfig,
        refreshInterval: 0,
        revalidateIfStale: false,
        // Predictions might not exist, so don't retry aggressively
        errorRetryCount: 1,
        onError: (error) => {
            // Silently handle 404s for predictions since they might not exist
            if (error?.status === 404) {
                return;
            }
        }
    });
    return {
        data: data || null,
        isLoading,
        error: error?.status === 404 ? null : error, // Don't treat 404 as error
        refetch: mutate,
    };
}
