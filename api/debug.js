export default async function handler(req, res) {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const resp = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await resp.text();
    return res.status(200).json({ status: resp.status, body: text });
  } catch (err) {
    return res.status(200).json({ error: err.message, type: err.constructor.name });
  }
}
