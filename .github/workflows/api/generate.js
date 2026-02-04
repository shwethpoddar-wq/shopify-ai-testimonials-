// api/generate.js
// Generates testimonial for a single product

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

Examples:
- Bahut accha product hai yaar! Quality ekdum first class. Delivery bhi time pe aayi.
- Mujhe toh bahut pasand aaya. Value for money hai definitely. Highly recommend!
- Kya baat hai bhai! Product dekh ke dil khush ho gaya. Packaging bhi solid thi.

Now generate ONE testimonial (without quotes):`;

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
  try {
    // First, try to get existing metafield
    const getResponse = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}/metafields.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    const existingMetafield = getResponse.data.metafields.find(
      m => m.namespace === 'custom' && m.key === 'ai_testimonial'
    );

    if (existingMetafield) {
      // Update existing metafield
      await axios.put(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/metafields/${existingMetafield.id}.json`,
        {
          metafield: {
            id: existingMetafield.id,
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
    } else {
      // Create new metafield
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
    
    return true;
  } catch (error) {
    console.error('Shopify Error:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const productId = req.query.productId || req.body?.productId;

    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    console.log(`Generating testimonial for product: ${productId}`);

    // Get product details
    const productResponse = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    const product = productResponse.data.product;

    // Generate testimonial
    const testimonial = await generateTestimonial(
      product.title,
      product.body_html?.replace(/<[^>]*>/g, '')
    );

    if (testimonial) {
      await saveToShopify(productId, testimonial);
      return res.status(200).json({ 
        success: true, 
        productId,
        productTitle: product.title,
        testimonial 
      });
    } else {
      return res.status(500).json({ error: 'Failed to generate testimonial' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
