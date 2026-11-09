const MAX_BUFFER_BYTES = 16000 * 2 * 5;

/** Ordered audio upload with bounded startup buffering and a final-result deadline. */
export class SpeechStreamClient {
  private socket: WebSocket;
  private pending: ArrayBuffer[] = [];
  private pendingBytes = 0;
  private ready = false;
  private finishing = false;
  private finishSent = false;
  private settled = false;
  private resolveResult!: (text: string) => void;
  private result = new Promise<string>(resolve => { this.resolveResult = resolve; });
  private timer: ReturnType<typeof setTimeout>;

  constructor(url: string, private onError: (message: string) => void) {
    this.socket = new WebSocket(url);
    this.timer = setTimeout(() => this.fail('语音连接超时，请重试'), 12000);
    this.socket.onmessage = event => {
      if (this.settled) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'ready' && !this.ready) {
          this.ready = true;
          clearTimeout(this.timer);
          const pending = this.pending;
          this.pending = [];
          this.pendingBytes = 0;
          for (const audio of pending) this.sendAudio(audio);
          if (this.finishing && !this.settled) this.sendFinish();
        } else if (message.type === 'result' && this.finishing && typeof message.text === 'string') {
          this.settle(message.text);
        } else if (message.type === 'error') {
          this.fail(typeof message.message === 'string' ? message.message : '语音识别失败');
        }
      } catch {
        this.fail('语音服务返回无效数据');
      }
    };
    this.socket.onerror = () => this.fail('无法连接语音服务，请检查网络后重试');
    this.socket.onclose = () => {
      if (!this.settled) this.fail('语音连接已断开，请重试');
    };
  }

  append(audio: ArrayBuffer): void {
    if (this.settled || this.finishing || audio.byteLength === 0) return;
    if (!this.ready) {
      this.pendingBytes += audio.byteLength;
      if (this.pendingBytes > MAX_BUFFER_BYTES) {
        this.fail('语音连接过慢，请重试');
        return;
      }
      this.pending.push(audio);
      return;
    }
    this.sendAudio(audio);
  }

  private sendAudio(audio: ArrayBuffer): void {
    if (this.settled) return;
    if (this.socket.readyState !== WebSocket.OPEN || this.socket.bufferedAmount + audio.byteLength > MAX_BUFFER_BYTES) {
      this.fail('语音上传网络拥塞或连接已断开，请重试');
      return;
    }
    try { this.socket.send(audio); }
    catch { this.fail('音频上传失败，请重试'); }
  }

  finish(): Promise<string> {
    if (!this.finishing && !this.settled) {
      this.finishing = true;
      if (this.ready) this.sendFinish();
    }
    return this.result;
  }

  cancel(): void {
    this.settle('');
  }

  private sendFinish(): void {
    if (this.settled || this.finishSent) return;
    if (this.socket.readyState !== WebSocket.OPEN) {
      this.fail('语音连接已断开，请重试');
      return;
    }
    this.finishSent = true;
    try { this.socket.send(JSON.stringify({ type: 'finish' })); }
    catch { this.fail('语音上传失败，请重试'); return; }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail('语音识别超时，请重试'), 25000);
  }

  private fail(message: string): void {
    if (this.settled) return;
    this.settle('');
    this.onError(message);
  }

  private settle(text: string): void {
    if (this.settled) return;
    this.settled = true;
    clearTimeout(this.timer);
    this.pending = [];
    this.pendingBytes = 0;
    this.resolveResult(text);
    this.socket.close();
  }
}
