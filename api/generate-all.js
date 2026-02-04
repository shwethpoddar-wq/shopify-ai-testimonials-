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
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen-2.5-72b-instruct:free'
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
      if (error.response?.status === 429) {
        await delay(3000);
      }
      continue;
    }
  }

  return { success: false };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!OPENROUTER_API_KEY || !SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  try {
    const productsRes = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=25`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } }
    );

    const products = productsRes.data.products;
    const results = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      try {
        const prompt = `Write a short Hinglish customer review for: ${product.title}. 2-3 sentences, positive, natural, like a happy Indian customer. No emojis, no hashtags. Example: Bahut accha product hai yaar! Quality mast hai.`;

        const result = await generateWithAllModels(prompt, OPENROUTER_API_KEY);

        if (result.success) {
          let testimonial = result.content.replace(/^["'`\*]+|["'`\*]+$/g, '').trim();
          testimonial = testimonial.replace(/^(Review:|Here's?:?)/i, '').trim();

          const metafieldsRes = await axios.get(
            `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${product.id}/metafields.json`,
            { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } }
          );

          const existing = metafieldsRes.data.metafields.find(
            m => m.namespace === 'custom' && m.key === 'ai_testimonial'
          );

          const headers = {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          };

          if (existing) {
            await axios.put(
              `https://${SHOPIFY_STORE}/admin/api/2024-01/metafields/${existing.id}.json`,
              { metafield: { id: existing.id, value: testimonial, type: 'multi_line_text_field' } },
              { headers }
            );
          } else {
            await axios.post(
              `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${product.id}/metafields.json`,
              { metafield: { namespace: 'custom', key: 'ai_testimonial', value: testimonial, type: 'multi_line_text_field' } },
              { headers }
            );
          }

          results.push({ id: product.id, title: product.title, testimonial, model: result.model, success: true });
        } else {
          results.push({ id: product.id, title: product.title, success: false, error: 'Generation failed' });
        }

        await delay(5000);

      } catch (err) {
        results.push({ id: product.id, title: product.title, error: err.message, success: false });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return res.status(200).json({
      message: `Generated ${successCount}/${products.length} testimonials`,
      total: products.length,
      success: successCount,
      results
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
