// Vercel API Endpoint: /api/create-draft-order.js
// This handles draft order creation with custom pricing AND product images

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { line_items, note, customer } = req.body;

    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return res.status(400).json({ error: 'line_items array is required' });
    }

    // Build draft order line items
    const draftLineItems = line_items.map(item => {
      // Convert properties from object to array format for Shopify
      const propertiesArray = [];
      if (item.properties && typeof item.properties === 'object') {
        Object.entries(item.properties).forEach(([name, value]) => {
          if (value && !name.startsWith('_')) {  // Skip internal properties
            propertiesArray.push({ name, value: String(value) });
          }
        });
      }

      // Build the line item
      const lineItem = {
        quantity: parseInt(item.quantity) || 1,
        properties: propertiesArray
      };

      // If variant_id is provided, use it (this enables product image in checkout)
      if (item.variant_id) {
        lineItem.variant_id = parseInt(item.variant_id);
        // When using variant_id, we need to set price as a string
        // This will override the variant's default price
        lineItem.price = item.price;
        console.log(`Line item with variant ${item.variant_id}, custom price: $${item.price}`);
      } else {
        // Custom line item (no variant) - no image in checkout
        lineItem.title = item.title || 'Custom Shade';
        lineItem.price = item.price;
        lineItem.requires_shipping = true;
        lineItem.taxable = true;
        console.log(`Custom line item: ${lineItem.title}, price: $${item.price}`);
      }

      return lineItem;
    });

    // Build the draft order payload
    const draftOrderPayload = {
      draft_order: {
        line_items: draftLineItems,
        use_customer_default_address: true
      }
    };

    // Add note if provided
    if (note) {
      draftOrderPayload.draft_order.note = note;
    }

    // Add customer if provided
    if (customer && customer.email) {
      draftOrderPayload.draft_order.customer = {
        email: customer.email
      };
    }

    console.log('Creating draft order:', JSON.stringify(draftOrderPayload, null, 2));

    // Create draft order via Shopify Admin API
    const shopifyResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/draft_orders.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
        },
        body: JSON.stringify(draftOrderPayload)
      }
    );

    const shopifyData = await shopifyResponse.json();

    if (!shopifyResponse.ok) {
      console.error('Shopify API error:', shopifyData);
      return res.status(shopifyResponse.status).json({
        error: shopifyData.errors || 'Failed to create draft order',
        details: shopifyData
      });
    }

    const draftOrder = shopifyData.draft_order;
    console.log('Draft order created:', draftOrder.id);

    // Return the invoice URL for checkout
    return res.status(200).json({
      success: true,
      draft_order_id: draftOrder.id,
      invoice_url: draftOrder.invoice_url,
      total_price: draftOrder.total_price,
      subtotal_price: draftOrder.subtotal_price,
      total_tax: draftOrder.total_tax
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
