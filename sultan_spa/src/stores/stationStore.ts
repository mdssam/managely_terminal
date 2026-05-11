import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem } from '../../types'

export type StationMode = 'order' | 'cashier' | null;

export interface OrderPartition {
  id: string;
  name: string;
  items: CartItem[];
  timestamp: number;
}

interface StationState {
  mode: StationMode;
  partitions: OrderPartition[];
  activePartitionId: string | null;
  
  // Actions
  setMode: (mode: StationMode) => void;
  addPartition: (name: string) => void;
  removePartition: (id: string) => void;
  setActivePartition: (id: string) => void;
  updatePartitionItems: (id: string, items: CartItem[]) => void;
  clearAllPartitions: () => void;
}

export const useStationStore = create<StationState>()(
  persist(
    (set) => ({
      mode: null,
      partitions: [],
      activePartitionId: null,

      setMode: (mode) => set({ mode }),

      addPartition: (name) => set((state) => {
        const newPartition: OrderPartition = {
          id: `partition-${Date.now()}`,
          name,
          items: [],
          timestamp: Date.now()
        };
        const newPartitions = [...state.partitions, newPartition];
        return {
          partitions: newPartitions,
          activePartitionId: newPartition.id
        };
      }),

      removePartition: (id) => set((state) => {
        const newPartitions = state.partitions.filter(p => p.id !== id);
        const newActive = state.activePartitionId === id 
          ? (newPartitions.length > 0 ? newPartitions[0].id : null) 
          : state.activePartitionId;
        return {
          partitions: newPartitions,
          activePartitionId: newActive
        };
      }),

      setActivePartition: (id) => set({ activePartitionId: id }),

      updatePartitionItems: (id, items) => set((state) => ({
        partitions: state.partitions.map(p => 
          p.id === id ? { ...p, items, timestamp: Date.now() } : p
        )
      })),

      clearAllPartitions: () => set({ partitions: [], activePartitionId: null })
    }),
    {
      name: 'sultan-station-storage'
    }
  )
);
