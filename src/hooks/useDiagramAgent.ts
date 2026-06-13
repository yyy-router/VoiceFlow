'use client';

import { useState, useCallback } from 'react';
interface AgentCommand {
  action: string;
  label?: string;
  payload: Record<string, unknown>;
}

export interface AgentStep {
  type: 'thinking' | 'executing' | 'done';
  message: string;
}

export function useDiagramAgent() {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const sendToAgent = useCallback(
    async (userInput: string, diagramStateJson: string, lastOperation: string): Promise<AgentCommand[]> => {
      setIsLoading(true);
      setStatusMessage('AI 正在理解指令...');

      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userInput, diagramStateJson, lastOperation }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'thinking' && event.message) {
                setStatusMessage(event.message as string);
              } else if (event.type === 'commands') {
                setStatusMessage('');
                setIsLoading(false);
                return event.commands as AgentCommand[];
              }
            } catch { /* skip parse errors */ }
          }
        }

        setStatusMessage('');
        setIsLoading(false);
        return [];
      } catch {
        setStatusMessage('');
        setIsLoading(false);
        return [{ action: 'ask_user', payload: { question: 'AI 请求失败，请重试。' } }];
      }
    },
    []
  );

  return { sendToAgent, isLoading, statusMessage };
}
