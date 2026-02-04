import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Missing OPENROUTER_API_KEY' });
  }

  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` }
    });

    const models = response.data.data || response.data || [];
    
    const freeModels = models.filter(model => {
      const id = model.id || '';
      const pricing = model.pricing || {};
      const promptPrice = parseFloat(pricing.prompt || '1');
      const completionPrice = parseFloat(pricing.completion || '1');
      
      return (promptPrice === 0 && completionPrice === 0) || id.includes(':free');
    });

    return res.status(200).json({
      total_models: models.length,
      free_models_count: freeModels.length,
      free_models: freeModels.map(m => ({
        id: m.id,
        name: m.name,
        context_length: m.context_length
      }))
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
