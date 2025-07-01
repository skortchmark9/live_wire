import React from 'react';
import { View, Text, ScrollView } from 'react-native';

// Test importing from shared package - just the imports, no execution
import { 
  // Types
  type ElectricityDataPoint, 
  type WeatherDataPoint,
  type CostBreakdown,
  
  // Utils (test if they import correctly)
  calculateCostBreakdown,
  getApiBaseUrl,
  
  // Components
  TestComponent
} from '@electricity-tracker/shared';

export default function TestShared() {
  const apiUrl = getApiBaseUrl();
  
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
  
  // Check if function imported correctly
  const costFunctionExists = typeof calculateCostBreakdown === 'function';
  
  return (
    <ScrollView className="flex-1 bg-green-50 p-4">
      <Text className="text-2xl font-bold text-green-800 mb-4 text-center">
        Shared Package Import Test ✅
      </Text>
      
      <View className="bg-blue-100 p-4 rounded-lg mb-4">
        <Text className="text-center text-blue-800 font-medium">
          {TestComponent({ platform: 'mobile' })}
        </Text>
      </View>
      
      <View className="bg-white p-4 rounded-lg mb-4">
        <Text className="text-lg font-semibold text-gray-800 mb-2">
          📊 Types Import Test
        </Text>
        <Text className="text-sm text-gray-600">
          ✅ ElectricityDataPoint: {sampleElectricityPoint.usage} kWh
        </Text>
        <Text className="text-sm text-gray-600">
          ✅ WeatherDataPoint: {sampleWeatherPoint.temperature}°F
        </Text>
      </View>
      
      <View className="bg-white p-4 rounded-lg mb-4">
        <Text className="text-lg font-semibold text-gray-800 mb-2">
          🔧 Functions Import Test
        </Text>
        <Text className="text-sm text-gray-600">
          calculateCostBreakdown: {costFunctionExists ? '✅ Imported' : '❌ Failed'}
        </Text>
        <Text className="text-sm text-gray-600">
          getApiBaseUrl: {typeof getApiBaseUrl === 'function' ? '✅ Imported' : '❌ Failed'}
        </Text>
      </View>
      
      <View className="bg-white p-4 rounded-lg">
        <Text className="text-lg font-semibold text-gray-800 mb-2">
          🌐 API Configuration
        </Text>
        <Text className="text-sm text-gray-600">
          Base URL: {apiUrl}
        </Text>
      </View>
      
      <Text className="text-center text-green-600 mt-4 font-medium">
        Code sharing is working! 🎉
      </Text>
      <Text className="text-center text-gray-500 text-sm mt-2">
        Next.js → Shared Package → React Native ✅
      </Text>
    </ScrollView>
  );
}