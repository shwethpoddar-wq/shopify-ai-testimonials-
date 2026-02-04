const axios = require('axios');

async function generateTestimonial(productTitle, productDescription) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  const prompt = `Generate a realistic Indian customer testimonial for: ${productTitle}. ${productDescription || ''}

Rules:
- Write in Hinglish (Hindi + English in Roman script)
- 2-3 lines only
- Sound natural, enthusiastic, positive
- NO emojis, NO hashtags, NO quotes

Generate ONE testimonial:`;

  try {
    var response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
      }
    );

    if (response.data.candidates && response.data.candidates[0]) {
      var testimonial = response.data.candidates[0].content.parts[0].text;
      testimonial = testimonial.replace(/^["']|["']$/g, '').trim();
      return testimonial;
    }
    return null;
  } catch (error) {
    console.error('Gemini Error:', error.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN || !GEMINI_API_KEY) {
    return res.status(200).json({ error: 'Missing environment variables' });
  }

  try {
    var product = req.body;
    
    if (!product || !product.id) {
      return res.status(200).json({ error: 'No product data received' });
    }

    console.log('Webhook received for product:', product.title, '(ID:', product.id, ')');

    var description = '';
    if (product.body_html) {
      description = product.body_html.replace(/<[^>]*>/g, '');
    }

    var testimonial = await generateTestimonial(product.title, description);

    if (testimonial) {
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

      console.log('Saved testimonial for:', product.title);
      
      return res.status(200).json({ 
        success: true, 
        productId: product.id,
        testimonial: testimonial
      });
    }

    return res.status(200).json({ 
      success: false, 
      message: 'Could not generate testimonial' 
    });

  } catch (error) {
    console.error('Webhook Error:', error.message);
    return res.status(200).json({ 
      error: error.message 
    });
  }
};
