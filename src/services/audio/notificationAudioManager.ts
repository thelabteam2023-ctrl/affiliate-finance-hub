
export const CHAT_SOUNDS = {
  pop: '/sounds/pop.mp3',
  ding: '/sounds/ding.mp3',
  chime: '/sounds/chime.mp3',
} as const;

export type SoundName = keyof typeof CHAT_SOUNDS;
export type AudioState = 'idle' | 'loading' | 'playing' | 'error';

interface SoundStatus {
  state: AudioState;
  currentTime: number;
  duration: number;
}

type StatusListener = (status: SoundStatus) => void;

class NotificationAudioManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private statuses: Map<string, SoundStatus> = new Map();
  private listeners: Map<string, Set<StatusListener>> = new Map();
  private isUnlocked = false;
  private unlockInProgress = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.preloadAll();
    }
  }

  private preloadAll() {
    Object.entries(CHAT_SOUNDS).forEach(([name, url]) => {
      this.getOrCreateAudio(url);
    });
  }

  private getOrCreateAudio(url: string): HTMLAudioElement {
    let audio = this.sounds.get(url);
    if (!audio) {
      audio = new Audio(url);
      audio.preload = 'auto';
      
      this.statuses.set(url, { state: 'idle', currentTime: 0, duration: 0 });
      this.listeners.set(url, new Set());

      audio.addEventListener('loadstart', () => this.updateStatus(url, { state: 'loading' }));
      audio.addEventListener('playing', () => this.updateStatus(url, { state: 'playing' }));
      audio.addEventListener('pause', () => this.updateStatus(url, { state: 'idle' }));
      audio.addEventListener('ended', () => this.updateStatus(url, { state: 'idle', currentTime: 0 }));
      audio.addEventListener('error', () => this.updateStatus(url, { state: 'error' }));
      audio.addEventListener('timeupdate', () => {
        this.updateStatus(url, { 
          currentTime: audio!.currentTime, 
          duration: audio!.duration || 0 
        });
      });
      audio.addEventListener('loadedmetadata', () => {
        this.updateStatus(url, { duration: audio!.duration });
      });

      this.sounds.set(url, audio);
      audio.load();
    }
    return audio;
  }

  private updateStatus(url: string, updates: Partial<SoundStatus>) {
    const current = this.statuses.get(url) || { state: 'idle', currentTime: 0, duration: 0 };
    const next = { ...current, ...updates };
    this.statuses.set(url, next);
    
    const listeners = this.listeners.get(url);
    if (listeners) {
      listeners.forEach(l => l(next));
    }
  }

  public subscribe(url: string, listener: StatusListener) {
    if (!this.listeners.has(url)) {
      this.getOrCreateAudio(url);
    }
    this.listeners.get(url)!.add(listener);
    // Initial call
    listener(this.statuses.get(url)!);
    
    return () => {
      this.listeners.get(url)?.delete(listener);
    };
  }

  public async unlock(): Promise<boolean> {
    if (this.isUnlocked || this.unlockInProgress) return this.isUnlocked;
    
    this.unlockInProgress = true;
    try {
      const silentAudio = new Audio();
      silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
      await silentAudio.play();
      this.isUnlocked = true;
      return true;
    } catch (error) {
      return false;
    } finally {
      this.unlockInProgress = false;
    }
  }

  public async play(soundUrl: string, volume = 0.4): Promise<void> {
    const audio = this.getOrCreateAudio(soundUrl);
    
    try {
      // If already playing, stop first to restart (preview behavior)
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }

      audio.volume = volume;
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        await playPromise;
        if (!this.isUnlocked) this.isUnlocked = true;
      }
    } catch (error: any) {
      this.updateStatus(soundUrl, { state: 'error' });
      throw error;
    }
  }

  public stop(soundUrl: string) {
    const audio = this.sounds.get(soundUrl);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  public getStatus(soundUrl: string): SoundStatus {
    return this.statuses.get(soundUrl) || { state: 'idle', currentTime: 0, duration: 0 };
  }

  public getIsUnlocked(): boolean {
    return this.isUnlocked;
  }
}

export const notificationAudioManager = new NotificationAudioManager();
