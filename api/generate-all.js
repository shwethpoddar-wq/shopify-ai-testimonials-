const axios = require('axios');

function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

async function generateTestimonial(productTitle, productDescription) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  const prompt = `Generate a realistic Indian customer testimonial for: ${productTitle}. ${productDescription || ''}

Rules:
- Write in Hinglish (Hindi + English in Roman script)
- 2-3 lines only
- Sound natural, enthusiastic, positive
- Mention quality or experience
- NO emojis, NO hashtags, NO quotes, NO labels

Example: Bahut accha product hai yaar! Quality first class hai aur delivery bhi fast thi.

Generate ONE testimonial:`;

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

async function saveToShopify(productId, testimonial) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  try {
    var getResponse = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}/metafields.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    var existingMetafield = null;
    for (var i = 0; i < getResponse.data.metafields.length; i++) {
      var m = getResponse.data.metafields[i];
      if (m.namespace === 'custom' && m.key === 'ai_testimonial') {
        existingMetafield = m;
        break;
      }
    }

    var headers = {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    };

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
        { headers: headers }
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
        { headers: headers }
      );
    }
    
    return true;
  } catch (error) {
    throw error;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN || !GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'Missing environment variables'
    });
  }

  try {
    console.log('Starting bulk generation...');

    var productsResponse = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    var products = productsResponse.data.products;
    var results = [];

    console.log('Found ' + products.length + ' products');

    for (var i = 0; i < products.length; i++) {
      var product = products[i];
      
      try {
        console.log('[' + (i + 1) + '/' + products.length + '] Processing: ' + product.title);

        var description = '';
        if (product.body_html) {
          description = product.body_html.replace(/<[^>]*>/g, '');
        }

        var testimonial = await generateTestimonial(product.title, description);

        if (testimonial) {
          await saveToShopify(product.id, testimonial);
          results.push({
            id: product.id,
            title: product.title,
            testimonial: testimonial,
            success: true
          });
          console.log('Done: ' + product.title);
        } else {
          results.push({
            id: product.id,
            title: product.title,
            success: false,
            error: 'Generation failed'
          });
        }

        await delay(1500);

      } catch (error) {
        console.error('Error for ' + product.title + ':', error.message);
        results.push({
          id: product.id,
          title: product.title,
          success: false,
          error: error.message
        });
      }
    }

    var successCount = 0;
    for (var j = 0; j < results.length; j++) {
      if (results[j].success) {
        successCount++;
      }
    }

    return res.status(200).json({
      message: 'Generated ' + successCount + '/' + products.length + ' testimonials',
      total: products.length,
      success: successCount,
      failed: products.length - successCount,
      results: results
    });

  } catch (error) {
    console.error('Bulk Error:', error);
    return res.status(500).json({ 
      error: error.message 
    });
  }
};
