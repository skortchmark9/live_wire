'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useDropzone } from 'react-dropzone'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { format, parseISO } from 'date-fns'
import { getApiBaseUrl } from '@electricity-tracker/shared'

interface UsageDataPoint {
  start_time: string
  end_time: string
  consumption_kwh: number | null
  provided_cost: number | null
}

interface ChartDataPoint {
  timestamp: string
  consumption_kwh: number
  hour: number
  temperature_f?: number | null
}

interface WeatherDataPoint {
  timestamp: string
  temperature_f: number | null
  humidity_percent: number | null
}

type TimeRange = '7d' | '30d' | 'all'
type Season = 'summer' | 'winter' | 'shoulder'

interface DayData {
  date: string
  totalKwh: number
  avgTemp: number | null
  season: Season
  hourlyData: { hour: number; kwh: number; temp: number | null }[]
}

// Classify month into season
function getSeason(month: number): Season {
  // Summer: June, July, August (6, 7, 8)
  if (month >= 6 && month <= 8) return 'summer'
  // Winter: December, January, February (12, 1, 2)
  if (month === 12 || month <= 2) return 'winter'
  // Shoulder: March-May, September-November
  return 'shoulder'
}

const SEASON_COLORS = {
  summer: '#ef4444', // red
  winter: '#3b82f6', // blue
  shoulder: '#22c55e', // green
}

const SEASON_LABELS = {
  summer: 'Summer (Jun-Aug)',
  winter: 'Winter (Dec-Feb)',
  shoulder: 'Shoulder (Mar-May, Sep-Nov)',
}

export default function AnalyzePage() {
  const [usageData, setUsageData] = useState<UsageDataPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [metadata, setMetadata] = useState<{ date_range?: { start: string; end: string } } | null>(null)
  const [accountInfo, setAccountInfo] = useState<{ zip_code?: string; region?: string; username?: string } | null>(null)
  const [weatherData, setWeatherData] = useState<WeatherDataPoint[]>([])
  const [weatherLoading, setWeatherLoading] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    setLoading(true)
    setError(null)
    setFilename(file.name)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const apiUrl = getApiBaseUrl()
      const response = await fetch(`${apiUrl}/api/upload/analyze`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to analyze file')
      }

      const data = await response.json()
      setUsageData(data.usage_data)
      setMetadata(data.metadata)
      setAccountInfo(data.account_info || null)

      // Fetch weather data if we have zip code and date range
      const zipCode = data.account_info?.zip_code
      const startDate = data.metadata?.date_range?.start?.split('T')[0]
      const endDate = data.metadata?.date_range?.end?.split('T')[0]

      if (zipCode && startDate && endDate) {
        setWeatherLoading(true)
        try {
          const weatherResp = await fetch(
            `${apiUrl}/api/upload/weather?zip_code=${zipCode}&start_date=${startDate}&end_date=${endDate}`
          )
          if (weatherResp.ok) {
            const weatherResult = await weatherResp.json()
            setWeatherData(weatherResult.data || [])
          }
        } catch (weatherErr) {
          console.error('Failed to fetch weather:', weatherErr)
        } finally {
          setWeatherLoading(false)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze file')
      setUsageData([])
    } finally {
      setLoading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/tab-separated-values': ['.tsv'],
    },
    multiple: false,
  })

  // Build weather lookup map
  const weatherMap = new Map<string, number>()
  weatherData.forEach(w => {
    if (w.temperature_f !== null) {
      // Key by hour (YYYY-MM-DDTHH)
      const hourKey = w.timestamp.substring(0, 13)
      weatherMap.set(hourKey, w.temperature_f)
    }
  })

  // Transform data for charts
  const chartData: ChartDataPoint[] = usageData
    .filter(d => d.consumption_kwh !== null)
    .map(d => {
      const hourKey = d.start_time.substring(0, 13)
      return {
        timestamp: d.start_time,
        consumption_kwh: d.consumption_kwh!,
        hour: parseISO(d.start_time).getHours(),
        temperature_f: weatherMap.get(hourKey) ?? null,
      }
    })

  // Filter by time range
  const getFilteredData = () => {
    if (timeRange === 'all' || chartData.length === 0) return chartData

    const daysAgo = timeRange === '7d' ? 7 : 30
    const latestDate = new Date(chartData[chartData.length - 1].timestamp)
    const cutoff = new Date(latestDate.getTime() - daysAgo * 24 * 60 * 60 * 1000)

    return chartData.filter(d => new Date(d.timestamp) >= cutoff)
  }

  const filteredData = getFilteredData()

  // Calculate hourly averages (usage and temperature)
  const getHourlyAverages = () => {
    const hourlyData: { [hour: number]: { totalKwh: number; totalTemp: number; countKwh: number; countTemp: number } } = {}

    filteredData.forEach(d => {
      if (!hourlyData[d.hour]) {
        hourlyData[d.hour] = { totalKwh: 0, totalTemp: 0, countKwh: 0, countTemp: 0 }
      }
      hourlyData[d.hour].totalKwh += d.consumption_kwh
      hourlyData[d.hour].countKwh += 1
      if (d.temperature_f != null) {
        hourlyData[d.hour].totalTemp += d.temperature_f
        hourlyData[d.hour].countTemp += 1
      }
    })

    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      avgConsumption: hourlyData[hour] ? hourlyData[hour].totalKwh / hourlyData[hour].countKwh : 0,
      avgTemperature: hourlyData[hour]?.countTemp ? hourlyData[hour].totalTemp / hourlyData[hour].countTemp : null,
    }))
  }

  const hourlyAverages = getHourlyAverages()

  // Calculate seasonal median days
  const getSeasonalMedianDays = () => {
    // Group data by day
    const dayMap = new Map<string, {
      total: number;
      hourly: Map<number, { kwh: number[]; temps: number[] }>;
      temps: number[];
    }>()

    chartData.forEach(d => {
      const date = d.timestamp.split('T')[0]
      if (!dayMap.has(date)) {
        dayMap.set(date, { total: 0, hourly: new Map(), temps: [] })
      }
      const day = dayMap.get(date)!
      day.total += d.consumption_kwh

      if (!day.hourly.has(d.hour)) {
        day.hourly.set(d.hour, { kwh: [], temps: [] })
      }
      day.hourly.get(d.hour)!.kwh.push(d.consumption_kwh)

      if (d.temperature_f != null) {
        day.temps.push(d.temperature_f)
        day.hourly.get(d.hour)!.temps.push(d.temperature_f)
      }
    })

    // Convert to array with season classification
    const days: DayData[] = []
    dayMap.forEach((data, date) => {
      const month = parseISO(date).getMonth() + 1 // 1-indexed
      const hourlyData = Array.from({ length: 24 }, (_, hour) => {
        const hourData = data.hourly.get(hour)
        return {
          hour,
          kwh: hourData?.kwh.length ? hourData.kwh.reduce((a, b) => a + b, 0) : 0,
          temp: hourData?.temps.length ? hourData.temps.reduce((a, b) => a + b, 0) / hourData.temps.length : null
        }
      })
      days.push({
        date,
        totalKwh: data.total,
        avgTemp: data.temps.length > 0 ? data.temps.reduce((a, b) => a + b, 0) / data.temps.length : null,
        season: getSeason(month),
        hourlyData
      })
    })

    // Find median day for each season
    const medianDays: { [key in Season]?: DayData } = {}

    for (const season of ['summer', 'winter', 'shoulder'] as Season[]) {
      const seasonDays = days.filter(d => d.season === season)
      if (seasonDays.length === 0) continue

      // Sort by total usage
      seasonDays.sort((a, b) => a.totalKwh - b.totalKwh)

      // Get median
      const medianIndex = Math.floor(seasonDays.length / 2)
      medianDays[season] = seasonDays[medianIndex]
    }

    return medianDays
  }

  const seasonalMedianDays = getSeasonalMedianDays()

  // Calculate consistent axis ranges for seasonal charts
  const seasonalAxisRanges = (() => {
    let maxKwh = 0
    let maxTemp = -Infinity
    let minTemp = Infinity

    for (const season of ['summer', 'winter', 'shoulder'] as Season[]) {
      const medianDay = seasonalMedianDays[season]
      if (!medianDay) continue
      for (const hourData of medianDay.hourlyData) {
        if (hourData.kwh > maxKwh) maxKwh = hourData.kwh
        if (hourData.temp != null) {
          if (hourData.temp > maxTemp) maxTemp = hourData.temp
          if (hourData.temp < minTemp) minTemp = hourData.temp
        }
      }
    }

    // Add some padding
    return {
      kwh: [0, Math.ceil(maxKwh * 1.1 * 100) / 100],
      temp: minTemp !== Infinity ? [Math.floor(minTemp - 5), Math.ceil(maxTemp + 5)] : [0, 100]
    }
  })()

  // Calculate stats
  const totalUsage = filteredData.reduce((sum, d) => sum + d.consumption_kwh, 0).toFixed(2)
  const avgUsage = filteredData.length > 0
    ? (filteredData.reduce((sum, d) => sum + d.consumption_kwh, 0) / filteredData.length).toFixed(3)
    : '0'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Analyze Your Data
          </h1>
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Upload Section */}
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
            }
          `}
        >
          <input {...getInputProps()} />
          {loading ? (
            <div className="text-gray-600 dark:text-gray-400">
              Processing {filename}...
            </div>
          ) : isDragActive ? (
            <div className="text-blue-600 dark:text-blue-400">
              Drop your file here...
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-gray-600 dark:text-gray-400">
                Drag and drop a spreadsheet here, or click to select
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-500">
                Supports CSV, XLSX, XLS, TSV
              </div>
              {filename && (
                <div className="text-sm text-green-600 dark:text-green-400 mt-2">
                  Current file: {filename}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-600 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Results Section */}
        {usageData.length > 0 && (
          <>
            {/* Time Range Selector and Stats */}
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-2">
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
                <button
                  onClick={() => setTimeRange('all')}
                  className={`px-4 py-2 rounded ${timeRange === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
                >
                  All Data
                </button>
              </div>

              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{totalUsage}</div>
                  <div className="text-gray-600 dark:text-gray-400">kWh Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{avgUsage}</div>
                  <div className="text-gray-600 dark:text-gray-400">Avg kWh/interval</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{filteredData.length}</div>
                  <div className="text-gray-600 dark:text-gray-400">Data Points</div>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Usage Over Time */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
                  Usage vs Temperature
                  {weatherLoading && <span className="text-sm text-gray-500 ml-2">(loading weather...)</span>}
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={filteredData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => {
                        if (filteredData.length < 100) {
                          return format(parseISO(value), 'MM/dd HH:mm')
                        }
                        return format(parseISO(value), 'MM/dd')
                      }}
                    />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip
                      labelFormatter={(value) => format(parseISO(value as string), 'MMM dd, yyyy HH:mm')}
                      formatter={(value: number, name: string) => [
                        value.toFixed(name === 'Temperature (°F)' ? 1 : 3),
                        name
                      ]}
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
                    {weatherData.length > 0 && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="temperature_f"
                        stroke="#dc2626"
                        strokeWidth={2}
                        dot={false}
                        name="Temperature (°F)"
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Hourly Averages */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
                  Average Usage by Hour of Day
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hourlyAverages}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => [value.toFixed(3), 'Avg kWh']}
                      labelFormatter={(hour) => `${hour}:00`}
                    />
                    <Bar dataKey="avgConsumption" fill="#8b5cf6" name="Avg kWh" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Daily Usage */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700 lg:col-span-2">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
                  Daily Usage & Temperature
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={(() => {
                      // Aggregate by day
                      const dailyData: { [date: string]: { usage: number; tempSum: number; tempCount: number } } = {}
                      filteredData.forEach(d => {
                        const date = d.timestamp.split('T')[0]
                        if (!dailyData[date]) {
                          dailyData[date] = { usage: 0, tempSum: 0, tempCount: 0 }
                        }
                        dailyData[date].usage += d.consumption_kwh
                        if (d.temperature_f != null) {
                          dailyData[date].tempSum += d.temperature_f
                          dailyData[date].tempCount += 1
                        }
                      })
                      return Object.entries(dailyData)
                        .map(([date, data]) => ({
                          date,
                          usage: data.usage,
                          avgTemp: data.tempCount > 0 ? data.tempSum / data.tempCount : null
                        }))
                        .sort((a, b) => a.date.localeCompare(b.date))
                    })()}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => format(parseISO(value), 'MM/dd')}
                    />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip
                      labelFormatter={(value) => format(parseISO(value as string), 'MMM dd, yyyy')}
                      formatter={(value: number, name: string) => [
                        value.toFixed(name === 'Avg Temp (°F)' ? 1 : 2),
                        name
                      ]}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="usage"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      name="Daily kWh"
                    />
                    {weatherData.length > 0 && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="avgTemp"
                        stroke="#dc2626"
                        strokeWidth={2}
                        dot={false}
                        name="Avg Temp (°F)"
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Seasonal Median Days - Individual Charts */}
              {(['summer', 'winter', 'shoulder'] as Season[]).map(season => {
                const medianDay = seasonalMedianDays[season]
                if (!medianDay) return null
                return (
                  <div key={season} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: SEASON_COLORS[season] }}
                      />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {SEASON_LABELS[season]}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      Median day: {format(parseISO(medianDay.date), 'MMM d, yyyy')} — {medianDay.totalKwh.toFixed(1)} kWh
                      {medianDay.avgTemp != null && ` — Avg ${medianDay.avgTemp.toFixed(0)}°F`}
                    </p>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={medianDay.hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} />
                        <YAxis yAxisId="left" domain={seasonalAxisRanges.kwh as [number, number]} />
                        <YAxis yAxisId="right" orientation="right" domain={seasonalAxisRanges.temp as [number, number]} />
                        <Tooltip
                          labelFormatter={(hour) => `${hour}:00`}
                          formatter={(value: number, name: string) => [
                            value.toFixed(name === 'Temp (°F)' ? 1 : 3),
                            name
                          ]}
                        />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="kwh"
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={false}
                          name="Usage (kWh)"
                        />
                        {weatherData.length > 0 && (
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="temp"
                            stroke="#dc2626"
                            strokeWidth={2}
                            dot={false}
                            name="Temp (°F)"
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              })}
            </div>

            {/* Metadata */}
            <div className="text-sm text-gray-500 dark:text-gray-400 flex flex-wrap gap-4">
              {metadata?.date_range && (
                <span>
                  Data range: {metadata.date_range.start && format(parseISO(metadata.date_range.start), 'MMM dd, yyyy')} - {metadata.date_range.end && format(parseISO(metadata.date_range.end), 'MMM dd, yyyy')}
                </span>
              )}
              {accountInfo?.zip_code && (
                <span>ZIP: {accountInfo.zip_code}</span>
              )}
              {accountInfo?.region && (
                <span>Region: {accountInfo.region}</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
