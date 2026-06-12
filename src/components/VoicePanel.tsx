'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface Props {
  isListening: boolean;
  transcript: string;
  isSupported: boolean;
  speechError: string | null;
  isLoading: boolean;
  startListening: () => void;
  stopListening: () => string;
  onSpeechResult: (text: string) => void;
  stateInfo: { type: string; nodeCount: number; edgeCount: number; lastOp: string };
}

export default function VoicePanel({
  isListening,
  transcript,
  isSupported,
  speechError,
  isLoading,
  startListening,
  stopListening,
  onSpeechResult,
  stateInfo,
}: Props) {
  const [log, setLog] = useState<string[]>([]);
  const isHolding = useRef(false);

  const addLog = useCallback((msg: string) => setLog((p) => [msg, ...p].slice(0, 50)), []);

  const onDown = useCallback(() => {
    isHolding.current = true;
    startListening();
    addLog('开始录音...');
  }, [startListening, addLog]);

  const onUp = useCallback(() => {
    if (!isHolding.current) return;
    isHolding.current = false;
    const text = stopListening();
    if (text) {
      addLog(text);
      onSpeechResult(text);
    } else {
      addLog('未识别到语音');
    }
  }, [stopListening, onSpeechResult, addLog]);

  if (!isSupported) {
    return (
      <div className="p-3 rounded-xl bg-danger-light border border-danger/20 text-sm text-danger flex items-center gap-2">
        <MicOff className="w-4 h-4 flex-shrink-0" />
        {speechError}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Mic button */}
      <button
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        disabled={isLoading}
        className={`w-full py-5 rounded-2xl text-base font-medium transition-all select-none flex items-center justify-center gap-2.5 ${
          isListening
            ? 'bg-danger text-white mic-active-ring shadow-lg shadow-danger/25'
            : 'bg-accent text-white hover:bg-accent-hover shadow-sm shadow-accent/20'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isListening ? (
          <>
            <Mic className="w-5 h-5" />
            松开结束
          </>
        ) : isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            AI 处理中...
          </>
        ) : (
          <>
            <Mic className="w-5 h-5" />
            按住说话
          </>
        )}
      </button>

      {/* Live transcript */}
      {isListening && transcript && (
        <div className="p-3 rounded-xl bg-accent-light border border-accent/10 text-sm text-text-primary min-h-[2.5rem] animate-fade-up">
          {transcript}
        </div>
      )}

      {/* Error */}
      {speechError && (
        <p className="text-danger text-xs px-1">{speechError}</p>
      )}

      {/* State info cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-bg-muted border border-border-light">
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">类型</p>
          <p className="text-sm font-medium text-text-primary">{stateInfo.type || '—'}</p>
        </div>
        <div className="p-3 rounded-xl bg-bg-muted border border-border-light">
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">节点 / 边</p>
          <p className="text-sm font-medium text-text-primary">{stateInfo.nodeCount} / {stateInfo.edgeCount}</p>
        </div>
        <div className="p-3 rounded-xl bg-bg-muted border border-border-light col-span-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">最近操作</p>
          <p className="text-sm font-medium text-text-primary truncate">{stateInfo.lastOp}</p>
        </div>
      </div>

      {/* Operation log */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2 px-1">操作日志</p>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {log.length === 0 && <p className="text-text-muted text-xs italic">等待操作...</p>}
          {log.map((e, i) => (
            <p key={i} className="text-xs text-text-secondary py-0.5 px-1">
              {e}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
