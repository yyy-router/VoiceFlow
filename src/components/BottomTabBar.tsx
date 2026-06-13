'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface BoardInfo {
  name: string;
  type: string;
  nodeCount: number;
}

interface Props {
  boards: BoardInfo[];
  activeIndex: number;
  onSwitch: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onRename: (index: number, name: string) => void;
}

function typeIcon(type: string): string {
  switch (type) {
    case 'er': return 'ER';
    case 'architecture': return 'AR';
    default: return 'FL';
  }
}

export default function BottomTabBar({
  boards,
  activeIndex,
  onSwitch,
  onAdd,
  onRemove,
  onRename,
}: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIndex !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingIndex]);

  const startRename = useCallback((index: number) => {
    setEditingIndex(index);
    setEditName(boards[index].name);
  }, [boards]);

  const commitRename = useCallback(() => {
    if (editingIndex !== null && editName.trim()) {
      onRename(editingIndex, editName.trim());
    }
    setEditingIndex(null);
  }, [editingIndex, editName, onRename]);

  return (
    <div className="flex items-center h-10 bg-bg-surface border-t border-border px-2 gap-0.5 select-none overflow-x-auto shrink-0">
      {boards.map((b, i) => (
        <div
          key={i}
          onClick={() => onSwitch(i)}
          onDoubleClick={() => startRename(i)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-t-md cursor-pointer transition-colors text-xs whitespace-nowrap group ${
            i === activeIndex
              ? 'bg-bg-primary text-text-primary border-t border-x border-border -mt-[1px]'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
          }`}
        >
          {editingIndex === i ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditingIndex(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-20 bg-transparent outline-none text-text-primary text-xs"
            />
          ) : (
            <>
              <span className="text-[9px] font-semibold tracking-tight opacity-50">
                {b.nodeCount > 0 ? typeIcon(b.type) : '—'}
              </span>
              <span className="max-w-24 truncate">{b.name}</span>
              {boards.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(i);
                  }}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 p-0.5 rounded hover:bg-bg-hover transition-all"
                  title="删除画板"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>
      ))}
      {boards.length < 10 && (
        <button
          onClick={onAdd}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-text-muted hover:text-accent hover:bg-bg-hover transition-colors text-xs"
          title="新建画板"
        >
          <Plus className="w-3.5 h-3.5" />
          新建
        </button>
      )}
    </div>
  );
}
