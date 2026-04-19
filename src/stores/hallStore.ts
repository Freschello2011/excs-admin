import { create } from 'zustand';

/* ==================== Types ==================== */

interface HallSelectionState {
  selectedHallId: number | undefined;
  selectedHallName: string | undefined;
  selectedExhibitId: number | undefined;
  selectedExhibitName: string | undefined;
}

interface HallSelectionActions {
  setSelectedHall: (id: number, name: string) => void;
  clearSelectedHall: () => void;
  setSelectedExhibit: (id: number, name: string) => void;
  clearSelectedExhibit: () => void;
}

type HallSelectionStore = HallSelectionState & HallSelectionActions;

/* ==================== Helpers ==================== */

function getInitialState(): HallSelectionState {
  const savedId = localStorage.getItem('excs-selected-hall-id');
  const savedName = localStorage.getItem('excs-selected-hall-name');
  const savedExhibitId = localStorage.getItem('excs-selected-exhibit-id');
  const savedExhibitName = localStorage.getItem('excs-selected-exhibit-name');
  return {
    selectedHallId: savedId ? Number(savedId) : undefined,
    selectedHallName: savedName || undefined,
    selectedExhibitId: savedExhibitId ? Number(savedExhibitId) : undefined,
    selectedExhibitName: savedExhibitName || undefined,
  };
}

function clearExhibitStorage() {
  localStorage.removeItem('excs-selected-exhibit-id');
  localStorage.removeItem('excs-selected-exhibit-name');
}

/* ==================== Store ==================== */

export const useHallStore = create<HallSelectionStore>()((set) => ({
  ...getInitialState(),

  setSelectedHall: (id, name) => {
    localStorage.setItem('excs-selected-hall-id', String(id));
    localStorage.setItem('excs-selected-hall-name', name);
    // 切换展厅时自动清空展项选择
    clearExhibitStorage();
    set({ selectedHallId: id, selectedHallName: name, selectedExhibitId: undefined, selectedExhibitName: undefined });
  },

  clearSelectedHall: () => {
    localStorage.removeItem('excs-selected-hall-id');
    localStorage.removeItem('excs-selected-hall-name');
    clearExhibitStorage();
    set({ selectedHallId: undefined, selectedHallName: undefined, selectedExhibitId: undefined, selectedExhibitName: undefined });
  },

  setSelectedExhibit: (id, name) => {
    localStorage.setItem('excs-selected-exhibit-id', String(id));
    localStorage.setItem('excs-selected-exhibit-name', name);
    set({ selectedExhibitId: id, selectedExhibitName: name });
  },

  clearSelectedExhibit: () => {
    clearExhibitStorage();
    set({ selectedExhibitId: undefined, selectedExhibitName: undefined });
  },
}));
