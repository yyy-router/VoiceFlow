import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachSpeechRelay } from '../../../scripts/speech-relay.mjs';
import { SpeechStreamClient } from '../speech-stream-client';

type ASREvent = { type: string; audio?: string; session?: object; event_id?: string };
const cleanup: (() => Promise<void>)[] = [];

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function nextMessage(socket: WebSocket, type: string): Promise<{ type: string; text?: string; message?: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Waiting for ${type}`));
    }, 2000);
    function onMessage(data: WebSocket.RawData) {
      const message = JSON.parse(data.toString());
      if (message.type !== type) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    }
    socket.on('message', onMessage);
  });
}

async function fixture(options: { autoFinish?: boolean; autoReady?: boolean; setupTimeoutMs?: number; finishTimeoutMs?: number } = {}) {
  const upstreamServer = createServer();
  const upstream = new WebSocketServer({ server: upstreamServer });
  const upstreamHost = await listen(upstreamServer);
  const sessions: { socket: WebSocket; events: ASREvent[] }[] = [];
  upstream.on('connection', socket => {
    const session = { socket, events: [] as ASREvent[] };
    sessions.push(session);
    socket.send(JSON.stringify({ type: 'session.created' }));
    socket.on('message', data => {
      const event = JSON.parse(data.toString()) as ASREvent;
      session.events.push(event);
      if (event.type === 'session.update' && options.autoReady !== false) {
        socket.send(JSON.stringify({ type: 'session.updated' }));
      } else if (event.type === 'input_audio_buffer.commit') {
        socket.send(JSON.stringify({ type: 'input_audio_buffer.committed' }));
      } else if (event.type === 'session.finish' && options.autoFinish !== false) {
        socket.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: `图表 ${sessions.indexOf(session) + 1}` }));
        socket.send(JSON.stringify({ type: 'session.finished' }));
      }
    });
  });
  const server = createServer((_request, response) => response.end('ok'));
  const relay = attachSpeechRelay(server, {
    createUpstream: () => new WebSocket(`ws://${upstreamHost}`),
    setupTimeoutMs: options.setupTimeoutMs ?? 1000,
    finishTimeoutMs: options.finishTimeoutMs ?? 1000,
  });
  const host = await listen(server);
  const clients: WebSocket[] = [];
  cleanup.push(async () => {
    clients.forEach(client => client.terminate());
    relay.close();
    upstream.clients.forEach(client => client.terminate());
    await Promise.all([
      new Promise<void>(resolve => server.close(() => resolve())),
      new Promise<void>(resolve => upstreamServer.close(() => resolve())),
      new Promise<void>(resolve => upstream.close(() => resolve())),
    ]);
  });
  return {
    sessions, host, url: `ws://${host}/api/speech/stream`,
    async open() {
      const client = new WebSocket(`ws://${host}/api/speech/stream`, { origin: `http://${host}` });
      clients.push(client);
      await nextMessage(client, 'ready');
      return client;
    },
  };
}

afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
  vi.unstubAllGlobals();
});

describe('browser to ASR realtime relay', () => {
  it('delivers audio to ASR before recording ends and preserves the final chunk before commit', async () => {
    const f = await fixture();
    vi.stubGlobal('WebSocket', WebSocket);
    const onError = vi.fn();
    const client = new SpeechStreamClient(f.url, onError);
    const first = new Uint8Array([1, 2, 3, 4]);
    const tail = new Uint8Array([5, 6]);
    client.append(first.buffer);
    await vi.waitFor(() => expect(f.sessions[0]?.events.some(event => event.type === 'input_audio_buffer.append')).toBe(true));
    expect(f.sessions[0].events.some(event => event.type === 'input_audio_buffer.commit')).toBe(false);
    client.append(tail.buffer);
    await expect(client.finish()).resolves.toBe('图表 1');
    expect(onError).not.toHaveBeenCalled();
    const events = f.sessions[0].events;
    expect(events.map(event => event.type)).toEqual([
      'session.update', 'input_audio_buffer.append', 'input_audio_buffer.append',
      'input_audio_buffer.commit', 'session.finish',
    ]);
    expect(events[0].session).toEqual({ input_audio_format: 'pcm', sample_rate: 16000, turn_detection: null });
    expect(Buffer.from(events[1].audio!, 'base64')).toEqual(Buffer.from(first));
    expect(Buffer.from(events[2].audio!, 'base64')).toEqual(Buffer.from(tail));
    expect(new Set(events.map(event => event.event_id)).size).toBe(events.length);
  });

  it('waits for session.finished after final transcription before returning a result', async () => {
    const f = await fixture({ autoFinish: false });
    const client = await f.open();
    client.send(Buffer.alloc(3200));
    const result = nextMessage(client, 'result');
    let returned = false;
    void result.then(() => { returned = true; });
    client.send(JSON.stringify({ type: 'finish' }));
    await vi.waitFor(() => expect(f.sessions[0].events.at(-1)?.type).toBe('session.finish'));
    const asr = f.sessions[0].socket;
    asr.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: '登录流程图' }));
    // A ping/pong establishes the preceding ASR message has been processed.
    asr.ping();
    await once(asr, 'pong');
    expect(returned).toBe(false);
    asr.send(JSON.stringify({ type: 'session.finished' }));
    await expect(result).resolves.toMatchObject({ text: '登录流程图' });
  });

  it('isolates simultaneous recordings', async () => {
    const f = await fixture();
    const first = await f.open();
    const second = await f.open();
    first.send(Buffer.from([1, 0]));
    second.send(Buffer.from([2, 0]));
    const firstResult = nextMessage(first, 'result');
    const secondResult = nextMessage(second, 'result');
    second.send(JSON.stringify({ type: 'finish' }));
    first.send(JSON.stringify({ type: 'finish' }));
    await expect(firstResult).resolves.toMatchObject({ text: '图表 1' });
    await expect(secondResult).resolves.toMatchObject({ text: '图表 2' });
    expect(f.sessions[0].events.find(event => event.audio)?.audio).toBe(Buffer.from([1, 0]).toString('base64'));
    expect(f.sessions[1].events.find(event => event.audio)?.audio).toBe(Buffer.from([2, 0]).toString('base64'));
  });

  it('closes the upstream when the browser disconnects', async () => {
    const f = await fixture();
    const client = await f.open();
    const closed = once(f.sessions[0].socket, 'close');
    client.terminate();
    await closed;
  });

  it('returns empty for a recording with no audio without committing an empty ASR buffer', async () => {
    const f = await fixture();
    const client = await f.open();
    const result = nextMessage(client, 'result');
    client.send(JSON.stringify({ type: 'finish' }));
    await expect(result).resolves.toMatchObject({ text: '' });
    expect(f.sessions[0].events.map(event => event.type)).toEqual(['session.update']);
  });

  it('reports provider errors and closes the upstream', async () => {
    const f = await fixture();
    const client = await f.open();
    const error = nextMessage(client, 'error');
    const closed = once(f.sessions[0].socket, 'close');
    f.sessions[0].socket.send(JSON.stringify({ type: 'error', error: { message: 'Invalid model' } }));
    await expect(error).resolves.toMatchObject({ message: 'Invalid model' });
    await closed;
  });

  it('rejects invalid PCM instead of forwarding corrupt audio', async () => {
    const f = await fixture();
    const client = await f.open();
    const error = nextMessage(client, 'error');
    client.send(Buffer.from([1]));
    await expect(error).resolves.toMatchObject({ message: expect.stringContaining('16 位 PCM') });
    expect(f.sessions[0].events.some(event => event.audio)).toBe(false);
  });

  it('times out if the provider never configures the session', async () => {
    const f = await fixture({ autoReady: false, setupTimeoutMs: 150 });
    const client = new WebSocket(f.url);
    const error = nextMessage(client, 'error');
    await expect(error).resolves.toMatchObject({ message: expect.stringContaining('连接超时') });
  });

  it('times out if final recognition never completes', async () => {
    const f = await fixture({ autoFinish: false, finishTimeoutMs: 150 });
    const client = await f.open();
    const error = nextMessage(client, 'error');
    client.send(Buffer.alloc(3200));
    client.send(JSON.stringify({ type: 'finish' }));
    await expect(error).resolves.toMatchObject({ message: expect.stringContaining('识别超时') });
  });

  it('rejects a browser connecting from another origin before opening an ASR session', async () => {
    const f = await fixture();
    const client = new WebSocket(f.url, { origin: 'https://another-site.example' });
    const [error] = await once(client, 'error');
    expect(error.message).toContain('403');
    expect(f.sessions).toHaveLength(0);
  });
});
