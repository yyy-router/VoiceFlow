import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeechStreamClient } from '../speech-stream-client';

class MockSocket {
  static OPEN = 1;
  static instances: MockSocket[] = [];
  readyState = 1;
  bufferedAmount = 0;
  sent: (string | ArrayBuffer)[] = [];
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  onclose?: () => void;
  close = vi.fn();
  constructor() { MockSocket.instances.push(this); }
  send(data: string | ArrayBuffer) { this.sent.push(data); }
  receive(message: object) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

beforeEach(() => {
  vi.useFakeTimers();
  MockSocket.instances = [];
  vi.stubGlobal('WebSocket', MockSocket);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('realtime audio client', () => {
  it('flushes audio recorded during connection setup before the finish command', async () => {
    const onError = vi.fn();
    const client = new SpeechStreamClient('ws://localhost/api/speech/stream', onError);
    const socket = MockSocket.instances[0];
    const first = new ArrayBuffer(3200);
    const tail = new ArrayBuffer(160);
    client.append(first);
    client.append(tail);
    const result = client.finish();
    expect(socket.sent).toEqual([]);
    socket.receive({ type: 'ready' });
    expect(socket.sent).toEqual([first, tail, JSON.stringify({ type: 'finish' })]);
    client.finish();
    client.append(new ArrayBuffer(10));
    expect(socket.sent).toHaveLength(3);
    socket.receive({ type: 'result', text: '画一个登录流程图' });
    await expect(result).resolves.toBe('画一个登录流程图');
    expect(onError).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('uploads each chunk as it arrives without waiting for stop', async () => {
    const client = new SpeechStreamClient('ws://localhost', vi.fn());
    const socket = MockSocket.instances[0];
    socket.receive({ type: 'ready' });
    const audio = new ArrayBuffer(3200);
    client.append(audio);
    expect(socket.sent).toEqual([audio]);
    client.cancel();
    await expect(client.finish()).resolves.toBe('');
  });

  it('limits buffering while the service is unavailable', async () => {
    const onError = vi.fn();
    const client = new SpeechStreamClient('ws://localhost', onError);
    client.append(new ArrayBuffer(160001));
    await expect(client.finish()).resolves.toBe('');
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('连接过慢'));
  });

  it('fails instead of silently dropping audio when the network backs up', async () => {
    const onError = vi.fn();
    const client = new SpeechStreamClient('ws://localhost', onError);
    const socket = MockSocket.instances[0];
    socket.receive({ type: 'ready' });
    socket.bufferedAmount = 160000;
    client.append(new ArrayBuffer(3200));
    await expect(client.finish()).resolves.toBe('');
    expect(onError).toHaveBeenCalledOnce();
    expect(socket.sent).toHaveLength(0);
  });

  it('times out both connection setup and final recognition', async () => {
    const onError = vi.fn();
    const first = new SpeechStreamClient('ws://localhost', onError);
    await vi.advanceTimersByTimeAsync(12000);
    await expect(first.finish()).resolves.toBe('');
    const second = new SpeechStreamClient('ws://localhost', onError);
    MockSocket.instances[1].receive({ type: 'ready' });
    const result = second.finish();
    await vi.advanceTimersByTimeAsync(25000);
    await expect(result).resolves.toBe('');
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('reports disconnect once and does not submit an incomplete command', async () => {
    const onError = vi.fn();
    const client = new SpeechStreamClient('ws://localhost', onError);
    const socket = MockSocket.instances[0];
    socket.onclose?.();
    socket.onerror?.();
    await expect(client.finish()).resolves.toBe('');
    expect(onError).toHaveBeenCalledOnce();
  });
});
