'use client'

import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Bar, ComposedChart, Cell } from 'recharts'
import { format, parseISO } from 'date-fns'
import { CombinedDataPoint, ConEdForecast } from './types'
import { calculateCostBreakdown } from '@/utils/costCalculations'

interface CostInsightsTabProps {
  combinedData: CombinedDataPoint[]
  conedForecast: ConEdForecast | null
  weatherData: Array<{
    time: string
    temperature_2m: number
    relative_humidity_2m: number
    weather_code: number
  }> // Add weather data to access forecast
}

// Helper component for bill projection display
function BillProjection({ 
  projection, 
  conedForecast, 
  isDesktop = false 
}: { 
  projection: {
    monthToDateUsage: number;
    projectedRemainingUsage: number;
    totalProjectedUsage: number;
    remainingDays: number;
    weatherBasedDays: number;
  }, 
  conedForecast: ConEdForecast | null, 
  isDesktop?: boolean 
}) {
  const { variableCost, fixedCost } = calculateCostBreakdown(projection.totalProjectedUsage)
  
  return (
    <div className="space-y-4">
      <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
        <div className="text-center">
          <div className={`font-bold text-green-600 ${isDesktop ? 'text-2xl' : 'text-3xl sm:text-4xl'}`}>
            ${(variableCost + fixedCost).toFixed(2)}
          </div>
          <div className="text-gray-600 dark:text-gray-400 font-medium">Projected Bill</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {projection.totalProjectedUsage.toFixed(0)} kWh total usage
          </div>
          {conedForecast && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              ConEd&apos;s forecast: {(conedForecast.usage_to_date + conedForecast.forecasted_usage).toFixed(0)} kWh
            </div>
          )}
        </div>
      </div>
      
      <div className='grid grid-cols-2 gap-2'>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
          <div className={`font-semibold ${isDesktop ? '' : 'text-lg'}`}>
            {projection.monthToDateUsage.toFixed(0)} kWh
          </div>
          <div className="text-gray-600 dark:text-gray-400 text-sm">
            Used So Far
          </div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded">
          <div className={`font-semibold ${isDesktop ? '' : 'text-lg'}`}>
            {projection.projectedRemainingUsage.toFixed(0)} kWh
          </div>
          <div className="text-gray-600 dark:text-gray-400 text-sm">
            Remaining
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CostInsightsTab({
  combinedData,
  conedForecast,
  weatherData
}: CostInsightsTabProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  
  // Initialize selectedModelDay to yesterday
  const [selectedModelDay, setSelectedModelDay] = useState<string>(() => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return format(yesterday, 'yyyy-MM-dd')
  })
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)
  // Memoize daily data buckets to avoid repeated filtering
  const dailyDataBuckets = useMemo(() => {
    const buckets = new Map<string, CombinedDataPoint[]>()
    
    combinedData.forEach(d => {
      const dateKey = d.timestamp.substring(0, 10) // YYYY-MM-DD
      if (!buckets.has(dateKey)) {
        buckets.set(dateKey, [])
      }
      buckets.get(dateKey)!.push(d)
    })
    
    return buckets
  }, [combinedData])

  const getCurrentMonthData = useCallback(() => {
    if (!conedForecast) return []
    
    const billStart = parseISO(conedForecast.bill_start_date)
    const now = new Date()
    
    return combinedData.filter(d => {
      const dataDate = new Date(d.timestamp)
      return dataDate >= billStart && dataDate <= now
    })
  }, [conedForecast, combinedData])

  const getLastMonthData = useMemo(() => {
    const now = new Date()
    const lastMonth = []
    
    // Get last 30 days, but build array from oldest to newest so today is on the right
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateKey = format(date, 'yyyy-MM-dd')
      
      const dayData = dailyDataBuckets.get(dateKey) || []
      
      const totalUsage = dayData.reduce((sum, d) => sum + d.consumption_kwh, 0)
      const totalCost = calculateCostBreakdown(totalUsage).variableCost
      
      const avgTemp = dayData.length > 0 
        ? dayData.filter(d => d.temperature_f !== null && d.temperature_f !== undefined)
            .reduce((sum, d, _, arr) => sum + (d.temperature_f! / arr.length), 0)
        : null
      
      // Only include days with data
      if (totalUsage > 0) {
        lastMonth.push({
          date: dateKey,
          displayDate: format(date, 'MMM dd'),
          dayOfWeek: format(date, 'EEE'),
          usage: totalUsage,
          cost: totalCost,
          avgTemp: avgTemp,
          isToday: dateKey === format(now, 'yyyy-MM-dd'),
          isYesterday: dateKey === format(new Date(now.getTime() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
        })
      }
    }
    
    return lastMonth
  }, [dailyDataBuckets])

  const findSimilarWeatherDay = useCallback((targetTemp: number, targetHumidity?: number, dayOfWeek?: number) => {
    // Find historical days with similar weather conditions
    const historicalDays = Array.from(dailyDataBuckets.entries())
      .map(([date, dayData]) => {
        if (dayData.length === 0) return null
        
        const avgTemp = dayData.filter(d => d.temperature_f !== null && d.temperature_f !== undefined)
          .reduce((sum, d, _, arr) => sum + (d.temperature_f! / arr.length), 0)
        
        const avgHumidity = dayData.filter(d => d.temperature_f !== null)
          .reduce((sum, d, _, arr) => sum + ((d.temperature_f)! / arr.length), 0)
        
        const totalUsage = dayData.reduce((sum, d) => sum + d.consumption_kwh, 0)
        const dayDate = parseISO(date)
        
        return {
          date,
          avgTemp,
          avgHumidity,
          totalUsage,
          dayOfWeek: dayDate.getDay(),
          data: dayData
        }
      })
      .filter((day): day is NonNullable<typeof day> => day !== null && day.avgTemp > 0 && day.totalUsage > 0)
    
    if (historicalDays.length === 0) return null
    
    // Calculate similarity scores
    const scoredDays = historicalDays.map(day => {
      let score = 0
      
      // Temperature similarity (most important factor)
      const tempDiff = Math.abs(day.avgTemp - targetTemp)
      const tempScore = Math.max(0, 100 - (tempDiff * 2)) // Penalty of 2 points per degree difference
      score += tempScore * 0.6 // 60% weight
      
      // Humidity/apparent temperature similarity
      if (targetHumidity && day.avgHumidity) {
        const humidityDiff = Math.abs(day.avgHumidity - targetHumidity)
        const humidityScore = Math.max(0, 100 - (humidityDiff * 1.5))
        score += humidityScore * 0.25 // 25% weight
      }
      
      // Day of week similarity (weekday vs weekend patterns)
      if (dayOfWeek !== undefined) {
        const isTargetWeekend = dayOfWeek >= 5
        const isDayWeekend = day.dayOfWeek >= 5
        const dowScore = isTargetWeekend === isDayWeekend ? 100 : 70 // Moderate penalty for different day types
        score += dowScore * 0.15 // 15% weight
      }
      
      return {
        ...day,
        similarityScore: score,
        tempDiff: tempDiff
      }
    })
    
    // Sort by similarity score and return the best match
    const bestMatch = scoredDays.sort((a, b) => b.similarityScore - a.similarityScore)[0]
    
    // Only return if the match is reasonably good (temperature within 10 degrees)
    if (bestMatch && bestMatch.tempDiff <= 10) {
      return bestMatch
    }
    
    return null
  }, [dailyDataBuckets])

  // Get the model day usage for predictions
  const getModelDayUsage = useMemo(() => {
    const selectedDayData = dailyDataBuckets.get(selectedModelDay) || []
    return selectedDayData.reduce((sum, d) => sum + d.consumption_kwh, 0)
  }, [selectedModelDay, dailyDataBuckets])

  const getBillingPeriodData = useMemo(() => {
    if (!conedForecast) return []
    
    const billStart = parseISO(conedForecast.bill_start_date)
    const billEnd = parseISO(conedForecast.bill_end_date)
    const now = new Date()
    const billingPeriodDays = []
    
    // Create weather map for easier lookup
    const weatherMap = new Map<string, Array<{
      time: string
      temperature_2m: number
      relative_humidity_2m: number
      weather_code: number
    }>>()
    weatherData.forEach(weather => {
      const dateKey = weather.time.substring(0, 10) // YYYY-MM-DD
      if (!weatherMap.has(dateKey)) {
        weatherMap.set(dateKey, [])
      }
      weatherMap.get(dateKey)!.push(weather)
    })
    
    const currentDate = new Date(billStart)
    while (currentDate <= billEnd) {
      const dateKey = format(currentDate, 'yyyy-MM-dd')
      const dayData = dailyDataBuckets.get(dateKey) || []
      const isHistorical = currentDate <= now
      const isToday = dateKey === format(now, 'yyyy-MM-dd')
      const isYesterday = dateKey === format(new Date(now.getTime() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
      
      let totalUsage = 0
      let avgTemp: number | null = null
      let predictedUsage = 0
      let similarDay: {
        date: string
        similarityScore: number
        tempDiff: number
        totalUsage: number
      } | null = null
      
      if (isHistorical) {
        // Historical data - use actual usage
        totalUsage = dayData.reduce((sum, d) => sum + d.consumption_kwh, 0)
        
        // Get temperature from actual data if available
        if (dayData.length > 0) {
          const temps = dayData.filter(d => d.temperature_f !== null && d.temperature_f !== undefined)
          avgTemp = temps.length > 0 
            ? temps.reduce((sum, d) => sum + d.temperature_f!, 0) / temps.length
            : null
        }
      } else {
        // Future data - no usage yet, but we might have forecast weather
        totalUsage = 0
      }
      
      // Try to get temperature from weather forecast if not available from actual data
      if (avgTemp === null) {
        const weatherForDay = weatherMap.get(dateKey) || []
        if (weatherForDay.length > 0) {
          const temps = weatherForDay.filter(w => w.temperature_2m !== null && w.temperature_2m !== undefined)
          avgTemp = temps.length > 0 
            ? temps.reduce((sum, w) => sum + w.temperature_2m, 0) / temps.length
            : null
        }
      }
      
      // For future days, always predict usage
      if (!isHistorical) {
        if (avgTemp !== null) {
          // We have weather forecast, use it to find similar days
          const weatherForDay = weatherMap.get(dateKey) || []
          const avgHumidity = weatherForDay.length > 0 
            ? weatherForDay.filter(w => w.relative_humidity_2m !== null)
                .reduce((sum, w, _, arr) => sum + (w.relative_humidity_2m / arr.length), 0)
            : undefined
          
          similarDay = findSimilarWeatherDay(avgTemp, avgHumidity, currentDate.getDay())
          predictedUsage = similarDay ? similarDay.totalUsage : getModelDayUsage
        } else {
          // No weather data, use model day usage
          predictedUsage = getModelDayUsage
        }
      }
      
      billingPeriodDays.push({
        date: dateKey,
        displayDate: format(currentDate, 'MMM dd'),
        dayOfWeek: format(currentDate, 'EEE'),
        usage: totalUsage,
        avgTemp: avgTemp,
        isToday: isToday,
        isYesterday: isYesterday,
        isFuture: !isHistorical,
        isForecast: !isHistorical && avgTemp !== null, // Has forecast weather
        predictedUsage: predictedUsage,
        similarDay: similarDay ? {
          date: similarDay.date,
          similarityScore: similarDay.similarityScore,
          tempDiff: similarDay.tempDiff
        } : null
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return billingPeriodDays
  }, [dailyDataBuckets, conedForecast, weatherData, getModelDayUsage, findSimilarWeatherDay])

  const getModelDayProjection = useMemo(() => {
    const currentBillData = getCurrentMonthData()
    const billToDateUsage = currentBillData.reduce((sum, d) => sum + d.consumption_kwh, 0)
    
    const billingData = getBillingPeriodData
    const futureData = billingData.filter(d => d.isFuture)
    
    // All future days now have predictedUsage set
    const projectedRemainingUsage = futureData.reduce((sum, day) => sum + day.predictedUsage, 0)
    const totalProjectedUsage = billToDateUsage + projectedRemainingUsage
    
    // Count days with weather-based vs model-based predictions
    const weatherBasedDays = futureData.filter(d => d.isForecast && d.similarDay).length
    
    const monthToDateCost = calculateCostBreakdown(billToDateUsage)
    const remainingCost = calculateCostBreakdown(projectedRemainingUsage)
    const projectedMonthlyCost = monthToDateCost.variableCost + remainingCost.variableCost + calculateCostBreakdown(0).fixedCost
    
    return {
      monthToDateUsage: billToDateUsage,
      projectedRemainingUsage,
      totalProjectedUsage,
      projectedMonthlyCost,
      remainingDays: futureData.length,
      weatherBasedDays: weatherBasedDays,
      simpleProjectionDays: futureData.length - weatherBasedDays
    }
  }, [getCurrentMonthData, getBillingPeriodData])

  const getSelectedDayData = useMemo(() => {
    return (selectedDate: string) => {
      return dailyDataBuckets.get(selectedDate) || []
    }
  }, [dailyDataBuckets])

  // Auto-scroll to selected model day
  useEffect(() => {
    if (selectedModelDay && scrollContainerRef.current) {
      // Use setTimeout to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        if (scrollContainerRef.current) {
          const selectedButton = scrollContainerRef.current.querySelector(`[data-date="${selectedModelDay}"]`)
          if (selectedButton) {
            selectedButton.scrollIntoView({ block: 'nearest', inline: 'center' })
          }
        }
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [selectedModelDay, getLastMonthData])


  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Mobile-only Bill Projection at top */}
      <div className="xl:hidden bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <h3 className="text-base sm:text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
          Billing Period Projection
        </h3>
        {conedForecast && (
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {format(parseISO(conedForecast.bill_start_date), 'MMM dd')} - {format(parseISO(conedForecast.bill_end_date), 'MMM dd, yyyy')}
          </div>
        )}
        <BillProjection 
          projection={getModelDayProjection} 
          conedForecast={conedForecast} 
          isDesktop={false} 
        />
      </div>

      {/* Charts and controls */}
      <div className="lg:grid lg:grid-cols-1 xl:grid-cols-4 lg:gap-6 space-y-4 lg:space-y-0">
        <div className="xl:col-span-3 space-y-4 lg:space-y-6">
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Billing Period Usage & Temperature</h3>
            {(() => {
            const billingPeriodData = getBillingPeriodData.map((x) => {
                  return {
                    ...x,
                    usage: Math.round(x.usage * 100) / 100,
                    avgTemp: x.avgTemp ? Math.round(x.avgTemp) : null,
                  };
            });
            
            // const today = format(new Date(), 'yyyy-MM-dd') // unused variable
            const futureCount = billingPeriodData.filter(d => d.isFuture).length
            const forecastCount = billingPeriodData.filter(d => d.isForecast).length
            
            return billingPeriodData.length > 0 ? (
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-3 flex justify-between items-center">
                  <span>Full billing period ({billingPeriodData.length} days)</span>
                  {futureCount > 0 && (
                    <span className="text-xs">
                      {forecastCount} future days with weather forecast • {futureCount - forecastCount} based on {selectedModelDay}
                    </span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={billingPeriodData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="displayDate" 
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      fontSize={12}
                    />
                    <YAxis yAxisId="left" domain={[0, 'dataMax']} />
                    <YAxis yAxisId="right" orientation="right" domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name === 'Daily Usage (kWh)' || name === 'Predicted Usage (kWh)' ? value.toFixed(1) : value.toFixed(0),
                        name
                      ]}
                      labelFormatter={(label, payload) => {
                        const data = payload?.[0]?.payload
                        if (data) {
                          let status = ''
                          if (data.isFuture) {
                            if (data.isForecast && data.similarDay) {
                              status = ` (predicted based on ${format(parseISO(data.similarDay.date), 'MMM dd')}, ${data.similarDay.tempDiff.toFixed(1)}°F diff)`
                            } else if (data.isForecast) {
                              status = ' (forecast weather, using model day)'
                            } else {
                              status = ' (no weather forecast, using model day)'
                            }
                          } else if (data.isToday) {
                            status = ' (today)'
                          }
                          return `${label}${status}`
                        }
                        return label
                      }}
                      position={{ y: -50 }}
                      allowEscapeViewBox={{ x: false, y: true }}
                    />
                    <Legend 
                      content={() => null} // Hide the default legend
                    />
                    <Bar 
                      yAxisId="left"
                      dataKey="usage" 
                      name="Actual Usage (kWh)"
                      onClick={(data) => {
                        if (data && !data.isFuture) {
                          setSelectedModelDay(data.date)
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {billingPeriodData.map((entry, index) => {
                        let fillColor = '#3b82f6' // Blue for historical
                        if (entry.isFuture) fillColor = 'transparent' // Transparent for future (no actual usage)
                        if (entry.isToday) fillColor = '#22c55e' // Green for today
                        
                        return (
                          <Cell key={`actual-${index}`} fill={fillColor} />
                        )
                      })}
                    </Bar>
                    <Bar 
                      yAxisId="left"
                      dataKey="predictedUsage" 
                      name="Predicted Usage (kWh)"
                      onClick={(data) => {
                        if (data && data.similarDay) {
                          setSelectedModelDay(data.similarDay.date)
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {billingPeriodData.map((entry, index) => {
                        let fillColor = 'transparent'
                        let strokeColor = 'transparent'
                        let strokeDasharray = undefined
                        let strokeWidth = 0
                        
                        if (entry.isFuture && entry.predictedUsage > 0) {
                          if (entry.isForecast && entry.similarDay) {
                            // Weather-based prediction - filled orange bar
                            fillColor = '#fbbf24'
                            strokeColor = '#f59e0b'
                            strokeDasharray = '4 2'
                            strokeWidth = 1
                          } else {
                            // Model day prediction - outline only
                            fillColor = 'transparent'
                            strokeColor = '#f59e0b'
                            strokeDasharray = '4 2'
                            strokeWidth = 2
                          }
                        }
                        
                        return (
                          <Cell
                            key={`predicted-${index}`}
                            fill={fillColor}
                            stroke={strokeColor}
                            strokeDasharray={strokeDasharray}
                            strokeWidth={strokeWidth}
                          />
                        )
                      })}
                    </Bar>
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="avgTemp" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      dot={(props: {index: number, cx: number, cy: number}) => {
                        const data = billingPeriodData[props.index]
                        // Don't render dot if no temperature data
                        if (data.avgTemp === null) {
                          return <circle key={props.index} cx={props.cx} cy={props.cy} r={0} fill="transparent" />
                        }
                        if (data.isForecast) {
                          // Dashed circle for forecast
                          return (
                            <circle 
                              key={props.index}
                              cx={props.cx} 
                              cy={props.cy} 
                              r={3} 
                              fill="none" 
                              stroke="#f59e0b" 
                              strokeWidth={2}
                              strokeDasharray="2 2"
                            />
                          )
                        }
                        // Solid circle for actual
                        return (
                          <circle 
                            key={props.index}
                            cx={props.cx} 
                            cy={props.cy} 
                            r={3} 
                            fill="#f59e0b" 
                            stroke="#f59e0b" 
                            strokeWidth={2}
                          />
                        )
                      }}
                      name="Temperature (°F)"
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                No billing period data available
              </div>
            )
            })()}
          </div>
        
        <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <div className="inline-flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">
              Select a Model Day
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">
              Used when we don&apos;t have weather data.
            </p>
          </div>
          {(() => {
            const lastMonthData = getLastMonthData
            
            return (
              <div className="overflow-x-auto" ref={scrollContainerRef}>
                <div className="flex gap-2 pb-2">
                  {lastMonthData.map((day) => (
                    <button
                      key={day.date}
                      data-date={day.date}
                      onClick={() => setSelectedModelDay(day.date)}
                      onMouseEnter={() => setHoveredDay(day.date)}
                      onMouseLeave={() => setHoveredDay(null)}
                      className={`flex-shrink-0 p-3 sm:p-4 rounded-lg border-2 transition-all touch-manipulation ${
                        selectedModelDay === day.date
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      style={{ minWidth: '110px', cursor: 'pointer' }}
                    >
                      <div className="text-center">
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{day.dayOfWeek}</div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{day.displayDate}</div>
                        <div className="text-base sm:text-lg font-bold text-green-600 mt-1">{day.usage.toFixed(1)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">kWh</div>
                        <div className="text-sm font-semibold text-blue-600">${day.cost.toFixed(2)}</div>
                        {day.avgTemp !== null && (
                          <div className="text-xs text-orange-600 font-medium">{day.avgTemp.toFixed(0)}°F</div>
                        )}
                        {day.isToday && <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Today</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">
            {format(parseISO(selectedModelDay), 'MMM dd')}&apos;s Usage Pattern
          </h3>
          {(() => {
            const selectedDate = selectedModelDay
            const selectedDayData = getSelectedDayData(selectedDate)
            // Get hovered day data if hovering
            const hoveredDayData = hoveredDay ? getSelectedDayData(hoveredDay) : []
            const showHoveredOverlay = hoveredDay && hoveredDayData.length > 0
            
            // Create combined data with hovered day overlay mapped to selected day's timeline
            const chartData = selectedDayData.map(point => {
              const result: CombinedDataPoint & { hoveredDayUsage: number | null } = { ...point, hoveredDayUsage: null }
              
              if (showHoveredOverlay) {
                // Match by time of day (HH:mm:ss)
                const selectedTime = format(parseISO(point.timestamp), 'HH:mm:ss')
                const hoveredPoint = hoveredDayData.find(h => 
                  format(parseISO(h.timestamp), 'HH:mm:ss') === selectedTime
                )
                result.hoveredDayUsage = hoveredPoint?.consumption_kwh || null
              } else {
                result.hoveredDayUsage = null
              }
              
              return result
            })
            
            return selectedDayData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp"
                    tickFormatter={(value) => format(parseISO(value), 'HH:mm')}
                  />
                  <YAxis yAxisId="left" domain={[0, 1]} />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip 
                    labelFormatter={(value) => format(parseISO(value as string), 'MMM dd, yyyy HH:mm')}
                    formatter={(value: number, name: string) => [
                      name === 'Usage (kWh)' || name === "Today's Usage" ? value.toFixed(3) : value.toFixed(1),
                      name
                    ]}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="consumption_kwh" 
                    stroke="#059669" 
                    strokeWidth={2}
                    dot={false}
                    name="Usage (kWh)"
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="temperature_f" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    dot={false}
                    name="Temperature (°F)"
                  />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="hoveredDayUsage"
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Hovered Day Usage"
                    connectNulls={false}
                    strokeOpacity={showHoveredOverlay ? 1 : 0}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                No data available for selected day
              </div>
            )
          })()}
        </div>
        </div>
        
        {/* Desktop Sidebar */}
        <div className="xl:col-span-1 space-y-4 lg:space-y-6">
          {/* Bill Projection - Desktop only */}
          <div className="hidden xl:block bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
              Billing Period Projection
            </h3>
            {conedForecast && (
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {format(parseISO(conedForecast.bill_start_date), 'MMM dd')} - {format(parseISO(conedForecast.bill_end_date), 'MMM dd, yyyy')}
              </div>
            )}
            <BillProjection 
              projection={getModelDayProjection} 
              conedForecast={conedForecast} 
              isDesktop={true} 
            />
          </div>

          {/* Detailed Cost Breakdown */}
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Detailed Cost Breakdown
            </h3>
            {(() => {
              const projection = getModelDayProjection
              
              // Calculate breakdown for the total projected monthly usage
              const { variableBreakdown, fixedBreakdown, variableCost, fixedCost } = calculateCostBreakdown(projection.totalProjectedUsage)
              
              return (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">Variable Costs (Usage-Based)</h4>
                    <div className="space-y-2">
                      {variableBreakdown.map((item, index) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">{item.tier}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">{item.description}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-gray-900 dark:text-gray-100">${item.cost.toFixed(2)}</div>
                            {item.usage && (
                              <div className="text-xs text-gray-600 dark:text-gray-400">{item.usage.toFixed(0)} kWh</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                      <div className="flex justify-between font-semibold text-sm">
                        <span>Total Variable Costs</span>
                        <span>${variableCost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">Fixed Costs (Monthly)</h4>
                    <div className="space-y-2">
                      {fixedBreakdown.map((item, index) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">{item.tier}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">{item.description}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-gray-900 dark:text-gray-100">${item.cost.toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                      <div className="flex justify-between font-semibold text-sm">
                        <span>Total Fixed Costs</span>
                        <span>${fixedCost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}