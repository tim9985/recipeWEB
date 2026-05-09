import React from 'react';
import { View, Text } from 'react-native';

export default function MyPage() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, marginBottom: 12 }}>마이페이지</Text>
      <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12 }}>
        <Text>프로필 및 설정</Text>
      </View>
    </View>
  );
}
