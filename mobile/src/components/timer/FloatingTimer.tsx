import React, { useRef } from 'react';
import { View, Text, Animated, PanResponder } from 'react-native';
import { useTimerStore } from '~/src/store/useTimerStore';

export default function FloatingTimer() {
  const active = useTimerStore((s) => s.active);
  const secondsLeft = useTimerStore((s) => s.secondsLeft);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({ x: pan.x._value, y: pan.y._value });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  if (!active) return null;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{ position: 'absolute', right: 16, bottom: 24, transform: pan.getTranslateTransform() }}
    >
      <View style={{ backgroundColor: '#FFB067', padding: 12, borderRadius: 999 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{Math.ceil(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</Text>
      </View>
    </Animated.View>
  );
}
