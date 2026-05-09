import React from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import StepCard from '~/src/components/recipe/StepCard';
import IngredientChip from '~/src/components/common/IngredientChip';

export default function RecipeDetail() {
  const mock = {
    title: '오믈렛 레시피',
    calories: 220,
    timeMins: 12,
    steps: [
      { stepNo: 1, description: '계란을 풀어 소금 간을 합니다.', timerSecs: 60 },
      { stepNo: 2, description: '팬에 기름을 두르고 약불에서 익힙니다.' },
    ],
    requiredIngredients: ['Egg', 'Salt', 'Butter'],
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ height: 300, backgroundColor: '#f3f3f3' }}>
        <Image style={{ width: '100%', height: '100%' }} source={require('../../assets/placeholder.png')} />
      </View>

      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>{mock.title}</Text>
        <Text style={{ color: '#666', marginTop: 6 }}>{mock.timeMins}분 · {mock.calories} kcal</Text>

        <View style={{ marginTop: 12, marginBottom: 8 }}>
          <Text style={{ fontWeight: '700' }}>재료</Text>
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            {mock.requiredIngredients.map((name) => (
              <IngredientChip key={name} name={name} isExpiring={false} />
            ))}
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '700', marginBottom: 8 }}>조리 단계</Text>
          {mock.steps.map((s) => (
            <StepCard key={s.stepNo} step={s} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
