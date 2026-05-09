import React from 'react';
import { View, Text } from 'react-native';

export default function Chip({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#FFF5E6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 }}>
      <Text style={{ color: '#4A4A4A' }}>{children}</Text>
    </View>
  );
}
