import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!GEMINI_API_KEY || !SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
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

      return res.status(200).json({ success: true, testimonial });
    }

    return res.status(200).json({ success: false });

  } catch (error) {
    return res.status(200).json({ error: error.message });
  }
}
