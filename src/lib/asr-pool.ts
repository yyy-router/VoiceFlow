import WebSocket from 'ws';

function getASRUrl(): string {
  const model = process.env.ASR_MODEL || 'qwen-asr-realtime';
  return `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${model}`;
}

export interface WarmConnection {
  ws: WebSocket;
  session: Record<string, unknown>;
}

class ASRConnectionManager {
  private warm: WarmConnection | null = null;
  private warming: Promise<WarmConnection> | null = null;
  private apiKey: string;
  private reconnectDelay = 1000;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.warmup();
  }

  /** Grab a ready connection (with session created) and immediately warm the next */
  async acquire(): Promise<WarmConnection> {
    if (this.warm && this.warm.ws.readyState === WebSocket.OPEN) {
      const conn = this.warm;
      this.warm = null;
      this.warmup();
      return conn;
    }

    if (this.warm) {
      this.warm.ws.close();
      this.warm = null;
    }

    if (this.warming) {
      try {
        const conn = await this.warming;
        this.warming = null;
        this.warmup();
        return conn;
      } catch {
        this.warming = null;
      }
    }

    const conn = await this.connect();
    this.warmup();
    return conn;
  }

  private warmup(): void {
    if (this.warm || this.warming) return;
    this.warming = this.connect();
    this.warming
      .then((conn) => {
        this.warm = conn;
        this.warming = null;
        this.reconnectDelay = 1000;
      })
      .catch(() => {
        this.warming = null;
        setTimeout(() => this.warmup(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
      });
  }

  /** Connect + wait for session.created so connection is ready to use */
  private connect(): Promise<WarmConnection> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(getASRUrl(), {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('ASR 连接超时'));
      }, 8000);

      ws.on('open', () => {
        // Wait for session.created (first server message after open)
        ws.once('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'session.created') {
              clearTimeout(timer);
              resolve({ ws, session: msg.session || {} });
            } else if (msg.type === 'error') {
              clearTimeout(timer);
              reject(new Error(msg.error?.message || 'ASR 会话创建失败'));
            } else {
              clearTimeout(timer);
              resolve({ ws, session: {} });
            }
          } catch {
            clearTimeout(timer);
            reject(new Error('ASR 响应解析失败'));
          }
        });

        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(new Error(`ASR 连接失败: ${err.message}`));
        });

        ws.on('close', (code) => {
          clearTimeout(timer);
          reject(new Error(`ASR 连接提前关闭 (code ${code})`));
        });
      });
    });
  }
}

// Singleton — one per Next.js dev server process
let instance: ASRConnectionManager | null = null;

export function getASRConnection(): ASRConnectionManager {
  if (!instance) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) throw new Error('DASHSCOPE_API_KEY not configured');
    instance = new ASRConnectionManager(apiKey);
  }
  return instance;
}
