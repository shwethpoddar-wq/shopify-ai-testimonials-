import axios from 'axios';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Fetch all available free models from OpenRouter
async function getFreeModels(apiKey) {
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const models = response.data.data || response.data || [];
    
    // Filter for free models (pricing is 0 or has :free suffix)
    const freeModels = models.filter(model => {
      const id = model.id || '';
      const pricing = model.pricing || {};
      const promptPrice = parseFloat(pricing.prompt || '1');
      const completionPrice = parseFloat(pricing.completion || '1');
      
      // Check if free by pricing or by :free suffix
      const isFreeByPrice = promptPrice === 0 && completionPrice === 0;
      const isFreeByName = id.includes(':free');
      
      return isFreeByPrice || isFreeByName;
    });

    // Sort by context length (prefer larger context)
    freeModels.sort((a, b) => (b.context_length || 0) - (a.context_length || 0));

    // Return model IDs
    return freeModels.map(m => m.id);
  } catch (error) {
    console.error('Error fetching models:', error.message);
    // Fallback list if API fails
    return [
      'deepseek/deepseek-r1:free',
      'deepseek/deepseek-chat:free',
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'mistralai/mistral-small-24b-instruct-2501:free',
      'google/gemma-2-9b-it:free',
      'nvidia/llama-3.1-nemotron-70b-instruct:free'
    ];
  }
}

// Try generating with all available free models
async function generateWithAllModels(prompt, apiKey) {
  const errors = [];
  
  // Get all free models
  const freeModels = await getFreeModels(apiKey);
  
  console.log(`Found ${freeModels.length} free models to try`);

  for (const model of freeModels) {
    try {
      console.log(`Trying: ${model}`);

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 250,
          temperature: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://shopify.com',
            'X-Title': 'Shopify AI Testimonials'
          },
          timeout: 60000
        }
      );

      const content = response.data.choices?.[0]?.message?.content;

      if (content && content.trim().length > 10) {
        console.log(`✅ Success with: ${model}`);
        return { success: true, content, model };
      }
    } catch (error) {
      const status = error.response?.status;
      const msg = error.response?.data?.error?.message || error.message;
      errors.push({ model, status, msg: msg.slice(0, 100) });

      console.log(`❌ Failed ${model}: ${status}`);

      // Rate limited - wait before trying next
      if (status === 429) {
        await delay(3000);
      }

      continue;
    }
  }

  return { success: false, errors, totalTried: freeModels.length };
}

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
    const description = product.body_html?.replace(/<[^>]*>/g, '').slice(0, 300) || '';

    const prompt = `Write a realistic Indian customer review in Hinglish for this product:

Product Name: ${product.title}
Description: ${description}

INSTRUCTIONS:
- Write in Hinglish (Hindi words in English letters mixed with English)
- Keep it exactly 2-3 sentences
- Sound like a real happy Indian customer
- Be enthusiastic and genuine
- Mention product quality, delivery, or value
- Use natural expressions like "yaar", "bhai", "ekdum", "mast"
- DO NOT use any emojis
- DO NOT use hashtags
- DO NOT use quotation marks
- DO NOT add any prefix like "Review:" or "Here's"

EXAMPLES:
- Bahut accha product hai yaar! Quality ekdum first class hai. Delivery bhi time pe aa gayi.
- Kya baat hai bhai! Product dekh ke dil khush ho gaya. Packing bhi solid thi, highly recommended!
- Mujhe toh bahut pasand aaya. Value for money hai definitely. Zaroor try karo!

Now write ONE short review:`;

    // Generate with auto-retry across all free models
    const result = await generateWithAllModels(prompt, OPENROUTER_API_KEY);

    if (!result.success) {
      return res.status(500).json({
        error: 'All AI models failed. Please try again later.',
        models_tried: result.totalTried,
        errors: result.errors.slice(0, 10) // Show first 10 errors
      });
    }

    // Clean up the response
    let testimonial = result.content;
    testimonial = testimonial.replace(/^["'`\*]+|["'`\*]+$/g, '').trim();
    testimonial = testimonial.replace(/\*+/g, '').trim();
    testimonial = testimonial.replace(/^(Review:|Testimonial:|Here's?:?|Here is:?)/i, '').trim();
    testimonial = testimonial.replace(/^["']|["']$/g, '').trim();

    // Save to Shopify metafield
    const metafieldsRes = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}/metafields.json`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } }
    );

    const existing = metafieldsRes.data.metafields.find(
      m => m.namespace === 'custom' && m.key === 'ai_testimonial'
    );

    const shopifyHeaders = {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    };

    if (existing) {
      await axios.put(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/metafields/${existing.id}.json`,
        { metafield: { id: existing.id, value: testimonial, type: 'multi_line_text_field' } },
        { headers: shopifyHeaders }
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
        { headers: shopifyHeaders }
      );
    }

    return res.status(200).json({
      success: true,
      productId,
      title: product.title,
      testimonial,
      model_used: result.model
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    return res.status(500).json({
      error: error.message,
      details: error.response?.data
    });
  }
}
