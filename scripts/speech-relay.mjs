import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { createSpeechAdmission } from './speech-admission.mjs';

export const SPEECH_PATH = '/api/speech/stream';

function connectToASR() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('服务端未配置 DASHSCOPE_API_KEY');
  const model = encodeURIComponent(process.env.ASR_MODEL || 'qwen-asr-realtime');
  return new WebSocket(`wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${model}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    handshakeTimeout: 8000,
  });
}

/** One upstream connection per recording; no credentials or audio history reach other clients. */
export function attachSpeechRelay(server, {
  admission = createSpeechAdmission(),
  createUpstream = connectToASR,
  setupTimeoutMs = 10000,
  finishTimeoutMs = 20000,
  idleTimeoutMs = 15000,
  maxDurationMs = 120000,
} = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
  const onUpgrade = (request, socket, head) => {
    if (request.url?.split('?')[0] !== SPEECH_PATH) return;
    const reservation = admission.acquire(request);
    if (!reservation.allowed) {
      const status = { 401: 'Unauthorized', 403: 'Forbidden', 429: 'Too Many Requests', 503: 'Service Unavailable' }[reservation.status];
      const headers = Object.entries(reservation.headers).map(([key, value]) => `${key}: ${value}\r\n`).join('');
      socket.end(`HTTP/1.1 ${reservation.status} ${status}\r\nConnection: close\r\n${headers}\r\n`);
      return;
    }
    // Invalid WebSocket handshakes never emit connection, but must still return their reservation.
    socket.once('close', reservation.release);
    try {
      wss.handleUpgrade(request, socket, head, client => {
        socket.off('close', reservation.release);
        wss.emit('connection', client, reservation.release);
      });
    } catch {
      reservation.release();
      socket.destroy();
    }
  };
  server.on('upgrade', onUpgrade);

  wss.on('connection', (client, release) => {
    let upstream;
    let phase = 'connecting';
    let configured = false;
    let finishSent = false;
    let audioBytes = 0;
    let finalText = '';
    let idleTimer;
    let finishTimer;
    const setupTimer = setTimeout(() => fail('语音服务连接超时，请重试'), setupTimeoutMs);
    const durationTimer = setTimeout(() => fail('单次录音最长 120 秒，请松开后重试'), maxDurationMs);

    function closeUpstream() {
      if (upstream?.readyState === WebSocket.CONNECTING) upstream.terminate();
      else if (upstream?.readyState === WebSocket.OPEN) upstream.close();
    }

    function cleanup() {
      if (phase === 'closed') return;
      phase = 'closed';
      clearTimeout(setupTimer);
      clearTimeout(durationTimer);
      clearTimeout(idleTimer);
      clearTimeout(finishTimer);
      // Keep the slot until the provider socket has actually closed, not just the browser.
      if (!upstream || upstream.readyState === WebSocket.CLOSED) release();
      else {
        upstream.once('close', release);
        closeUpstream();
      }
    }

    function sendClient(event) {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event));
    }

    function fail(message) {
      if (phase === 'closed') return;
      sendClient({ type: 'error', message });
      cleanup();
      client.close(1011, 'Speech session failed');
    }

    function complete() {
      sendClient({ type: 'result', text: finalText });
      cleanup();
      client.close(1000);
    }

    function sendASR(type, data = {}) {
      if (upstream?.readyState !== WebSocket.OPEN) {
        fail('语音服务连接已断开，请重试');
        return;
      }
      if (upstream.bufferedAmount > 128 * 1024) {
        fail('语音服务网络拥塞，请重试');
        return;
      }
      upstream.send(JSON.stringify({ event_id: randomUUID(), type, ...data }));
    }

    function touch() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => fail('录音连接空闲超时，请重试'), idleTimeoutMs);
    }

    client.on('close', cleanup);
    client.on('error', cleanup);
    client.on('message', (data, isBinary) => {
      if (phase === 'closed') return;
      touch();
      if (isBinary) {
        if (phase !== 'ready') { fail('音频发送顺序错误，请重试'); return; }
        if (data.length === 0 || data.length % 2 !== 0) {
          fail('音频必须为 16 位 PCM');
          return;
        }
        audioBytes += data.length;
        if (audioBytes > 16000 * 2 * 120) {
          fail('录音数据超过单次上限，请重试');
          return;
        }
        sendASR('input_audio_buffer.append', { audio: data.toString('base64') });
        return;
      }
      let message;
      try { message = JSON.parse(data.toString()); }
      catch { fail('无效的语音控制消息'); return; }
      if (message?.type === 'cancel') {
        cleanup();
        client.close(1000);
      } else if (message?.type === 'finish' && phase === 'ready') {
        if (audioBytes === 0) { complete(); return; }
        phase = 'finishing';
        clearTimeout(idleTimer);
        clearTimeout(durationTimer);
        finishTimer = setTimeout(() => fail('语音识别超时，请重试'), finishTimeoutMs);
        sendASR('input_audio_buffer.commit');
      } else {
        fail('无效的语音控制消息或会话状态');
      }
    });

    try { upstream = createUpstream(); }
    catch (error) {
      fail(error instanceof Error ? error.message : '无法连接语音服务');
      return;
    }
    upstream.on('error', () => fail('语音服务连接失败，请检查服务配置或网络'));
    upstream.on('close', () => {
      if (phase !== 'closed') fail('语音服务连接提前关闭，请重试');
    });
    upstream.on('message', data => {
      if (phase === 'closed') return;
      let event;
      try { event = JSON.parse(data.toString()); }
      catch { fail('语音服务返回无效数据'); return; }
      switch (event.type) {
        case 'session.created':
          if (configured) break;
          configured = true;
          sendASR('session.update', {
            session: { input_audio_format: 'pcm', sample_rate: 16000, turn_detection: null },
          });
          break;
        case 'session.updated':
          if (!configured || phase !== 'connecting') break;
          phase = 'ready';
          clearTimeout(setupTimer);
          touch();
          sendClient({ type: 'ready' });
          break;
        case 'input_audio_buffer.committed':
          if (phase === 'finishing' && !finishSent) {
            finishSent = true;
            sendASR('session.finish');
          }
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (typeof event.transcript === 'string') finalText += event.transcript;
          break;
        case 'session.finished':
          if (phase === 'finishing' && finishSent) complete();
          else fail('语音会话意外结束，请重试');
          break;
        case 'conversation.item.input_audio_transcription.failed':
        case 'error':
          fail(event.error?.message || '语音识别失败，请重试');
          break;
      }
    });
  });

  return {
    close() {
      server.off('upgrade', onUpgrade);
      for (const client of wss.clients) client.terminate();
      wss.close();
    },
  };
}
