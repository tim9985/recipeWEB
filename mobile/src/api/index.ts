const BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://10.0.2.2:3000';

async function apiGet(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

async function apiPost(path: string, body: any) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

export const api = {
  ping: () => apiGet('/api/ping-feature'),
  getShoppingList: () => apiGet('/api/shopping-list'),
  addShoppingItem: (item: { name: string; quantityText?: string }) => apiPost('/api/shopping-list', item),
  bulkAddShopping: (items: any[]) => apiPost('/api/shopping-list/bulk', { items }),
  estimateNutrition: (profile: any) => apiPost('/api/nutrition/estimate', profile),
  seasonalRecommendations: () => apiGet('/api/seasonal-recommendations'),
};

export default api;
