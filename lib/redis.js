import https from 'https';

// Tolerates values pasted as NAME="value" or with stray quotes and spaces.
export function cleanEnv(v) {
  let s = String(v || '').trim();
  s = s.replace(/^[A-Z_]+\s*=\s*/, '');
  s = s.replace(/^["']+|["']+$/g, '').trim();
  return s;
}

export function envShape() {
  const t = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');
  const c = cleanEnv(t);
  return { rawLen: t.length, cleanLen: c.length, hasQuote: /["']/.test(t), hasEquals: t.includes('='), hasSpace: /\s/.test(t) };
}

// Runs one Redis command against the Upstash REST API, e.g. cmd('SET', 'k', 'v').
// Uses the https module because global fetch failed on this deployment.
export function cmd(...args) {
  const raw = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!raw || !token) return Promise.reject(new Error('Redis env vars missing'));
  const base = new URL(raw);
  const body = JSON.stringify(args.map(String));
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: base.hostname,
      path: '/',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error));
          resolve(parsed.result);
        } catch (e) {
          reject(new Error('Bad Redis response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('Redis timeout')));
    req.write(body);
    req.end();
  });
}

export async function getJSON(key) {
  const v = await cmd('GET', key);
  if (v === null || v === undefined) return null;
  try { return JSON.parse(v); } catch { return null; }
}

export function setJSON(key, value) {
  return cmd('SET', key, JSON.stringify(value));
}

export async function getMany(keys) {
  if (!keys || keys.length === 0) return [];
  const vals = await cmd('MGET', ...keys);
  return (vals || []).map((v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } });
}

// Operator endpoints require the operator password in the x-operator-key header.
export function isOperator(req) {
  const expected = process.env.OPERATOR_PASSWORD || 'park!ng10';
  return req.headers['x-operator-key'] === expected;
}
