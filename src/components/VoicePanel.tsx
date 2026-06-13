'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface Props {
  isListening: boolean;
  isSupported: boolean;
  speechError: string | null;
  isLoading: boolean;
  statusMessage: string;
  question: string;
  startListening: () => void;
  stopListening: () => Promise<string>;
  onSpeechResult: (text: string) => void;
  stateInfo: { type: string; nodeCount: number; edgeCount: number; lastOp: string };
}

export default function VoicePanel({
  isListening,
  isSupported,
  speechError,
  isLoading,
  statusMessage,
  question,
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

  const onUp = useCallback(async () => {
    if (!isHolding.current) return;
    isHolding.current = false;
    const text = await stopListening();
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

      {/* Status message */}
      {statusMessage && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent-light border border-accent/10 text-sm text-accent animate-fade-up">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {statusMessage}
        </div>
      )}

      {/* Ask_user question */}
      {question && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 animate-fade-up">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{question}</span>
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
