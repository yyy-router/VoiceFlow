import { NextRequest, NextResponse } from 'next/server';
import WebSocket from 'ws';

function getASRUrl(): string {
  const model = process.env.ASR_MODEL || 'qwen-asr-realtime';
  return `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${model}`;
}

interface PendingEvent {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export async function POST(request: NextRequest) {
  let ws: WebSocket | null = null;

  try {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ text: '', error: '未配置 DASHSCOPE_API_KEY' }, { status: 500 });
    }

    const { audio } = await request.json();
    if (!audio || typeof audio !== 'string') {
      return NextResponse.json({ text: '', error: '缺少音频数据' }, { status: 400 });
    }

    // Connect with all handlers ready before open fires
    const pending = new Map<string, PendingEvent>();
    let finalText = '';
    let connected = false;

    ws = new WebSocket(getASRUrl(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const waitFor = (type: string, timeoutMs: number): Promise<Record<string, unknown>> => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(type);
          reject(new Error(`等待 ${type} 超时`));
        }, timeoutMs);
        pending.set(type, { resolve, reject, timer });
      });
    };

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log('[ASR]', msg.type, msg.transcript ? `"${msg.transcript}"` : '');

        if (msg.type === 'error') {
          console.error('[ASR Error]', msg.error);
          // Reject all pending
          for (const [, p] of pending) {
            clearTimeout(p.timer);
            p.reject(new Error(msg.error?.message || 'ASR 错误'));
          }
          pending.clear();
          return;
        }

        // Capture transcription text
        if (msg.transcript) {
          finalText = msg.transcript;
        }

        // Resolve matching pending waiter
        const waiter = pending.get(msg.type);
        if (waiter) {
          clearTimeout(waiter.timer);
          pending.delete(msg.type);
          waiter.resolve(msg as Record<string, unknown>);
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on('error', (err) => {
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      pending.clear();
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('连接超时')), 8000);
      ws!.on('open', () => {
        clearTimeout(timer);
        connected = true;
        resolve();
      });
    });

    // Wait for session.created
    await waitFor('session.created', 5000);

    // Send audio chunks
    const CHUNK_SIZE = 32000;
    for (let offset = 0; offset < audio.length; offset += CHUNK_SIZE) {
      ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: audio.slice(offset, offset + CHUNK_SIZE),
      }));
    }

    // Commit → wait for committed
    ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    await waitFor('input_audio_buffer.committed', 5000);

    // Finish session
    ws.send(JSON.stringify({ type: 'session.finish' }));

    // Wait for completed or finished
    try {
      await waitFor('conversation.item.input_audio_transcription.completed', 15000);
    } catch {
      // Fall through to use finalText
    }

    ws.close();
    ws = null;

    return NextResponse.json({ text: finalText });

  } catch (error) {
    if (ws && ws.readyState === ws.OPEN) ws.close();
    console.error('Speech API error:', error);
    return NextResponse.json({
      text: '',
      error: error instanceof Error ? error.message : '语音识别失败',
    }, { status: 200 });
  }
}
