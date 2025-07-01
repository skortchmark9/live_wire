"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downsampleWeatherTo15Minutes = downsampleWeatherTo15Minutes;
exports.useWeatherData = useWeatherData;
const swr_1 = __importDefault(require("swr"));
const swr_2 = require("../lib/swr");
function downsampleWeatherTo15Minutes(hourlyData) {
    if (!hourlyData || hourlyData.length === 0)
        return [];
    const downsampled = [];
    // Sort data by timestamp
    const sortedData = [...hourlyData].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    // Helper to format timestamp with NYC timezone offset
    const formatWithTimezone = (date) => {
        let isoString = date.toISOString();
        // remove millis
        isoString = isoString.replace('.000', '');
        // Replace Z with -04:00 (NYC EDT offset)
        return isoString.replace('Z', '-04:00');
    };
    for (let i = 0; i < sortedData.length; i++) {
        const currentPoint = sortedData[i];
        const currentTime = new Date(currentPoint.timestamp);
        const nextPoint = sortedData[i + 1];
        // Add the exact hour point with timezone
        downsampled.push({
            ...currentPoint,
            timestamp: formatWithTimezone(currentTime)
        });
        // If there's a next point, interpolate values for 15, 30, and 45 minutes
        if (nextPoint) {
            const nextTime = new Date(nextPoint.timestamp);
            const tempDiff = nextPoint.temperature_f - currentPoint.temperature_f;
            const humidityDiff = nextPoint.humidity_percent - currentPoint.humidity_percent;
            // Create 15-minute interval points
            for (let minutes = 15; minutes < 60; minutes += 15) {
                const interpolatedTime = new Date(currentTime);
                interpolatedTime.setMinutes(minutes, 0, 0);
                // Only add if this time is before the next data point
                if (interpolatedTime < nextTime) {
                    const fraction = minutes / 60;
                    downsampled.push({
                        timestamp: formatWithTimezone(interpolatedTime),
                        temperature_f: currentPoint.temperature_f + (tempDiff * fraction),
                        humidity_percent: currentPoint.humidity_percent + (humidityDiff * fraction)
                    });
                }
            }
        }
        else {
            // For the last point, extend with same values for remaining 15-minute intervals
            for (let minutes = 15; minutes < 60; minutes += 15) {
                const extendedTime = new Date(currentTime);
                extendedTime.setMinutes(minutes, 0, 0);
                downsampled.push({
                    timestamp: formatWithTimezone(extendedTime),
                    temperature_f: currentPoint.temperature_f,
                    humidity_percent: currentPoint.humidity_percent
                });
            }
        }
    }
    return downsampled;
}
function useWeatherData() {
    const { data, error, isLoading, mutate } = (0, swr_1.default)('/api/weather-data', swr_2.swrConfig.fetcher, {
        ...swr_2.swrConfig,
        refreshInterval: 0,
        revalidateIfStale: false,
    });
    return {
        data: data || null,
        isLoading,
        error,
        refetch: mutate,
    };
}
