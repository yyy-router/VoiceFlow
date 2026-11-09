import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function normalizeIP(address = '') {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

/** @typedef {{allowed: true, release: () => void} | {allowed: false, status: number, message: string, headers: Record<string, string>, release?: undefined}} AdmissionResult */

/** Share one budget across HTTP and WebSocket speech ingress in this Node process. */
export function createSpeechAdmission({
  maxSessions = positiveInteger('SPEECH_MAX_SESSIONS', 16),
  maxSessionsPerIP = positiveInteger('SPEECH_MAX_SESSIONS_PER_IP', 2),
  maxStarts = positiveInteger('SPEECH_MAX_STARTS_PER_MINUTE', 120),
  maxStartsPerIP = positiveInteger('SPEECH_MAX_STARTS_PER_IP_PER_MINUTE', 12),
  windowMs = 60000,
  allowMissingOrigin = process.env.SPEECH_ALLOW_MISSING_ORIGIN === 'true',
  allowAnonymous = process.env.NODE_ENV !== 'production' || process.env.SPEECH_ALLOW_ANONYMOUS === 'true',
  authUser = process.env.SPEECH_AUTH_USER || '',
  authPassword = process.env.SPEECH_AUTH_PASSWORD || '',
  trustedProxyIPs = (process.env.SPEECH_TRUSTED_PROXY_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean),
  now = Date.now,
} = {}) {
  for (const value of [maxSessions, maxSessionsPerIP, maxStarts, maxStartsPerIP, windowMs]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Speech admission limits must be positive integers');
  }
  if (!!authUser !== !!authPassword) throw new Error('SPEECH_AUTH_USER and SPEECH_AUTH_PASSWORD must be set together');
  if (authUser.includes(':')) throw new Error('SPEECH_AUTH_USER must not contain a colon');
  const trusted = new Set(trustedProxyIPs.map(normalizeIP));
  if ([...trusted].some(ip => !isIP(ip))) throw new Error('SPEECH_TRUSTED_PROXY_IPS must contain IP addresses');
  const expectedAuth = authUser ? `Basic ${Buffer.from(`${authUser}:${authPassword}`).toString('base64')}` : '';
  const digest = value => createHash('sha256').update(value).digest();
  const authDigest = digest(expectedAuth);
  const clients = new Map();
  let active = 0;
  let starts = 0;
  let resetAt = 0;

  /** Authenticate navigation too, so browsers can reuse their HTTP Basic credentials for WebSocket. */
  function authorize(request) {
    if (!expectedAuth) return allowAnonymous ? null : {
      status: 503, message: '生产环境尚未配置访问认证', headers: {},
    };
    const header = request.headers.authorization;
    const credentials = typeof header === 'string' && /^Basic\s+([A-Za-z0-9+/]+=*)$/i.exec(header);
    if (credentials && timingSafeEqual(authDigest, digest(`Basic ${credentials[1]}`))) return null;
    return {
      status: 401, message: '需要访问认证',
      headers: { 'WWW-Authenticate': 'Basic realm="VoiceFlow", charset="UTF-8"' },
    };
  }

  /**
   * Validate caller and atomically reserve capacity before creating any ASR connection.
   * @returns {AdmissionResult}
   */
  function acquire(request) {
    const denied = authorize(request);
    if (denied) return { allowed: false, ...denied };
    try {
      const originHeader = request.headers.origin;
      if (!originHeader && !allowMissingOrigin) throw new Error('Origin required');
      if (originHeader) {
        const origin = new URL(originHeader);
        if (!['http:', 'https:'].includes(origin.protocol) || !request.headers.host
          || origin.host !== new URL(`${origin.protocol}//${request.headers.host}`).host) {
          throw new Error('Origin mismatch');
        }
      }
    } catch {
      return { allowed: false, status: 403, message: '语音请求来源无效', headers: {} };
    }

    const peer = normalizeIP(request.socket.remoteAddress || 'unknown');
    const forwarded = request.headers['x-real-ip'];
    const ip = trusted.has(peer) && typeof forwarded === 'string' && isIP(forwarded)
      ? normalizeIP(forwarded) : peer;
    const time = now();
    // Expire inactive clients on access rather than keeping a background timer or unbounded IP history.
    for (const [key, value] of clients) {
      if (value.active === 0 && value.resetAt <= time) clients.delete(key);
    }
    if (resetAt <= time) { starts = 0; resetAt = time + windowMs; }
    const entry = clients.get(ip) || { active: 0, starts: 0, resetAt: time + windowMs };
    if (entry.resetAt <= time) { entry.starts = 0; entry.resetAt = time + windowMs; }
    const throttled = retryAfter => ({
      allowed: false, status: 429, message: '语音请求过于频繁或服务繁忙，请稍后重试',
      headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfter / 1000))) },
    });
    if (active >= maxSessions || entry.active >= maxSessionsPerIP) return throttled(1000);
    if (starts >= maxStarts || entry.starts >= maxStartsPerIP) {
      return throttled(Math.max(starts >= maxStarts ? resetAt : 0, entry.starts >= maxStartsPerIP ? entry.resetAt : 0) - time);
    }
    starts++;
    entry.starts++;
    active++;
    entry.active++;
    clients.set(ip, entry);
    let released = false;
    return {
      allowed: true,
      release() {
        if (released) return;
        released = true;
        active--;
        entry.active--;
      },
    };
  }

  return { authorize, acquire };
}

/** Gate legacy POST requests with the same reservation held until their handler finishes. */
export function withSpeechAdmission(handler, admission) {
  return async (request, response) => {
    let reservation;
    let denied = admission.authorize(request);
    if (!denied && request.method === 'POST') {
      let path;
      try { path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/\/+$/, ''); }
      catch { denied = { status: 400, message: '无效的请求路径', headers: {} }; }
      if (path === '/api/speech') {
        reservation = admission.acquire(request);
        if (!reservation.allowed) denied = reservation;
      }
    }
    if (denied) {
      response.writeHead(denied.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...denied.headers });
      response.end(JSON.stringify({ text: '', error: denied.message }));
      return;
    }
    try { await handler(request, response); }
    finally { reservation?.release?.(); }
  };
}
