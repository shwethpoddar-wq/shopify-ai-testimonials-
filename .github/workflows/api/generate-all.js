// api/generate-all.js
// Generate testimonials for ALL products at once

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
    console.error('Gemini Error:', error.message);
    return null;
  }
}

async function saveToShopify(productId, testimonial) {
  try {
    const getResponse = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}/metafields.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    const existingMetafield = getResponse.data.metafields.find(
      m => m.namespace === 'custom' && m.key === 'ai_testimonial'
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
    throw error;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('Starting bulk generation...');

    // Get all products
    const productsResponse = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    const products = productsResponse.data.products;
    const results = [];

    console.log(`Found ${products.length} products`);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      try {
        console.log(`[${i + 1}/${products.length}] Processing: ${product.title}`);

        const testimonial = await generateTestimonial(
          product.title,
          product.body_html?.replace(/<[^>]*>/g, '')
        );

        if (testimonial) {
          await saveToShopify(product.id, testimonial);
          results.push({
            id: product.id,
            title: product.title,
            testimonial,
            success: true
          });
          console.log(`✅ Done: ${product.title}`);
        } else {
          results.push({
            id: product.id,
            title: product.title,
            success: false,
            error: 'Generation failed'
          });
        }

        // Wait 1.5 seconds between requests to avoid rate limits
        await delay(1500);

      } catch (error) {
        console.error(`❌ Error for ${product.title}:`, error.message);
        results.push({
          id: product.id,
          title: product.title,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    return res.status(200).json({
      message: `Generated ${successCount}/${products.length} testimonials`,
      results
    });

  } catch (error) {
    console.error('Bulk Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
