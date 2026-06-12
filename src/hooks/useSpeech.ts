'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export function useSpeech() {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumulatedRef = useRef('');

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('请使用 Chrome 浏览器');
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) accumulatedRef.current += final;
      setTranscript(accumulatedRef.current + interim);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return;
      setError(`语音识别错误: ${event.error}`);
      setIsListening(false);
    };

    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;

    return () => {
      rec.abort();
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    accumulatedRef.current = '';
    setTranscript('');
    setError(null);
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      // already started
    }
  }, []);

  const stopListening = useCallback((): string => {
    recognitionRef.current?.stop();
    setIsListening(false);
    const final = accumulatedRef.current + transcript;
    accumulatedRef.current = '';
    setTranscript('');
    return final.trim();
  }, [transcript]);

  return { transcript, isListening, startListening, stopListening, isSupported, error };
}
