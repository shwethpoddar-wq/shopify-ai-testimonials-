import axios from 'axios';

// List of free models to try (in order)
const FREE_MODELS = [
  'qwen/qwen-2.5-7b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.2-1b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free',
  'openchat/openchat-7b:free',
  'huggingfaceh4/zephyr-7b-beta:free',
  'undi95/toppy-m-7b:free'
];

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Try generating with multiple models
async function generateWithRetry(prompt, apiKey, maxRetries = 3) {
  let lastError = null;

  for (const model of FREE_MODELS) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Trying model: ${model} (attempt ${attempt})`);

        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.9
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://shopify.com',
              'X-Title': 'Shopify AI Testimonials'
            },
            timeout: 30000
          }
        );

        const content = response.data.choices?.[0]?.message?.content;

        if (content) {
          console.log(`Success with model: ${model}`);
          return {
            success: true,
            content: content,
            model: model
          };
        }
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        const errorMessage = error.response?.data?.error?.message || error.message;

        console.log(`Error with ${model}: ${status} - ${errorMessage}`);

        // If rate limited, wait and retry same model
        if (status === 429) {
          console.log(`Rate limited. Waiting 5 seconds...`);
          await delay(5000);
          continue;
        }

        // If model not found, try next model
        if (status === 404) {
          break;
        }

        // For other errors, wait briefly and retry
        if (attempt < maxRetries) {
          await delay(2000);
        }
      }
    }
  }

  return {
    success: false,
    error: lastError?.response?.data || lastError?.message || 'All models failed'
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!OPENROUTER_API_KEY || !SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({
      error: 'Missing environment variables',
      required: ['OPENROUTER_API_KEY', 'SHOPIFY_STORE', 'SHOPIFY_ACCESS_TOKEN']
    });
  }

  const productId = req.query.productId || req.body?.productId;

  if (!productId) {
    return res.status(400).json({
      error: 'productId is required',
      usage: '/api/generate?productId=YOUR_PRODUCT_ID'
    });
  }

  try {
    // Get product from Shopify
    const productRes = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}.json`,
      {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
      }
    );

    const product = productRes.data.product;
    const description = product.body_html?.replace(/<[^>]*>/g, '') || '';

    const prompt = `Generate a realistic Indian customer testimonial for this product.

Product: ${product.title}
Description: ${description}

RULES:
- Write in Hinglish (Hindi + English in Roman script)
- Keep it 2-3 lines only
- Sound natural like a real customer
- Be enthusiastic and positive
- Mention product quality or experience
- Use words like "yaar", "bhai", "ekdum", "bahut"
- NO emojis, NO hashtags, NO quotes, NO asterisks

Examples:
- Bahut accha product hai yaar! Quality ekdum first class. Delivery bhi fast thi.
- Mujhe toh bahut pasand aaya bhai. Value for money hai definitely.
- Kya baat hai! Product dekh ke dil khush ho gaya. Highly recommended.

Generate ONE testimonial only (just the text, nothing else):`;

    // Generate testimonial with auto-retry
    const result = await generateWithRetry(prompt, OPENROUTER_API_KEY);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to generate testimonial',
        details: result.error
      });
    }

    let testimonial = result.content;
    testimonial = testimonial.replace(/^["'\*]|["'\*]$/g, '').trim();
    testimonial = testimonial.replace(/\*+/g, '').trim();

    // Save to Shopify metafield
    const metafieldsRes = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}/metafields.json`,
      {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
      }
    );

    const existing = metafieldsRes.data.metafields.find(
      m => m.namespace === 'custom' && m.key === 'ai_testimonial'
    );

    const shopifyHeaders = {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    };

    if (existing) {
      await axios.put(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/metafields/${existing.id}.json`,
        {
          metafield: { id: existing.id, value: testimonial, type: 'multi_line_text_field' }
        },
        { headers: shopifyHeaders }
      );
    } else {
      await axios.post(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}/metafields.json`,
        {
          metafield: {
            namespace: 'custom',
            key: 'ai_testimonial',
            value: testimonial,
            type: 'multi_line_text_field'
          }
        },
        { headers: shopifyHeaders }
      );
    }

    return res.status(200).json({
      success: true,
      productId,
      title: product.title,
      testimonial,
      model_used: result.model
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    return res.status(500).json({
      error: error.message,
      details: error.response?.data
    });
  }
}
