'use client';

import { useState, useCallback } from 'react';
import { DiagramCommand } from '@/core/types';

export function useDiagramAgent() {
  const [isLoading, setIsLoading] = useState(false);

  const sendToAgent = useCallback(
    async (userInput: string, diagramStateJson: string, lastOperation: string): Promise<DiagramCommand[]> => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userInput, diagramStateJson, lastOperation }),
        });
        const data = await res.json();
        return data.commands || [];
      } catch {
        return [{ action: 'ask_user', payload: { question: '网络请求失败，请检查连接后重试。' } }];
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { sendToAgent, isLoading };
}
