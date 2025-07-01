"use strict";
'use client';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingProjectionProvider = BillingProjectionProvider;
exports.useBillingProjection = useBillingProjection;
const react_1 = __importStar(require("react"));
const date_fns_1 = require("date-fns");
const billingProjections_1 = require("../utils/billingProjections");
const BillingProjectionContext = (0, react_1.createContext)(undefined);
function BillingProjectionProvider({ children, combinedData, conedForecast, weatherData }) {
    // Initialize selectedModelDay to yesterday - this state is truly shared
    const [selectedModelDay, setSelectedModelDay] = (0, react_1.useState)(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return (0, date_fns_1.format)(yesterday, 'yyyy-MM-dd');
    });
    // Memoize daily data buckets to avoid repeated filtering
    const dailyDataBuckets = (0, react_1.useMemo)(() => {
        return (0, billingProjections_1.createDailyDataBuckets)(combinedData);
    }, [combinedData]);
    // Get last month data for model day selection
    const lastMonthData = (0, react_1.useMemo)(() => {
        return (0, billingProjections_1.getLastMonthData)(dailyDataBuckets);
    }, [dailyDataBuckets]);
    // Get the model day usage for predictions
    const modelDayUsage = (0, react_1.useMemo)(() => {
        const selectedDayData = dailyDataBuckets.get(selectedModelDay) || [];
        return selectedDayData.reduce((sum, d) => sum + d.consumption_kwh, 0);
    }, [selectedModelDay, dailyDataBuckets]);
    // Calculate billing period data
    const billingPeriodData = (0, react_1.useMemo)(() => {
        if (!conedForecast)
            return [];
        return (0, billingProjections_1.getBillingPeriodData)(conedForecast, dailyDataBuckets, weatherData, modelDayUsage);
    }, [dailyDataBuckets, conedForecast, weatherData, modelDayUsage]);
    // Calculate the billing projection
    const projection = (0, react_1.useMemo)(() => {
        if (!conedForecast || !combinedData.length)
            return null;
        return (0, billingProjections_1.calculateBillingProjection)(conedForecast, combinedData, billingPeriodData);
    }, [conedForecast, combinedData, billingPeriodData]);
    // Auto-update selectedModelDay if it's not available in the data
    (0, react_1.useEffect)(() => {
        if (lastMonthData.length > 0 && !lastMonthData.find(d => d.date === selectedModelDay)) {
            // If selected model day is not in the data, use yesterday or the most recent day
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayKey = (0, date_fns_1.format)(yesterday, 'yyyy-MM-dd');
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
    return (react_1.default.createElement(BillingProjectionContext.Provider, { value: value }, children));
}
function useBillingProjection() {
    const context = (0, react_1.useContext)(BillingProjectionContext);
    if (context === undefined) {
        throw new Error('useBillingProjection must be used within a BillingProjectionProvider');
    }
    return context;
}
