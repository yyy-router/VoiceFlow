'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { DiagramSchema } from '@/core/schema';
import { BoardStore } from '@/core/board-store';

export function useDiagramState() {
  const storeRef = useRef(new BoardStore());
  const [schema, setSchema] = useState<DiagramSchema>(storeRef.current.activeSchema);
  const [mermaidCode, setMermaidCode] = useState(storeRef.current.activeMermaidCode);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [lastOperation, setLastOperation] = useState('无');
  const [boards, setBoards] = useState(() => storeRef.current.list());
  const [activeIndex, setActiveIndex] = useState(0);

  // Load from localStorage on client mount only (avoids SSR hydration mismatch)
  useEffect(() => {
    if (storeRef.current.load()) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => {
    const s = storeRef.current;
    setSchema(s.activeSchema);
    setMermaidCode(s.activeMermaidCode);
    setCanUndo(s.activeCanUndo);
    setCanRedo(s.activeCanRedo);
    setLastOperation(s.activeLastOperation);
    setBoards(s.list());
    setActiveIndex(s.activeId);
  }, []);

  const setSchemaFromRaw = useCallback((raw: unknown) => {
    const result = storeRef.current.setSchema(raw);
    if (result.schema) refresh();
    return result;
  }, [refresh]);

  const undo = useCallback(() => {
    if (storeRef.current.undo()) refresh();
  }, [refresh]);

  const redo = useCallback(() => {
    if (storeRef.current.redo()) refresh();
  }, [refresh]);

  const clear = useCallback(() => {
    if (storeRef.current.clear()) refresh();
  }, [refresh]);

  const addBoard = useCallback(() => {
    if (storeRef.current.addBoard()) refresh();
  }, [refresh]);

  const removeBoard = useCallback((index: number) => {
    if (storeRef.current.removeBoard(index)) refresh();
  }, [refresh]);

  const renameBoard = useCallback((index: number, name: string) => {
    storeRef.current.renameBoard(index, name);
    refresh();
  }, [refresh]);

  const switchBoard = useCallback((index: number) => {
    storeRef.current.switchTo(index);
    refresh();
  }, [refresh]);

  const getContextJson = useCallback(() => storeRef.current.active.getContextJson(), []);
  const getSummary = useCallback(() => storeRef.current.active.getSummary(), []);
  const getContextForLLM = useCallback((input: string) => storeRef.current.getContextForLLM(input), []);

  return {
    schema,
    mermaidCode,
    canUndo,
    canRedo,
    lastOperation,
    boards,
    activeIndex,
    setSchemaFromRaw,
    undo,
    redo,
    clear,
    addBoard,
    removeBoard,
    renameBoard,
    switchBoard,
    getContextJson,
    getSummary,
    getContextForLLM,
  };
}
