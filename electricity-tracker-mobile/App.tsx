import "./global.css";
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <View className="flex-1 items-center justify-center bg-white dark:bg-gray-900">
          <Text className="text-xl font-bold text-gray-900 dark:text-white">
            Electricity Tracker Mobile
          </Text>
          <Text className="text-gray-600 dark:text-gray-400 mt-2">
            Expo + NativeWind Setup Complete ✅
          </Text>
          <StatusBar style="auto" />
        </View>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}