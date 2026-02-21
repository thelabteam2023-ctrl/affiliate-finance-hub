import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface TopBarContextType {
  content: ReactNode | null;
  setContent: (content: ReactNode | null) => void;
}

const TopBarContext = createContext<TopBarContextType>({
  content: null,
  setContent: () => {},
});

export function TopBarProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode | null>(null);
  return (
    <TopBarContext.Provider value={{ content, setContent }}>
      {children}
    </TopBarContext.Provider>
  );
}

export const useTopBar = () => useContext(TopBarContext);
