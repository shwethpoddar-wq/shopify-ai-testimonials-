// api/index.js
// Health check endpoint

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.status(200).json({
    status: 'OK',
    message: 'Shopify AI Testimonial Generator is running!',
    endpoints: {
      generate: 'POST /api/generate?productId=YOUR_PRODUCT_ID',
      generateAll: 'POST /api/generate-all',
      webhook: 'POST /api/webhook'
    },
    timestamp: new Date().toISOString()
  });
};
