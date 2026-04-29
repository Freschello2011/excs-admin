/**
 * device-mgmt-v2 P9-D：现场模式（FIELD MODE）开关 store。
 *
 * ADR-0015：现场模式 = 同一组件库的两套 CSS density token 切换；
 * 不另写一套界面。enabled 标志持久化到 localStorage 'excs-field-mode'。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FieldModeState {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
}

export const useFieldMode = create<FieldModeState>()(
  persist(
    (set, get) => ({
      enabled: false,
      toggle: () => set({ enabled: !get().enabled }),
      setEnabled: (v) => set({ enabled: v }),
    }),
    { name: 'excs-field-mode' },
  ),
);
