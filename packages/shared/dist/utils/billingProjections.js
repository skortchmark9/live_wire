"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDailyDataBuckets = createDailyDataBuckets;
exports.getLastMonthData = getLastMonthData;
exports.getCurrentMonthData = getCurrentMonthData;
exports.findSimilarWeatherDay = findSimilarWeatherDay;
exports.getBillingPeriodData = getBillingPeriodData;
exports.calculateBillingProjection = calculateBillingProjection;
const date_fns_1 = require("date-fns");
const costCalculations_1 = require("./costCalculations");
function createDailyDataBuckets(combinedData) {
    const buckets = new Map();
    combinedData.forEach(d => {
        const dateKey = d.timestamp.substring(0, 10); // YYYY-MM-DD
        if (!buckets.has(dateKey)) {
            buckets.set(dateKey, []);
        }
        buckets.get(dateKey).push(d);
    });
    return buckets;
}
function getLastMonthData(dailyDataBuckets) {
    const now = new Date();
    const lastMonth = [];
    // Get last 30 days, but build array from oldest to newest so today is on the right
    for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateKey = (0, date_fns_1.format)(date, 'yyyy-MM-dd');
        const dayData = dailyDataBuckets.get(dateKey) || [];
        const totalUsage = dayData.reduce((sum, d) => sum + d.consumption_kwh, 0);
        const totalCost = (0, costCalculations_1.calculateCostBreakdown)(totalUsage).variableCost;
        const avgTemp = dayData.length > 0
            ? dayData.filter(d => d.temperature_f !== null && d.temperature_f !== undefined)
                .reduce((sum, d, _, arr) => sum + (d.temperature_f / arr.length), 0)
            : null;
        // Only include days with data
        if (totalUsage > 0) {
            lastMonth.push({
                date: dateKey,
                displayDate: (0, date_fns_1.format)(date, 'MMM dd'),
                dayOfWeek: (0, date_fns_1.format)(date, 'EEE'),
                usage: totalUsage,
                cost: totalCost,
                avgTemp: avgTemp,
                isToday: dateKey === (0, date_fns_1.format)(now, 'yyyy-MM-dd'),
                isYesterday: dateKey === (0, date_fns_1.format)(new Date(now.getTime() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
            });
        }
    }
    return lastMonth;
}
function getCurrentMonthData(conedForecast, combinedData) {
    if (!conedForecast)
        return [];
    const billStart = (0, date_fns_1.parseISO)(conedForecast.bill_start_date);
    const now = new Date();
    return combinedData.filter(d => {
        const dataDate = new Date(d.timestamp);
        return dataDate >= billStart && dataDate <= now;
    });
}
function findSimilarWeatherDay(targetTemp, targetHumidity, dayOfWeek, dailyDataBuckets) {
    // Find historical days with similar weather conditions
    const historicalDays = Array.from(dailyDataBuckets.entries())
        .map(([date, dayData]) => {
        if (dayData.length === 0)
            return null;
        const avgTemp = dayData.filter(d => d.temperature_f !== null && d.temperature_f !== undefined)
            .reduce((sum, d, _, arr) => sum + (d.temperature_f / arr.length), 0);
        const avgHumidity = dayData.filter(d => d.temperature_f !== null)
            .reduce((sum, d, _, arr) => sum + ((d.temperature_f) / arr.length), 0);
        const totalUsage = dayData.reduce((sum, d) => sum + d.consumption_kwh, 0);
        const dayDate = (0, date_fns_1.parseISO)(date);
        return {
            date,
            avgTemp,
            avgHumidity,
            totalUsage,
            dayOfWeek: dayDate.getDay(),
            data: dayData
        };
    })
        .filter((day) => day !== null && day.avgTemp > 0 && day.totalUsage > 0);
    if (historicalDays.length === 0)
        return null;
    // Calculate similarity scores
    const scoredDays = historicalDays.map(day => {
        let score = 0;
        // Temperature similarity (most important factor)
        const tempDiff = Math.abs(day.avgTemp - targetTemp);
        const tempScore = Math.max(0, 100 - (tempDiff * 2)); // Penalty of 2 points per degree difference
        score += tempScore * 0.6; // 60% weight
        // Humidity/apparent temperature similarity
        if (targetHumidity && day.avgHumidity) {
            const humidityDiff = Math.abs(day.avgHumidity - targetHumidity);
            const humidityScore = Math.max(0, 100 - (humidityDiff * 1.5));
            score += humidityScore * 0.25; // 25% weight
        }
        // Day of week similarity (weekday vs weekend patterns)
        if (dayOfWeek !== undefined) {
            const isTargetWeekend = dayOfWeek >= 5;
            const isDayWeekend = day.dayOfWeek >= 5;
            const dowScore = isTargetWeekend === isDayWeekend ? 100 : 70; // Moderate penalty for different day types
            score += dowScore * 0.15; // 15% weight
        }
        return {
            ...day,
            similarityScore: score,
            tempDiff: tempDiff
        };
    });
    // Sort by similarity score and return the best match
    const bestMatch = scoredDays.sort((a, b) => b.similarityScore - a.similarityScore)[0];
    // Only return if the match is reasonably good (temperature within 10 degrees)
    if (bestMatch && bestMatch.tempDiff <= 10) {
        return bestMatch;
    }
    return null;
}
function getBillingPeriodData(conedForecast, dailyDataBuckets, weatherData, modelDayUsage) {
    if (!conedForecast)
        return [];
    const billStart = (0, date_fns_1.parseISO)(conedForecast.bill_start_date);
    const billEnd = (0, date_fns_1.parseISO)(conedForecast.bill_end_date);
    const now = new Date();
    const billingPeriodDays = [];
    // Create weather map for easier lookup
    const weatherMap = new Map();
    weatherData.forEach(weather => {
        const dateKey = weather.time.substring(0, 10); // YYYY-MM-DD
        if (!weatherMap.has(dateKey)) {
            weatherMap.set(dateKey, []);
        }
        weatherMap.get(dateKey).push(weather);
    });
    const currentDate = new Date(billStart);
    while (currentDate <= billEnd) {
        const dateKey = (0, date_fns_1.format)(currentDate, 'yyyy-MM-dd');
        const dayData = dailyDataBuckets.get(dateKey) || [];
        const isHistorical = currentDate <= now;
        const isToday = dateKey === (0, date_fns_1.format)(now, 'yyyy-MM-dd');
        const isYesterday = dateKey === (0, date_fns_1.format)(new Date(now.getTime() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
        let totalUsage = 0;
        let avgTemp = null;
        let predictedUsage = 0;
        let similarDay = null;
        if (isHistorical) {
            // Historical data - use actual usage
            totalUsage = dayData.reduce((sum, d) => sum + d.consumption_kwh, 0);
            // Get temperature from actual data if available
            if (dayData.length > 0) {
                const temps = dayData.filter(d => d.temperature_f !== null && d.temperature_f !== undefined);
                avgTemp = temps.length > 0
                    ? temps.reduce((sum, d) => sum + d.temperature_f, 0) / temps.length
                    : null;
            }
        }
        else {
            // Future data - no usage yet, but we might have forecast weather
            totalUsage = 0;
        }
        // Try to get temperature from weather forecast if not available from actual data
        if (avgTemp === null) {
            const weatherForDay = weatherMap.get(dateKey) || [];
            if (weatherForDay.length > 0) {
                const temps = weatherForDay.filter(w => w.temperature_2m !== null && w.temperature_2m !== undefined);
                avgTemp = temps.length > 0
                    ? temps.reduce((sum, w) => sum + w.temperature_2m, 0) / temps.length
                    : null;
            }
        }
        // For future days, always predict usage
        if (!isHistorical) {
            if (avgTemp !== null) {
                // We have weather forecast, use it to find similar days
                const weatherForDay = weatherMap.get(dateKey) || [];
                const avgHumidity = weatherForDay.length > 0
                    ? weatherForDay.filter(w => w.relative_humidity_2m !== null)
                        .reduce((sum, w, _, arr) => sum + (w.relative_humidity_2m / arr.length), 0)
                    : undefined;
                const similarWeatherDay = findSimilarWeatherDay(avgTemp, avgHumidity, currentDate.getDay(), dailyDataBuckets);
                if (similarWeatherDay) {
                    predictedUsage = similarWeatherDay.totalUsage;
                    similarDay = {
                        date: similarWeatherDay.date,
                        similarityScore: similarWeatherDay.similarityScore,
                        tempDiff: similarWeatherDay.tempDiff
                    };
                }
                else {
                    predictedUsage = modelDayUsage;
                }
            }
            else {
                // No weather data, use model day usage
                predictedUsage = modelDayUsage;
            }
        }
        billingPeriodDays.push({
            date: dateKey,
            displayDate: (0, date_fns_1.format)(currentDate, 'MMM dd'),
            dayOfWeek: (0, date_fns_1.format)(currentDate, 'EEE'),
            usage: totalUsage,
            cost: (0, costCalculations_1.calculateCostBreakdown)(totalUsage).variableCost,
            avgTemp: avgTemp,
            isToday: isToday,
            isYesterday: isYesterday,
            isFuture: !isHistorical,
            isForecast: !isHistorical && avgTemp !== null, // Has forecast weather
            predictedUsage: predictedUsage,
            similarDay: similarDay
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return billingPeriodDays;
}
function calculateBillingProjection(conedForecast, combinedData, billingPeriodData) {
    const currentBillData = getCurrentMonthData(conedForecast, combinedData);
    const billToDateUsage = currentBillData.reduce((sum, d) => sum + d.consumption_kwh, 0);
    const futureData = billingPeriodData.filter(d => d.isFuture);
    // All future days now have predictedUsage set
    const projectedRemainingUsage = futureData.reduce((sum, day) => sum + day.predictedUsage, 0);
    const totalProjectedUsage = billToDateUsage + projectedRemainingUsage;
    // Count days with weather-based vs model-based predictions
    const weatherBasedDays = futureData.filter(d => d.isForecast && d.similarDay).length;
    const monthToDateCost = (0, costCalculations_1.calculateCostBreakdown)(billToDateUsage);
    const remainingCost = (0, costCalculations_1.calculateCostBreakdown)(projectedRemainingUsage);
    const projectedMonthlyCost = monthToDateCost.variableCost + remainingCost.variableCost + (0, costCalculations_1.calculateCostBreakdown)(0).fixedCost;
    return {
        monthToDateUsage: billToDateUsage,
        projectedRemainingUsage,
        totalProjectedUsage,
        projectedMonthlyCost,
        remainingDays: futureData.length,
        weatherBasedDays: weatherBasedDays,
        simpleProjectionDays: futureData.length - weatherBasedDays
    };
}
