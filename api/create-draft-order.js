// Vercel API Endpoint: /api/create-draft-order.js
// Version: 2.1 - Updated Feb 7, 2025
// Added variant_id support for product images in checkout

export default async function handler(req, res) {
  console.log('=== INCOMING REQUEST ===');
  console.log('Version: 2.1 - Feb 7 2025');
  
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

    console.log('Line items received:', JSON.stringify(line_items, null, 2));

    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return res.status(400).json({ error: 'line_items array is required' });
    }

    // Build draft order line items
    const draftLineItems = line_items.map((item, index) => {
      console.log(`--- Processing item ${index + 1} ---`);
      
      // Convert properties from object to array format for Shopify
      const propertiesArray = [];
      if (item.properties && typeof item.properties === 'object') {
        Object.entries(item.properties).forEach(([name, value]) => {
          // Skip internal properties (those starting with _)
          if (value && !name.startsWith('_')) {
            propertiesArray.push({ name, value: String(value) });
          }
        });
      }
      
      console.log('Properties count:', propertiesArray.length);

      // Check if we have a variant_id
      const hasVariantId = item.variant_id && String(item.variant_id).length > 0;
      console.log('Has variant_id:', hasVariantId, '| Value:', item.variant_id || 'none');

      let lineItem;

      if (hasVariantId) {
        // WITH VARIANT ID - Product image will show in checkout
        lineItem = {
          variant_id: parseInt(item.variant_id),
          quantity: parseInt(item.quantity) || 1,
          properties: propertiesArray
        };
        
        // Set custom price
        if (item.price) {
          lineItem.price = String(item.price);
        }
        
        console.log('Created line item WITH variant_id (image will show)');
        
      } else {
        // WITHOUT VARIANT ID - Custom line item (no image in checkout)
        lineItem = {
          title: item.title || 'Custom Shade',
          price: String(item.price),
          quantity: parseInt(item.quantity) || 1,
          requires_shipping: true,
          taxable: true,
          properties: propertiesArray
        };
        
        console.log('Created CUSTOM line item (no image in checkout)');
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

    console.log('Sending to Shopify...');

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
      console.error('Shopify API error:', JSON.stringify(shopifyData, null, 2));
      return res.status(shopifyResponse.status).json({
        error: shopifyData.errors || 'Failed to create draft order',
        details: shopifyData
      });
    }

    const draftOrder = shopifyData.draft_order;
    console.log('SUCCESS - Draft order created:', draftOrder.id);

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
