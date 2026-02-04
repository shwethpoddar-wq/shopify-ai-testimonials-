const axios = require('axios');

async function generateTestimonial(productTitle, productDescription) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  const prompt = `Generate a realistic Indian customer testimonial for this product.

Product Name: ${productTitle}
Product Description: ${productDescription || 'A high-quality product'}

STRICT RULES:
- Write in Hinglish (mix of Hindi and English using Roman script)
- Keep it 2-3 lines maximum
- Sound natural like a real Indian customer wrote it
- Be enthusiastic and positive
- Mention quality, feeling, or experience
- Use common Indian expressions like "yaar", "bhai", "ekdum", "bahut"
- DO NOT use emojis
- DO NOT use hashtags
- DO NOT use quotation marks
- DO NOT start with "Review:" or any label

GOOD EXAMPLES:
- Bahut accha product hai yaar! Quality ekdum first class. Delivery bhi time pe aayi.
- Mujhe toh bahut pasand aaya. Value for money hai definitely. Highly recommend karunga sabko!
- Kya baat hai bhai! Product dekh ke dil khush ho gaya. Packaging bhi solid thi.

Now generate ONE testimonial (just the text, nothing else):`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
          maxOutputTokens: 200
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.candidates && response.data.candidates[0]) {
      let testimonial = response.data.candidates[0].content.parts[0].text;
      testimonial = testimonial.replace(/^["']|["']$/g, '').trim();
      testimonial = testimonial.replace(/^Review:\s*/i, '').trim();
      return testimonial;
    }
    return null;
  } catch (error) {
    console.error('Gemini API Error:', error.response?.data || error.message);
    throw error;
  }
}

async function saveToShopify(productId, testimonial) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  try {
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
      function(m) {
        return m.namespace === 'custom' && m.key === 'ai_testimonial';
      }
    );

    if (existingMetafield) {
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
    console.error('Shopify API Error:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN || !GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'Missing environment variables',
      required: ['SHOPIFY_STORE', 'SHOPIFY_ACCESS_TOKEN', 'GEMINI_API_KEY']
    });
  }

  try {
    var productId = req.query.productId;
    
    if (req.body && req.body.productId) {
      productId = req.body.productId;
    }

    if (!productId) {
      return res.status(400).json({ 
        error: 'productId is required',
        usage: '/api/generate?productId=YOUR_PRODUCT_ID'
      });
    }

    console.log('Generating testimonial for product:', productId);

    var productResponse = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    var product = productResponse.data.product;
    var description = '';
    
    if (product.body_html) {
      description = product.body_html.replace(/<[^>]*>/g, '');
    }

    var testimonial = await generateTestimonial(product.title, description);

    if (testimonial) {
      await saveToShopify(productId, testimonial);
      
      return res.status(200).json({ 
        success: true, 
        productId: productId,
        productTitle: product.title,
        testimonial: testimonial
      });
    } else {
      return res.status(500).json({ 
        error: 'Failed to generate testimonial from Gemini'
      });
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    
    return res.status(500).json({ 
      error: error.message,
      details: error.response?.data || null
    });
  }
};
