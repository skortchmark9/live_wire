'use client'

import { useState, useEffect } from 'react'
import { parseISO } from 'date-fns'
import LoadDisaggregation from './LoadDisaggregation'
import CostInsightsTab from './CostInsightsTab'
import HomeTab from './HomeTab'
import { Header } from './Header'
import { BillingProjectionProvider, useElectricityData, useWeatherData } from '@electricity-tracker/shared'
// import { usePredictionsData } from '@/hooks/usePredictionsData' // unused import
import { 
  ElectricityDataPoint, 
  WeatherDataPoint, 
  CombinedDataPoint, 
  // PredictionDataPoint, // unused type 
  ConEdForecast,
  ActiveTab 
} from '@electricity-tracker/shared'

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('home')

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
        <div className="text-lg text-gray-900 dark:text-gray-100">Loading electricity usage data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <h2 className="text-red-800 dark:text-red-200 font-semibold mb-2">Error Loading Data</h2>
        <p className="text-red-600 dark:text-red-300">{error?.message || String(error)}</p>
        <pre className="text-red-600 dark:text-red-300">{error?.info?.detail}</pre>
     </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <BillingProjectionProvider
        combinedData={combinedData}
        conedForecast={conedForecast}
        weatherData={weatherData.map(item => ({
          time: item.timestamp,
          temperature_2m: item.temperature_f || 0,
          relative_humidity_2m: item.humidity_percent || 0,
          weather_code: 0
        }))}
      >
        {activeTab === 'home' ? (
          <HomeTab electricityData={electricityData} setActiveTab={setActiveTab} />
        ) : activeTab === 'disaggregation' ? (
          <LoadDisaggregation electricityData={electricityData} loading={loading} />
        ) : activeTab === 'cost' ? (
          <CostInsightsTab />
        ) : null}
      </BillingProjectionProvider>
    </div>
  )
}