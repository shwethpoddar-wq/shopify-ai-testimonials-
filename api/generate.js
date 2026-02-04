import axios from 'axios';

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

Generate ONE testimonial only:`;

    // Call OpenRouter API
    const aiRes = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemma-3-1b-it:free',
        messages: [
          { role: 'user', content: prompt }
        ],
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

    let testimonial = aiRes.data.choices?.[0]?.message?.content || null;

    if (!testimonial) {
      return res.status(500).json({ error: 'Failed to generate testimonial' });
    }

    testimonial = testimonial.replace(/^["']|["']$/g, '').trim();

    // Check for existing metafield
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
