import { create } from 'zustand';

export type FlyoutState = 'closed' | 'hover-preview' | 'pinned-open' | 'closing-delay';

interface SidebarNavigationState {
  activeFlyoutId: string | null;
  pinnedFlyoutId: string | null;
  state: FlyoutState;
  
  // Actions
  openHover: (id: string) => void;
  pin: (id: string) => void;
  close: () => void;
  startClosing: () => void;
  clearActive: () => void;
}

export const useSidebarStore = create<SidebarNavigationState>((set, get) => ({
  activeFlyoutId: null,
  pinnedFlyoutId: null,
  state: 'closed',

  openHover: (id: string) => {
    // If it's pinned and we hover another one, we might want to unpin or just show hover
    // Usually, hovering another menu should probably unpin the current one for better UX
    set({ 
      activeFlyoutId: id, 
      state: 'hover-preview',
      pinnedFlyoutId: get().pinnedFlyoutId === id ? get().pinnedFlyoutId : null 
    });
  },

  pin: (id: string) => {
    set({ 
      activeFlyoutId: id, 
      pinnedFlyoutId: id, 
      state: 'pinned-open' 
    });
  },

  close: () => {
    set({ 
      activeFlyoutId: null, 
      pinnedFlyoutId: null, 
      state: 'closed' 
    });
  },

  startClosing: () => {
    // Only transition to closing-delay if not pinned
    if (get().state !== 'pinned-open') {
      set({ state: 'closing-delay' });
    }
  },

  clearActive: () => {
    if (get().state !== 'pinned-open') {
      set({ activeFlyoutId: null, state: 'closed' });
    }
  }
}));
