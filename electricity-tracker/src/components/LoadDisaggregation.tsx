'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar, ReferenceLine } from 'recharts'
import { format, parseISO } from 'date-fns'
import { useWeatherData, downsampleWeatherTo15Minutes } from '@/hooks/useWeatherData'
import { calculateUsageCost } from '@/utils/costCalculations'
import { calculateBaseline, detectACEvents } from '@/utils/loadAnalysis'

interface ElectricityDataPoint {
  start_time: string
  end_time: string
  consumption_kwh: number | null
  provided_cost: number | null
}

interface WeatherDataPoint {
  timestamp: string
  temperature_f: number
  humidity_percent: number
}

interface ACUsage {
  startTime: string
  endTime: string
  peakWatts: number
  estimatedKwh: number
  estimatedCost: number
  avgTemperature?: number
  confidence: number
}

interface LoadDisaggregationProps {
  electricityData: ElectricityDataPoint[]
  loading?: boolean
}

export default function LoadDisaggregation({ electricityData, loading = false }: LoadDisaggregationProps) {
  const [detectedAC, setDetectedAC] = useState<ACUsage[]>([])
  const [selectedTimeRange, setSelectedTimeRange] = useState<'yesterday' | '24h' | '7d' | '30d'>('yesterday')
  const [baselineWatts, setBaselineWatts] = useState<number>(0)
  const { data: weatherData, isLoading: weatherLoading } = useWeatherData()

  const analyzeACUsage = useCallback((data: ElectricityDataPoint[], weather: WeatherDataPoint[]) => {
    const now = new Date()
    let cutoff: Date
    let endTime: Date = now
    
    if (selectedTimeRange === 'yesterday') {
      // Get yesterday's date range (midnight to midnight)
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)
      cutoff = yesterday
      
      endTime = new Date(yesterday)
      endTime.setDate(endTime.getDate() + 1)
    } else {
      const cutoffHours = selectedTimeRange === '24h' ? 24 : selectedTimeRange === '7d' ? 168 : 720
      cutoff = new Date(now.getTime() - cutoffHours * 60 * 60 * 1000)
    }
    
    // Filter recent data and convert to watts, assuming 15-minute intervals
    const recentData = data
      .filter(d => {
        if (d.consumption_kwh === null) return false
        const startTime = new Date(d.start_time)
        if (selectedTimeRange === 'yesterday') {
          return startTime >= cutoff && startTime < endTime
        }
        return startTime >= cutoff
      })
      .map(d => ({
        timestamp: d.start_time,
        watts: (d.consumption_kwh! * 1000) / 0.25, // Convert kWh to W (15min intervals)
        kwh: d.consumption_kwh!
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    if (recentData.length === 0) return

    // Downsample weather data to 15-minute intervals
    const downsampledWeather = downsampleWeatherTo15Minutes(weather)
    
    // Create weather lookup map with downsampled data
    const weatherMap = new Map()
    downsampledWeather.forEach(w => {
      weatherMap.set(w.timestamp, w.temperature_f)
    })

    // Calculate baseline usage
    const baseline = calculateBaseline(recentData)
    setBaselineWatts(baseline)

    // Detect AC usage
    const acEvents = detectACEvents(recentData, baseline)
    
    // Convert events to ACUsage format with weather data
    const acUsageList: ACUsage[] = acEvents.map(event => {
      const duration = event.endIndex - event.startIndex + 1
      const estimatedKwh = (event.avgExcessWatts * duration * 0.25) / 1000 // 15-minute intervals
      
      // Get temperature for this event
      const temperature = weatherMap.get(recentData[event.startIndex].timestamp) || undefined
      
      // Calculate confidence
      let confidence = 0.6
      if (temperature && temperature > 75) {
        confidence += 0.2
        if (temperature > 85) confidence += 0.1
      }
      if (event.avgExcessWatts > 500) confidence += 0.1
      if (event.avgExcessWatts > 1000) confidence += 0.1
      
      return {
        startTime: recentData[event.startIndex].timestamp,
        endTime: recentData[event.endIndex].timestamp,
        peakWatts: event.peakWatts,
        estimatedKwh,
        estimatedCost: calculateUsageCost(estimatedKwh),
        avgTemperature: temperature,
        confidence: Math.min(confidence, 0.95)
      }
    })
    
    setDetectedAC(acUsageList)
  }, [selectedTimeRange])

  useEffect(() => {
    if (electricityData.length > 0 && weatherData) {
      analyzeACUsage(electricityData, weatherData.data)
    }
  }, [selectedTimeRange, electricityData, weatherData, analyzeACUsage])


  const getChartData = useMemo(() => {
    const now = new Date()
    let cutoff: Date
    let endTime: Date = now
    
    if (selectedTimeRange === 'yesterday') {
      // Get yesterday's date range (midnight to midnight)
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)
      cutoff = yesterday
      
      endTime = new Date(yesterday)
      endTime.setDate(endTime.getDate() + 1)
    } else {
      const cutoffHours = selectedTimeRange === '24h' ? 24 : selectedTimeRange === '7d' ? 168 : 720
      cutoff = new Date(now.getTime() - cutoffHours * 60 * 60 * 1000)
    }
    
    // Get data for selected time range
    const recentData = electricityData
      .filter(d => {
        if (d.consumption_kwh === null) return false
        const startTime = new Date(d.start_time)
        if (selectedTimeRange === 'yesterday') {
          return startTime >= cutoff && startTime < endTime
        }
        return startTime >= cutoff
      })
      .map(d => ({
        timestamp: d.start_time,
        watts: (d.consumption_kwh! * 1000) / 0.25, // Convert kWh to W (15min intervals)
        kwh: d.consumption_kwh!
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Build optimized weather lookup with downsampled data
    const weatherLookup = new Map<string, number>()
    if (weatherData?.data) {
      const downsampledWeather = downsampleWeatherTo15Minutes(weatherData.data)
      downsampledWeather.forEach(w => {
        weatherLookup.set(w.timestamp, w.temperature_f)
      })
    }


    // Create a set of AC usage timestamps for faster lookup
    const acTimestamps = new Set<number>()
    detectedAC.forEach(ac => {
      const start = new Date(ac.startTime).getTime()
      const end = new Date(ac.endTime).getTime()
      
      recentData.forEach(dataPoint => {
        const pointTime = new Date(dataPoint.timestamp).getTime()
        if (pointTime >= start && pointTime <= end) {
          acTimestamps.add(pointTime)
        }
      })
    })

    // Combine actual data with AC detections and weather
    const chartData = recentData.map(d => {
      const pointTime = new Date(d.timestamp).getTime()
      return {
        ...d,
        temperature: weatherLookup.get(d.timestamp) || undefined,
        AC: acTimestamps.has(pointTime) ? 1 : null // Binary indicator - only show when AC is active
      }
    })
    
    // // For 24h view, ensure we show the full 24 hours even if data is missing
    // if (selectedTimeRange === '24h' && chartData.length > 0) {
    //   // If there's a gap at the end (due to 2hr delay), fill with weather-only data
    //   const lastDataTime = new Date(chartData[chartData.length - 1].timestamp).getTime()
    //   const targetEndTime = now.getTime()
    // }
    
    return chartData
  }, [selectedTimeRange, electricityData, weatherData, detectedAC])

  if (loading || weatherLoading) {
    return <div className="flex items-center justify-center h-64 dark:text-white">Loading usage analysis...</div>
  }

  const totalDetectedKwh = detectedAC.reduce((sum, ac) => sum + ac.estimatedKwh, 0)
  const totalDetectedCost = detectedAC.reduce((sum, ac) => sum + ac.estimatedCost, 0)
  const acWithTemp = detectedAC.filter(ac => ac.avgTemperature && ac.avgTemperature > 0)
  const avgTemp = acWithTemp.length > 0 
    ? acWithTemp.reduce((sum, ac) => sum + ac.avgTemperature!, 0) / acWithTemp.length 
    : 0

  // Calculate total usage for the selected period
  const now = new Date()
  const cutoffHours = selectedTimeRange === '24h' ? 24 : selectedTimeRange === '7d' ? 168 : 720
  const cutoff = new Date(now.getTime() - cutoffHours * 60 * 60 * 1000)
  
  const totalPeriodKwh = electricityData
    .filter(d => d.consumption_kwh !== null && new Date(d.start_time) >= cutoff)
    .reduce((sum, d) => sum + (d.consumption_kwh || 0), 0)
  
  const acPercentage = totalPeriodKwh > 0 ? (totalDetectedKwh / totalPeriodKwh) * 100 : 0


  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <h2 className="hidden sm:block text-xl sm:text-2xl font-bold dark:text-white">AC Usage Analysis</h2>
        <div className="flex gap-1 sm:gap-2 sm:ml-auto">
          {(['yesterday', '24h', '7d', '30d'] as const).map(range => (
            <button
              key={range}
              onClick={() => setSelectedTimeRange(range)}
              className={`flex-1 px-3 sm:px-4 py-2 rounded text-sm sm:text-base ${
                selectedTimeRange === range ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-white'
              }`}
            >
              {range === 'yesterday' ? 'Yesterday' : range === '24h' ? '24h' : range === '7d' ? '7d' : range === '30d' ? '30d' : range}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
        <div className="hidden sm:block text-center p-2 sm:p-3 bg-red-50 dark:bg-red-900/20 rounded">
          <div className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400">{detectedAC.length}</div>
          <div className="text-xs text-gray-600 dark:text-gray-300">Events</div>
        </div>
        <div className="text-center p-2 sm:p-3 bg-green-50 dark:bg-green-900/20 rounded">
          <div className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400">{totalDetectedKwh.toFixed(1)}</div>
          <div className="text-xs text-gray-600 dark:text-gray-300">kWh</div>
        </div>
        <div className="text-center p-2 sm:p-3 bg-purple-50 dark:bg-purple-900/20 rounded">
          <div className="text-base sm:text-lg font-bold text-purple-600 dark:text-purple-400">${totalDetectedCost.toFixed(2)}</div>
          <div className="text-xs text-gray-600 dark:text-gray-300">AC Cost</div>
        </div>
        <div className="text-center p-2 sm:p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
          <div className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400">{acPercentage.toFixed(1)}%</div>
          <div className="text-xs text-gray-600 dark:text-gray-300">of Total</div>
        </div>
        <div className="hidden sm:block text-center p-2 sm:p-3 bg-orange-50 dark:bg-orange-900/20 rounded">
          <div className="text-base sm:text-lg font-bold text-orange-600 dark:text-orange-400">{avgTemp.toFixed(0)}°F</div>
          <div className="text-xs text-gray-600 dark:text-gray-300">Avg Temp</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow dark:shadow-gray-700">
        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">Usage & Temperature Correlation</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={getChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="timestamp"
              tickFormatter={(value) => {
                const date = parseISO(value)
                if (selectedTimeRange === 'yesterday' || selectedTimeRange === '24h') return format(date, 'HH:mm')
                if (selectedTimeRange === '7d') return format(date, 'MMM dd')
                return format(date, 'MMM dd')
              }}
            />
            <YAxis yAxisId="left" label={{ value: 'Watts', angle: -90, position: 'insideLeft' }} />
            <YAxis yAxisId="right" orientation="right" label={{ value: 'Temperature (°F)', angle: 90, position: 'insideRight' }} />
            <YAxis yAxisId="indicator" orientation="right" domain={[0, 1]} hide />
            <Tooltip 
              labelFormatter={(value) => format(parseISO(value as string), 'MMM dd, HH:mm')}
              formatter={(value: number, name: string) => {
                if (name === 'Power Usage') return [`${value.toFixed(0)}W`, name]
                if (name === 'Temperature') return [`${value}°F`, name]
                return [value > 0 ? 'Active' : 'Inactive', name]
              }}
            />
            <Legend />
            
            {/* Temperature bar chart */}
            <Bar 
              yAxisId="right"
              dataKey="temperature" 
              fill="#fbbf24" 
              fillOpacity={0.3}
              name="Temperature"
            />
            
            {/* Actual power consumption line */}
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="watts" 
              stroke="#2563eb" 
              strokeWidth={2}
              dot={false}
              name="Power Usage"
            />
            
            {/* AC usage indicator */}
            <Line
              yAxisId="indicator"
              type="stepAfter"
              dataKey="AC"
              stroke="#ef4444"
              strokeWidth={8}
              dot={false}
              connectNulls={false}
              name="AC Usage"
            />
            
            {/* Baseline reference line */}
            <ReferenceLine 
              yAxisId="left"
              y={baselineWatts} 
              stroke="#10b981" 
              strokeDasharray="5 5"
              label={{ value: "Baseline", position: "insideTopRight" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-700">
        <h3 className="text-lg font-semibold mb-4 dark:text-white">AC Usage Events</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700">
                <th className="text-left p-2 dark:text-white">Start Time</th>
                <th className="text-left p-2 dark:text-white">Duration</th>
                <th className="text-left p-2 dark:text-white">Peak Watts</th>
                <th className="text-left p-2 dark:text-white">Energy (kWh)</th>
                <th className="text-left p-2 dark:text-white">Cost ($)</th>
                <th className="text-left p-2 dark:text-white">Temperature</th>
                <th className="text-left p-2 dark:text-white">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {detectedAC.slice(-20).map((ac, index) => {
                const start = new Date(ac.startTime)
                const end = new Date(ac.endTime)
                const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
                
                return (
                  <tr key={index} className="border-b dark:border-gray-600">
                    <td className="p-2 dark:text-white">{format(start, 'MMM dd, HH:mm')}</td>
                    <td className="p-2 dark:text-white">{durationHours.toFixed(1)}h</td>
                    <td className="p-2 dark:text-white">{ac.peakWatts.toFixed(0)}W</td>
                    <td className="p-2 dark:text-white">{ac.estimatedKwh.toFixed(4)}</td>
                    <td className="p-2 font-medium text-purple-600 dark:text-purple-400">${ac.estimatedCost.toFixed(4)}</td>
                    <td className="p-2 dark:text-white">{ac.avgTemperature ? `${ac.avgTemperature.toFixed(0)}°F` : '-'}</td>
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        ac.confidence > 0.7 ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' :
                        ac.confidence > 0.5 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200' :
                        'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
                      }`}>
                        {(ac.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
        <h4 className="font-semibold mb-2 dark:text-white">AC Detection Logic</h4>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <p className="mb-2">
            <span className="font-medium">AC Detection:</span> Identifies power spikes 200W+ above baseline usage
          </p>
          <p className="mb-2">
            <span className="font-medium">Temperature Correlation:</span> Higher confidence when temperature exceeds 75°F
          </p>
          <p>
            <span className="font-medium">Baseline:</span> Calculated as 18th percentile of usage over selected time period
          </p>
        </div>
      </div>
    </div>
  )
}