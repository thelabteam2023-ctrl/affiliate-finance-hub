import { useState, useEffect, useCallback, createContext, useContext } from 'react';

// User preferences for media display
export type ImageDisplayMode = 'auto' | 'collapsed' | 'hidden';

interface ChatMediaPreferences {
  imageDisplayMode: ImageDisplayMode;
}

const STORAGE_KEY = 'chat-media-preferences';

const defaultPreferences: ChatMediaPreferences = {
  imageDisplayMode: 'collapsed', // Default: always collapsed
};

// Rate limits
const RATE_LIMITS = {
  image: {
    perInterval: 3, // max 3 images
    intervalMs: 10 * 60 * 1000, // per 10 minutes
    maxPerDay: 10,
  },
  audio: {
    maxDuration: 30, // seconds
  },
};

interface MediaUsageRecord {
  timestamps: number[];
  dailyCount: number;
  lastResetDate: string;
}

interface MediaUsage {
  image: MediaUsageRecord;
}

const USAGE_STORAGE_KEY = 'chat-media-usage';

export function useChatMediaPreferences() {
  const [preferences, setPreferences] = useState<ChatMediaPreferences>(() => {
    if (typeof window === 'undefined') return defaultPreferences;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return { ...defaultPreferences, ...JSON.parse(stored) };
      } catch {
        return defaultPreferences;
      }
    }
    return defaultPreferences;
  });

  const updatePreferences = useCallback((updates: Partial<ChatMediaPreferences>) => {
    setPreferences(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    preferences,
    updatePreferences,
    imageDisplayMode: preferences.imageDisplayMode,
    setImageDisplayMode: (mode: ImageDisplayMode) => updatePreferences({ imageDisplayMode: mode }),
  };
}

// Rate limit hook
export function useChatMediaRateLimit() {
  const [usage, setUsage] = useState<MediaUsage>(() => {
    if (typeof window === 'undefined') return getDefaultUsage();
    const stored = localStorage.getItem(USAGE_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Check if daily reset needed
        const today = new Date().toISOString().split('T')[0];
        if (parsed.image.lastResetDate !== today) {
          return getDefaultUsage();
        }
        return parsed;
      } catch {
        return getDefaultUsage();
      }
    }
    return getDefaultUsage();
  });

  const saveUsage = useCallback((newUsage: MediaUsage) => {
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(newUsage));
    setUsage(newUsage);
  }, []);

  const checkImageRateLimit = useCallback((): { allowed: boolean; reason?: string; waitSeconds?: number } => {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    
    // Reset if new day
    if (usage.image.lastResetDate !== today) {
      const newUsage: MediaUsage = {
        image: {
          timestamps: [],
          dailyCount: 0,
          lastResetDate: today,
        },
      };
      saveUsage(newUsage);
      return { allowed: true };
    }

    // Check daily limit
    if (usage.image.dailyCount >= RATE_LIMITS.image.maxPerDay) {
      return { 
        allowed: false, 
        reason: `Limite de ${RATE_LIMITS.image.maxPerDay} imagens por dia atingido.`,
      };
    }

    // Filter timestamps within interval
    const cutoff = now - RATE_LIMITS.image.intervalMs;
    const recentTimestamps = usage.image.timestamps.filter(ts => ts > cutoff);

    // Check interval limit
    if (recentTimestamps.length >= RATE_LIMITS.image.perInterval) {
      const oldestRecent = Math.min(...recentTimestamps);
      const waitMs = (oldestRecent + RATE_LIMITS.image.intervalMs) - now;
      const waitSeconds = Math.ceil(waitMs / 1000);
      const waitMinutes = Math.ceil(waitSeconds / 60);
      
      return {
        allowed: false,
        reason: `Limite de ${RATE_LIMITS.image.perInterval} imagens a cada 10 minutos. Aguarde ${waitMinutes} minuto(s).`,
        waitSeconds,
      };
    }

    return { allowed: true };
  }, [usage, saveUsage]);

  const recordImageSent = useCallback(() => {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const cutoff = now - RATE_LIMITS.image.intervalMs;
    
    // Filter old timestamps
    const recentTimestamps = usage.image.timestamps.filter(ts => ts > cutoff);
    
    const newUsage: MediaUsage = {
      image: {
        timestamps: [...recentTimestamps, now],
        dailyCount: usage.image.lastResetDate === today 
          ? usage.image.dailyCount + 1 
          : 1,
        lastResetDate: today,
      },
    };
    
    saveUsage(newUsage);
  }, [usage, saveUsage]);

  const getRemainingImages = useCallback((): { intervalRemaining: number; dailyRemaining: number } => {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    
    if (usage.image.lastResetDate !== today) {
      return {
        intervalRemaining: RATE_LIMITS.image.perInterval,
        dailyRemaining: RATE_LIMITS.image.maxPerDay,
      };
    }
    
    const cutoff = now - RATE_LIMITS.image.intervalMs;
    const recentCount = usage.image.timestamps.filter(ts => ts > cutoff).length;
    
    return {
      intervalRemaining: Math.max(0, RATE_LIMITS.image.perInterval - recentCount),
      dailyRemaining: Math.max(0, RATE_LIMITS.image.maxPerDay - usage.image.dailyCount),
    };
  }, [usage]);

  return {
    checkImageRateLimit,
    recordImageSent,
    getRemainingImages,
    maxAudioDuration: RATE_LIMITS.audio.maxDuration,
  };
}

function getDefaultUsage(): MediaUsage {
  const today = new Date().toISOString().split('T')[0];
  return {
    image: {
      timestamps: [],
      dailyCount: 0,
      lastResetDate: today,
    },
  };
}
