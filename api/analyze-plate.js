import https from 'https';

function anthropic(payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Bad AI response')); } });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('AI timeout')));
    req.write(body);
    req.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, plateClaimed } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'No image provided' });

  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,/.exec(imageBase64);
  const mediaType = match ? match[1] : 'image/jpeg';
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const claimed = String(plateClaimed || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

  const prompt = `You are checking a license plate photo for a parking check-in.
The driver typed the plate as: "${claimed}"
Reply with ONLY a JSON object, no markdown:
{"readable": true|false, "extractedPlate": "letters and digits only, or null", "plateMatch": true|false|null, "vehicleColor": "or null", "vehicleMake": "or null", "vehicleModel": "or null", "notes": "other identifying details, or null"}
plateMatch compares extractedPlate to the typed plate ignoring spaces and dashes; use null if unreadable.`;

  try {
    const out = await anthropic({
      model: 'claude-sonnet-5-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: prompt }
        ]
      }]
    });

    if (out.error) return res.status(502).json({ error: 'Analysis failed', detail: out.error.message });

    const text = out.content?.[0]?.text || '{}';
    let parsed;
    try {
      const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      parsed = JSON.parse(jsonText);
    } catch {
      parsed = { readable: false, extractedPlate: null, plateMatch: null, notes: 'Could not read the analysis' };
    }
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
}
