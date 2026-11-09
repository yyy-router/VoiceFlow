import { createServer } from 'node:http';
import next from 'next';
import { attachSpeechRelay } from './speech-relay.mjs';

const dev = process.argv.includes('--dev');
process.env.NODE_ENV ||= dev ? 'development' : 'production';
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || '0.0.0.0';
const app = next({ dev, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer((request, response) => {
  handle(request, response).catch(error => {
    console.error('Request failed:', error);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});

// Next installs its HMR upgrade listener on the first HTTP request; the relay
// handles only its own path, leaving development hot reload to Next.
const relay = attachSpeechRelay(server);
server.listen(port, hostname, () => {
  console.log(`VoiceFlow ready at http://localhost:${port} (${dev ? 'development' : 'production'})`);
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  relay.close();
  server.close(() => { void app.close().then(() => process.exit(0)); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
