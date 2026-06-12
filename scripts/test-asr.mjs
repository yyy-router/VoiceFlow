// Generate a sine wave, encode as base64 PCM, and POST to /api/speech
// Usage: node scripts/test-asr.mjs

const SAMPLE_RATE = 16000;
const DURATION = 2; // seconds
const FREQ = 440; // Hz

// Generate Float32 sine wave
const samples = new Float32Array(SAMPLE_RATE * DURATION);
for (let i = 0; i < samples.length; i++) {
  samples[i] = Math.sin((2 * Math.PI * FREQ * i) / SAMPLE_RATE) * 0.5;
}

// Float32 → Int16
const int16 = new Int16Array(samples.length);
for (let i = 0; i < samples.length; i++) {
  int16[i] = Math.round(samples[i] * 32767);
}

// Int16 → base64
const bytes = new Uint8Array(int16.buffer);
const base64 = Buffer.from(bytes).toString('base64');

console.log(`Generated ${DURATION}s test audio (${base64.length} bytes base64)`);
console.log('POST /api/speech ...');

const res = await fetch('http://localhost:3000/api/speech', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ audio: base64 }),
});

const data = await res.json();
console.log('Response:', JSON.stringify(data, null, 2));

if (data.text) {
  console.log('SUCCESS: ASR returned text:', data.text);
} else if (data.error) {
  console.log('INFO:', data.error, '(expected with sine wave — ASR found no speech)');
}
