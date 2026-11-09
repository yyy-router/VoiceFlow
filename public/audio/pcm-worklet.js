/* global AudioWorkletProcessor, registerProcessor, sampleRate */

// Emit 100 ms of 16 kHz mono PCM16 per message. Average samples when the
// browser uses a higher sample rate despite the AudioContext preference.
class PCMUploadProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new ArrayBuffer(1600 * 2);
    this.view = new DataView(this.buffer);
    this.length = 0;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.stopped = false;
    this.port.onmessage = event => {
      if (event.data.type !== 'flush' || this.stopped) return;
      this.stopped = true;
      if (this.count) this.writeSample(this.sum / this.count);
      this.flush();
      this.port.postMessage({ type: 'flushed' });
    };
  }

  writeSample(value) {
    const clipped = Math.max(-1, Math.min(1, value));
    this.view.setInt16(this.length * 2, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true);
    this.length++;
    if (this.length === 1600) this.flush();
  }

  flush() {
    if (!this.length) return;
    const audio = this.buffer.slice(0, this.length * 2);
    this.port.postMessage({ type: 'audio', audio }, [audio]);
    this.length = 0;
  }

  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const value of input) {
      this.sum += value;
      this.count++;
      this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.writeSample(this.sum / this.count);
        this.phase -= sampleRate;
        this.sum = 0;
        this.count = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-uploader', PCMUploadProcessor);
