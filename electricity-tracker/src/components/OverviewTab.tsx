'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { format, parseISO } from 'date-fns'
import { CombinedDataPoint, PredictionDataPoint, TimeRange } from '@electricity-tracker/shared'

interface OverviewTabProps {
  combinedData: CombinedDataPoint[]
  predictions: PredictionDataPoint[]
  timeRange: TimeRange
  setTimeRange: (range: TimeRange) => void
}

export default function OverviewTab({ 
  combinedData, 
  predictions, 
  timeRange, 
  setTimeRange 
}: OverviewTabProps) {
  const getFilteredData = () => {
    const now = new Date()
    const daysAgo = {
      '7d': 7,
      '30d': 30,
      '1d': 1
    }[timeRange];
    const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)

    return combinedData.filter(d => new Date(d.timestamp) >= cutoff)
  }

  const getHourlyAverages = () => {
    const hourlyData: { [hour: number]: { total: number; count: number } } = {}
    const filteredData = getFilteredData()
    
    filteredData.forEach(d => {
      if (!hourlyData[d.hour]) {
        hourlyData[d.hour] = { total: 0, count: 0 }
      }
      hourlyData[d.hour].total += d.consumption_kwh
      hourlyData[d.hour].count += 1
    })

    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      avgConsumption: hourlyData[hour] ? hourlyData[hour].total / hourlyData[hour].count : 0
    }))
  }

  const getTotalUsage = () => {
    const filtered = getFilteredData()
    return filtered.reduce((sum, d) => sum + d.consumption_kwh, 0).toFixed(2)
  }

  const getAvgTemperature = () => {
    const filtered = getFilteredData()
    if (filtered.length === 0) return 0
    const withTemps = filtered.filter((d): d is CombinedDataPoint & { temperature_f: number } => d.temperature_f !== null && d.temperature_f !== undefined);
    return (withTemps.reduce((sum, d) => sum + d.temperature_f, 0) / withTemps.length).toFixed(1);
  }

  const filteredData = getFilteredData()
  const hourlyAverages = getHourlyAverages()

  return (
    <>
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange('1d')}
            className={`px-4 py-2 rounded ${timeRange === '1d' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
          >
            Last 24 Hours
          </button>
          <button
            onClick={() => setTimeRange('7d')}
            className={`px-4 py-2 rounded ${timeRange === '7d' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setTimeRange('30d')}
            className={`px-4 py-2 rounded ${timeRange === '30d' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
          >
            Last 30 Days
          </button>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{getTotalUsage()}</div>
            <div className="text-gray-600 dark:text-gray-400">kWh Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{getAvgTemperature()}°F</div>
            <div className="text-gray-600 dark:text-gray-400">Avg Temp</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{filteredData.length}</div>
            <div className="text-gray-600 dark:text-gray-400">Data Points</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Usage vs Temperature</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="timestamp"
                tickFormatter={(value) => {
                  if (timeRange === '1d') {
                    return format(parseISO(value), 'HH:mm')
                  }
                  return format(parseISO(value), 'MM/dd')
                }}
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip 
                labelFormatter={(value) => format(parseISO(value as string), 'MMM dd, yyyy HH:mm')}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="consumption_kwh" 
                stroke="#2563eb" 
                strokeWidth={2}
                dot={false}
                name="Usage (kWh)"
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="temperature_f" 
                stroke="#dc2626" 
                strokeWidth={2}
                dot={false}
                name="Temperature (°F)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Average Usage by Hour of Day</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyAverages}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip 
                formatter={(value: number) => [value.toFixed(3), 'Avg kWh']}
                labelFormatter={(hour) => `${hour}:00`}
              />
              <Bar dataKey="avgConsumption" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {predictions.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">24-Hour Usage Prediction</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={predictions}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="hour"
                  domain={[0, 23]}
                  ticks={Array.from({length: 24}, (_, i) => i)}
                  tickFormatter={(hour) => `${hour}`}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(hour) => `${hour}:00`}
                  formatter={(value: number) => [value.toFixed(3), 'Predicted kWh']}
                />
                <Line 
                  type="monotone" 
                  dataKey="predicted_kwh" 
                  stroke="#f59e0b" 
                  strokeWidth={3}
                  dot={{ fill: "#f59e0b" }}
                  name="ML Prediction"
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Generated by machine learning model trained on {combinedData.length.toLocaleString()} historical data points
            </p>
          </div>
        )}
      </div>
    </>
  )
}