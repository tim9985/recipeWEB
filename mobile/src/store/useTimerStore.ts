import create from 'zustand';

type TimerState = {
  active: boolean;
  secondsLeft: number;
  start: (secs: number) => void;
  stop: () => void;
  tick: () => void;
};

export const useTimerStore = create<TimerState>((set) => ({
  active: false,
  secondsLeft: 0,
  start: (secs) => set({ active: true, secondsLeft: secs }),
  stop: () => set({ active: false, secondsLeft: 0 }),
  tick: () => set((s) => ({ secondsLeft: Math.max(0, s.secondsLeft - 1), active: s.secondsLeft - 1 > 0 }))
}));
