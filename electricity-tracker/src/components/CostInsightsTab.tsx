'use client'

import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ComposedChart } from 'recharts'
import { format, parseISO } from 'date-fns'
import { CombinedDataPoint, ConEdForecast } from './types'
import { calculateCostBreakdown } from './utils'

interface CostInsightsTabProps {
  combinedData: CombinedDataPoint[]
  conedForecast: ConEdForecast | null
  selectedModelDay: string | null
  setSelectedModelDay: (day: string | null) => void
  hoveredDay: string | null
  setHoveredDay: (day: string | null) => void
}

export default function CostInsightsTab({
  combinedData,
  conedForecast,
  selectedModelDay,
  setSelectedModelDay,
  hoveredDay,
  setHoveredDay
}: CostInsightsTabProps) {
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

  const getCurrentMonthData = () => {
    const billStart = parseISO(conedForecast!.bill_start_date)
    const now = new Date()
    
    return combinedData.filter(d => {
      const dataDate = new Date(d.timestamp)
      return dataDate >= billStart && dataDate <= now
    })
  }

  const getLast7DaysData = useMemo(() => {
    const now = new Date()
    const last7Days = []
    
    for (let i = 6; i >= 0; i--) {
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
      
      last7Days.push({
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
    
    return last7Days
  }, [dailyDataBuckets])

  const getBillingPeriodData = useMemo(() => {
    if (!conedForecast) return []
    
    const billStart = parseISO(conedForecast.bill_start_date)
    const now = new Date()
    const billingPeriodDays = []
    
    let currentDate = new Date(billStart)
    while (currentDate <= now) {
      const dateKey = format(currentDate, 'yyyy-MM-dd')
      const dayData = dailyDataBuckets.get(dateKey) || []
      
      const totalUsage = dayData.reduce((sum, d) => sum + d.consumption_kwh, 0)
      
      const avgTemp = dayData.length > 0 
        ? dayData.filter(d => d.temperature_f !== null && d.temperature_f !== undefined)
            .reduce((sum, d, _, arr) => sum + (d.temperature_f! / arr.length), 0)
        : null
      
      billingPeriodDays.push({
        date: dateKey,
        displayDate: format(currentDate, 'MMM dd'),
        dayOfWeek: format(currentDate, 'EEE'),
        usage: totalUsage,
        avgTemp: avgTemp,
        isToday: dateKey === format(now, 'yyyy-MM-dd'),
        isYesterday: dateKey === format(new Date(now.getTime() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return billingPeriodDays
  }, [dailyDataBuckets, conedForecast])

  const getModelDayProjection = (modelDayUsage: number) => {
    const currentBillData = getCurrentMonthData()
    const billToDateUsage = currentBillData.reduce((sum, d) => sum + d.consumption_kwh, 0)
    
    const billEnd = parseISO(conedForecast!.bill_end_date)
    const now = new Date()
    const remainingDays = Math.max(0, Math.ceil((billEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    
    const projectedRemainingUsage = modelDayUsage * remainingDays
    const totalProjectedUsage = billToDateUsage + projectedRemainingUsage
    
    const monthToDateCost = calculateCostBreakdown(billToDateUsage)
    const remainingCost = calculateCostBreakdown(projectedRemainingUsage)
    const projectedMonthlyCost = monthToDateCost.variableCost + remainingCost.variableCost + calculateCostBreakdown(0).fixedCost
    
    return {
      monthToDateUsage: billToDateUsage,
      projectedRemainingUsage,
      totalProjectedUsage,
      projectedMonthlyCost,
      remainingDays
    }
  }

  const getSelectedDayData = useMemo(() => {
    return (selectedDate: string) => {
      return dailyDataBuckets.get(selectedDate) || []
    }
  }, [dailyDataBuckets])

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Billing Period Usage & Temperature</h3>
          {(() => {
            const billingPeriodData = getBillingPeriodData
            console.log(billingPeriodData);
            
            return billingPeriodData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
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
                      name === 'Daily Usage (kWh)' ? value.toFixed(1) : value.toFixed(0),
                      name
                    ]}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Legend />
                  <Bar 
                    yAxisId="left"
                    dataKey="usage" 
                    fill="#3b82f6"
                    name="Daily Usage (kWh)"
                    onClick={(data) => {
                      if (data && !data.isToday) {
                        setSelectedModelDay(data.date)
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="avgTemp" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    dot={{ fill: '#f59e0b', strokeWidth: 2, r: 3 }}
                    name="Avg Temperature (°F)"
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-500 py-8">
                No billing period data available
              </div>
            )
          })()}
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Daily Usage & Cost Insights - Last 7 Days</h3>
          {(() => {
            const last7DaysData = getLast7DaysData
            
            return (
              <div className="grid grid-cols-7 gap-2">
                {last7DaysData.map((day) => (
                  <button
                    key={day.date}
                    onClick={() => !day.isToday && setSelectedModelDay(day.date)}
                    onMouseEnter={() => setHoveredDay(day.date)}
                    onMouseLeave={() => setHoveredDay(null)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      selectedModelDay === day.date || (!selectedModelDay && day.isYesterday)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    } ${day.isToday ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-600">{day.dayOfWeek}</div>
                      <div className="text-sm font-semibold">{day.displayDate}</div>
                      <div className="text-lg font-bold text-green-600 mt-1">{day.usage.toFixed(1)}</div>
                      <div className="text-xs text-gray-500">kWh</div>
                      <div className="text-sm font-semibold text-blue-600">${day.cost.toFixed(2)}</div>
                      {day.avgTemp !== null && (
                        <div className="text-xs text-orange-600 font-medium">{day.avgTemp.toFixed(0)}°F</div>
                      )}
                      {day.isToday && <div className="text-xs text-gray-400 mt-1">Today</div>}
                    </div>
                  </button>
                ))}
              </div>
            )
          })()}
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">
            {(() => {
              if (selectedModelDay) {
                const selectedDate = parseISO(selectedModelDay)
                return `${format(selectedDate, 'MMM dd')}'s Usage Pattern`
              } else {
                return "Yesterday's Usage Pattern"
              }
            })()}
          </h3>
          {(() => {
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            const selectedDate = selectedModelDay || format(yesterday, 'yyyy-MM-dd')
            const selectedDayData = getSelectedDayData(selectedDate)
            // Get hovered day data if hovering
            const hoveredDayData = hoveredDay ? getSelectedDayData(hoveredDay) : []
            const showHoveredOverlay = hoveredDay && hoveredDayData.length > 0
            
            // Create combined data with hovered day overlay mapped to selected day's timeline
            const chartData = selectedDayData.map(point => {
              const result = { ...point }
              
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
              <ResponsiveContainer width="100%" height={300}>
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
              <div className="text-center text-gray-500 py-8">
                No data available for selected day
              </div>
            )
          })()}
        </div>
      </div>
      
      <div className="xl:col-span-1 space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">
            Billing Period Costs
            {(() => {
              if (selectedModelDay) {
                const selectedDate = parseISO(selectedModelDay)
                return ` (based on ${format(selectedDate, 'MMM dd')})`
              } else {
                return " (based on Yesterday)"
              }
            })()}
          </h3>
          {conedForecast && (
            <div className="text-sm text-gray-600 mb-4">
              {format(parseISO(conedForecast.bill_start_date), 'MMM dd')} - {format(parseISO(conedForecast.bill_end_date), 'MMM dd, yyyy')}
            </div>
          )}
          {(() => {
            let selectedDayUsage = 0
            
            if (selectedModelDay) {
              const selectedDayData = getSelectedDayData(selectedModelDay)
              selectedDayUsage = selectedDayData.reduce((sum, d) => sum + d.consumption_kwh, 0)
            } else {
              const last7DaysData = getLast7DaysData
              const yesterdayData = last7DaysData.find(d => d.isYesterday)
              selectedDayUsage = yesterdayData?.usage || 0
            }
            const projection = getModelDayProjection(selectedDayUsage)
            
            // Calculate breakdown for the total projected monthly usage
            const { variableBreakdown, fixedBreakdown, variableCost, fixedCost } = calculateCostBreakdown(projection.totalProjectedUsage)
            
            return (
              <div className="space-y-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">${(variableCost + fixedCost).toFixed(2)}</div>
                    <div className="text-gray-600">Projected Bill</div>
                    <div className="text-sm text-gray-500">{projection.totalProjectedUsage.toFixed(0)} kWh total usage</div>
                    {conedForecast && (
                      <div className="text-xs text-gray-500 mt-1">
                        ConEd's forecast: {(conedForecast.usage_to_date + conedForecast.forecasted_usage).toFixed(0)} kWh
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-blue-50 p-2 rounded">
                    <div className="font-semibold">{projection.monthToDateUsage.toFixed(0)} kWh</div>
                    <div className="text-gray-600">Bill Period to Date</div>
                  </div>
                  <div className="bg-orange-50 p-2 rounded">
                    <div className="font-semibold">{projection.projectedRemainingUsage.toFixed(0)} kWh</div>
                    <div className="text-gray-600">Projected Remaining ({projection.remainingDays} days)</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-3">Variable Costs (Usage-Based)</h4>
                  <div className="space-y-2">
                    {variableBreakdown.map((item, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                        <div>
                          <div className="font-medium">{item.tier}</div>
                          <div className="text-xs text-gray-600">{item.description}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">${item.cost.toFixed(2)}</div>
                          {item.usage && (
                            <div className="text-xs text-gray-600">{item.usage.toFixed(0)} kWh</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 p-2 bg-blue-100 rounded">
                    <div className="flex justify-between font-semibold text-sm">
                      <span>Total Variable Costs</span>
                      <span>${variableCost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-3">Fixed Costs (Monthly)</h4>
                  <div className="space-y-2">
                    {fixedBreakdown.map((item, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                        <div>
                          <div className="font-medium">{item.tier}</div>
                          <div className="text-xs text-gray-600">{item.description}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">${item.cost.toFixed(2)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 p-2 bg-blue-100 rounded">
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
  )
}