import axios from 'axios';

const FREE_MODELS = [
  'qwen/qwen-2.5-7b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.2-1b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free',
  'openchat/openchat-7b:free'
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
  res.setHeader('Access-Control-Allow-Origin', '*');

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!OPENROUTER_API_KEY || !SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  try {
    const productsRes = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=50`,
      {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
      }
    );

    const products = productsRes.data.products;
    const results = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      try {
        const description = product.body_html?.replace(/<[^>]*>/g, '') || '';

        const prompt = `Generate Indian customer testimonial for: ${product.title}. ${description}

Rules: Hinglish (Hindi+English in Roman script), 2-3 lines, natural, positive, no emojis/hashtags.

Example: Bahut accha product hai yaar! Quality first class.

Generate ONE testimonial only:`;

        const result = await generateWithRetry(prompt, OPENROUTER_API_KEY);

        if (result.success) {
          let testimonial = result.content.replace(/^["'\*]|["'\*]$/g, '').trim();

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

          results.push({
            id: product.id,
            title: product.title,
            testimonial,
            model: result.model,
            success: true
          });
        } else {
          results.push({ id: product.id, title: product.title, success: false, error: 'Generation failed' });
        }

        // Wait between products to avoid rate limits
        await delay(3000);

      } catch (err) {
        results.push({ id: product.id, title: product.title, error: err.message, success: false });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return res.status(200).json({
      message: `Generated ${successCount}/${products.length} testimonials`,
      total: products.length,
      success: successCount,
      failed: products.length - successCount,
      results
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
