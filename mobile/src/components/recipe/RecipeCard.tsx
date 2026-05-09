import React from 'react';
import { View, Text, Image } from 'react-native';

export default function RecipeCard({ title, timeMins, calories }: { title: string; timeMins?: number; calories?: number }) {
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 12 }}>
      <View style={{ height: 120, backgroundColor: '#f3f3f3', borderRadius: 12, marginBottom: 8 }} />
      <Text style={{ fontSize: 16, fontWeight: '600' }}>{title}</Text>
      <Text style={{ color: '#666', marginTop: 6 }}>{timeMins ? `${timeMins}분` : ''} {calories ? `· ${calories} kcal` : ''}</Text>
    </View>
  );
}
