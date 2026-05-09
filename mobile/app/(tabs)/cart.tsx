import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useCartStore } from '~/src/store/useCartStore';

export default function CartScreen() {
  const items = useCartStore((s) => s.items);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, marginBottom: 12 }}>장보기</Text>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text>{item.name}</Text>
            <TouchableOpacity onPress={() => remove(item.id)}>
              <Text style={{ color: '#FF6B6B' }}>삭제</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity onPress={() => clear()} style={{ marginTop: 12, backgroundColor: '#FFB067', padding: 12, borderRadius: 999 }}>
        <Text style={{ textAlign: 'center' }}>장보기 완료 (모두 이동)</Text>
      </TouchableOpacity>
    </View>
  );
}
