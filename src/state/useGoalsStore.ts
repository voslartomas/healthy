import { create } from 'zustand';

export interface WeeklyGoal {
  id: string;
  title: string;
  targetPerWeek: number;
  completedThisWeek: number;
}

interface GoalsState {
  goals: WeeklyGoal[];
  addGoal: (title: string, targetPerWeek: number) => void;
  incrementProgress: (id: string) => void;
  resetWeek: () => void;
}

let nextId = 1;

export const useGoalsStore = create<GoalsState>(set => ({
  goals: [],
  addGoal: (title, targetPerWeek) =>
    set(state => ({
      goals: [
        ...state.goals,
        {
          id: String(nextId++),
          title,
          targetPerWeek,
          completedThisWeek: 0,
        },
      ],
    })),
  incrementProgress: id =>
    set(state => ({
      goals: state.goals.map(goal =>
        goal.id === id && goal.completedThisWeek < goal.targetPerWeek
          ? { ...goal, completedThisWeek: goal.completedThisWeek + 1 }
          : goal,
      ),
    })),
  resetWeek: () =>
    set(state => ({
      goals: state.goals.map(goal => ({ ...goal, completedThisWeek: 0 })),
    })),
}));

export function isGoalComplete(goal: WeeklyGoal): boolean {
  return goal.completedThisWeek >= goal.targetPerWeek;
}
