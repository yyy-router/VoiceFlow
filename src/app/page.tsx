'use client';

import { useCallback } from 'react';
import { Undo2, Redo2, Sparkles } from 'lucide-react';
import { useSpeech } from '@/hooks/useSpeech';
import { useDiagramAgent } from '@/hooks/useDiagramAgent';
import { useDiagramState } from '@/hooks/useDiagramState';
import VoicePanel from '@/components/VoicePanel';
import DiagramCanvas from '@/components/DiagramCanvas';
import ExportButton from '@/components/ExportButton';

export default function Home() {
  const { state, mermaidCode, canUndo, canRedo, lastOperation, applyCommand, undo, redo, getContextJson } =
    useDiagramState();
  const { sendToAgent, isLoading } = useDiagramAgent();
  const speech = useSpeech();

  const handleSpeech = useCallback(
    async (text: string) => {
      const commands = await sendToAgent(text, getContextJson(), lastOperation);
      for (const cmd of commands) {
        if (cmd.action === 'ask_user') {
          if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(cmd.payload.question as string);
            u.lang = 'zh-CN';
            u.rate = 1.1;
            speechSynthesis.speak(u);
          }
        } else {
          applyCommand(cmd);
        }
      }
    },
    [sendToAgent, getContextJson, lastOperation, applyCommand]
  );

  return (
    <main className="flex h-screen flex-col bg-bg-primary">
      {/* Header */}
      <header className="border-b border-border bg-bg-surface/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-semibold font-display tracking-tight text-text-primary">
            VoiceFlow Agent
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-2 rounded-lg hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-text-secondary hover:text-text-primary"
            title="撤销"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2 rounded-lg hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-text-secondary hover:text-text-primary"
            title="恢复"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <ExportButton />
        </div>
      </header>

      {/* Content: Canvas left, Panel right */}
      <div className="flex flex-1 overflow-hidden">
        <section className="flex-1 p-6 overflow-auto bg-bg-muted/50">
          <DiagramCanvas code={mermaidCode} />
        </section>
        <aside className="w-80 border-l border-border bg-bg-surface p-4 flex-shrink-0 shadow-[-4px_0_24px_rgba(0,0,0,0.03)]">
          <VoicePanel
            isListening={speech.isListening}
            isSupported={speech.isSupported}
            speechError={speech.error}
            isLoading={isLoading}
            startListening={speech.startListening}
            stopListening={speech.stopListening}
            onSpeechResult={handleSpeech}
            stateInfo={{
              type: state.type || '未创建',
              nodeCount: state.nodes.length,
              edgeCount: state.edges.length,
              lastOp: lastOperation,
            }}
          />
        </aside>
      </div>
    </main>
  );
}
