import { describe, expect, it } from 'vitest';
import { createSpeechAdmission, withSpeechAdmission } from '../../../scripts/speech-admission.mjs';

function request(ip = '192.0.2.1', headers: Record<string, string> = {}) {
  return {
    headers: { host: 'voiceflow.example', origin: 'https://voiceflow.example', ...headers },
    socket: { remoteAddress: ip },
  };
}

function gate(options: Parameters<typeof createSpeechAdmission>[0] = {}) {
  return createSpeechAdmission({ allowAnonymous: true, ...options });
}

describe('shared speech admission', () => {
  it('atomically enforces global and per-IP concurrency, with idempotent release', () => {
    const admission = gate({ maxSessions: 3, maxSessionsPerIP: 2 });
    const first = admission.acquire(request());
    const second = admission.acquire(request());
    expect(first.allowed && second.allowed).toBe(true);
    expect(admission.acquire(request())).toMatchObject({ allowed: false, status: 429 });
    const third = admission.acquire(request('192.0.2.2'));
    expect(third.allowed).toBe(true);
    expect(admission.acquire(request('192.0.2.3'))).toMatchObject({ allowed: false, status: 429 });
    first.release?.();
    first.release?.();
    const next = admission.acquire(request('192.0.2.3'));
    expect(next.allowed).toBe(true);
    expect(admission.acquire(request('192.0.2.4'))).toMatchObject({ allowed: false, status: 429 });
    second.release?.(); third.release?.(); next.release?.();
  });

  it('retains per-IP start limits after disconnect and replenishes them only after the window', () => {
    let time = 0;
    const admission = gate({ maxStartsPerIP: 2, now: () => time });
    admission.acquire(request()).release?.();
    admission.acquire(request()).release?.();
    expect(admission.acquire(request())).toMatchObject({ allowed: false, status: 429, headers: { 'Retry-After': '60' } });
    time = 60000;
    const next = admission.acquire(request());
    expect(next.allowed).toBe(true);
    next.release?.();
  });

  it('limits global start rate even when clients have different IPs', () => {
    const admission = gate({ maxStarts: 2 });
    admission.acquire(request('192.0.2.1')).release?.();
    admission.acquire(request('192.0.2.2')).release?.();
    expect(admission.acquire(request('192.0.2.3'))).toMatchObject({ allowed: false, status: 429 });
  });

  it('requires Origin by default and makes originless diagnostics an explicit opt-in', () => {
    const missing = { headers: { host: 'voiceflow.example' }, socket: { remoteAddress: '127.0.0.1' } };
    expect(gate().acquire(missing)).toMatchObject({ allowed: false, status: 403 });
    const accepted = gate({ allowMissingOrigin: true }).acquire(missing);
    expect(accepted.allowed).toBe(true);
    accepted.release?.();
    for (const origin of ['null', 'file://voiceflow.example', 'https://different.example']) {
      expect(gate().acquire(request('127.0.0.1', { origin }))).toMatchObject({ allowed: false, status: 403 });
    }
  });

  it('fails closed unless production authentication or anonymous access is explicitly configured', () => {
    const protectedGate = gate({ allowAnonymous: false });
    expect(protectedGate.acquire(request())).toMatchObject({ allowed: false, status: 503 });
    const authenticated = gate({ allowAnonymous: false, authUser: 'voiceflow', authPassword: 'test-password' });
    expect(authenticated.acquire(request())).toMatchObject({ allowed: false, status: 401 });
    const wrong = `Basic ${Buffer.from('voiceflow:wrong').toString('base64')}`;
    expect(authenticated.acquire(request('192.0.2.1', { authorization: wrong }))).toMatchObject({ allowed: false, status: 401 });
    const authorization = `basic ${Buffer.from('voiceflow:test-password').toString('base64')}`;
    const permitted = authenticated.acquire(request('192.0.2.1', { authorization }));
    expect(permitted.allowed).toBe(true);
    permitted.release?.();
  });

  it('ignores spoofed forwarded IPs and normalizes IPv4-mapped socket addresses', () => {
    const admission = gate({ maxSessionsPerIP: 1 });
    const first = admission.acquire(request('::ffff:192.0.2.1', { 'x-real-ip': '203.0.113.1' }));
    expect(first.allowed).toBe(true);
    expect(admission.acquire(request('192.0.2.1', { 'x-real-ip': '203.0.113.2' })))
      .toMatchObject({ allowed: false, status: 429 });
    first.release?.();
  });

  it('accepts X-Real-IP only from explicitly trusted proxy peer IPs', () => {
    const admission = gate({ maxSessionsPerIP: 1, trustedProxyIPs: ['127.0.0.1'] });
    const first = admission.acquire(request('127.0.0.1', { 'x-real-ip': '192.0.2.1' }));
    const second = admission.acquire(request('127.0.0.1', { 'x-real-ip': '192.0.2.2' }));
    expect(first.allowed && second.allowed).toBe(true);
    expect(admission.acquire(request('127.0.0.1', { 'x-real-ip': '192.0.2.1' })))
      .toMatchObject({ allowed: false, status: 429 });
    first.release?.(); second.release?.();
  });

  it('rejects invalid security configuration instead of silently disabling protections', () => {
    expect(() => gate({ maxSessions: 0 })).toThrow('positive integers');
    expect(() => gate({ authUser: 'user' })).toThrow('set together');
    expect(() => gate({ trustedProxyIPs: ['*'] })).toThrow('IP addresses');
  });

  it('returns HTTP capacity even when the legacy handler throws', async () => {
    const admission = gate({ maxSessions: 1 });
    const handle = withSpeechAdmission(async () => { throw new Error('ASR failed'); }, admission);
    const req = { ...request(), method: 'POST', url: '/api/%73peech/' };
    await expect(handle(req, {})).rejects.toThrow('ASR failed');
    const next = admission.acquire(request());
    expect(next.allowed).toBe(true);
    next.release?.();
  });
});
