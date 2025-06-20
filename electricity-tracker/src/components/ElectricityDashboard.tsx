'use client'

import { useState, useEffect } from 'react'
import { parseISO } from 'date-fns'
import LoadDisaggregation from './LoadDisaggregation'
import OverviewTab from './OverviewTab'
import CostInsightsTab from './CostInsightsTab'
import { 
  ElectricityDataPoint, 
  WeatherDataPoint, 
  CombinedDataPoint, 
  PredictionDataPoint, 
  ConEdForecast,
  TimeRange,
  ActiveTab 
} from './types'

export default function ElectricityDashboard() {
  const [electricityData, setElectricityData] = useState<ElectricityDataPoint[]>([])
  const [weatherData, setWeatherData] = useState<WeatherDataPoint[]>([])
  const [combinedData, setCombinedData] = useState<CombinedDataPoint[]>([])
  const [predictions, setPredictions] = useState<PredictionDataPoint[]>([])
  const [conedForecast, setConedForecast] = useState<ConEdForecast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [selectedModelDay, setSelectedModelDay] = useState<string | null>(null)
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
      
      const [electricityResponse, weatherResponse, predictionsResponse, forecastResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/electricity-usage`),
        fetch(`${API_BASE_URL}/api/weather-data`),
        fetch(`${API_BASE_URL}/api/predictions`).catch(() => null), // Predictions might not exist yet
        fetch(`${API_BASE_URL}/api/coned-forecast`).catch(() => null) // ConEd forecast might not exist yet
      ])

      if (!electricityResponse.ok || !weatherResponse.ok) {
        throw new Error('Failed to load data from API. Make sure the Flask backend is running.')
      }

      const electricityJson = await electricityResponse.json()
      const weatherJson = await weatherResponse.json()
      
      let predictionsJson = null
      if (predictionsResponse && predictionsResponse.ok) {
        predictionsJson = await predictionsResponse.json()
      }

      let forecastJson = null
      if (forecastResponse && forecastResponse.ok) {
        forecastJson = await forecastResponse.json()
      }

      setElectricityData(electricityJson.data || [])
      setWeatherData(weatherJson.data || [])
      setPredictions(predictionsJson?.predictions || [])
      setConedForecast(forecastJson?.forecasts?.[0] || null) // Get first electricity forecast

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
          Make sure the Flask backend is running:
          <br />
          <code className="bg-red-100 px-1 rounded">cd backend && python app.py</code>
        </p>
      </div>
    )
  }

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
        <CostInsightsTab
          combinedData={combinedData}
          conedForecast={conedForecast}
          selectedModelDay={selectedModelDay}
          setSelectedModelDay={setSelectedModelDay}
          hoveredDay={hoveredDay}
          setHoveredDay={setHoveredDay}
          weatherData={weatherData}
        />
      ) : (
        <OverviewTab
          combinedData={combinedData}
          predictions={predictions}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
        />
      )}
    </div>
  )
}