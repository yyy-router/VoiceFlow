'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export function useSpeech() {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const chunksRef = useRef<Float32Array[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setIsSupported(false);
      setError('当前浏览器不支持麦克风访问，请使用 Chrome 浏览器');
    }
  }, []);

  const startListening = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) return;

    chunksRef.current = [];
    setError(null);

    navigator.mediaDevices
      .getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true } })
      .then((stream) => {
        streamRef.current = stream;
        const ctx = new AudioContext({ sampleRate: 16000 });
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };

        source.connect(processor);
        processor.connect(ctx.destination);
        setIsListening(true);
      })
      .catch((err) => {
        setError(`麦克风访问被拒绝: ${err.message}`);
      });
  }, []);

  const stopListening = useCallback(async (): Promise<string> => {
    processorRef.current?.disconnect();
    ctxRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setIsListening(false);

    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (chunks.length === 0) return '';

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const flat = new Float32Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      flat.set(c, offset);
      offset += c.length;
    }

    // Float32 (-1..1) → Int16 PCM: round(sample * 32767)
    const int16 = new Int16Array(flat.length);
    let maxAbs = 0;
    for (let i = 0; i < flat.length; i++) {
      const clipped = Math.max(-1, Math.min(1, flat[i]));
      maxAbs = Math.max(maxAbs, Math.abs(clipped));
      int16[i] = Math.round(clipped * 32767);
    }

    // Boost quiet audio to avoid ASR rejection
    if (maxAbs > 0 && maxAbs < 0.1) {
      const gain = 0.1 / maxAbs;
      for (let i = 0; i < int16.length; i++) {
        int16[i] = Math.round(Math.max(-32767, Math.min(32767, int16[i] * gain)));
      }
    }

    // Int16Array → base64 via FileReader (safe for all byte values)
    const blob = new Blob([int16.buffer], { type: 'application/octet-stream' });
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = () => reject(new Error('base64 编码失败'));
      reader.readAsDataURL(blob);
    });

    try {
      const res = await fetch('/api/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64 }),
      });
      const data = await res.json();
      return data.text || '';
    } catch {
      setError('语音识别服务暂不可用');
      return '';
    }
  }, []);

  return { isListening, startListening, stopListening, isSupported, error };
}
