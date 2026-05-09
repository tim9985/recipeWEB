import create from 'zustand';
import { Ingredient } from '~/src/types';

type FridgeState = {
  ingredients: Ingredient[];
  addIngredient: (item: Ingredient) => void;
  removeIngredient: (id: string) => void;
  loadMock: (items: Ingredient[]) => void;
};

export const useFridgeStore = create<FridgeState>((set) => ({
  ingredients: [],
  addIngredient: (item) => set((s) => ({ ingredients: [item, ...s.ingredients] })),
  removeIngredient: (id) => set((s) => ({ ingredients: s.ingredients.filter((i) => i.id !== id) })),
  loadMock: (items) => set({ ingredients: items })
}));
