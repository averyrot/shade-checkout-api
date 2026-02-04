// api/cleanup-drafts.js
// Cron job to delete draft orders older than 30 minutes

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Verify this is a cron request or authorized request
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  // Allow cron (Vercel adds this header) or manual trigger with secret
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;
  
  // For GET requests (health check), allow without auth
  if (req.method === 'GET' && !isVercelCron) {
    return res.status(200).json({
      status: 'ok',
      message: 'Draft order cleanup endpoint',
      description: 'Deletes draft orders older than 30 minutes',
      schedule: 'Runs every 30 minutes via Vercel Cron'
    });
  }

  // For actual cleanup, require authorization
  if (!isVercelCron && !isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'dollarblinds.myshopify.com';
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'API not configured' });
    }

    console.log('Starting draft order cleanup...');

    // Calculate cutoff time (30 minutes ago)
    const cutoffTime = new Date(Date.now() - 30 * 60 * 1000);
    console.log('Cutoff time:', cutoffTime.toISOString());

    // Fetch draft orders
    const listResponse = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/draft_orders.json?status=open&limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    if (!listResponse.ok) {
      const error = await listResponse.text();
      console.error('Failed to fetch draft orders:', error);
      return res.status(500).json({ error: 'Failed to fetch draft orders', details: error });
    }

    const data = await listResponse.json();
    const draftOrders = data.draft_orders || [];

    console.log(`Found ${draftOrders.length} open draft orders`);

    // Filter orders older than 30 minutes
    const oldDrafts = draftOrders.filter(order => {
      const createdAt = new Date(order.created_at);
      return createdAt < cutoffTime;
    });

    console.log(`Found ${oldDrafts.length} draft orders older than 30 minutes`);

    // Delete old draft orders
    const results = {
      checked: draftOrders.length,
      deleted: 0,
      failed: 0,
      details: []
    };

    for (const draft of oldDrafts) {
      try {
        const deleteResponse = await fetch(
          `https://${SHOPIFY_STORE}/admin/api/2024-01/draft_orders/${draft.id}.json`,
          {
            method: 'DELETE',
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
            }
          }
        );

        if (deleteResponse.ok || deleteResponse.status === 204) {
          console.log(`Deleted draft order ${draft.id} (${draft.name})`);
          results.deleted++;
          results.details.push({
            id: draft.id,
            name: draft.name,
            created_at: draft.created_at,
            status: 'deleted'
          });
        } else {
          const error = await deleteResponse.text();
          console.error(`Failed to delete ${draft.id}:`, error);
          results.failed++;
          results.details.push({
            id: draft.id,
            name: draft.name,
            status: 'failed',
            error: error
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error deleting ${draft.id}:`, error);
        results.failed++;
        results.details.push({
          id: draft.id,
          name: draft.name,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log('Cleanup complete:', results);

    return res.status(200).json({
      success: true,
      message: 'Draft order cleanup complete',
      timestamp: new Date().toISOString(),
      cutoff_time: cutoffTime.toISOString(),
      results: {
        total_checked: results.checked,
        deleted: results.deleted,
        failed: results.failed
      }
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({
      error: 'Cleanup failed',
      message: error.message
    });
  }
}
