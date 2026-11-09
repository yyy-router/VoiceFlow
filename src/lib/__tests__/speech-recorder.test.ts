import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeechRecorder } from '../speech-recorder';

const { transport } = vi.hoisted(() => ({
  transport: { append: vi.fn(), finish: vi.fn(), cancel: vi.fn() },
}));
vi.mock('../speech-stream-client', () => ({
  SpeechStreamClient: vi.fn(function () { return transport; }),
}));

type AudioMessage = { type: string; audio?: ArrayBuffer };
class MockWorklet {
  static instances: MockWorklet[] = [];
  onprocessorerror: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  port = {
    onmessage: null as ((event: { data: AudioMessage }) => void) | null,
    close: vi.fn(),
    postMessage: vi.fn(() => {
      this.emit({ type: 'audio', audio: new ArrayBuffer(80) });
      this.emit({ type: 'flushed' });
    }),
  };
  constructor() { MockWorklet.instances.push(this); }
  emit(data: AudioMessage) { this.port.onmessage?.({ data }); }
}

class MockContext {
  static instances: MockContext[] = [];
  sampleRate = 16000;
  state = 'running';
  destination = {};
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  source = { connect: vi.fn(), disconnect: vi.fn() };
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn(async () => { this.state = 'closed'; });
  createMediaStreamSource = vi.fn(() => this.source);
  constructor() { MockContext.instances.push(this); }
}

let track: { stop: ReturnType<typeof vi.fn> };
let getUserMedia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  MockWorklet.instances = [];
  MockContext.instances = [];
  transport.finish.mockResolvedValue('登录流程图');
  track = { stop: vi.fn() };
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('AudioContext', MockContext);
  vi.stubGlobal('AudioWorkletNode', MockWorklet);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('microphone recording lifecycle', () => {
  it('sends live audio and flushes the final partial chunk before requesting recognition', async () => {
    const status = vi.fn();
    const error = vi.fn();
    const recorder = new SpeechRecorder('ws://localhost', status, error);
    recorder.start();
    await vi.waitFor(() => expect(MockWorklet.instances).toHaveLength(1));
    const processor = MockWorklet.instances[0];
    const liveAudio = new ArrayBuffer(3200);
    processor.emit({ type: 'audio', audio: liveAudio });
    expect(transport.append).toHaveBeenCalledWith(liveAudio);
    expect(transport.finish).not.toHaveBeenCalled();
    const result = recorder.stop();
    expect(recorder.stop()).toBe(result);
    await expect(result).resolves.toBe('登录流程图');
    expect(transport.append).toHaveBeenCalledTimes(2);
    expect(transport.append.mock.invocationCallOrder[1]).toBeLessThan(transport.finish.mock.invocationCallOrder[0]);
    expect(track.stop).toHaveBeenCalled();
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
    expect(processor.port.close).toHaveBeenCalledOnce();
    expect(status.mock.calls.map(call => call[0])).toEqual(['preparing', 'recording', 'transcribing', 'idle']);
    expect(error).not.toHaveBeenCalled();
  });

  it('stops a late microphone stream when the button was already released', async () => {
    let grant!: (value: object) => void;
    getUserMedia.mockReturnValue(new Promise(resolve => { grant = resolve; }));
    const error = vi.fn();
    const status = vi.fn();
    const recorder = new SpeechRecorder('ws://localhost', status, error);
    recorder.start();
    expect(status.mock.calls.map(call => call[0])).toEqual(['preparing']);
    await expect(recorder.stop()).resolves.toBe('');
    grant({ getTracks: () => [track] });
    await vi.waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(MockWorklet.instances).toHaveLength(0);
    expect(transport.cancel).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    expect(status.mock.calls.map(call => call[0])).toEqual(['preparing', 'idle']);
  });

  it('releases the stream when cancelled during worklet loading', async () => {
    let loaded!: () => void;
    const status = vi.fn();
    const recorder = new SpeechRecorder('ws://localhost', status, vi.fn());
    recorder.start();
    MockContext.instances[0].audioWorklet.addModule.mockReturnValue(new Promise<void>(resolve => { loaded = resolve; }));
    await vi.waitFor(() => expect(MockContext.instances[0].audioWorklet.addModule).toHaveBeenCalledOnce());
    expect(status.mock.calls.map(call => call[0])).toEqual(['preparing']);
    recorder.cancel();
    loaded();
    await Promise.resolve();
    await Promise.resolve();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(MockWorklet.instances).toHaveLength(0);
    expect(status.mock.calls.map(call => call[0])).toEqual(['preparing', 'idle']);
  });

  it('reports microphone denial and closes the audio context and transport', async () => {
    getUserMedia.mockRejectedValue(new Error('Permission denied'));
    const error = vi.fn();
    const status = vi.fn();
    const recorder = new SpeechRecorder('ws://localhost', status, error);
    recorder.start();
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Permission denied'));
    expect(MockContext.instances[0].close).toHaveBeenCalledOnce();
    expect(transport.cancel).toHaveBeenCalledOnce();
    expect(status.mock.calls.map(call => call[0])).toEqual(['preparing', 'idle']);
  });

  it('enters recording only after permission and the audio processing graph are ready', async () => {
    let grant!: (stream: object) => void;
    let load!: () => void;
    getUserMedia.mockReturnValue(new Promise(resolve => { grant = resolve; }));
    const status = vi.fn();
    const recorder = new SpeechRecorder('ws://localhost', status, vi.fn());
    recorder.start();
    const context = MockContext.instances[0];
    context.audioWorklet.addModule.mockReturnValue(new Promise<void>(resolve => { load = resolve; }));
    expect(status.mock.calls.map(call => call[0])).toEqual(['preparing']);
    grant({ getTracks: () => [track] });
    await vi.waitFor(() => expect(context.audioWorklet.addModule).toHaveBeenCalledOnce());
    expect(status.mock.calls.map(call => call[0])).toEqual(['preparing']);
    load();
    await vi.waitFor(() => expect(status).toHaveBeenCalledWith('recording'));
    expect(MockWorklet.instances[0].connect.mock.invocationCallOrder[0])
      .toBeLessThan(status.mock.invocationCallOrder[1]);
    recorder.cancel();
  });

  it('times out a failed audio flush without submitting a truncated command', async () => {
    const error = vi.fn();
    const recorder = new SpeechRecorder('ws://localhost', vi.fn(), error);
    recorder.start();
    await vi.waitFor(() => expect(MockWorklet.instances).toHaveLength(1));
    MockWorklet.instances[0].port.postMessage.mockImplementation(() => {});
    vi.useFakeTimers();
    const result = recorder.stop();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toBe('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('音频处理超时'));
    expect(transport.finish).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });
});
