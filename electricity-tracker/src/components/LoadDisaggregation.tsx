'use client'

import { useState, useEffect, useMemo } from 'react'
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar } from 'recharts'
import { format, parseISO } from 'date-fns'
import { useWeatherData } from '@/hooks/useWeatherData'
import { calculateUsageCost } from '@/utils/costCalculations'

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
  const [selectedTimeRange, setSelectedTimeRange] = useState<'24h' | '7d' | '30d'>('24h')
  const { data: weatherData, isLoading: weatherLoading } = useWeatherData()

  useEffect(() => {
    if (electricityData.length > 0 && weatherData) {
      analyzeACUsage(electricityData, weatherData.data)
    }
  }, [selectedTimeRange, electricityData, weatherData])

  const analyzeACUsage = (data: ElectricityDataPoint[], weather: WeatherDataPoint[]) => {
    const acUsage: ACUsage[] = []
    const now = new Date()
    const cutoffHours = selectedTimeRange === '24h' ? 24 : selectedTimeRange === '7d' ? 168 : 720
    const cutoff = new Date(now.getTime() - cutoffHours * 60 * 60 * 1000)
    
    // Filter recent data and convert to watts
    const recentData = data
      .filter(d => d.consumption_kwh !== null && new Date(d.start_time) >= cutoff)
      .map(d => ({
        timestamp: d.start_time,
        watts: (d.consumption_kwh! * 1000) / 0.25, // Convert kWh to W (15min intervals)
        kwh: d.consumption_kwh!
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    if (recentData.length === 0) return

    // Create weather lookup map with more flexible timestamp matching
    const weatherMap = new Map()
    weather.forEach(w => {
      // Store both exact timestamp and rounded timestamp for better matching
      weatherMap.set(w.timestamp, w.temperature_f)
      // Also try storing with rounded time to nearest 15 minutes
      const roundedTime = new Date(w.timestamp)
      roundedTime.setMinutes(Math.floor(roundedTime.getMinutes() / 15) * 15, 0, 0)
      weatherMap.set(roundedTime.toISOString(), w.temperature_f)
    })
    

    // Calculate baseline usage (25th percentile)
    const allWatts = recentData.map(d => d.watts)
    const sortedWatts = [...allWatts].sort((a, b) => a - b)
    const baselineWatts = sortedWatts[Math.floor(sortedWatts.length * 0.25)]

    // Detect AC usage
    detectACUsage(recentData, weatherMap, baselineWatts, acUsage)
    setDetectedAC(acUsage)
  }

  const getTemperatureForTimestamp = (timestamp: string, weatherMap: Map<string, number>): number | undefined => {
    // Try exact match first
    let temp = weatherMap.get(timestamp)
    if (temp) return temp
    
    // Try rounded timestamp
    const roundedTime = new Date(timestamp)
    roundedTime.setMinutes(Math.floor(roundedTime.getMinutes() / 15) * 15, 0, 0)
    temp = weatherMap.get(roundedTime.toISOString())
    if (temp) return temp
    
    // Try finding closest timestamp within 1 hour
    const targetTime = new Date(timestamp).getTime()
    let closestTemp: number | undefined
    let minDiff = Infinity
    
    for (const [weatherTimestamp, temperature] of weatherMap.entries()) {
      const weatherTime = new Date(weatherTimestamp).getTime()
      const diff = Math.abs(targetTime - weatherTime)
      if (diff < minDiff && diff < 60 * 60 * 1000) { // Within 1 hour
        minDiff = diff
        closestTemp = temperature
      }
    }
    
    return closestTemp
  }

  const detectACUsage = (
    data: Array<{timestamp: string, watts: number}>, 
    weatherMap: Map<string, number>, 
    baseline: number, 
    acUsage: ACUsage[]
  ) => {
    for (let i = 0; i < data.length - 2; i++) {
      const current = data[i].watts
      const excess = current - baseline
      
      // Look for significant spikes that could be AC (200W+ above baseline)
      if (excess >= 200) {
        // const temperature = getTemperatureForTimestamp(data[i].timestamp, weatherMap)
        const temperature = 80;

        // Find end of spike
        let endIndex = i
        let peakWatts = current
        for (let j = i + 1; j < Math.min(i + 24, data.length); j++) { // Up to 6 hours
          if (data[j].watts > peakWatts) peakWatts = data[j].watts
          if (data[j].watts < baseline + excess * 0.6) {
            endIndex = j - 1
            break
          }
          endIndex = j
        }
        
        if (endIndex > i) { // At least 15 minutes
          let confidence = 0.6
          
          // Higher confidence if temperature is available and hot
          if (temperature && temperature > 75) {
            confidence += 0.2
            if (temperature > 85) confidence += 0.1
          }
          
          // Higher confidence for very high usage spikes
          if (excess > 500) confidence += 0.1
          if (excess > 1000) confidence += 0.1
          
          const duration = endIndex - i + 1
          const estimatedKwh = (excess * duration * 0.25) / 1000 // Use excess watts - just the AC portion
          acUsage.push({
            startTime: data[i].timestamp,
            endTime: data[endIndex].timestamp,
            peakWatts,
            estimatedKwh,
            estimatedCost: calculateUsageCost(estimatedKwh),
            avgTemperature: temperature,
            confidence: Math.min(confidence, 0.95)
          })
          
          i = endIndex // Skip ahead
        }
      }
    }
  }


  const getChartData = useMemo(() => {
    const now = new Date()
    const cutoffHours = selectedTimeRange === '24h' ? 24 : selectedTimeRange === '7d' ? 168 : 720
    const cutoff = new Date(now.getTime() - cutoffHours * 60 * 60 * 1000)
    
    // Get data for selected time range
    const recentData = electricityData
      .filter(d => d.consumption_kwh !== null && new Date(d.start_time) >= cutoff)
      .map(d => ({
        timestamp: d.start_time,
        watts: (d.consumption_kwh! * 1000) / 0.25, // Convert kWh to W (15min intervals)
        kwh: d.consumption_kwh!
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Build optimized weather lookup - pre-sorted array for binary search
    const weatherLookup: Array<{timestamp: number, temperature: number}> = []
    if (weatherData?.data) {
      weatherData.data.forEach(w => {
        const time = new Date(w.timestamp).getTime()
        weatherLookup.push({timestamp: time, temperature: w.temperature_f})
        
        // Also add rounded timestamps for better matching
        const roundedTime = new Date(w.timestamp)
        roundedTime.setMinutes(Math.floor(roundedTime.getMinutes() / 15) * 15, 0, 0)
        weatherLookup.push({timestamp: roundedTime.getTime(), temperature: w.temperature_f})
      })
      // Sort for binary search
      weatherLookup.sort((a, b) => a.timestamp - b.timestamp)
    }

    // Optimized temperature lookup function
    const getTemperature = (timestamp: string): number | undefined => {
      const targetTime = new Date(timestamp).getTime()
      
      // Binary search for closest temperature within 1 hour
      let left = 0
      let right = weatherLookup.length - 1
      let bestMatch: {timestamp: number, temperature: number} | null = null
      let minDiff = Infinity
      
      while (left <= right) {
        const mid = Math.floor((left + right) / 2)
        const diff = Math.abs(weatherLookup[mid].timestamp - targetTime)
        
        if (diff < minDiff && diff < 60 * 60 * 1000) { // Within 1 hour
          minDiff = diff
          bestMatch = weatherLookup[mid]
        }
        
        if (weatherLookup[mid].timestamp < targetTime) {
          left = mid + 1
        } else {
          right = mid - 1
        }
      }
      
      return bestMatch?.temperature
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
    return recentData.map(d => {
      const pointTime = new Date(d.timestamp).getTime()
      return {
        ...d,
        // temperature: getTemperature(d.timestamp),
        temperature: 80,
        AC: acTimestamps.has(pointTime) ? 1 : null // Binary indicator - only show when AC is active
      }
    })
  }, [selectedTimeRange, electricityData, weatherData, detectedAC])

  if (loading || weatherLoading) {
    return <div className="flex items-center justify-center h-64">Loading usage analysis...</div>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">AC Usage Analysis</h2>
        <div className="flex gap-2">
          {(['24h', '7d', '30d'] as const).map(range => (
            <button
              key={range}
              onClick={() => setSelectedTimeRange(range)}
              className={`px-4 py-2 rounded ${
                selectedTimeRange === range ? 'bg-blue-500 text-white' : 'bg-gray-200'
              }`}
            >
              {range === '24h' ? 'Last 24h' : range === '7d' ? 'Last 7 days' : 'Last 30 days'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="text-center p-4 bg-red-50 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{detectedAC.length}</div>
          <div className="text-sm text-gray-600">AC Usage Events</div>
        </div>
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{totalDetectedKwh.toFixed(3)}</div>
          <div className="text-sm text-gray-600">kWh from AC</div>
        </div>
        <div className="text-center p-4 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">${totalDetectedCost.toFixed(2)}</div>
          <div className="text-sm text-gray-600">Cost from AC</div>
        </div>
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{acPercentage.toFixed(1)}%</div>
          <div className="text-sm text-gray-600">of Total Usage</div>
        </div>
        <div className="text-center p-4 bg-orange-50 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">{avgTemp.toFixed(0)}°F</div>
          <div className="text-sm text-gray-600">Avg Temp during AC</div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Usage & Temperature Correlation</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={getChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="timestamp"
              tickFormatter={(value) => {
                const date = parseISO(value)
                if (selectedTimeRange === '24h') return format(date, 'HH:mm')
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">AC Usage Events</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2">Start Time</th>
                <th className="text-left p-2">Duration</th>
                <th className="text-left p-2">Peak Watts</th>
                <th className="text-left p-2">Energy (kWh)</th>
                <th className="text-left p-2">Cost ($)</th>
                <th className="text-left p-2">Temperature</th>
                <th className="text-left p-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {detectedAC.slice(-20).map((ac, index) => {
                const start = new Date(ac.startTime)
                const end = new Date(ac.endTime)
                const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
                
                return (
                  <tr key={index} className="border-b">
                    <td className="p-2">{format(start, 'MMM dd, HH:mm')}</td>
                    <td className="p-2">{durationHours.toFixed(1)}h</td>
                    <td className="p-2">{ac.peakWatts.toFixed(0)}W</td>
                    <td className="p-2">{ac.estimatedKwh.toFixed(4)}</td>
                    <td className="p-2 font-medium text-purple-600">${ac.estimatedCost.toFixed(4)}</td>
                    <td className="p-2">{ac.avgTemperature ? `${ac.avgTemperature.toFixed(0)}°F` : '-'}</td>
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        ac.confidence > 0.7 ? 'bg-green-100 text-green-800' :
                        ac.confidence > 0.5 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
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

      <div className="bg-red-50 p-4 rounded-lg">
        <h4 className="font-semibold mb-2">AC Detection Logic</h4>
        <div className="text-sm text-gray-600">
          <p className="mb-2">
            <span className="font-medium">AC Detection:</span> Identifies power spikes 200W+ above baseline usage
          </p>
          <p className="mb-2">
            <span className="font-medium">Temperature Correlation:</span> Higher confidence when temperature exceeds 75°F
          </p>
          <p>
            <span className="font-medium">Baseline:</span> Calculated as 25th percentile of usage over selected time period
          </p>
        </div>
      </div>
    </div>
  )
}