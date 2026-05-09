import React from 'react';
import { View, Text } from 'react-native';

export default function NutritionScreen() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, marginBottom: 12 }}>영양</Text>
      <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12 }}>
        <Text>도넛 차트 자리 (추후 구현)</Text>
      </View>
    </View>
  );
}
