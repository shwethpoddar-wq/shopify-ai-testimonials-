import axios from 'axios';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getFreeModels(apiKey) {
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const models = response.data.data || response.data || [];
    
    const freeModels = models.filter(model => {
      const id = model.id || '';
      const pricing = model.pricing || {};
      const promptPrice = parseFloat(pricing.prompt || '1');
      const completionPrice = parseFloat(pricing.completion || '1');
      
      return (promptPrice === 0 && completionPrice === 0) || id.includes(':free');
    });

    return freeModels.map(m => m.id);
  } catch (error) {
    return [
      'deepseek/deepseek-r1:free',
      'deepseek/deepseek-chat:free',
      'google/gemini-2.0-flash-exp:free'
    ];
  }
}

async function generateWithAllModels(prompt, apiKey) {
  const freeModels = await getFreeModels(apiKey);

  for (const model of freeModels) {
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 250,
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
        return { success: true, content, model };
      }
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

    const prompt = `Write a short Hinglish review for: ${product.title}. 2-3 sentences, positive, like a happy Indian customer. No emojis.`;

    const result = await generateWithAllModels(prompt, OPENROUTER_API_KEY);

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

    return res.status(200).json({ success: false, error: 'All models failed' });

  } catch (error) {
    return res.status(200).json({ error: error.message });
  }
}
