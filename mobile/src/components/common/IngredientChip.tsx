import React from 'react';
import { View, Text } from 'react-native';
import COLORS from '~/src/constants/colors';

export default function IngredientChip({ name, isExpiring }: { name: string; isExpiring?: boolean }) {
  const bg = isExpiring ? COLORS.warn : '#E8FFF3';
  const textColor = '#4A4A4A';
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, marginRight: 8 }}>
      <Text style={{ color: textColor }}>{name}</Text>
    </View>
  );
}
