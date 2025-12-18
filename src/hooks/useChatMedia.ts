import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // 3MB
const MAX_AUDIO_DURATION = 30; // seconds

interface UploadResult {
  url: string;
  path: string;
}

export function useChatMedia(workspaceId: string | null, userId: string | null) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const uploadFile = useCallback(async (
    file: Blob,
    type: 'image' | 'audio'
  ): Promise<UploadResult | null> => {
    if (!workspaceId || !userId) return null;

    setUploading(true);
    try {
      const extension = type === 'image' ? 'webp' : 'webm';
      const fileName = `${userId}/${workspaceId}/${Date.now()}.${extension}`;
      
      const { data, error } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file, {
          contentType: type === 'image' ? 'image/webp' : 'audio/webm',
          cacheControl: '3600',
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('chat-media')
        .getPublicUrl(data.path);

      return {
        url: urlData.publicUrl,
        path: data.path,
      };
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Erro no upload',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setUploading(false);
    }
  }, [workspaceId, userId, toast]);

  const handleImagePaste = useCallback(async (
    event: ClipboardEvent
  ): Promise<UploadResult | null> => {
    const items = event.clipboardData?.items;
    if (!items) return null;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;

        if (file.size > MAX_IMAGE_SIZE) {
          toast({
            title: 'Imagem muito grande',
            description: 'O tamanho máximo é 3MB',
            variant: 'destructive',
          });
          return null;
        }

        // Convert to WebP for optimization
        const webpBlob = await convertToWebP(file);
        return uploadFile(webpBlob, 'image');
      }
    }
    return null;
  }, [uploadFile, toast]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      
      audioChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setRecording(true);
      setRecordingTime(0);

      // Timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= MAX_AUDIO_DURATION - 1) {
            stopRecording();
            return MAX_AUDIO_DURATION;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (error: any) {
      console.error('Recording error:', error);
      toast({
        title: 'Erro ao gravar',
        description: 'Não foi possível acessar o microfone',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const stopRecording = useCallback(async (): Promise<UploadResult | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Stop all tracks
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
        
        setRecording(false);
        setRecordingTime(0);

        if (audioBlob.size > 0) {
          const result = await uploadFile(audioBlob, 'audio');
          resolve(result);
        } else {
          resolve(null);
        }
      };

      mediaRecorderRef.current.stop();
    });
  }, [uploadFile]);

  const cancelRecording = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current.stop();
    }

    audioChunksRef.current = [];
    setRecording(false);
    setRecordingTime(0);
  }, []);

  return {
    uploading,
    recording,
    recordingTime,
    maxAudioDuration: MAX_AUDIO_DURATION,
    handleImagePaste,
    startRecording,
    stopRecording,
    cancelRecording,
    uploadFile,
  };
}

async function convertToWebP(file: File): Promise<Blob> {
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
          if (blob) resolve(blob);
          else reject(new Error('Failed to convert image'));
        },
        'image/webp',
        0.85
      );
    };

    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
