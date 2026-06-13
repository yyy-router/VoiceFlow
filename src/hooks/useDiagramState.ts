'use client';

import { useRef, useState, useCallback } from 'react';
import { DiagramState } from '@/core/diagram-state';
import { DiagramSchema } from '@/core/schema';

export function useDiagramState() {
  const stateRef = useRef(new DiagramState());
  const [schema, setSchema] = useState<DiagramSchema>(stateRef.current.getSchema());
  const [mermaidCode, setMermaidCode] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [lastOperation, setLastOperation] = useState('无');

  const refresh = useCallback(() => {
    const ds = stateRef.current;
    setSchema(ds.getSchema());
    setMermaidCode(ds.compile());
    setCanUndo(ds.canUndo);
    setCanRedo(ds.canRedo);
    setLastOperation(ds.getLastOperationText());
  }, []);

  const setSchemaFromRaw = useCallback((raw: unknown) => {
    const result = stateRef.current.setSchema(raw);
    if (result.schema) refresh();
    return result;
  }, [refresh]);

  const undo = useCallback(() => {
    if (stateRef.current.undo()) refresh();
  }, [refresh]);

  const redo = useCallback(() => {
    if (stateRef.current.redo()) refresh();
  }, [refresh]);

  const getContextJson = useCallback(() => stateRef.current.getContextJson(), []);
  const getSummary = useCallback(() => stateRef.current.getSummary(), []);

  return {
    schema,
    mermaidCode,
    canUndo,
    canRedo,
    lastOperation,
    setSchemaFromRaw,
    undo,
    redo,
    getContextJson,
    getSummary,
  };
}
