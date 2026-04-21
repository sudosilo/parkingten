export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64, plateClaimed } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'No image provided' });
  }

  try {
    const prompt = `You are analyzing a license plate photo for a parking management system.

The user claims the license plate reads: "${plateClaimed}"

Analyze the image and respond ONLY with a JSON object, no markdown, no explanation:
{
  "readable": true or false,
  "extractedPlate": "plate text you can read, or null",
  "plateMatch": true or false or null,
  "vehicleColor": "color or null",
  "vehicleMake": "make if visible or null",
  "vehicleModel": "model if visible or null",
  "notes": "any other identifying details or null"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64.replace(/^data:image\/\w+;base64,/, '')
                }
              },
              { type: 'text', text: prompt }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      parsed = { readable: false, extractedPlate: null, plateMatch: null, notes: 'Analysis failed' };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Plate analysis error:', err);
    return res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
}
