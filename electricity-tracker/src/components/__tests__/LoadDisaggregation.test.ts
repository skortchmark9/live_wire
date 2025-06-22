/**
 * Unit test for fridge compressor cycle detection in LoadDisaggregation component
 * Tests the detection algorithm using real electricity usage data
 */

// Mock data representing typical fridge compressor cycles
const mockElectricityData = [
  // Baseline consumption (fridge running but compressor off)
  { start_time: '2025-05-27T00:00:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T00:15:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T00:30:00Z', consumption_kwh: 0.015 }, // 60W
  
  // Compressor cycle 1 (starts at 00:45, runs for 45 minutes)
  { start_time: '2025-05-27T00:45:00Z', consumption_kwh: 0.040 }, // 160W (compressor on)
  { start_time: '2025-05-27T01:00:00Z', consumption_kwh: 0.040 }, // 160W
  { start_time: '2025-05-27T01:15:00Z', consumption_kwh: 0.040 }, // 160W
  { start_time: '2025-05-27T01:30:00Z', consumption_kwh: 0.015 }, // 60W (compressor off)
  
  // Off period (3.5 hours)
  { start_time: '2025-05-27T01:45:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T02:00:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T02:15:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T02:30:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T02:45:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T03:00:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T03:15:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T03:30:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T03:45:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T04:00:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T04:15:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T04:30:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T04:45:00Z', consumption_kwh: 0.015 }, // 60W
  { start_time: '2025-05-27T05:00:00Z', consumption_kwh: 0.015 }, // 60W
  
  // Compressor cycle 2 (starts at 05:15, runs for 30 minutes) 
  { start_time: '2025-05-27T05:15:00Z', consumption_kwh: 0.040 }, // 160W (compressor on)
  { start_time: '2025-05-27T05:30:00Z', consumption_kwh: 0.040 }, // 160W
  { start_time: '2025-05-27T05:45:00Z', consumption_kwh: 0.015 }, // 60W (compressor off)
]

// Helper functions extracted from LoadDisaggregation component
const getBaselineUsage = (data: Array<{watts: number}>, index: number): number => {
  const window = data.slice(Math.max(0, index - 12), Math.min(data.length, index + 12))
  const sortedWatts = window.map(d => d.watts).sort((a, b) => a - b)
  return sortedWatts[Math.floor(sortedWatts.length * 0.25)]
}

const detectFridgeCompressor = (data: Array<{timestamp: string, watts: number}>): Array<{appliance: string, startTime: string, endTime: string, estimatedKwh: number, confidence: number}> => {
  const detected: Array<{appliance: string, startTime: string, endTime: string, estimatedKwh: number, confidence: number}> = []
  const potentialCycles: Array<{start: number, end: number, avgWatts: number, timestamp: string}> = []
  
  for (let i = 1; i < data.length - 1; i++) {
    const current = data[i].watts
    const prev = data[i - 1].watts
    const baseline = getBaselineUsage(data, i)
    
    // Look for significant power increase (compressor starting)
    if (current > baseline + 40 && current > prev + 25) {
      // Find end of this cycle
      let endIndex = i
      let maxWatts = current
      
      for (let j = i + 1; j < Math.min(i + 18, data.length); j++) {
        if (data[j].watts > maxWatts) maxWatts = data[j].watts
        if (data[j].watts < baseline + 20) {
          endIndex = j - 1
          break
        }
        endIndex = j
      }
      
      // Only consider cycles that last at least 2 intervals (30 minutes)
      if (endIndex > i + 1) {
        const duration = endIndex - i + 1
        const avgWatts = data.slice(i, endIndex + 1).reduce((sum, d) => sum + d.watts, 0) / duration
        
        potentialCycles.push({
          start: i,
          end: endIndex,
          avgWatts,
          timestamp: data[i].timestamp
        })
        
        i = endIndex // Skip ahead
      }
    }
  }
  
  // Validate cycles and add to detected
  potentialCycles.forEach((cycle, index) => {
    let confidence = 0.5
    
    // Check for periodic pattern
    const cycleTime = new Date(cycle.timestamp).getTime()
    const nearCycles = potentialCycles.filter((other, otherIndex) => {
      if (otherIndex === index) return false
      const otherTime = new Date(other.timestamp).getTime()
      const hoursDiff = Math.abs(cycleTime - otherTime) / (1000 * 60 * 60)
      return hoursDiff >= 3 && hoursDiff <= 5
    })
    
    if (nearCycles.length > 0) {
      confidence += 0.2
    }
    
    // Check power level
    const baseline = getBaselineUsage(data, cycle.start)
    const excess = cycle.avgWatts - baseline
    if (excess >= 60 && excess <= 180) {
      confidence += 0.2
    }
    
    // Check duration
    const durationMinutes = (cycle.end - cycle.start + 1) * 15
    if (durationMinutes >= 20 && durationMinutes <= 90) {
      confidence += 0.1
    }
    
    detected.push({
      appliance: 'Fridge Compressor',
      startTime: data[cycle.start].timestamp,
      endTime: data[cycle.end].timestamp,
      estimatedKwh: (cycle.avgWatts * (cycle.end - cycle.start + 1) * 0.25) / 1000,
      confidence: Math.min(confidence, 0.95)
    })
  })
  
  return detected
}

// Test function
const testFridgeDetection = (): boolean => {
  console.log('🧪 Testing Fridge Compressor Detection')
  console.log('=====================================')
  
  // Convert mock data to the format expected by detection algorithm
  const processedData = mockElectricityData.map(d => ({
    timestamp: d.start_time,
    watts: (d.consumption_kwh * 1000) / 0.25, // Convert kWh to W for 15min intervals
    kwh: d.consumption_kwh
  }))
  
  console.log(`📊 Input data: ${processedData.length} data points`)
  console.log(`   Power range: ${Math.min(...processedData.map(d => d.watts))}W - ${Math.max(...processedData.map(d => d.watts))}W`)
  
  // Run detection
  const detectedCycles = detectFridgeCompressor(processedData)
  
  console.log(`\n🔍 Detection Results:`)
  console.log(`   Detected cycles: ${detectedCycles.length}`)
  
  detectedCycles.forEach((cycle, i) => {
    const start = new Date(cycle.startTime)
    const end = new Date(cycle.endTime)
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60)
    
    console.log(`   Cycle ${i + 1}: ${start.toISOString().substr(11, 5)} - ${end.toISOString().substr(11, 5)} | ${durationMinutes}min | ${(cycle.confidence * 100).toFixed(0)}% confidence`)
  })
  
  // Test assertions
  const tests = [
    {
      name: 'Should detect 2 fridge cycles',
      condition: detectedCycles.length === 2,
      actual: detectedCycles.length,
      expected: 2
    },
    {
      name: 'First cycle should start around 00:45',
      condition: detectedCycles.length > 0 && detectedCycles[0].startTime.includes('00:45'),
      actual: detectedCycles[0]?.startTime,
      expected: 'contains 00:45'
    },
    {
      name: 'Second cycle should start around 05:15',
      condition: detectedCycles.length > 1 && detectedCycles[1].startTime.includes('05:15'),
      actual: detectedCycles[1]?.startTime,
      expected: 'contains 05:15'
    },
    {
      name: 'Cycles should have reasonable confidence (>50%)',
      condition: detectedCycles.every(cycle => cycle.confidence > 0.5),
      actual: detectedCycles.map(c => `${(c.confidence * 100).toFixed(0)}%`).join(', '),
      expected: '>50%'
    }
  ]
  
  console.log(`\n✅ Test Results:`)
  let passedTests = 0
  
  tests.forEach(test => {
    const passed = test.condition
    const icon = passed ? '✅' : '❌'
    console.log(`   ${icon} ${test.name}`)
    console.log(`      Expected: ${test.expected}`)
    console.log(`      Actual: ${test.actual}`)
    
    if (passed) passedTests++
  })
  
  const success = passedTests === tests.length
  console.log(`\n🎯 Overall: ${passedTests}/${tests.length} tests passed`)
  console.log(success ? '🎉 SUCCESS: Fridge detection is working!' : '🔧 NEEDS WORK: Detection needs improvement')
  
  return success
}

// Export for use in actual test runners
export { testFridgeDetection, detectFridgeCompressor, getBaselineUsage }

// Run test if this file is executed directly
if (typeof window === 'undefined' && typeof module !== 'undefined') {
  const success = testFridgeDetection()
  process.exit(success ? 0 : 1)
}