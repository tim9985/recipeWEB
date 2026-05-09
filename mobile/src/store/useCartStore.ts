import create from 'zustand';
import { Ingredient } from '~/src/types';

type CartState = {
  items: Ingredient[];
  add: (item: Ingredient) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: [item, ...s.items] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clear: () => set({ items: [] })
}));
