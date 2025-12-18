import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // 3MB
const MAX_AUDIO_DURATION = 30; // seconds

export type MediaState = 
  | 'idle'
  | 'recording_audio'
  | 'preview_audio'
  | 'preview_image'
  | 'uploading'
  | 'error';

interface UploadResult {
  url: string;
  path: string;
}

interface MediaPreview {
  blob: Blob;
  url: string;
  type: 'image' | 'audio';
  size: number;
  duration?: number; // for audio
}

export function useChatMedia(workspaceId: string | null, userId: string | null) {
  const { toast } = useToast();
  const [state, setState] = useState<MediaState>('idle');
  const [mediaPreview, setMediaPreview] = useState<MediaPreview | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRecording();
      if (mediaPreview?.url) {
        URL.revokeObjectURL(mediaPreview.url);
      }
    };
  }, []);

  const cleanupRecording = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const uploadFile = useCallback(async (
    file: Blob,
    type: 'image' | 'audio'
  ): Promise<UploadResult | null> => {
    if (!workspaceId || !userId) return null;

    setState('uploading');
    try {
      // Use mp4 for audio (better browser support) and webp for images
      const extension = type === 'image' ? 'webp' : 'mp4';
      const contentType = type === 'image' ? 'image/webp' : 'audio/mp4';
      const fileName = `${userId}/${workspaceId}/${Date.now()}.${extension}`;
      
      const { data, error } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file, {
          contentType,
          cacheControl: '3600',
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('chat-media')
        .getPublicUrl(data.path);

      setState('idle');
      return {
        url: urlData.publicUrl,
        path: data.path,
      };
    } catch (error: any) {
      console.error('Upload error:', error);
      setState('error');
      toast({
        title: 'Erro no upload',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  }, [workspaceId, userId, toast]);

  const startRecording = useCallback(async () => {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });
      
      streamRef.current = stream;

      // Setup audio analyser for waveform
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Determine best supported format
      let mimeType = 'audio/webm;codecs=opus';
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      audioChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setState('recording_audio');
      setRecordingTime(0);
      setAudioLevels([]);

      // Start waveform animation
      const updateLevels = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Get average level for simplified waveform
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = Math.min(1, average / 128);
        
        setAudioLevels(prev => {
          const newLevels = [...prev, normalized];
          // Keep last 50 levels for visualization
          return newLevels.slice(-50);
        });

        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();

      // Timer with auto-stop at 30s
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= MAX_AUDIO_DURATION - 1) {
            // Will trigger stopRecording via effect
            return MAX_AUDIO_DURATION;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (error: any) {
      console.error('Recording error:', error);
      setState('error');
      
      let errorMessage = 'Não foi possível acessar o microfone';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Permissão de microfone negada';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'Nenhum dispositivo de áudio detectado';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Falha ao iniciar gravação';
      }
      
      toast({
        title: 'Erro ao gravar',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Auto-stop when reaching max duration
  useEffect(() => {
    if (recordingTime >= MAX_AUDIO_DURATION && state === 'recording_audio') {
      stopRecording();
    }
  }, [recordingTime, state]);

  const stopRecording = useCallback(async (): Promise<void> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve();
        return;
      }

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      mediaRecorderRef.current.onstop = async () => {
        // Determine the MIME type used
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        // Stop all tracks
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }

        if (audioBlob.size > 0) {
          const previewUrl = URL.createObjectURL(audioBlob);
          
          setMediaPreview({
            blob: audioBlob,
            url: previewUrl,
            type: 'audio',
            size: audioBlob.size,
            duration: recordingTime,
          });
          setState('preview_audio');
        } else {
          setState('idle');
        }
        
        resolve();
      };

      mediaRecorderRef.current.stop();
    });
  }, [recordingTime]);

  const cancelRecording = useCallback(() => {
    cleanupRecording();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    audioChunksRef.current = [];
    setRecordingTime(0);
    setAudioLevels([]);
    setState('idle');
  }, [cleanupRecording]);

  const setImagePreview = useCallback(async (file: File | Blob): Promise<boolean> => {
    if (file.size > MAX_IMAGE_SIZE) {
      toast({
        title: 'Imagem muito grande',
        description: 'O tamanho máximo é 3MB. Tente uma imagem menor.',
        variant: 'destructive',
      });
      return false;
    }

    try {
      // Convert to WebP for optimization
      const webpBlob = await convertToWebP(file);
      const previewUrl = URL.createObjectURL(webpBlob);
      
      setMediaPreview({
        blob: webpBlob,
        url: previewUrl,
        type: 'image',
        size: webpBlob.size,
      });
      setState('preview_image');
      return true;
    } catch (error) {
      console.error('Error processing image:', error);
      toast({
        title: 'Erro ao processar imagem',
        description: 'Não foi possível processar a imagem',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  const handleImagePaste = useCallback(async (
    event: ClipboardEvent
  ): Promise<boolean> => {
    const items = event.clipboardData?.items;
    if (!items) return false;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        
        event.preventDefault();
        return setImagePreview(file);
      }
    }
    return false;
  }, [setImagePreview]);

  const confirmAndSend = useCallback(async (): Promise<UploadResult | null> => {
    if (!mediaPreview) return null;
    
    const result = await uploadFile(mediaPreview.blob, mediaPreview.type);
    
    if (result) {
      // Cleanup preview
      URL.revokeObjectURL(mediaPreview.url);
      setMediaPreview(null);
      setState('idle');
    }
    
    return result;
  }, [mediaPreview, uploadFile]);

  const cancelPreview = useCallback(() => {
    if (mediaPreview?.url) {
      URL.revokeObjectURL(mediaPreview.url);
    }
    setMediaPreview(null);
    setAudioLevels([]);
    setRecordingTime(0);
    setState('idle');
  }, [mediaPreview]);

  const reRecord = useCallback(() => {
    cancelPreview();
    // Small delay to ensure cleanup
    setTimeout(() => {
      startRecording();
    }, 100);
  }, [cancelPreview, startRecording]);

  return {
    state,
    mediaPreview,
    recordingTime,
    audioLevels,
    maxAudioDuration: MAX_AUDIO_DURATION,
    uploading: state === 'uploading',
    recording: state === 'recording_audio',
    // Actions
    startRecording,
    stopRecording,
    cancelRecording,
    setImagePreview,
    handleImagePaste,
    confirmAndSend,
    cancelPreview,
    reRecord,
    uploadFile,
  };
}

async function convertToWebP(file: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Limit dimensions
      const maxDim = 1920;
      let { width, height } = img;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = (height / width) * maxDim;
          width = maxDim;
        } else {
          width = (width / height) * maxDim;
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          if (blob) resolve(blob);
          else reject(new Error('Failed to convert image'));
        },
        'image/webp',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    
    img.src = URL.createObjectURL(file);
  });
}
