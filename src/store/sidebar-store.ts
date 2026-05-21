import { create } from 'zustand';

export type FlyoutState = 'closed' | 'opening' | 'hover-preview' | 'pinned-open' | 'closing-delay';

interface SidebarNavigationState {
  activeFlyoutId: string | null;
  pinnedFlyoutId: string | null;
  state: FlyoutState;
  
  // Actions
  setOpening: (id: string) => void;
  setHoverPreview: (id: string) => void;
  pin: (id: string) => void;
  close: () => void;
  startClosing: () => void;
  clearActive: () => void;
}

export const useSidebarStore = create<SidebarNavigationState>((set, get) => ({
  activeFlyoutId: null,
  pinnedFlyoutId: null,
  state: 'closed',

  setOpening: (id: string) => {
    set({ 
      activeFlyoutId: id, 
      state: 'opening'
    });
  },

  setHoverPreview: (id: string) => {
    set({ 
      activeFlyoutId: id, 
      state: 'hover-preview'
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
    if (get().state !== 'pinned-open') {
      set({ state: 'closing-delay' });
    }
  },

  clearActive: () => {
    const currentState = get().state;
    if (currentState !== 'pinned-open') {
      set({ activeFlyoutId: null, state: 'closed' });
    }
  }
}));
