module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  return res.status(200).json({
    status: 'OK',
    message: 'Shopify AI Testimonial Generator is running!',
    endpoints: {
      health: 'GET /',
      generate: 'GET or POST /api/generate?productId=YOUR_PRODUCT_ID',
      generateAll: 'GET or POST /api/generate-all',
      webhook: 'POST /api/webhook'
    },
    timestamp: new Date().toISOString()
  });
};
