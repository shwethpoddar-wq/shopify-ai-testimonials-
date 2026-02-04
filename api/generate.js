import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!GEMINI_API_KEY || !SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({
      error: 'Missing environment variables',
      required: ['GEMINI_API_KEY', 'SHOPIFY_STORE', 'SHOPIFY_ACCESS_TOKEN']
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
- NO emojis, NO hashtags, NO quotes

Example: Bahut accha product hai yaar! Quality first class. Delivery bhi fast thi.

Generate ONE testimonial:`;

    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 200 }
      }
    );

    let testimonial = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!testimonial) {
      return res.status(500).json({ error: 'Failed to generate testimonial' });
    }

    testimonial = testimonial.replace(/^["']|["']$/g, '').trim();

    const metafieldsRes = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}/metafields.json`,
      {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
      }
    );

    const existing = metafieldsRes.data.metafields.find(
      m => m.namespace === 'custom' && m.key === 'ai_testimonial'
    );

    if (existing) {
      await axios.put(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/metafields/${existing.id}.json`,
        {
          metafield: { id: existing.id, value: testimonial, type: 'multi_line_text_field' }
        },
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
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
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    return res.status(200).json({
      success: true,
      productId,
      title: product.title,
      testimonial
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    return res.status(500).json({
      error: error.message,
      details: error.response?.data
    });
  }
}
