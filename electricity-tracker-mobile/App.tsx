import './global.css';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import TestShared from './test-shared';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <TestShared />
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}