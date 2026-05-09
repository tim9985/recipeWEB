import React from 'react';
import { TouchableOpacity, Text, ViewStyle } from 'react-native';

export default function FAB({ onPress, style }: { onPress?: () => void; style?: ViewStyle }) {
  return (
    <TouchableOpacity onPress={onPress} style={[{ position: 'absolute', right: 20, bottom: 24, backgroundColor: '#FFB067', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6 }, style]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 24 }}>+</Text>
    </TouchableOpacity>
  );
}
