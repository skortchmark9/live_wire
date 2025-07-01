export interface ElectricityDataPoint {
  start_time: string
  end_time: string
  consumption_kwh: number | null
  provided_cost: number | null
}

export interface WeatherDataPoint {
  timestamp: string
  temperature_f: number | null
  humidity_percent: number | null
}

export interface CombinedDataPoint {
  timestamp: string
  consumption_kwh: number
  temperature_f?: number | null
  cost: number
  hour: number
  dayOfWeek: number
}

export interface PredictionDataPoint {
  hour: number
  predicted_kwh: number
  timestamp: string
}

export interface ConEdForecast {
  bill_start_date: string
  bill_end_date: string
  current_date: string
  unit_of_measure: string
  usage_to_date: number
  cost_to_date: number
  forecasted_usage: number
  forecasted_cost: number
  typical_usage: number
  typical_cost: number
  account_id: string
}

export interface CostBreakdownItem {
  tier: string
  usage: number | null
  rate: number | null
  cost: number
  description: string
}

export interface CostBreakdown {
  variableBreakdown: CostBreakdownItem[]
  fixedBreakdown: CostBreakdownItem[]
  variableCost: number
  fixedCost: number
  totalDailyCost: number
  projectedMonthlyCost: number
}

export type TimeRange = '7d' | '30d' | '1d'
export type ActiveTab = 'home' | 'disaggregation' | 'cost'