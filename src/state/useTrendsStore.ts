import { create } from 'zustand';

/** The Trends metric currently selected. Lifted to a tiny store so the native
 * header can show the selected metric's delta (top-right, as in the design)
 * while the screen owns the segment picker. */
interface TrendsState {
  activeKey: string;
  setActiveKey: (key: string) => void;
}

export const useTrendsStore = create<TrendsState>(set => ({
  activeKey: 'weight',
  setActiveKey: activeKey => set({ activeKey }),
}));
