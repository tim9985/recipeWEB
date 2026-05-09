import React, { useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useFridgeStore } from '~/src/store/useFridgeStore';

export default function FridgeScreen() {
  const ingredients = useFridgeStore((s) => s.ingredients);
  const loadMock = useFridgeStore((s) => s.loadMock);

  useEffect(() => {
    // load mock data if empty
    if (!ingredients || ingredients.length === 0) {
      fetch('src/mocks/ingredients.json')
        .then((r) => r.json())
        .then((data) => loadMock(data))
        .catch(() => {});
    }
  }, []);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, marginBottom: 12 }}>내 냉장고</Text>
      <FlatList
        data={ingredients}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12, marginBottom: 8 }}>
            <Text>{item.name}</Text>
            <Text style={{ color: '#666', fontSize: 12 }}>{item.category}</Text>
          </View>
        )}
      />
    </View>
  );
}
