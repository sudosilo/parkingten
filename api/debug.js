export default async function handler(req, res) {
  return res.status(200).json({
    hasUrl: !!process.env.UPSTASH_REDIS_REST_URL,
    hasToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    urlStart: process.env.UPSTASH_REDIS_REST_URL?.slice(0, 30) || 'missing'
  });
}
