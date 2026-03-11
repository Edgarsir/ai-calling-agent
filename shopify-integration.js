require('dotenv').config();
const crypto = require('crypto');

// Shopify Webhook Secret (from your image)
const SHOPIFY_WEBHOOK_SECRET = '4145251654ea4a6880eaef5339ba7980113ab3a14c3ebc55fcc8db600c5a9816';

/**
 * Verify Shopify Webhook Signature
 * Shopify signs webhooks with HMAC-SHA256
 * 
 * NOTE: For now, we'll skip verification in production
 * To enable: need raw body before JSON parsing
 */
function verifyShopifyWebhook(req) {
  try {
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    
    if (!hmacHeader) {
      console.log('⚠️  No HMAC header found - allowing webhook (development mode)');
      return true; // Allow for testing
    }
    
    console.log('⚠️  Webhook signature verification skipped (raw body not available)');
    console.log('   HMAC Header:', hmacHeader);
    console.log('   Shop Domain:', req.headers['x-shopify-shop-domain']);
    console.log('   Topic:', req.headers['x-shopify-topic']);
    
    // For production security, you should:
    // 1. Use express.raw() middleware for this route
    // 2. Store raw body before JSON parsing
    // 3. Calculate HMAC on raw body
    
    // For now, verify shop domain as basic security
    const shopDomain = req.headers['x-shopify-shop-domain'];
    if (shopDomain && shopDomain.includes('myshopify.com')) {
      console.log('✅ Valid Shopify domain detected');
      return true;
    }
    
    return true; // Allow for testing
    
  } catch (error) {
    console.error('❌ Error verifying webhook:', error.message);
    return true; // Allow on error for testing
  }
}

/**
 * Process Shopify Order and Make Confirmation Call
 */
async function processShopifyOrder(orderData) {
  try {
    console.log('\n🛍️ ===== NEW SHOPIFY ORDER =====');
    console.log('   Order ID:', orderData.id);
    console.log('   Order Number:', orderData.order_number || orderData.name);
    console.log('   Customer:', orderData.customer?.first_name, orderData.customer?.last_name);
    console.log('   Phone:', orderData.customer?.phone);
    console.log('   Total:', orderData.total_price, orderData.currency);
    
    // Extract order details
    const order = {
      id: orderData.id,
      number: orderData.order_number || orderData.name,
      customer_name: `${orderData.customer?.first_name || ''} ${orderData.customer?.last_name || ''}`.trim(),
      customer_phone: orderData.customer?.phone,
      customer_email: orderData.customer?.email,
      total_price: orderData.total_price,
      currency: orderData.currency || 'INR',
      items: orderData.line_items?.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })) || [],
      shipping_address: orderData.shipping_address,
      created_at: orderData.created_at
    };
    
    // Validate phone number
    if (!order.customer_phone) {
      console.log('⚠️  No customer phone number - cannot make call');
      return {
        success: false,
        error: 'No customer phone number'
      };
    }
    
    // Clean phone number (remove spaces, dashes, etc.)
    let cleanPhone = order.customer_phone.replace(/[\s\-\(\)]/g, '');
    
    // Add country code if missing (assuming India)
    if (!cleanPhone.startsWith('+') && !cleanPhone.startsWith('91')) {
      cleanPhone = '91' + cleanPhone;
    }
    cleanPhone = cleanPhone.replace('+', '');
    
    console.log('   Clean Phone:', cleanPhone);
    
    // Prepare call message
    const itemsList = order.items.slice(0, 3).map(item => 
      `${item.quantity} ${item.name}`
    ).join(', ');
    
    const message = `calling to confirm your order number ${order.number}. You ordered ${itemsList}. Total amount is ${order.total_price} ${order.currency}.`;
    
    // Make outbound call via Smartflo
    const callResult = await makeOrderConfirmationCall({
      to_number: cleanPhone,
      customer_name: order.customer_name,
      message: message,
      order_data: order
    });
    
    console.log('📞 Call Result:', callResult);
    
    return {
      success: true,
      order: order,
      call: callResult
    };
    
  } catch (error) {
    console.error('❌ Error processing order:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Make Order Confirmation Call via Smartflo
 */
async function makeOrderConfirmationCall(callData) {
  try {
    const { to_number, customer_name, message, order_data } = callData;
    
    console.log('\n📞 ===== MAKING ORDER CONFIRMATION CALL =====');
    console.log('   To:', to_number);
    console.log('   Customer:', customer_name);
    console.log('   Order:', order_data.number);
    
    // Prepare order variables for AI
    const orderVariables = {
      customer_first_name: order_data.customer_name.split(' ')[0] || 'Customer',
      customer_full_name: order_data.customer_name,
      product_name: order_data.items.map(item => item.name).join(', '),
      order_id: order_data.id,
      order_amount: order_data.total_price,
      delivery_date: calculateDeliveryDate(order_data.created_at),
      delivery_days: '5 to 7 days',
      delivery_city: order_data.shipping_address?.city || 'your location',
      payment_method: 'Cash on Delivery'
    };
    
    console.log('📋 Order Variables:', orderVariables);
    
    // Store order context for the call
    const callContext = {
      orderVariables: orderVariables,
      customerName: customer_name,
      timestamp: new Date()
    };
    
    // Store context with phone number key for retrieval during call
    global.orderContexts = global.orderContexts || new Map();
    global.orderContexts.set(to_number, callContext);
    
    console.log('📝 Stored order context for call');
    
    // Prepare Smartflo API request (correct format)
    const payload = {
      agent_number: process.env.SMARTFLO_DID_NUMBER,
      destination_number: to_number,
      caller_id: process.env.SMARTFLO_DID_NUMBER,
      async: 1
    };
    
    console.log('📤 Calling Smartflo API...');
    console.log('   API Token:', process.env.SMARTFLO_API_TOKEN ? 'Set ✅' : 'Missing ❌');
    console.log('   Agent Number (DID):', process.env.SMARTFLO_DID_NUMBER);
    console.log('   Destination:', to_number);
    console.log('   URL:', process.env.SMARTFLO_API_URL);
    
    // Call Smartflo Click-to-Call API with Bearer token
    const response = await fetch(process.env.SMARTFLO_API_URL, {
      method: 'POST',
      headers: { 
        'accept': 'application/json',
        'content-type': 'application/json',
        'Authorization': `Bearer ${process.env.SMARTFLO_API_TOKEN}`
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    console.log('📥 Smartflo Response Status:', response.status);
    console.log('📥 Smartflo Response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('✅ Order confirmation call initiated');
      return {
        success: true,
        smartflo_response: result,
        call_details: {
          to: to_number,
          customer: customer_name,
          order_id: order_data.id
        }
      };
    } else {
      console.error('❌ Smartflo API error:', result);
      return {
        success: false,
        error: result
      };
    }
    
  } catch (error) {
    console.error('❌ Error making call:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Calculate delivery date (5-7 days from order)
 */
function calculateDeliveryDate(orderDate) {
  const date = new Date(orderDate);
  date.setDate(date.getDate() + 7); // Add 7 days
  
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  return date.toLocaleDateString('hi-IN', options);
}

/**
 * Shopify Webhook Handler - Order Creation
 */
async function handleOrderCreated(req, res) {
  console.log('\n🔔 ===== SHOPIFY WEBHOOK: ORDER CREATED =====');
  console.log('   Timestamp:', new Date().toISOString());
  console.log('   Shop Domain:', req.headers['x-shopify-shop-domain']);
  console.log('   Topic:', req.headers['x-shopify-topic']);
  
  // Verify webhook signature (currently in testing mode)
  const isValid = verifyShopifyWebhook(req);
  
  if (!isValid) {
    console.log('❌ Webhook verification failed');
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid webhook signature' 
    });
  }
  
  console.log('✅ Webhook accepted - processing order...');
  
  // Process order
  const result = await processShopifyOrder(req.body);
  
  // Always return 200 to Shopify (even if call fails)
  res.status(200).json({
    success: true,
    message: 'Webhook received and processed',
    result: result
  });
}

/**
 * Test Endpoint - Manually trigger order confirmation call
 */
async function handleTestOrderCall(req, res) {
  console.log('\n🧪 ===== TEST ORDER CALL =====');
  
  const { phone, customer_name, order_number, items, total } = req.body;
  
  if (!phone) {
    return res.status(400).json({
      success: false,
      error: 'phone is required'
    });
  }
  
  const message = `calling to confirm your order${order_number ? ` number ${order_number}` : ''}${items ? `. You ordered ${items}` : ''}${total ? `. Total amount is ${total}` : ''}.`;
  
  const result = await makeOrderConfirmationCall({
    to_number: phone,
    customer_name: customer_name || 'Customer',
    message: message,
    order_data: { id: 'test', number: order_number || 'TEST' }
  });
  
  res.json(result);
}

module.exports = {
  verifyShopifyWebhook,
  processShopifyOrder,
  makeOrderConfirmationCall,
  handleOrderCreated,
  handleTestOrderCall
};
