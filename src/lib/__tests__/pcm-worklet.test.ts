import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

function createProcessor(rate: number) {
  const messages: { type: string; audio?: ArrayBuffer }[] = [];
  let Processor!: new () => {
    process: (input: Float32Array[][]) => boolean;
    port: { onmessage: (event: { data: { type: string } }) => void };
  };
  runInNewContext(readFileSync('public/audio/pcm-worklet.js', 'utf8'), {
    sampleRate: rate,
    AudioWorkletProcessor: class { port = { postMessage: (message: typeof messages[number]) => messages.push(message) }; },
    registerProcessor: (_name: string, implementation: typeof Processor) => { Processor = implementation; },
  });
  return { processor: new Processor(), messages };
}

describe('PCM audio worklet', () => {
  it('emits 100 ms chunks while recording and preserves the remaining samples on flush', () => {
    const { processor, messages } = createProcessor(16000);
    processor.process([[new Float32Array(1700).fill(0.5)]]);
    expect(messages).toHaveLength(1);
    expect(messages[0].audio?.byteLength).toBe(3200);
    processor.port.onmessage({ data: { type: 'flush' } });
    expect(messages.map(message => message.type)).toEqual(['audio', 'audio', 'flushed']);
    expect(messages[1].audio?.byteLength).toBe(200);
    processor.port.onmessage({ data: { type: 'flush' } });
    expect(messages).toHaveLength(3);
    expect(processor.process([[new Float32Array(128)]])).toBe(false);
  });

  it.each([44100, 48000])('resamples %i Hz audio to the expected 16 kHz duration', rate => {
    const { processor, messages } = createProcessor(rate);
    for (let offset = 0; offset < rate; offset += 128) {
      processor.process([[new Float32Array(Math.min(128, rate - offset)).fill(0.25)]]);
    }
    processor.port.onmessage({ data: { type: 'flush' } });
    const audio = messages.filter(message => message.type === 'audio');
    expect(audio.reduce((sum, message) => sum + message.audio!.byteLength, 0)).toBe(32000);
    expect(new DataView(audio[0].audio!).getInt16(0, true)).toBe(8192);
  });

  it('encodes clipped little-endian signed PCM16 without amplifying silence', () => {
    const { processor, messages } = createProcessor(16000);
    processor.process([[new Float32Array([-2, -1, 0, 1, 2])]]);
    processor.port.onmessage({ data: { type: 'flush' } });
    const view = new DataView(messages[0].audio!);
    expect(Array.from({ length: 5 }, (_, index) => view.getInt16(index * 2, true)))
      .toEqual([-32768, -32768, 0, 32767, 32767]);
  });
});
