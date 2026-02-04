import axios from 'axios';

// Updated list of FREE models (December 2024)
const FREE_MODELS = [
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'meta-llama/llama-3.1-70b-instruct:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'microsoft/phi-3-medium-128k-instruct:free',
  'google/gemma-2-9b-it:free',
  'qwen/qwen-2-7b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'huggingfaceh4/zephyr-7b-beta:free'
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithRetry(prompt, apiKey) {
  const errors = [];

  for (const model of FREE_MODELS) {
    try {
      console.log(`Trying: ${model}`);

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
          timeout: 60000
        }
      );

      const content = response.data.choices?.[0]?.message?.content;

      if (content && content.trim().length > 10) {
        console.log(`Success with: ${model}`);
        return { success: true, content, model };
      }
    } catch (error) {
      const status = error.response?.status;
      const msg = error.response?.data?.error?.message || error.message;
      errors.push({ model, status, msg });

      console.log(`Failed ${model}: ${status} - ${msg}`);

      // Rate limited - wait and try next model
      if (status === 429) {
        await delay(3000);
      }

      // Continue to next model
      continue;
    }
  }

  return { success: false, errors };
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
    const description = product.body_html?.replace(/<[^>]*>/g, '').slice(0, 200) || '';

    const prompt = `Write a short customer review in Hinglish for: ${product.title}

Product: ${product.title}

Instructions:
- Use Hinglish (Hindi words written in English letters mixed with English)  
- Keep it 2-3 sentences only
- Sound like a happy Indian customer
- Be positive and natural
- No emojis, no hashtags, no quotes

Example format:
Bahut accha product hai yaar! Quality mast hai aur delivery bhi fast thi. Highly recommend!

Write one review now:`;

    const result = await generateWithRetry(prompt, OPENROUTER_API_KEY);

    if (!result.success) {
      return res.status(500).json({
        error: 'All AI models failed. Please try again in a few minutes.',
        tried_models: result.errors
      });
    }

    let testimonial = result.content;
    // Clean up the response
    testimonial = testimonial.replace(/^["'`\*]+|["'`\*]+$/g, '').trim();
    testimonial = testimonial.replace(/\*+/g, '').trim();
    testimonial = testimonial.replace(/^(Review:|Testimonial:|Here's?:?)/i, '').trim();

    // Save to Shopify
    const metafieldsRes = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}/metafields.json`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } }
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
        { metafield: { id: existing.id, value: testimonial, type: 'multi_line_text_field' } },
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
