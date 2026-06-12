'use client';

import { useRef, useState, useCallback } from 'react';
import { DiagramState } from '@/core/diagram-state';
import { DiagramCommand, DiagramStateData } from '@/core/types';
import { stateToMermaid } from '@/core/mermaid-generator';

const EMPTY_STATE: DiagramStateData = { type: 'flowchart', direction: 'TD', nodes: [], edges: [] };

export function useDiagramState() {
  const stateRef = useRef(new DiagramState());
  const [state, setState] = useState<DiagramStateData>(EMPTY_STATE);
  const [mermaidCode, setMermaidCode] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [lastOperation, setLastOperation] = useState('无');

  const refresh = useCallback(() => {
    const ds = stateRef.current;
    setState(ds.getState());
    setMermaidCode(stateToMermaid(ds.getState()));
    setCanUndo(ds.canUndo);
    setCanRedo(ds.canRedo);
    setLastOperation(ds.getLastOperationText());
  }, []);

  const applyCommand = useCallback(
    (cmd: DiagramCommand) => {
      stateRef.current.applyCommand(cmd);
      refresh();
    },
    [refresh]
  );

  const undo = useCallback(() => applyCommand({ action: 'undo', payload: {} }), [applyCommand]);
  const redo = useCallback(() => applyCommand({ action: 'redo', payload: {} }), [applyCommand]);
  const getContextJson = useCallback(() => stateRef.current.getContextJson(), []);

  return { state, mermaidCode, canUndo, canRedo, lastOperation, applyCommand, undo, redo, getContextJson };
}
