'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface Props {
  isListening: boolean;
  isSupported: boolean;
  speechError: string | null;
  isLoading: boolean;
  statusMessage: string;
  reasoningText: string;
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
  reasoningText,
  question,
  startListening,
  stopListening,
  onSpeechResult,
  stateInfo,
}: Props) {
  const [log, setLog] = useState<string[]>([]);
  const isHolding = useRef(false);
  const reasoningEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => setLog((p) => [msg, ...p].slice(0, 50)), []);

  // Auto-scroll reasoning to bottom as text streams in
  useEffect(() => {
    if (reasoningText && reasoningEndRef.current) {
      reasoningEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [reasoningText]);

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
    <div className="flex flex-col gap-5 h-full">
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

      {/* Processing block: status + reasoning */}
      {isLoading && (
        <div className="animate-fade-up space-y-3">
          {/* Status */}
          {statusMessage && (
            <div className="flex items-center gap-2.5 px-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
              </span>
              <span className="text-sm text-text-secondary font-medium">{statusMessage}</span>
            </div>
          )}

          {/* Reasoning — editorial marginalia style */}
          {reasoningText && (
            <div className="relative rounded-xl bg-bg-muted/70 border border-border-light overflow-hidden max-h-48 overflow-y-auto">
              {/* Left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent/30" />
              <div className="px-4 py-3">
                <p className="text-[11px] font-medium text-text-muted tracking-wide mb-2">
                  思考过程
                </p>
                <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {reasoningText}
                  <span className="inline-block w-px h-[14px] bg-accent/50 ml-0.5 align-[-2px] animate-pulse" />
                </p>
                <div ref={reasoningEndRef} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ask_user question */}
      {question && (
        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-amber-50/80 border border-amber-200/70 text-sm text-amber-800 animate-fade-up">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
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
