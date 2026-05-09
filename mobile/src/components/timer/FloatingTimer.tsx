import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTimerStore } from '~/src/store/useTimerStore';

export default function FloatingTimer() {
  const active = useTimerStore((s) => s.active);
  const secondsLeft = useTimerStore((s) => s.secondsLeft);

  if (!active) return null;

  return (
    <Pressable style={{ position: 'absolute', right: 16, bottom: 24, backgroundColor: '#FFB067', padding: 12, borderRadius: 999 }}>
      <Text style={{ color: '#fff', fontWeight: '700' }}>{Math.ceil(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</Text>
    </Pressable>
  );
}
