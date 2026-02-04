export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  return res.status(200).json({
    status: 'Debug Info',
    environment_variables: {
      OPENROUTER_API_KEY: OPENROUTER_API_KEY ? `✅ Set (${OPENROUTER_API_KEY.slice(0, 10)}...)` : '❌ MISSING',
      SHOPIFY_STORE: SHOPIFY_STORE ? `✅ Set (${SHOPIFY_STORE})` : '❌ MISSING',
      SHOPIFY_ACCESS_TOKEN: SHOPIFY_ACCESS_TOKEN ? `✅ Set (${SHOPIFY_ACCESS_TOKEN.slice(0, 10)}...)` : '❌ MISSING'
    },
    timestamp: new Date().toISOString()
  });
}
