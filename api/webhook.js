import axios from 'axios';

const FREE_MODELS = [
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'google/gemma-2-9b-it:free'
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithRetry(prompt, apiKey) {
  for (const model of FREE_MODELS) {
    try {
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
      if (content) return { success: true, content, model };
    } catch (error) {
      if (error.response?.status === 429) await delay(3000);
      continue;
    }
  }
  return { success: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!OPENROUTER_API_KEY || !SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(200).json({ error: 'Missing env vars' });
  }

  try {
    const product = req.body;
    if (!product?.id) return res.status(200).json({ error: 'No product data' });

    const prompt = `Write a short Hinglish review for: ${product.title}. 2-3 sentences, positive, no emojis.`;

    const result = await generateWithRetry(prompt, OPENROUTER_API_KEY);

    if (result.success) {
      let testimonial = result.content.replace(/^["'`\*]+|["'`\*]+$/g, '').trim();

      await axios.post(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${product.id}/metafields.json`,
        {
          metafield: {
            namespace: 'custom',
            key: 'ai_testimonial',
            value: testimonial,
            type: 'multi_line_text_field'
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      return res.status(200).json({ success: true, testimonial, model: result.model });
    }

    return res.status(200).json({ success: false });

  } catch (error) {
    return res.status(200).json({ error: error.message });
  }
}
