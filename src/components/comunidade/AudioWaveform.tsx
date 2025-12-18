import { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  levels: number[];
  isRecording?: boolean;
  isPlaying?: boolean;
  progress?: number; // 0-1 for playback progress
  className?: string;
  barColor?: string;
  activeColor?: string;
}

export function AudioWaveform({
  levels,
  isRecording = false,
  isPlaying = false,
  progress = 0,
  className = '',
  barColor = 'hsl(var(--muted-foreground))',
  activeColor = 'hsl(var(--primary))',
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const barWidth = 3;
    const barGap = 2;
    const maxBars = Math.floor(width / (barWidth + barGap));
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // If no levels, draw placeholder bars
    const displayLevels = levels.length > 0 
      ? levels.slice(-maxBars) 
      : Array(maxBars).fill(0.1);

    // Center the bars
    const totalBarsWidth = displayLevels.length * (barWidth + barGap) - barGap;
    const startX = (width - totalBarsWidth) / 2;

    displayLevels.forEach((level, i) => {
      const x = startX + i * (barWidth + barGap);
      
      // Calculate bar height with minimum
      const minHeight = 4;
      const maxHeight = height * 0.9;
      const barHeight = Math.max(minHeight, level * maxHeight);
      
      // Center vertically
      const y = (height - barHeight) / 2;

      // Determine color based on playback progress
      let color = barColor;
      if (isPlaying && progress > 0) {
        const barProgress = i / displayLevels.length;
        color = barProgress < progress ? activeColor : barColor;
      } else if (isRecording) {
        color = activeColor;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      ctx.fill();
    });

  }, [levels, isRecording, isPlaying, progress, barColor, activeColor]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-8 ${className}`}
      style={{ display: 'block' }}
    />
  );
}

// Static waveform from audio blob
export function useAudioWaveform(audioUrl: string | null) {
  const levelsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!audioUrl) {
      levelsRef.current = [];
      return;
    }

    const analyzeAudio = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const channelData = audioBuffer.getChannelData(0);
        const samples = 50; // Number of bars
        const blockSize = Math.floor(channelData.length / samples);
        const levels: number[] = [];
        
        for (let i = 0; i < samples; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[i * blockSize + j]);
          }
          const average = sum / blockSize;
          // Normalize to 0-1 range
          levels.push(Math.min(1, average * 4));
        }
        
        levelsRef.current = levels;
        audioContext.close();
      } catch (error) {
        console.error('Error analyzing audio:', error);
        // Fallback to random-ish levels
        levelsRef.current = Array(50).fill(0).map(() => Math.random() * 0.5 + 0.2);
      }
    };

    analyzeAudio();
  }, [audioUrl]);

  return levelsRef.current;
}
