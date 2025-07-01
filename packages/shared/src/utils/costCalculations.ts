import { CostBreakdown, CostBreakdownItem } from '../types';

export function calculateCostBreakdown(usage: number): CostBreakdown {
  const variableBreakdown: CostBreakdownItem[] = []
  const fixedBreakdown: CostBreakdownItem[] = []
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
  
  const deliveryRate = 0.18050 // 18.050c/kWh
  const deliveryCost = usage * deliveryRate
  variableBreakdown.push({
    tier: 'Delivery',
    usage: usage,
    rate: deliveryRate,
    cost: deliveryCost,
    description: '18.050¢/kWh'
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
  
  const basicServiceCharge = 21.28
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

export function calculateUsageCost(kwh: number): number {
  return calculateCostBreakdown(kwh).variableCost
}