// api/health.js

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'dollarblinds.myshopify.com';
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  let shopifyInfo = { connected: false };

  // Test Shopify connection
  if (SHOPIFY_ACCESS_TOKEN) {
    try {
      const response = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        shopifyInfo = {
          connected: true,
          shopName: data.shop.name,
          shopDomain: data.shop.domain,
          plan: data.shop.plan_name
        };
      }
    } catch (e) {
      shopifyInfo = { connected: false, error: e.message };
    }
  }

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'shade-checkout-api',
    version: '1.0.0',
    config: {
      shopifyStore: SHOPIFY_STORE ? '✓ Set' : '✗ Missing',
      apiToken: SHOPIFY_ACCESS_TOKEN ? '✓ Set' : '✗ Missing'
    },
    shopify: shopifyInfo
  });
}
