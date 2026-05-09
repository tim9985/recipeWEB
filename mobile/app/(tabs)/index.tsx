import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity } from 'react-native';
import RecipeCard from '~/src/components/recipe/RecipeCard';
import { useFridgeStore } from '~/src/store/useFridgeStore';
import api from '~/src/api';

export default function HomeScreen() {
  const ingredients = useFridgeStore((s) => s.ingredients);
  const [recommended, setRecommended] = useState<any[]>([]);

  useEffect(() => {
    api.seasonalRecommendations()
      .then((res) => {
        if (res?.ok && Array.isArray(res.data)) setRecommended(res.data);
      })
      .catch(() => {});
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>오늘의 추천</Text>

      <View style={{ backgroundColor: '#FFF5E6', padding: 12, borderRadius: 16, marginBottom: 12 }}>
        <Text style={{ fontWeight: '700' }}>내 냉장고</Text>
        <Text style={{ color: '#666', marginTop: 6 }}>{ingredients.length}개의 재료 등록됨</Text>
      </View>

      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>추천 레시피</Text>
      <FlatList
        horizontal
        data={recommended.length ? recommended : [{ id: 'r1', RCP_NM: '샐러드' }, { id: 'r2', RCP_NM: '오믈렛' }]}
        keyExtractor={(i: any) => i.id || i.RCP_SEQ || String(i.RCP_NM)}
        renderItem={({ item }: any) => (
          <View style={{ width: 220, marginRight: 12 }}>
            <RecipeCard title={item.RCP_NM || item.title || '레시피'} timeMins={item.timeMins || 15} calories={item.calories || 200} />
          </View>
        )}
      />

      <TouchableOpacity style={{ marginTop: 20, backgroundColor: '#86D3A5', padding: 12, borderRadius: 999, alignItems: 'center' }} onPress={() => {}}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>레시피 더보기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
