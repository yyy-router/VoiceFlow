import type { PointerEvent, ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import VoicePanel from '../VoicePanel';

// A shallow hook harness exercises the component's actual pointer handlers;
// no microphone, DOM, or icon rendering is involved in pointer ownership.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T>(initial: T) => [initial, vi.fn()],
  useRef: <T>(initial: T) => ({ current: initial }),
  useCallback: <T>(callback: T) => callback,
  useEffect: () => {},
}));

type MicButtonProps = {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => Promise<void>;
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => Promise<void>;
  onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => Promise<void>;
};

function panel(options: { isLoading?: boolean; isTranscribing?: boolean } = {}) {
  const start = vi.fn();
  const stop = vi.fn().mockResolvedValue('登录流程图');
  const result = vi.fn();
  const tree = VoicePanel({
    isListening: false, isPreparing: false, isTranscribing: false, isSupported: true,
    speechError: null, isLoading: false, statusMessage: '', reasoningText: '', question: '',
    startListening: start, stopListening: stop, onSpeechResult: result,
    stateInfo: { type: 'flowchart', nodeCount: 0, edgeCount: 0, lastOp: '' },
    ...options,
  }) as ReactElement<{ children: ReactNode[] }>;
  const button = tree.props.children[0] as ReactElement<MicButtonProps>;
  const capture = vi.fn();
  const event = (pointerId: number, mouseButton = 0) => ({
    pointerId, button: mouseButton, currentTarget: { setPointerCapture: capture },
  }) as unknown as PointerEvent<HTMLButtonElement>;
  return { handlers: button.props, start, stop, result, capture, event };
}

describe('recording pointer ownership', () => {
  it('ignores a second pointer down, up, cancellation, and lost capture while the first is held', async () => {
    const p = panel();
    p.handlers.onPointerDown(p.event(1));
    p.handlers.onPointerDown(p.event(2));
    await p.handlers.onPointerUp(p.event(2));
    await p.handlers.onPointerCancel(p.event(2));
    await p.handlers.onLostPointerCapture(p.event(2));
    expect(p.start).toHaveBeenCalledOnce();
    expect(p.capture).toHaveBeenCalledExactlyOnceWith(1);
    expect(p.stop).not.toHaveBeenCalled();
    await p.handlers.onPointerUp(p.event(1));
    expect(p.stop).toHaveBeenCalledOnce();
    expect(p.result).toHaveBeenCalledExactlyOnceWith('登录流程图');
  });

  it.each(['onPointerUp', 'onPointerCancel', 'onLostPointerCapture'] as const)(
    'ends the owning pointer once through %s and ignores repeated terminal events', async handler => {
      const p = panel();
      p.handlers.onPointerDown(p.event(0));
      await p.handlers[handler](p.event(0));
      await p.handlers.onPointerUp(p.event(0));
      await p.handlers.onPointerCancel(p.event(0));
      await p.handlers.onLostPointerCapture(p.event(0));
      expect(p.stop).toHaveBeenCalledOnce();
      expect(p.result).toHaveBeenCalledOnce();
    },
  );

  it('allows a new pointer to start after the previous recording ends', async () => {
    const p = panel();
    p.handlers.onPointerDown(p.event(1));
    await p.handlers.onPointerUp(p.event(1));
    p.handlers.onPointerDown(p.event(2));
    await p.handlers.onLostPointerCapture(p.event(1));
    expect(p.start).toHaveBeenCalledTimes(2);
    expect(p.stop).toHaveBeenCalledOnce();
    await p.handlers.onPointerUp(p.event(2));
    expect(p.stop).toHaveBeenCalledTimes(2);
  });

  it('ignores non-primary mouse buttons without taking pointer capture', async () => {
    const p = panel();
    p.handlers.onPointerDown(p.event(1, 2));
    await p.handlers.onPointerUp(p.event(1, 2));
    expect(p.capture).not.toHaveBeenCalled();
    expect(p.start).not.toHaveBeenCalled();
    expect(p.stop).not.toHaveBeenCalled();
  });

  it.each([{ isLoading: true }, { isTranscribing: true }])('does not start while the button is disabled: %j', options => {
    const p = panel(options);
    p.handlers.onPointerDown(p.event(1));
    expect(p.capture).not.toHaveBeenCalled();
    expect(p.start).not.toHaveBeenCalled();
  });
});
