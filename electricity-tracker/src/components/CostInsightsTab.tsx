'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Bar, ComposedChart, Cell } from 'recharts'
import { format, parseISO } from 'date-fns'
import { CombinedDataPoint, calculateCostBreakdown, useBillingProjection } from '@electricity-tracker/shared'

export default function CostInsightsTab() {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  
  // Use the shared billing projection context
  const { 
    projection, 
    billingPeriodData, 
    lastMonthData, 
    selectedModelDay, 
    setSelectedModelDay, 
    dailyDataBuckets,
    conedForecast
  } = useBillingProjection();
  
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)

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
            selectedButton.scrollIntoView({ inline: 'center', block: 'nearest' })
          }
        }
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [selectedModelDay, lastMonthData])

  // Calculate cost breakdown from projection
  const { variableCost, fixedCost } = projection ? 
    calculateCostBreakdown(projection.totalProjectedUsage) : 
    { variableCost: 0, fixedCost: 0 }

  return (
    <div className="relative">
      {/* Sticky Bill Projection - mobile only */}
      <div className="xl:hidden sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 pb-4 -mx-2 sm:-mx-4 px-2 sm:px-4">
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg shadow-lg">
          <div className="flex flex-col text-center align-center">
            <div className="text-3xl sm:text-4xl font-bold text-green-600">
              ${(variableCost + fixedCost).toFixed(2)}
            </div>
            <div className='flex items-center justify-center gap-2'>
              <div className="text-gray-600 dark:text-gray-400 font-small">Projected Bill:</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {projection?.totalProjectedUsage.toFixed(0) || 0} kWh total usage
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:space-y-6">

      {/* Charts and controls */}
      <div className="lg:grid lg:grid-cols-1 xl:grid-cols-4 lg:gap-6 space-y-4 lg:space-y-0">
        <div className="xl:col-span-3 space-y-4 lg:space-y-6">
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Billing Period Usage & Temperature</h3>
            {(() => {
            const mappedBillingPeriodData = billingPeriodData.map((x) => {
                  return {
                    ...x,
                    usage: Math.round(x.usage * 100) / 100,
                    avgTemp: x.avgTemp ? Math.round(x.avgTemp) : null,
                  };
            });
            
            const futureCount = mappedBillingPeriodData.filter(d => d.isFuture).length
            const forecastCount = mappedBillingPeriodData.filter(d => d.isForecast).length
            
            return mappedBillingPeriodData.length > 0 ? (
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-3 flex justify-between items-center">
                  <span>Full billing period ({mappedBillingPeriodData.length} days)</span>
                  {futureCount > 0 && (
                    <span className="text-xs">
                      {forecastCount} future days with weather forecast • {futureCount - forecastCount} based on {selectedModelDay}
                    </span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={mappedBillingPeriodData}>
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
                      {mappedBillingPeriodData.map((entry, index) => {
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
                      {mappedBillingPeriodData.map((entry, index) => {
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
                        const data = mappedBillingPeriodData[props.index]
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
          {/* Bill Projection - Desktop only, sticky within sidebar */}
          <div className="hidden xl:block sticky top-4">
            <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
              Billing Period Projection
            </h3>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  ${(variableCost + fixedCost).toFixed(2)}
                </div>
                <div className="text-gray-600 dark:text-gray-400">Projected Bill</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {projection?.totalProjectedUsage.toFixed(0) || 0} kWh total usage
                </div>
              </div>
            </div>
            </div>
          </div>

          {/* Billing Period Details */}
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
              Billing Period Details
            </h3>
            {conedForecast && (
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {format(parseISO(conedForecast.bill_start_date), 'MMM dd')} - {format(parseISO(conedForecast.bill_end_date), 'MMM dd, yyyy')}
              </div>
            )}
            <div className='grid grid-cols-2 xl:grid-cols-1 gap-2'>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                <div className="font-semibold text-lg">
                  {projection?.monthToDateUsage.toFixed(0) || 0} kWh
                </div>
                <div className="text-gray-600 dark:text-gray-400 text-sm">
                  Used So Far
                </div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded">
                <div className="font-semibold text-lg">
                  {projection?.projectedRemainingUsage.toFixed(0) || 0} kWh
                </div>
                <div className="text-gray-600 dark:text-gray-400 text-sm">
                  Remaining
                </div>
                {projection && projection.weatherBasedDays > 0 && (
                  <div className="text-xs text-purple-600 mt-1">
                    {projection.weatherBasedDays} days weather-based
                  </div>
                )}
              </div>
            </div>
            {conedForecast && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                ConEd&apos;s forecast: {(conedForecast.usage_to_date + conedForecast.forecasted_usage).toFixed(0)} kWh
              </div>
            )}
          </div>

          {/* Detailed Cost Breakdown */}
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Detailed Cost Breakdown
            </h3>
            {(() => {
              if (!projection) return <div>No projection data available</div>
              
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
    </div>
  )
}