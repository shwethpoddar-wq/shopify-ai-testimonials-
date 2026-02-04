export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  return res.status(200).json({
    status: 'Debug Info',
    message: 'Environment Variables Check',
    variables: {
      OPENROUTER_API_KEY: OPENROUTER_API_KEY 
        ? '✅ SET (' + OPENROUTER_API_KEY.substring(0, 15) + '...)' 
        : '❌ MISSING',
      SHOPIFY_STORE: SHOPIFY_STORE 
        ? '✅ SET (' + SHOPIFY_STORE + ')' 
        : '❌ MISSING',
      SHOPIFY_ACCESS_TOKEN: SHOPIFY_ACCESS_TOKEN 
        ? '✅ SET (' + SHOPIFY_ACCESS_TOKEN.substring(0, 15) + '...)' 
        : '❌ MISSING'
    },
    all_set: !!(OPENROUTER_API_KEY && SHOPIFY_STORE && SHOPIFY_ACCESS_TOKEN),
    timestamp: new Date().toISOString()
  });
}
