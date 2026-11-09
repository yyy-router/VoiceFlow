import { SpeechStreamClient } from './speech-stream-client';

export type SpeechStatus = 'idle' | 'preparing' | 'recording' | 'transcribing';

/** Owns one push-to-talk recording, including asynchronous microphone permission. */
export class SpeechRecorder {
  private transport?: SpeechStreamClient;
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private processor?: AudioWorkletNode;
  private cancelled = false;
  private stopPromise?: Promise<string>;
  private flush?: { resolve: () => void; reject: (error: Error) => void };

  constructor(
    private url: string,
    private onStatus: (status: SpeechStatus) => void,
    private onError: (message: string) => void,
  ) {}

  start(): void {
    if (this.cancelled || this.context) return;
    try {
      // Resume in the pointer gesture, before awaiting microphone permission.
      const context = new AudioContext({ sampleRate: 16000 });
      this.context = context;
      const resumed = context.resume();
      void resumed.catch(error => this.fail(error));
      this.transport = new SpeechStreamClient(this.url, message => this.fail(new Error(message)));
      this.onStatus('preparing');
      void this.capture(context, resumed).catch(error => this.fail(error));
    } catch (error) {
      this.fail(error);
    }
  }

  private async capture(context: AudioContext, resumed: Promise<void>): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, autoGainControl: true },
    });
    if (this.cancelled) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    this.stream = stream;
    await context.audioWorklet.addModule('/audio/pcm-worklet.js');
    await resumed;
    if (this.cancelled) return;
    if (context.sampleRate < 16000) throw new Error('浏览器音频采样率低于 16 kHz');

    const processor = new AudioWorkletNode(context, 'pcm-uploader');
    this.processor = processor;
    processor.port.onmessage = event => {
      if (this.cancelled) return;
      if (event.data.type === 'audio') this.transport?.append(event.data.audio);
      else if (event.data.type === 'flushed') this.flush?.resolve();
    };
    processor.onprocessorerror = () => this.fail(new Error('音频采集失败，请重试'));
    this.source = context.createMediaStreamSource(stream);
    this.source.connect(processor);
    // The processor's output is silence; microphone audio is never played back.
    processor.connect(context.destination);
    this.onStatus('recording');
  }

  stop(): Promise<string> {
    if (this.stopPromise) return this.stopPromise;
    if (this.cancelled) return Promise.resolve('');
    if (!this.processor) {
      // A quick release must not start recording later when permission resolves.
      this.cancel();
      return Promise.resolve('');
    }
    this.onStatus('transcribing');
    this.source?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stopPromise = this.finish();
    return this.stopPromise;
  }

  private async finish(): Promise<string> {
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.flush = undefined;
          reject(new Error('音频处理超时，请重试'));
        }, 1500);
        this.flush = {
          resolve: () => { clearTimeout(timer); this.flush = undefined; resolve(); },
          reject: error => { clearTimeout(timer); this.flush = undefined; reject(error); },
        };
        // Audio messages and this acknowledgement share an ordered MessagePort.
        this.processor!.port.postMessage({ type: 'flush' });
      });
      if (this.cancelled) return '';
      this.releaseAudio();
      const text = await this.transport!.finish();
      return this.cancelled ? '' : text;
    } catch (error) {
      this.fail(error);
      return '';
    } finally {
      this.cancel();
    }
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.flush?.reject(new Error('录音已取消'));
    this.transport?.cancel();
    this.releaseAudio();
    this.onStatus('idle');
  }

  private fail(error: unknown): void {
    if (this.cancelled) return;
    this.onError(error instanceof Error ? error.message : '无法启动语音录音');
    this.cancel();
  }

  private releaseAudio(): void {
    this.source?.disconnect();
    this.source = undefined;
    if (this.processor) {
      this.processor.onprocessorerror = null;
      this.processor.port.onmessage = null;
      this.processor.port.close();
      this.processor.disconnect();
      this.processor = undefined;
    }
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = undefined;
  }
}
