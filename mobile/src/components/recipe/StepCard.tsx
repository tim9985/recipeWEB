import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTimerStore } from '~/src/store/useTimerStore';

export default function StepCard({ step }: { step: { stepNo: number; description: string; timerSecs?: number } }) {
  const start = useTimerStore((s) => s.start);

  return (
    <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10 }}>
      <Text style={{ fontWeight: '700' }}>Step {step.stepNo}</Text>
      <Text style={{ marginTop: 6, color: '#444' }}>{step.description}</Text>
      {step.timerSecs ? (
        <TouchableOpacity onPress={() => start(step.timerSecs)} style={{ marginTop: 10, backgroundColor: '#FFB067', padding: 8, borderRadius: 999, alignSelf: 'flex-start' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>타이머 {Math.ceil(step.timerSecs / 60)}분</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
