'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'
import { format, parseISO } from 'date-fns'

interface ElectricityDataPoint {
  start_time: string
  end_time: string
  consumption_kwh: number | null
  provided_cost: number | null
}

interface ApplianceSignature {
  name: string
  watts: number
  pattern?: string
  color: string
}

interface DetectedUsage {
  appliance: string
  startTime: string
  endTime: string
  estimatedKwh: number
  confidence: number
}

const APPLIANCE_SIGNATURES: ApplianceSignature[] = [
  { name: 'Fridge (Compressor)', watts: 160, pattern: 'cyclic-4h', color: '#3b82f6' },
  { name: 'Fridge (Base)', watts: 60, pattern: 'constant', color: '#60a5fa' },
  { name: 'Charging Laptop', watts: 100, pattern: 'block-2-4h', color: '#10b981' },
  { name: 'Fridge (Amortized)', watts: 85, pattern: 'average', color: '#8b5cf6' },
  { name: 'Fan', watts: 30, pattern: 'manual', color: '#f59e0b' },
  { name: 'Piano', watts: 5, pattern: 'manual', color: '#ef4444' },
  { name: 'Lamp', watts: 2, pattern: 'manual', color: '#6b7280' }
]

export default function LoadDisaggregation() {
  const [electricityData, setElectricityData] = useState<ElectricityDataPoint[]>([])
  const [detectedUsage, setDetectedUsage] = useState<DetectedUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTimeRange, setSelectedTimeRange] = useState<'24h' | '7d' | '30d'>('24h')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (electricityData.length > 0) {
      analyzeAppliances(electricityData)
    }
  }, [selectedTimeRange, electricityData])

  const loadData = async () => {
    try {
      setLoading(true)
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
      const response = await fetch(`${API_BASE_URL}/api/electricity-data`) // Use consolidated endpoint
      if (!response.ok) throw new Error('Failed to load electricity data')
      
      const data = await response.json()
      setElectricityData(data.usage_data || []) // Extract usage_data from consolidated response
      analyzeAppliances(data.usage_data || [])
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const analyzeAppliances = (data: ElectricityDataPoint[]) => {
    const detected: DetectedUsage[] = []
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

    console.log(`Analyzing ${recentData.length} data points for ${selectedTimeRange}`)
    
    if (recentData.length === 0) {
      console.log('No recent data found')
      return
    }

    // Log some sample data for debugging
    console.log('Sample data points:', recentData.slice(0, 5))
    const wattsRange = {
      min: Math.min(...recentData.map(d => d.watts)),
      max: Math.max(...recentData.map(d => d.watts)),
      avg: recentData.reduce((sum, d) => sum + d.watts, 0) / recentData.length
    }
    console.log('Watts range:', wattsRange)

    // Detect fridge compressor cycles (4-hour pattern, 160W spikes)
    detectFridgeCompressor(recentData, detected)
    
    // Detect laptop charging sessions (100W blocks)
    detectLaptopCharging(recentData, detected)
    
    // Detect manual appliances (fans, lamps, etc.)
    detectManualAppliances(recentData, detected)

    console.log(`Detected ${detected.length} usage events`)
    setDetectedUsage(detected)
  }

  const detectFridgeCompressor = (data: any[], detected: DetectedUsage[]) => {
    // First pass: find all potential compressor cycles (spikes above baseline)
    const potentialCycles: Array<{start: number, end: number, avgWatts: number, timestamp: string}> = []
    
    for (let i = 1; i < data.length - 1; i++) {
      const current = data[i].watts
      const prev = data[i - 1].watts
      const baseline = getBaselineUsage(data, i)
      
      // Look for significant power increase (compressor starting)
      if (current > baseline + 40 && current > prev + 25) {
        // Find end of this cycle
        let endIndex = i
        let maxWatts = current
        
        for (let j = i + 1; j < Math.min(i + 18, data.length); j++) { // Up to 4.5 hours
          if (data[j].watts > maxWatts) maxWatts = data[j].watts
          if (data[j].watts < baseline + 20) {
            endIndex = j - 1
            break
          }
          endIndex = j
        }
        
        // Only consider cycles that last at least 2 intervals (30 minutes)
        if (endIndex > i + 1) {
          const duration = endIndex - i + 1
          const avgWatts = data.slice(i, endIndex + 1).reduce((sum, d) => sum + d.watts, 0) / duration
          
          potentialCycles.push({
            start: i,
            end: endIndex,
            avgWatts,
            timestamp: data[i].timestamp
          })
          
          i = endIndex // Skip ahead
        }
      }
    }
    
    console.log(`Found ${potentialCycles.length} potential compressor cycles`)
    
    // Second pass: validate cycles based on 4-hour pattern
    potentialCycles.forEach((cycle, index) => {
      let confidence = 0.5
      
      // Check for periodic pattern (look for cycles ~4 hours apart)
      const cycleTime = new Date(cycle.timestamp).getTime()
      const nearCycles = potentialCycles.filter((other, otherIndex) => {
        if (otherIndex === index) return false
        const otherTime = new Date(other.timestamp).getTime()
        const hoursDiff = Math.abs(cycleTime - otherTime) / (1000 * 60 * 60)
        return hoursDiff >= 3 && hoursDiff <= 5 // 3-5 hours apart
      })
      
      if (nearCycles.length > 0) {
        confidence += 0.2 // Bonus for periodic pattern
      }
      
      // Check power level (fridge compressors typically 80-200W above baseline)
      const baseline = getBaselineUsage(data, cycle.start)
      const excess = cycle.avgWatts - baseline
      if (excess >= 60 && excess <= 180) {
        confidence += 0.2 // Bonus for typical fridge power range
      }
      
      // Check duration (fridge compressors typically run 20-60 minutes)
      const durationMinutes = (cycle.end - cycle.start + 1) * 15
      if (durationMinutes >= 20 && durationMinutes <= 90) {
        confidence += 0.1 // Bonus for typical duration
      }
      
      detected.push({
        appliance: 'Fridge Compressor',
        startTime: data[cycle.start].timestamp,
        endTime: data[cycle.end].timestamp,
        estimatedKwh: (cycle.avgWatts * (cycle.end - cycle.start + 1) * 0.25) / 1000,
        confidence: Math.min(confidence, 0.95)
      })
    })
  }

  const detectLaptopCharging = (data: any[], detected: DetectedUsage[]) => {
    // Look for sustained higher usage blocks
    for (let i = 0; i < data.length - 4; i++) { // At least 1 hour
      const block = data.slice(i, i + 4)
      const avgWatts = block.reduce((sum, d) => sum + d.watts, 0) / block.length
      const baseline = getBaselineUsage(data, i)
      
      // Check if this looks like laptop charging (60W+ above baseline)
      if (avgWatts > baseline + 60 && avgWatts >= 80) {
        // Find end of charging session
        let endIndex = i + 4
        for (let j = i + 4; j < Math.min(i + 16, data.length); j++) {
          if (data[j].watts < baseline + 40) {
            endIndex = j
            break
          }
          endIndex = j
        }
        
        const duration = endIndex - i
        if (duration >= 4) { // At least 1 hour
          detected.push({
            appliance: 'Laptop Charging',
            startTime: data[i].timestamp,
            endTime: data[endIndex].timestamp,
            estimatedKwh: (avgWatts * duration * 0.25) / 1000,
            confidence: 0.6
          })
          
          i = endIndex // Skip ahead to avoid overlaps
        }
      }
    }
  }

  const detectManualAppliances = (data: any[], detected: DetectedUsage[]) => {
    // Look for any sustained loads above baseline
    for (let i = 0; i < data.length - 2; i++) { // At least 30 minutes
      const current = data[i].watts
      const baseline = getBaselineUsage(data, i)
      const excess = current - baseline
      
      // Check for any appliance usage (15W+ excess)
      if (excess >= 15) {
        let endIndex = i
        let appliance = 'Unknown Appliance'
        
        // Classify based on power level
        if (excess >= 80) {
          appliance = 'High Power Device'
        } else if (excess >= 50) {
          appliance = 'Medium Power Device'  
        } else if (excess >= 25) {
          appliance = 'Fan/Small Appliance'
        } else {
          appliance = 'Light/Low Power'
        }
        
        for (let j = i + 1; j < Math.min(i + 24, data.length); j++) { // Up to 6 hours
          if (data[j].watts - baseline < excess * 0.7) {
            endIndex = j - 1
            break
          }
          endIndex = j
        }
        
        if (endIndex > i + 1) { // At least 30 minutes
          const duration = endIndex - i + 1
          detected.push({
            appliance,
            startTime: data[i].timestamp,
            endTime: data[endIndex].timestamp,
            estimatedKwh: (excess * duration * 0.25) / 1000,
            confidence: 0.5
          })
          
          i = endIndex // Skip ahead to avoid overlaps
        }
      }
    }
  }

  const getBaselineUsage = (data: any[], index: number): number => {
    // Calculate baseline by looking at nearby low points
    const window = data.slice(Math.max(0, index - 12), Math.min(data.length, index + 12))
    const sortedWatts = window.map(d => d.watts).sort((a, b) => a - b)
    return sortedWatts[Math.floor(sortedWatts.length * 0.25)] // 25th percentile
  }

  const get24HourData = () => {
    const now = new Date()
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    // Get last 24 hours of actual data
    const recentData = electricityData
      .filter(d => d.consumption_kwh !== null && new Date(d.start_time) >= cutoff)
      .map(d => ({
        timestamp: d.start_time,
        watts: (d.consumption_kwh! * 1000) / 0.25, // Convert kWh to W (15min intervals)
        kwh: d.consumption_kwh!
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Create a map of appliance usage by timestamp
    const applianceMap: { [timestamp: string]: { [appliance: string]: number } } = {}
    
    detectedUsage.forEach(usage => {
      const start = new Date(usage.startTime).getTime()
      const end = new Date(usage.endTime).getTime()
      
      recentData.forEach(dataPoint => {
        const pointTime = new Date(dataPoint.timestamp).getTime()
        if (pointTime >= start && pointTime <= end) {
          if (!applianceMap[dataPoint.timestamp]) {
            applianceMap[dataPoint.timestamp] = {}
          }
          applianceMap[dataPoint.timestamp][usage.appliance] = 1 // Binary indicator
        }
      })
    })

    // Combine actual data with appliance detections
    return recentData.map(d => ({
      ...d,
      ...applianceMap[d.timestamp]
    }))
  }

  const getUniqueAppliances = () => {
    return [...new Set(detectedUsage.map(usage => usage.appliance))]
  }

  const getApplianceBreakdown = () => {
    const breakdown: { [key: string]: number } = {}
    
    detectedUsage.forEach(usage => {
      if (!breakdown[usage.appliance]) {
        breakdown[usage.appliance] = 0
      }
      breakdown[usage.appliance] += usage.estimatedKwh
    })

    return Object.entries(breakdown).map(([name, kwh], index) => ({
      name,
      kwh: Number(kwh.toFixed(4)),
      color: APPLIANCE_SIGNATURES[index % APPLIANCE_SIGNATURES.length].color
    }))
  }

  const getDailyPattern = () => {
    const hourlyUsage: { [hour: number]: { [appliance: string]: number } } = {}
    
    // Initialize hourly data
    for (let hour = 0; hour < 24; hour++) {
      hourlyUsage[hour] = {}
    }

    detectedUsage.forEach(usage => {
      const startHour = new Date(usage.startTime).getHours()
      const endHour = new Date(usage.endTime).getHours()
      
      // Distribute usage across hours
      const hours = endHour >= startHour ? endHour - startHour + 1 : 24 - startHour + endHour + 1
      const kwhPerHour = usage.estimatedKwh / hours
      
      for (let h = startHour; h <= endHour; h++) {
        const hour = h % 24
        if (!hourlyUsage[hour][usage.appliance]) {
          hourlyUsage[hour][usage.appliance] = 0
        }
        hourlyUsage[hour][usage.appliance] += kwhPerHour
      }
    })

    const result = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      ...hourlyUsage[hour]
    }))
    
    console.log('Daily pattern data:', result.slice(0, 3))
    return result
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading appliance analysis...</div>
  }

  const applianceBreakdown = getApplianceBreakdown()
  const dailyPattern = getDailyPattern()
  const totalDetectedKwh = detectedUsage.reduce((sum, usage) => sum + usage.estimatedKwh, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Load Disaggregation</h2>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{detectedUsage.length}</div>
          <div className="text-sm text-gray-600">Detected Events</div>
        </div>
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{totalDetectedKwh.toFixed(3)}</div>
          <div className="text-sm text-gray-600">kWh Identified</div>
        </div>
        <div className="text-center p-4 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{applianceBreakdown.length}</div>
          <div className="text-sm text-gray-600">Appliances Found</div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">24-Hour Load Analysis</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={get24HourData()}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="timestamp"
              tickFormatter={(value) => format(parseISO(value), 'HH:mm')}
            />
            <YAxis yAxisId="left" label={{ value: 'Watts', angle: -90, position: 'insideLeft' }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 1]} hide />
            <Tooltip 
              labelFormatter={(value) => format(parseISO(value as string), 'MMM dd, HH:mm')}
              formatter={(value: number, name: string) => {
                if (name === 'Actual Usage') return [`${value.toFixed(0)}W`, name]
                return [value > 0 ? 'Active' : 'Inactive', name]
              }}
            />
            <Legend />
            
            {/* Actual power consumption line */}
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="watts" 
              stroke="#2563eb" 
              strokeWidth={2}
              dot={false}
              name="Actual Usage"
            />
            
            {/* Appliance detection bars */}
            {getUniqueAppliances().map((appliance, index) => (
              <Line
                key={appliance}
                yAxisId="right"
                type="stepAfter"
                dataKey={appliance}
                stroke={APPLIANCE_SIGNATURES[index % APPLIANCE_SIGNATURES.length].color}
                strokeWidth={8}
                dot={false}
                name={appliance}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Appliance Usage Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={applianceBreakdown}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="kwh"
                label={({ name, kwh }) => `${name}: ${kwh} kWh`}
              >
                {applianceBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => [`${value} kWh`, 'Usage']} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Fridge Compressor Cycles</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {detectedUsage
              .filter(usage => usage.appliance.includes('Fridge') || usage.appliance.includes('Compressor'))
              .slice(-10)
              .map((usage, index) => {
                const start = new Date(usage.startTime)
                const end = new Date(usage.endTime)
                const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60)
                
                return (
                  <div key={index} className="flex justify-between items-center p-2 bg-blue-50 rounded">
                    <div>
                      <div className="font-medium">{format(start, 'HH:mm')} - {format(end, 'HH:mm')}</div>
                      <div className="text-sm text-gray-600">{durationMinutes.toFixed(0)} minutes</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{usage.estimatedKwh.toFixed(3)} kWh</div>
                      <div className="text-sm text-gray-600">{(usage.confidence * 100).toFixed(0)}% confidence</div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Detected Usage Events</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2">Appliance</th>
                <th className="text-left p-2">Start Time</th>
                <th className="text-left p-2">Duration</th>
                <th className="text-left p-2">Energy (kWh)</th>
                <th className="text-left p-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {detectedUsage.slice(-20).map((usage, index) => {
                const start = new Date(usage.startTime)
                const end = new Date(usage.endTime)
                const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
                
                return (
                  <tr key={index} className="border-b">
                    <td className="p-2 font-medium">{usage.appliance}</td>
                    <td className="p-2">{format(start, 'MMM dd, HH:mm')}</td>
                    <td className="p-2">{durationHours.toFixed(1)}h</td>
                    <td className="p-2">{usage.estimatedKwh.toFixed(4)}</td>
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        usage.confidence > 0.7 ? 'bg-green-100 text-green-800' :
                        usage.confidence > 0.5 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {(usage.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-semibold mb-2">Known Appliance Signatures</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {APPLIANCE_SIGNATURES.map(appliance => (
            <div key={appliance.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: appliance.color }}
              />
              <span>{appliance.name}: {appliance.watts}W</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}