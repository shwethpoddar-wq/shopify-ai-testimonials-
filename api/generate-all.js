import axios from 'axios';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!GEMINI_API_KEY || !SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
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

        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.9, maxOutputTokens: 200 }
          }
        );

        let testimonial = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text;

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

        await delay(5000);

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
