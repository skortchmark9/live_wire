'use client';

import React from 'react';

// Test importing from shared package - avoid hooks for now
import { 
  // Types
  type ElectricityDataPoint, 
  type WeatherDataPoint,
  type CostBreakdown,
  
  // Components
  TestComponent
} from '@electricity-tracker/shared';

export default function TestSharedPage() {
  // Test types by creating sample data
  const sampleElectricityPoint: ElectricityDataPoint = {
    timestamp: new Date(),
    usage: 1.5,
    cost: 0.3
  };
  
  const sampleWeatherPoint: WeatherDataPoint = {
    timestamp: new Date(),
    temperature: 72,
    humidity: 60
  };
  
  // Simple test data
  const apiUrl = "http://localhost:5000"; // Hardcoded for test
  
  return (
    <div className="min-h-screen bg-green-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-green-800 mb-8 text-center">
          Next.js Shared Package Test ✅
        </h1>
        
        <TestComponent platform="web" />
        
        <div className="grid gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              📊 Types Import Test
            </h2>
            <p className="text-gray-600">
              ✅ ElectricityDataPoint: {sampleElectricityPoint.usage} kWh
            </p>
            <p className="text-gray-600">
              ✅ WeatherDataPoint: {sampleWeatherPoint.temperature}°F
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              🔧 Package Import Test
            </h2>
            <p className="text-gray-600">
              ✅ Shared package imports working
            </p>
            <p className="text-gray-600">
              ✅ TypeScript types available
            </p>
            <p className="text-gray-600">
              ✅ Monorepo structure functional
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              🌐 API Configuration
            </h2>
            <p className="text-gray-600">
              Base URL: {apiUrl}
            </p>
          </div>
          
          <div className="text-center">
            <p className="text-green-600 text-lg font-medium">
              Web app can import shared code! 🎉
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Bidirectional code sharing is working ✅
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}