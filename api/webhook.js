import axios from 'axios';

const FREE_MODELS = [
  'qwen/qwen-2.5-7b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.2-1b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free'
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithRetry(prompt, apiKey) {
  for (const model of FREE_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
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
            timeout: 30000
          }
        );

        const content = response.data.choices?.[0]?.message?.content;
        if (content) {
          return { success: true, content, model };
        }
      } catch (error) {
        if (error.response?.status === 429) {
          await delay(5000);
          continue;
        }
        if (error.response?.status === 404) {
          break;
        }
        await delay(2000);
      }
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

    if (!product?.id) {
      return res.status(200).json({ error: 'No product data' });
    }

    const description = product.body_html?.replace(/<[^>]*>/g, '') || '';

    const prompt = `Generate Indian customer testimonial for: ${product.title}. ${description}

Rules: Hinglish, 2-3 lines, natural, positive, no emojis.

Generate ONE testimonial only:`;

    const result = await generateWithRetry(prompt, OPENROUTER_API_KEY);

    if (result.success) {
      let testimonial = result.content.replace(/^["'\*]|["'\*]$/g, '').trim();

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

    return res.status(200).json({ success: false, error: 'All models failed' });

  } catch (error) {
    return res.status(200).json({ error: error.message });
  }
}
