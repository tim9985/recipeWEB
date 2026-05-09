import React from 'react';
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ href: '/' }} />
      <Tabs.Screen name="recipe" />
      <Tabs.Screen name="fridge" />
      <Tabs.Screen name="cart" />
      <Tabs.Screen name="nutrition" />
      <Tabs.Screen name="mypage" />
    </Tabs>
  );
}
