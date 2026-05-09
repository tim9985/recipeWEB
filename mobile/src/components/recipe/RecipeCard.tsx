import React, { useRef } from 'react';
import { View, Text, Image, Animated, Pressable } from 'react-native';

export default function RecipeCard({ title, timeMins, calories }: { title: string; timeMins?: number; calories?: number }) {
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  }
  function onPressOut() {
    Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }).start();
  }

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={{ transform: [{ scale }], backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 12 }}>
        <View style={{ height: 120, backgroundColor: '#f3f3f3', borderRadius: 12, marginBottom: 8 }} />
        <Text style={{ fontSize: 16, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: '#666', marginTop: 6 }}>{timeMins ? `${timeMins}분` : ''} {calories ? `· ${calories} kcal` : ''}</Text>
      </Animated.View>
    </Pressable>
  );
}
