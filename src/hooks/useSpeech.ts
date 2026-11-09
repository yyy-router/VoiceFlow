'use client';

import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { SpeechRecorder, type SpeechStatus } from '@/lib/speech-recorder';

const subscribe = () => () => {};
const serverSupported = () => true;
function browserSupported() {
  return !!navigator.mediaDevices?.getUserMedia && !!window.AudioContext && !!window.AudioWorkletNode;
}

export function useSpeech() {
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const isSupported = useSyncExternalStore(subscribe, browserSupported, serverSupported);
  const recorderRef = useRef<SpeechRecorder | null>(null);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      recorder?.cancel();
    };
  }, []);

  const startListening = useCallback(() => {
    if (recorderRef.current || !browserSupported()) return;
    setError(null);

    const url = new URL('/api/speech/stream', window.location.href);
    url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const recorder = new SpeechRecorder(url.toString(), next => {
      if (recorderRef.current !== recorder) return;
      setStatus(next);
      if (next === 'idle') recorderRef.current = null;
    }, message => {
      if (recorderRef.current === recorder) setError(message);
    });
    recorderRef.current = recorder;
    recorder.start();
  }, []);

  const stopListening = useCallback((): Promise<string> => recorderRef.current?.stop() ?? Promise.resolve(''), []);

  return {
    isListening: status === 'recording',
    isPreparing: status === 'preparing',
    isTranscribing: status === 'transcribing',
    startListening, stopListening, isSupported,
    error: isSupported ? error : '当前浏览器不支持实时录音，请使用 HTTPS 或 localhost 下的现代浏览器',
  };
}
