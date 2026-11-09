// Protocol smoke test using synthetic silence; this does not measure speech accuracy.
// Start the app first, then: node scripts/test-asr-stream.mjs
// Optional: SPEECH_URL=ws://localhost:3456/api/speech/stream
import WebSocket from 'ws';

const url = process.env.SPEECH_URL || 'ws://localhost:3000/api/speech/stream';
const origin = new URL(url);
origin.protocol = origin.protocol === 'wss:' ? 'https:' : 'http:';
const headers = {};
if (process.env.SPEECH_AUTH_USER && process.env.SPEECH_AUTH_PASSWORD) {
  headers.Authorization = `Basic ${Buffer.from(`${process.env.SPEECH_AUTH_USER}:${process.env.SPEECH_AUTH_PASSWORD}`).toString('base64')}`;
}
const ws = new WebSocket(url, { origin: origin.origin, headers });
const chunk = Buffer.alloc(1600 * 2); // 100 ms, PCM16 mono at 16 kHz
let interval;
let chunks = 0;
let completed = false;
const started = Date.now();

try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Speech test timed out')), 35000);
    const fail = error => { clearTimeout(timeout); reject(error); };
    ws.on('error', fail);
    ws.on('close', () => {
      if (!completed) fail(new Error('Connection closed without a final result'));
    });
    ws.on('message', data => {
      const message = JSON.parse(data.toString());
      if (message.type === 'ready') {
        console.log(`ASR ready after ${Date.now() - started} ms; uploading every 100 ms`);
        interval = setInterval(() => {
          if (chunks === 20) {
            clearInterval(interval);
            console.log('Uploaded 2 seconds of audio; requesting final recognition');
            ws.send(JSON.stringify({ type: 'finish' }));
          } else {
            ws.send(chunk);
            chunks++;
          }
        }, 100);
      } else if (message.type === 'result') {
        completed = true;
        clearTimeout(timeout);
        console.log(`PASS: final result received (${message.text.length} characters; silence may produce empty text)`);
        resolve();
      } else if (message.type === 'error') {
        fail(new Error(message.message));
      }
    });
  });
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearInterval(interval);
  ws.close();
}
