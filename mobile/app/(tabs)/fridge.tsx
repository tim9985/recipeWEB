import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useFridgeStore } from '~/src/store/useFridgeStore';
import BottomSheet from '@gorhom/bottom-sheet';
import FAB from '~/src/components/common/FAB';

export default function FridgeScreen() {
  const ingredients = useFridgeStore((s) => s.ingredients);
  const loadMock = useFridgeStore((s) => s.loadMock);
  const addIngredient = useFridgeStore((s) => s.addIngredient);

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['25%', '50%'], []);

  const [name, setName] = useState('');

  useEffect(() => {
    if (!ingredients || ingredients.length === 0) {
      fetch('/src/mocks/ingredients.json')
        .then((r) => r.json())
        .then((data) => loadMock(data))
        .catch(() => {});
    }
  }, []);

  function onAdd() {
    if (!name.trim()) return;
    addIngredient({ id: `ing-${Date.now()}`, name: name.trim(), category: 'ETC', expirationDate: new Date().toISOString() });
    setName('');
    sheetRef.current?.collapse();
  }

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

      <BottomSheet ref={sheetRef} index={-1} snapPoints={snapPoints} enablePanDownToClose={true}>
        <View style={{ padding: 16 }}>
          <Text style={{ fontWeight: '700', marginBottom: 8 }}>재료 추가</Text>
          <TextInput value={name} onChangeText={setName} placeholder="재료 이름" style={{ backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 8 }} />
          <TouchableOpacity onPress={onAdd} style={{ backgroundColor: '#FFB067', padding: 12, borderRadius: 999, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>추가</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <FAB onPress={() => sheetRef.current?.expand()} />
    </View>
  );
}
