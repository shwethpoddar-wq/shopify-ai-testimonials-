// api/webhook.js
// Webhook endpoint for automatic generation on product create

const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function generateTestimonial(productTitle, productDescription) {
  const prompt = `Generate a realistic Indian customer testimonial for this product.

Product Name: ${productTitle}
Product Description: ${productDescription || 'A high-quality product'}

RULES:
- Write in Hinglish (mix of Hindi and English using Roman script)
- Keep it 2-3 lines only
- Sound natural like a real customer wrote it
- Be enthusiastic and positive
- Mention quality, feeling, or experience
- Use common Indian expressions
- NO hashtags, NO emojis, NO quotation marks

Generate ONE testimonial:`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.9,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 200,
        }
      }
    );

    if (response.data.candidates && response.data.candidates[0]) {
      let testimonial = response.data.candidates[0].content.parts[0].text;
      testimonial = testimonial.replace(/^["']|["']$/g, '').trim();
      return testimonial;
    }
    return null;
  } catch (error) {
    console.error('Gemini Error:', error.response?.data || error.message);
    return null;
  }
}

async function saveToShopify(productId, testimonial) {
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const product = req.body;
    
    console.log(`Webhook received for product: ${product.title} (ID: ${product.id})`);

    // Generate testimonial
    const testimonial = await generateTestimonial(
      product.title,
      product.body_html?.replace(/<[^>]*>/g, '')
    );

    if (testimonial) {
      await saveToShopify(product.id, testimonial);
      console.log(`✅ Saved testimonial for: ${product.title}`);
      return res.status(200).json({ success: true, testimonial });
    }

    return res.status(200).json({ success: false, message: 'Could not generate' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(200).json({ error: error.message });
  }
};
