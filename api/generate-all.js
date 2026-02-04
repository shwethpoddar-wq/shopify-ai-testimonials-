import axios from 'axios';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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
Rules: Hinglish, 2-3 lines, natural, positive, no emojis/hashtags.
Generate ONE:`;

        const aiRes = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: 'google/gemma-3-1b-it:free',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.9
          },
          {
            headers: {
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://shopify.com',
              'X-Title': 'Shopify AI Testimonials'
            }
          }
        );

        let testimonial = aiRes.data.choices?.[0]?.message?.content;

        if (testimonial) {
          testimonial = testimonial.replace(/^["']|["']$/g, '').trim();

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

          results.push({ id: product.id, title: product.title, testimonial, success: true });
        }

        await delay(3000);

      } catch (err) {
        results.push({ id: product.id, title: product.title, error: err.message, success: false });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return res.status(200).json({
      message: `Generated ${successCount}/${products.length} testimonials`,
      results
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
