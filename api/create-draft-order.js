// api/create-draft-order.js

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check for GET requests
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'Draft Orders API ready. Send POST with line_items.',
      configured: !!process.env.SHOPIFY_ACCESS_TOKEN
    });
  }

  // Only POST allowed for creating orders
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get line_items from request body
    const { line_items, note, customer_email } = req.body;

    // Validate - accept both "line_items" and "items"
    const items = line_items || req.body.items;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        error: 'No items provided',
        message: 'Please provide line_items array in request body'
      });
    }

    // Get Shopify credentials
    const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'dollarblinds.myshopify.com';
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({ 
        error: 'API not configured',
        message: 'Missing SHOPIFY_ACCESS_TOKEN'
      });
    }

    // Build line items for Shopify
    const shopifyLineItems = items.map(item => {
      const lineItem = {
        title: item.title || 'Custom Shade',
        price: String(item.price),
        quantity: parseInt(item.quantity) || 1,
        requires_shipping: true,
        taxable: true
      };

      // Add properties if present
      if (item.properties && typeof item.properties === 'object') {
        lineItem.properties = Object.entries(item.properties).map(([name, value]) => ({
          name: String(name),
          value: String(value)
        }));
      }

      return lineItem;
    });

    // Create draft order payload
    const payload = {
      draft_order: {
        line_items: shopifyLineItems,
        note: note || 'Custom Shade Order - Dollar Blinds',
        use_customer_default_address: true,
        tags: 'custom-shade,draft-order-api'
      }
    };

    if (customer_email) {
      payload.draft_order.email = customer_email;
    }

    console.log('Creating draft order:', JSON.stringify(payload, null, 2));

    // Call Shopify API
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/draft_orders.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Shopify error:', data);
      return res.status(response.status).json({
        error: 'Shopify API error',
        details: data
      });
    }

    const draftOrder = data.draft_order;

    if (!draftOrder || !draftOrder.invoice_url) {
      return res.status(500).json({
        error: 'Invalid response from Shopify',
        details: data
      });
    }

    console.log('Draft order created:', draftOrder.id);

    // Return success
    return res.status(200).json({
      success: true,
      draft_order_id: draftOrder.id,
      invoice_url: draftOrder.invoice_url,
      total_price: draftOrder.total_price,
      name: draftOrder.name
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
}
