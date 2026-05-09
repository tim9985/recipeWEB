import create from 'zustand';

type Macro = { carbs: number; protein: number; fat: number };

type MealState = {
  todayMacros: Macro;
  addMeal: (m: Macro) => void;
  reset: () => void;
};

export const useMealStore = create<MealState>((set) => ({
  todayMacros: { carbs: 0, protein: 0, fat: 0 },
  addMeal: (m) => set((s) => ({ todayMacros: { carbs: s.todayMacros.carbs + m.carbs, protein: s.todayMacros.protein + m.protein, fat: s.todayMacros.fat + m.fat } })),
  reset: () => set({ todayMacros: { carbs: 0, protein: 0, fat: 0 } })
}));
