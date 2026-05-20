
export const CHAT_SOUNDS = {
  pop: '/sounds/pop.mp3',
  ding: '/sounds/ding.mp3',
  chime: '/sounds/chime.mp3',
} as const;

export type SoundName = keyof typeof CHAT_SOUNDS;

class NotificationAudioManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private isUnlocked = false;
  private unlockInProgress = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.preloadAll();
    }
  }

  private preloadAll() {
    Object.entries(CHAT_SOUNDS).forEach(([name, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.load();
      this.sounds.set(url, audio);
    });
  }

  public async unlock(): Promise<boolean> {
    if (this.isUnlocked || this.unlockInProgress) return this.isUnlocked;
    
    this.unlockInProgress = true;
    console.log('[AudioService] Attempting to unlock audio context...');

    try {
      // Create a small silent buffer to play
      const silentAudio = new Audio();
      silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
      
      await silentAudio.play();
      this.isUnlocked = true;
      console.log('[AudioService] Audio context unlocked successfully');
      return true;
    } catch (error) {
      console.warn('[AudioService] Audio unlock failed. Still requires user interaction.', error);
      return false;
    } finally {
      this.unlockInProgress = false;
    }
  }

  public async play(soundUrl: string, volume = 0.4): Promise<void> {
    try {
      let audio = this.sounds.get(soundUrl);
      
      if (!audio) {
        console.log(`[AudioService] Sound not preloaded, creating new instance: ${soundUrl}`);
        audio = new Audio(soundUrl);
        audio.preload = 'auto';
        this.sounds.set(soundUrl, audio);
      }

      // Reset and play
      audio.currentTime = 0;
      audio.volume = volume;
      
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        await playPromise;
        if (!this.isUnlocked) {
          this.isUnlocked = true;
          console.log('[AudioService] Audio unlocked via manual play');
        }
      }
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        console.warn('[AudioService] Playback blocked by browser policy. Interaction required.', soundUrl);
      } else {
        console.error('[AudioService] Playback failed:', error, soundUrl);
      }
      throw error;
    }
  }

  public getIsUnlocked(): boolean {
    return this.isUnlocked;
  }
}

export const notificationAudioManager = new NotificationAudioManager();
