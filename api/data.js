const { Redis } = require("@upstash/redis");

const STORE_KEY = "browns-sales-data";

function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

module.exports = async function handler(req, res) {
  const configuredPasscode = process.env.APP_PASSCODE;
  if (!configuredPasscode) {
    res.status(503).json({ error: "Sync isn't configured on the server yet (missing APP_PASSCODE)." });
    return;
  }

  const redis = getRedis();
  if (!redis) {
    res.status(503).json({ error: "No data store connected yet." });
    return;
  }

  const passcode = req.method === "GET" ? req.query.passcode : (req.body || {}).passcode;
  if (!passcode || passcode !== configuredPasscode) {
    res.status(401).json({ error: "Invalid passcode." });
    return;
  }

  if (req.method === "GET") {
    const data = await redis.get(STORE_KEY);
    res.status(200).json(data || null);
    return;
  }

  if (req.method === "PUT") {
    const { sales, settings } = req.body || {};
    if (!Array.isArray(sales) || !settings || typeof settings !== "object") {
      res.status(400).json({ error: "Invalid payload." });
      return;
    }
    const record = { sales: sales, settings: settings, updatedAt: Date.now() };
    await redis.set(STORE_KEY, record);
    res.status(200).json({ ok: true, updatedAt: record.updatedAt });
    return;
  }

  res.status(405).json({ error: "Method not allowed." });
};
