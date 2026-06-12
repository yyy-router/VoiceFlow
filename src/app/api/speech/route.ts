import { NextRequest, NextResponse } from 'next/server';
import WebSocket from 'ws';
import { getASRConnection } from '@/lib/asr-pool';

interface PendingEvent {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export async function POST(request: NextRequest) {
  const pooled = await getASRConnection().acquire();
  const ws = pooled.ws;

  try {
    const { audio } = await request.json();
    if (!audio || typeof audio !== 'string') {
      return NextResponse.json({ text: '', error: '缺少音频数据' }, { status: 400 });
    }

    const pending = new Map<string, PendingEvent>();
    let finalText = '';

    const waitFor = (type: string, timeoutMs: number): Promise<Record<string, unknown>> => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(type);
          reject(new Error(`等待 ${type} 超时`));
        }, timeoutMs);
        pending.set(type, { resolve, reject, timer });
      });
    };

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log('[ASR]', msg.type, msg.transcript ? `"${msg.transcript}"` : '');

        if (msg.type === 'error') {
          console.error('[ASR Error]', msg.error);
          for (const [, p] of pending) {
            clearTimeout(p.timer);
            p.reject(new Error(msg.error?.message || 'ASR 错误'));
          }
          pending.clear();
          return;
        }

        if (msg.transcript) finalText = msg.transcript;

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

    ws.on('error', (err: Error) => {
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      pending.clear();
    });

    // Connection & session already ready from pool — stream audio immediately

    const CHUNK_SIZE = 32000;
    for (let offset = 0; offset < audio.length; offset += CHUNK_SIZE) {
      ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: audio.slice(offset, offset + CHUNK_SIZE),
      }));
    }

    ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    await waitFor('input_audio_buffer.committed', 5000);

    ws.send(JSON.stringify({ type: 'session.finish' }));

    try {
      await waitFor('conversation.item.input_audio_transcription.completed', 15000);
    } catch {
      // Fall through to use finalText captured from partial events
    }

    ws.close();
    return NextResponse.json({ text: finalText });

  } catch (error) {
    if (ws.readyState === ws.OPEN) ws.close();
    console.error('Speech API error:', error);
    return NextResponse.json({
      text: '',
      error: error instanceof Error ? error.message : '语音识别失败',
    }, { status: 200 });
  }
}
