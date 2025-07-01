import './global.css';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <View className="flex-1 bg-white">
          <View className="flex-1 items-center justify-center">
            <Text className="text-2xl font-bold text-gray-900 text-center">
              Electricity Tracker ks
            </Text>
            <Text className="text-base text-gray-600 mt-2 text-center">
              Expo + NativeWind v4 ✅
            </Text>
          </View>
          <StatusBar style="auto" />
        </View>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}