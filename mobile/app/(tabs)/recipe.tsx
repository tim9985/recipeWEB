import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import RecipeCard from '~/src/components/recipe/RecipeCard';

export default function RecipeScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 20, marginBottom: 12 }}>추천 레시피</Text>
      <RecipeCard title="샐러드" timeMins={10} calories={150} />
      <RecipeCard title="오믈렛" timeMins={12} calories={220} />
    </ScrollView>
  );
}
