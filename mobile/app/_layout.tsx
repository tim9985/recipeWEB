import React from 'react';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import FloatingTimer from '~/src/components/timer/FloatingTimer';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Slot />
        <FloatingTimer />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
