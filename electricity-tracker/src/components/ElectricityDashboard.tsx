'use client'

import { useState, useEffect } from 'react'
import { parseISO } from 'date-fns'
import LoadDisaggregation from './LoadDisaggregation'
import CostInsightsTab from './CostInsightsTab'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { useElectricityData } from '@/hooks/useElectricityData'
import { useWeatherData } from '@/hooks/useWeatherData'
// import { usePredictionsData } from '@/hooks/usePredictionsData' // unused import
import { 
  ElectricityDataPoint, 
  WeatherDataPoint, 
  CombinedDataPoint, 
  // PredictionDataPoint, // unused type 
  ConEdForecast,
  TimeRange,
  ActiveTab 
} from './types'

export default function ElectricityDashboard() {
  // Use SWR hooks for all data fetching
  const { data: electricityApiData, isLoading: electricityLoading, error: electricityError } = useElectricityData()
  const { data: weatherApiData, isLoading: weatherLoading, error: weatherError } = useWeatherData()
  
  const [electricityData, setElectricityData] = useState<ElectricityDataPoint[]>([])
  const [weatherData, setWeatherData] = useState<WeatherDataPoint[]>([])
  const [combinedData, setCombinedData] = useState<CombinedDataPoint[]>([])
  // const [predictions, setPredictions] = useState<PredictionDataPoint[]>([]) // unused state
  const [conedForecast, setConedForecast] = useState<ConEdForecast | null>(null)
  
  // Compute overall loading and error states
  const loading = electricityLoading || weatherLoading
  const error = electricityError || weatherError
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const [activeTab, setActiveTab] = useState<ActiveTab>('cost')
  const [selectedModelDay, setSelectedModelDay] = useState<string | null>(null)
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)

  // Process electricity data
  useEffect(() => {
    if (electricityApiData) {
      setConedForecast(electricityApiData.forecast_data?.[0] || null)
      setElectricityData((electricityApiData.usage_data || []).map(item => ({
        ...item,
        provided_cost: item.provided_cost ?? null
      })))
    }
  }, [electricityApiData])

  // Process weather data
  useEffect(() => {
    if (weatherApiData) {
      setWeatherData((weatherApiData.data || []).map(item => ({
        timestamp: item.timestamp,
        temperature_f: item.temperature_f,
        humidity_percent: item.humidity_percent,
      })))
    }
  }, [weatherApiData])

  // Combine data when both electricity and weather are available
  useEffect(() => {
    if (electricityApiData && weatherApiData) {
      combineData(
        (electricityApiData.usage_data || []).map(item => ({
          ...item,
          provided_cost: item.provided_cost ?? null
        })), 
        (weatherApiData.data || []).map(item => ({
          timestamp: item.timestamp,
          temperature_f: item.temperature_f,
          humidity_percent: item.humidity_percent,
        }))
      )
    }
  }, [electricityApiData, weatherApiData])

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
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold">Electricity Usage Dashboard</h1>
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('cost')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  activeTab === 'cost' 
                    ? 'bg-blue-100 text-blue-700 font-medium' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Cost Insights
              </button>
              <button
                onClick={() => setActiveTab('disaggregation')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  activeTab === 'disaggregation' 
                    ? 'bg-blue-100 text-blue-700 font-medium' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                AC Analysis
              </button>
            </div>
          </div>
          <LogoutButton />
        </div>
      </div>

      {activeTab === 'disaggregation' ? (
        <LoadDisaggregation electricityData={electricityData} loading={loading} />
      ) : activeTab === 'cost' ? (
        <CostInsightsTab
          combinedData={combinedData}
          conedForecast={conedForecast}
          selectedModelDay={selectedModelDay}
          setSelectedModelDay={setSelectedModelDay}
          hoveredDay={hoveredDay}
          setHoveredDay={setHoveredDay}
          weatherData={weatherData.map(item => ({
            time: item.timestamp,
            temperature_2m: item.temperature_f || 0,
            relative_humidity_2m: item.humidity_percent || 0,
            weather_code: 0
          }))}
        />
      ) : null}
    </div>
  )
}