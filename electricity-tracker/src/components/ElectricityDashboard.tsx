'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { format, parseISO } from 'date-fns'
import LoadDisaggregation from './LoadDisaggregation'

interface ElectricityDataPoint {
  start_time: string
  end_time: string
  consumption_kwh: number | null
  provided_cost: number | null
}

interface WeatherDataPoint {
  timestamp: string
  temperature_f: number | null
  apparent_temperature_f: number | null
  humidity_percent: number | null
  precipitation_inch: number | null
  cloud_cover_percent: number | null
  wind_speed_mph: number | null
}

interface CombinedDataPoint {
  timestamp: string
  consumption_kwh: number
  temperature_f?: number | null
  apparent_temperature_f?: number | null
  cost: number
  hour: number
  dayOfWeek: number
}

interface PredictionDataPoint {
  hour: number
  predicted_kwh: number
  timestamp: string
}

export default function ElectricityDashboard() {
  const [electricityData, setElectricityData] = useState<ElectricityDataPoint[]>([])
  const [weatherData, setWeatherData] = useState<WeatherDataPoint[]>([])
  const [combinedData, setCombinedData] = useState<CombinedDataPoint[]>([])
  const [predictions, setPredictions] = useState<PredictionDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d')
  const [activeTab, setActiveTab] = useState<'overview' | 'disaggregation' | 'cost'>('overview')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      const [electricityResponse, weatherResponse, predictionsResponse] = await Promise.all([
        fetch('/data/electricity_usage.json'),
        fetch('/data/weather_data.json'),
        fetch('/data/predictions.json').catch(() => null) // Predictions might not exist yet
      ])

      if (!electricityResponse.ok || !weatherResponse.ok) {
        throw new Error('Failed to load data files. Run the Python scripts first to collect data.')
      }

      const electricityJson = await electricityResponse.json()
      const weatherJson = await weatherResponse.json()
      
      let predictionsJson = null
      if (predictionsResponse && predictionsResponse.ok) {
        predictionsJson = await predictionsResponse.json()
      }

      setElectricityData(electricityJson.data || [])
      setWeatherData(weatherJson.data || [])
      setPredictions(predictionsJson?.predictions || [])

      combineData(electricityJson.data || [], weatherJson.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const combineData = (elecData: ElectricityDataPoint[], weatherData: WeatherDataPoint[]) => {
    const weatherMap = new Map<string, WeatherDataPoint>()
    
    weatherData.forEach(weather => {
      const hour = weather.timestamp.substring(0, 13)
      weatherMap.set(hour, weather)
    })

    const combined: CombinedDataPoint[] = []

    elecData.forEach(elec => {
      if (elec.consumption_kwh === null) return

      const startTime = parseISO(elec.start_time)
      const hourKey = elec.start_time.substring(0, 13)
      const weather = weatherMap.get(hourKey)


      combined.push({
        timestamp: elec.start_time,
        consumption_kwh: elec.consumption_kwh,
        temperature_f: weather?.temperature_f,
        apparent_temperature_f: weather?.apparent_temperature_f || weather?.temperature_f,
        cost: elec.provided_cost || 0,
        hour: startTime.getHours(),
        dayOfWeek: startTime.getDay()
      })
    })

    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    setCombinedData(combined)
  }

  const getFilteredData = () => {
    if (timeRange === 'all') return combinedData

    const now = new Date()
    const daysAgo = timeRange === '7d' ? 7 : 30
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

  const getYesterdayData = () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    
    const endOfYesterday = new Date(yesterday)
    endOfYesterday.setHours(23, 59, 59, 999)
    
    return combinedData.filter(d => {
      const dataDate = new Date(d.timestamp)
      return dataDate >= yesterday && dataDate <= endOfYesterday
    })
  }

  const getCurrentMonthData = () => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(23, 59, 59, 999)
    
    return combinedData.filter(d => {
      const dataDate = new Date(d.timestamp)
      return dataDate >= startOfMonth && dataDate <= yesterday
    })
  }

  const calculateCostBredown = (usage: number) => {
    const variableBreakdown = []
    const fixedBreakdown = []
    let variableCost = 0
    let fixedCost = 0
    
    // Variable costs (usage-based)
    const supplyRate = 0.11953 // 11.953c/kWh
    const supplyCost = usage * supplyRate
    variableBreakdown.push({
      tier: 'Supply',
      usage: usage,
      rate: supplyRate,
      cost: supplyCost,
      description: '11.953¢/kWh'
    })
    variableCost += supplyCost
    
    const deliveryRate = 0.17745 // 17.745c/kWh
    const deliveryCost = usage * deliveryRate
    variableBreakdown.push({
      tier: 'Delivery',
      usage: usage,
      rate: deliveryRate,
      cost: deliveryCost,
      description: '17.745¢/kWh'
    })
    variableCost += deliveryCost
    
    const systemBenefitRate = 0.00689 // 0.689c/kWh
    const systemBenefitCost = usage * systemBenefitRate
    variableBreakdown.push({
      tier: 'System Benefit Charge',
      usage: usage,
      rate: systemBenefitRate,
      cost: systemBenefitCost,
      description: '0.689¢/kWh'
    })
    variableCost += systemBenefitCost
    
    // Variable costs tax
    const variableTax = variableCost * 0.045
    variableBreakdown.push({
      tier: 'Sales Tax on Usage',
      usage: null,
      rate: null,
      cost: variableTax,
      description: '4.5% on variable charges'
    })
    variableCost += variableTax
    
    // Fixed costs (monthly)
    const merchantCharge = 0.50
    fixedBreakdown.push({
      tier: 'Merchant Function Charge',
      usage: null,
      rate: null,
      cost: merchantCharge,
      description: 'Monthly fixed fee'
    })
    fixedCost += merchantCharge
    
    const basicServiceCharge = 20.61
    fixedBreakdown.push({
      tier: 'Basic Service Charge',
      usage: null,
      rate: null,
      cost: basicServiceCharge,
      description: 'Monthly fixed fee'
    })
    fixedCost += basicServiceCharge
    
    const grt = 1.92
    fixedBreakdown.push({
      tier: 'GRT',
      usage: null,
      rate: null,
      cost: grt,
      description: 'Monthly fixed fee'
    })
    fixedCost += grt
    
    // Fixed costs tax
    const fixedTax = fixedCost * 0.045
    fixedBreakdown.push({
      tier: 'Sales Tax on Fixed Charges',
      usage: null,
      rate: null,
      cost: fixedTax,
      description: '4.5% on fixed charges'
    })
    fixedCost += fixedTax
    
    return { 
      variableBreakdown, 
      fixedBreakdown, 
      variableCost, 
      fixedCost,
      totalDailyCost: variableCost + (fixedCost / 30), // Daily portion of fixed costs
      projectedMonthlyCost: (variableCost * 30) + fixedCost
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading electricity usage data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-red-800 font-semibold mb-2">Error Loading Data</h2>
        <p className="text-red-600">{error}</p>
        <p className="text-sm text-red-500 mt-2">
          Make sure to run the Python data collection scripts first:
          <br />
          <code className="bg-red-100 px-1 rounded">python data_collector.py</code>
          <br />
          <code className="bg-red-100 px-1 rounded">python weather_collector.py</code>
        </p>
      </div>
    )
  }

  const filteredData = getFilteredData()
  const hourlyAverages = getHourlyAverages()

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 border-b-2 ${
            activeTab === 'overview' 
              ? 'border-blue-500 text-blue-600 font-semibold' 
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          Usage Overview
        </button>
        <button
          onClick={() => setActiveTab('disaggregation')}
          className={`px-4 py-2 border-b-2 ${
            activeTab === 'disaggregation' 
              ? 'border-blue-500 text-blue-600 font-semibold' 
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          Appliance Analysis
        </button>
        <button
          onClick={() => setActiveTab('cost')}
          className={`px-4 py-2 border-b-2 ${
            activeTab === 'cost' 
              ? 'border-blue-500 text-blue-600 font-semibold' 
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          Cost Insights
        </button>
      </div>

      {activeTab === 'disaggregation' ? (
        <LoadDisaggregation />
      ) : activeTab === 'cost' ? (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Yesterday's Electricity Cost</h3>
            {(() => {
              const yesterdayData = getYesterdayData()
              const currentMonthData = getCurrentMonthData()
              const yesterdayUsage = yesterdayData.reduce((sum, d) => sum + d.consumption_kwh, 0)
              const monthToDateUsage = currentMonthData.reduce((sum, d) => sum + d.consumption_kwh, 0)
              
              const now = new Date()
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
              const dayOfMonth = now.getDate()
              const remainingDays = daysInMonth - dayOfMonth + 1 // +1 because we want to include today
              
              const projectedRemainingUsage = yesterdayUsage * remainingDays
              const totalProjectedUsage = monthToDateUsage + projectedRemainingUsage
              
              const { variableBreakdown, fixedBreakdown, variableCost, fixedCost } = calculateCostBredown(yesterdayUsage)
              const monthToDateCost = calculateCostBredown(monthToDateUsage)
              const projectedMonthlyCost = (monthToDateCost.variableCost + (projectedRemainingUsage * (variableCost / yesterdayUsage))) + fixedCost
              
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">${variableCost.toFixed(2)}</div>
                        <div className="text-gray-600">Yesterday's Variable Cost</div>
                        <div className="text-sm text-gray-500">{yesterdayUsage.toFixed(2)} kWh usage</div>
                      </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">${projectedMonthlyCost.toFixed(2)}</div>
                        <div className="text-gray-600">Projected Monthly Bill</div>
                        <div className="text-sm text-gray-500">{monthToDateUsage.toFixed(0)} kWh used + {projectedRemainingUsage.toFixed(0)} kWh projected = {totalProjectedUsage.toFixed(0)} kWh</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold mb-3">Variable Costs (Usage-Based)</h4>
                      <div className="space-y-2">
                        {variableBreakdown.map((item, index) => (
                          <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                            <div>
                              <div className="font-medium">{item.tier}</div>
                              <div className="text-sm text-gray-600">{item.description}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">${item.cost.toFixed(2)}</div>
                              {item.usage && (
                                <div className="text-sm text-gray-600">{item.usage.toFixed(2)} kWh</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-3">Fixed Costs (Monthly)</h4>
                      <div className="space-y-2">
                        {fixedBreakdown.map((item, index) => (
                          <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                            <div>
                              <div className="font-medium">{item.tier}</div>
                              <div className="text-sm text-gray-600">{item.description}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">${item.cost.toFixed(2)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 p-3 bg-blue-100 rounded">
                        <div className="flex justify-between font-semibold">
                          <span>Total Fixed Costs</span>
                          <span>${fixedCost.toFixed(2)}/month</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {yesterdayData.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      No data available for yesterday
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
          
          {(() => {
            const yesterdayData = getYesterdayData()
            return yesterdayData.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">Yesterday's Usage Pattern</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={yesterdayData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="timestamp"
                      tickFormatter={(value) => format(parseISO(value), 'HH:mm')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(value) => format(parseISO(value as string), 'MMM dd, yyyy HH:mm')}
                      formatter={(value: number) => [value.toFixed(3), 'kWh']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="consumption_kwh" 
                      stroke="#059669" 
                      strokeWidth={2}
                      dot={false}
                      name="Usage (kWh)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange('7d')}
            className={`px-4 py-2 rounded ${timeRange === '7d' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setTimeRange('30d')}
            className={`px-4 py-2 rounded ${timeRange === '30d' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setTimeRange('all')}
            className={`px-4 py-2 rounded ${timeRange === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            All Time
          </button>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{getTotalUsage()}</div>
            <div className="text-gray-600">kWh Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{getAvgTemperature()}°F</div>
            <div className="text-gray-600">Avg Temp</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{filteredData.length}</div>
            <div className="text-gray-600">Data Points</div>
          </div>
        </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Electricity Usage Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="timestamp"
                tickFormatter={(value) => format(parseISO(value), 'MM/dd HH:mm')}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => format(parseISO(value as string), 'MMM dd, yyyy HH:mm')}
                formatter={(value: number) => [value.toFixed(3), 'kWh']}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="consumption_kwh" 
                stroke="#2563eb" 
                strokeWidth={2}
                dot={false}
                name="Consumption (kWh)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Usage vs Temperature</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="timestamp"
                tickFormatter={(value) => format(parseISO(value), 'MM/dd')}
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

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Average Usage by Hour of Day</h3>
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

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Recent Usage Pattern</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={filteredData.slice(-96)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="timestamp"
                tickFormatter={(value) => format(parseISO(value), 'dd HH:mm')}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => format(parseISO(value as string), 'MMM dd, yyyy HH:mm')}
                formatter={(value: number) => [value.toFixed(3), 'kWh']}
              />
              <Line 
                type="monotone" 
                dataKey="consumption_kwh" 
                stroke="#059669" 
                strokeWidth={2}
                dot={true}
                dotFill="#059669"
                name="15-min Usage"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {predictions.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">24-Hour Usage Prediction</h3>
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
                  dot={true}
                  dotFill="#f59e0b"
                  name="ML Prediction"
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-sm text-gray-600 mt-2">
              Generated by machine learning model trained on {combinedData.length.toLocaleString()} historical data points
            </p>
          </div>
        )}
          </div>
        </>
      )}
    </div>
  )
}