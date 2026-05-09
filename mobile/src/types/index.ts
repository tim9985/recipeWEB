export type Category = 'VEGETABLE' | 'MEAT' | 'SAUCE' | 'ETC';

export interface Ingredient {
  id: string;
  name: string;
  category: Category;
  expirationDate: string;
  isExpiringSoon?: boolean;
}

export interface RecipeStep {
  stepNo: number;
  description: string;
  timerSecs?: number;
}

export interface Recipe {
  id: string;
  title: string;
  imageUrl?: string;
  timeMins: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  calories: number;
  macros: { carbs: number; protein: number; fat: number };
  requiredIngredients: string[];
  steps: RecipeStep[];
}
