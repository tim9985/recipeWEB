import React from 'react';
import { Pressable, Text, ViewStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
};

export default function SoftButton({ children, onPress, style }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ backgroundColor: pressed ? '#FFDCC0' : '#FFB067', padding: 12, borderRadius: 999, alignItems: 'center' }, style]}>
      <Text style={{ color: '#fff', fontWeight: '600' }}>{children}</Text>
    </Pressable>
  );
}
