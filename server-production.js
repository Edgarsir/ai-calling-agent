require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const os = require('os');
const Groq = require('groq-sdk');
const { VertexAI } = require('@google-cloud/vertexai');
const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming');
const { handleOrderCreated, handleTestOrderCall } = require('./shopify-integration');

const app = express();
const PORT = process.env.PORT || 3000;

// Production logging optimization
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Initialize Groq client (ULTRA FAST AI - Fallback)
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Initialize Vertex AI client (Gemini 2.5 Flash - PRIMARY AI)
let vertexAI;
try {
  const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  vertexAI = new VertexAI({
    project: process.env.GOOGLE_PROJECT_ID,
    location: process.env.GOOGLE_LOCATION || 'us-central1',
    googleAuthOptions: {
      credentials: googleCredentials
    }
  });
  console.log('✅ Vertex AI initialized (Gemini 2.5 Flash)');
  console.log('   Project:', process.env.GOOGLE_PROJECT_ID);
  console.log('   Location:', process.env.GOOGLE_LOCATION || 'us-central1');
  console.log('   Service Account:', googleCredentials.client_email);
} catch (error) {
  console.error('❌ Failed to initialize Vertex AI:', error.message);
  console.error('   Error details:', error);
  console.log('⚠️  Will use Groq as primary AI');
}

// Initialize AWS Transcribe client
const transcribeClient = new TranscribeStreamingClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Shopify Webhook Endpoints
app.post('/api/shopify/order-created', handleOrderCreated);
app.post('/api/shopify/test-call', handleTestOrderCall);

// Store conversation context
const conversations = new Map();
const activeCalls = new Map();

// TTS interruption control
const ttsControllers = new Map(); // Map callSid -> AbortController for TTS interruption

// VOCODE-INSPIRED: Interruption Configuration
const INTERRUPT_CONFIG = {
  minConfidence: 0.5,              // Minimum confidence to trigger interrupt (0.0-1.0)
  minInterruptDurationMs: 300,     // Minimum speech duration to interrupt (ms)
  maxInterruptsPerCall: 15,        // Maximum interrupts allowed per call
  rapidInterruptThresholdMs: 800,  // Minimum time between interrupts (ms)
  enableLogging: true              // Enable detailed interrupt logging
};

// AI Agent Configuration (CONVERSATIONAL: Natural, Detailed, Helpful)
const AGENT_PROMPT = `You are a professional customer support agent for Kaia Bags. You call customers to confirm orders.

CORE RULES:
• Speak naturally like a real human in a friendly conversation
• Give COMPLETE, DETAILED responses (15-25 words per response)
• Be warm, helpful, and informative
• Provide all relevant information without being asked twice
• Never make up information

LANGUAGE HANDLING:
• ALWAYS start in Hindi: "नमस्ते [name], मैं Kaia Bags से बोल रही हूं"
• Stay in Hindi unless customer speaks 2+ full English sentences
• Match customer's language in each response
• Allow switching back and forth

RESPONSE STYLE:
• Give FULL details in each response (don't be brief)
• Use 2-3 complete sentences per response
• Include relevant information proactively
• Natural conversation flow with proper context
• Be helpful and informative

CONVERSATION FLOW:
1. Greeting: "नमस्ते [name], मैं Kaia Bags से बोल रही हूं। मैं आपके हाल के ऑर्डर की पुष्टि करने के लिए कॉल कर रही हूं"
2. Order Details: "आपने [product] ऑर्डर किया है जो [color/details] है। कुल राशि [amount] रुपये है"
3. Delivery: "आपका ऑर्डर [date] तक [city] में डिलीवर हो जाएगा। शिप होने पर आपको SMS से ट्रैकिंग डिटेल मिल जाएगी"
4. Questions: Answer with FULL details, don't just give one-word answers
5. Close: "क्या कुछ और जानना चाहेंगे? धन्यवाद। आपका दिन शुभ हो"

COMMON QUESTIONS (Give DETAILED answers):
• Product: "आपने [product name] ऑर्डर किया है जो [color] रंग का है। यह [material/features] है और बहुत अच्छी क्वालिटी का है"
• Delivery: "आपका ऑर्डर [date] तक पहुंच जाएगा। हम [courier] से भेजते हैं और शिप होने पर आपको SMS मिलेगा"
• Amount: "कुल राशि [amount] रुपये है जिसमें प्रोडक्ट प्राइस और डिलीवरी चार्ज शामिल है"
• Tracking: "जैसे ही आपका ऑर्डर शिप होगा, आपको SMS से ट्रैकिंग नंबर मिल जाएगा। उससे आप रियल टाइम में ट्रैक कर सकते हैं"
• Return: "अगर कोई प्रॉब्लम है तो 7 दिन में वापस कर सकते हैं। हमारी टीम आपकी पूरी मदद करेगी"
• Cancel: "मैं आपको हमारी सपोर्ट टीम से जोड़ती हूं जो कैंसलेशन में मदद करेंगे"

IMPORTANT: 
• Don't give one-word or very short answers
• Always provide context and complete information
• Be conversational and natural
• Help customer understand everything clearly`


// Health check endpoint
app.get('/', (req, res) => {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  const wsUrl = publicUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  
  res.json({ 
    status: 'AI Calling Agent - BILINGUAL (Hindi + English) - TRUE STREAMING', 
    timestamp: new Date(),
    server: {
      local: `http://localhost:${PORT}`,
      public: publicUrl,
      websocket: `${wsUrl}/ws/smartflo/audio`
    },
    services: {
      groq: '✅ Enabled (Llama 3.3 70B - PRIMARY - ULTRA FAST!)',
      gemini2Flash: vertexAI ? '✅ Enabled (Fallback - 2K req/min)' : '❌ Disabled',
      awsTranscribe: '✅ Enabled (STT - Hindi/English Auto-Detect)',
      sarvamAI: '✅ Enabled (TTS - Hindi/English 8kHz)',
      smartfloProtocol: '✅ Compliant',
      outboundCalls: '✅ Enabled'
    },
    optimizations: {
      noBufferLayer: '✅ 600ms saved',
      transcribeVAD: '✅ Built-in (automatic)',
      geminiStreaming: '✅ TRUE streaming (no rate limits)',
      sarvamTTS: '✅ WebSocket streaming (200-300ms)',
      targetLatency: '<1000ms (human-like)'
    },
    languages: {
      hindi: '✅ PRIMARY (हिंदी)',
      english: '✅ SECONDARY (English)',
      autoDetect: '✅ Enabled (AWS Transcribe)'
    }
  });
});

// Outgoing Call API - Make AI calls to any number
app.post('/api/make-call', async (req, res) => {
  console.log('\n📞 ===== OUTGOING CALL REQUEST =====');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { to_number, message, customer_name } = req.body;
    
    // Validate phone number
    if (!to_number) {
      return res.status(400).json({ 
        success: false, 
        error: 'to_number is required' 
      });
    }
    
    // Store custom message for this call (optional)
    if (message || customer_name) {
      const callContext = {
        customMessage: message,
        customerName: customer_name,
        timestamp: new Date()
      };
      conversations.set(`outbound_${to_number}`, callContext);
      console.log('📝 Stored call context:', callContext);
    }
    
    // Prepare Smartflo Click-to-Call API request
    const callPayload = {
      api_key: process.env.SMARTFLO_API_KEY,
      api_token: process.env.SMARTFLO_API_TOKEN,
      did_number: process.env.SMARTFLO_DID_NUMBER,
      destination_number: to_number,
      caller_id: process.env.SMARTFLO_DID_NUMBER
    };
    
    console.log('📤 Calling Smartflo API...');
    console.log('   From:', callPayload.did_number);
    console.log('   To:', to_number);
    
    // Call Smartflo Click-to-Call API
    const response = await fetch(process.env.SMARTFLO_API_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callPayload)
    });
    
    const result = await response.json();
    
    console.log('📥 Smartflo Response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('✅ Call initiated successfully!');
      res.json({
        success: true,
        message: 'Call initiated successfully',
        to_number: to_number,
        smartflo_response: result
      });
    } else {
      console.error('❌ Smartflo API error:', result);
      res.status(response.status).json({
        success: false,
        error: 'Failed to initiate call',
        details: result
      });
    }
    
  } catch (error) {
    console.error('❌ Error making outbound call:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API Dialplan endpoint
app.all('/api/dialplan', async (req, res) => {
  console.log('\n📞 ===== INCOMING CALL =====');
  console.log('Method:', req.method);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  const data = req.method === 'POST' ? req.body : req.query;
  
  console.log('Call from:', data.caller_id_number);
  console.log('Call to:', data.call_to_number);
  console.log('Call ID:', data.call_id);
  console.log('UUID:', data.uuid);
  
  // Initialize conversation
  if (data.call_id) {
    conversations.set(data.call_id, []);
  }
  
  // Tell Smartflo what to do with the call
  try {
    console.log('📤 Processing call routing...');
    
    // IMPORTANT: API Dialplan doesn't support direct voice_bot response
    // You must either:
    // 1. Assign DID directly to Voice Bot in Smartflo portal (recommended)
    // 2. Or return empty array [] to let failover handle it
    
    // Option 1: Empty response (let failover route to Voice Bot)
    const response = [];
    
    // Option 2: Play a recording first (if needed)
    // const response = [{
    //   "recording": {
    //     "type": "system",
    //     "data": "your_recording_id"
    //   }
    // }];
    
    console.log('📤 Response:', JSON.stringify(response, null, 2));
    console.log('⚠️  API Dialplan cannot route to Voice Bot directly!');
    console.log('💡 Solution: Assign DID directly to Voice Bot in Smartflo portal');
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ noServer: true });

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;
  
  console.log('🔌 WebSocket upgrade request for:', pathname);
  
  if (pathname === '/voice/stream' || pathname === '/ws/smartflo/audio' || pathname.startsWith('/ws/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    console.log('❌ Rejected WebSocket connection to:', pathname);
    socket.destroy();
  }
});

// WebSocket connection handler - TRUE STREAMING (No Buffer Layer)
wss.on('connection', (ws, req) => {
  console.log('\n🔌 ===== WebSocket Connected =====');
  console.log('   URL:', req.url);
  console.log('   Time:', new Date().toLocaleString());
  
  let streamSid = null;
  let callSid = null;
  let transcribeStream = null; // Active Transcribe streaming session
  let isTranscribing = false; // Lock for transcription processing
  
  // Performance tracking
  let perfTimestamps = {
    T1_audioReceived: 0,
    T2_firstPartial: 0,
    T3_finalTranscript: 0,
    T4_firstAIToken: 0,
    T5_lastAIToken: 0,
    T6_sarvamReturned: 0
  };
  
  // Send connected event (Smartflo protocol)
  try {
    ws.send(JSON.stringify({
      event: 'connected'
    }));
    console.log('✅ Sent connected event');
  } catch (error) {
    console.error('❌ Error sending connected:', error.message);
  }
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // Handle START event
      if (data.event === 'start') {
        console.log('\n📞 ===== CALL STARTED =====');
        streamSid = data.streamSid || data.start?.streamSid;
        callSid = data.start?.callSid;
        
        const direction = data.start?.direction || 'unknown';
        const fromNumber = data.start?.from || data.from;
        const toNumber = data.start?.to || data.to;
        
        console.log('   Stream SID:', streamSid);
        console.log('   Call SID:', callSid);
        console.log('   From:', fromNumber);
        console.log('   To:', toNumber);
        console.log('   Direction:', direction);
        console.log('   Audio Format:', data.start?.mediaFormat?.encoding);
        console.log('   Sample Rate:', data.start?.mediaFormat?.sampleRate);
        
        conversations.set(callSid, []);
        activeCalls.set(callSid, { 
          ws, 
          streamSid,
          startTime: new Date(),
          mediaChunk: 1,
          direction: direction,
          transcribeStream: null,
          sarvamWs: null,  // Persistent Sarvam WebSocket
          sarvamConfigured: false,  // Track if config sent
          sarvamConnecting: false,  // Lock to prevent race conditions
          sarvamConnectionPromise: null,  // Promise for waiting connections
          ttsQueue: [],  // Queue for TTS chunks
          audioBuffer: [],  // Buffer for audio chunks
          isInterrupted: false,  // Flag to stop audio on interruption
          // VOCODE-INSPIRED: Interrupt tracking
          interruptStats: {
            count: 0,
            timestamps: [],
            lastInterruptTime: null,
            successfulInterrupts: 0,
            ignoredInterrupts: 0,
            reasons: []  // Track why interrupts were ignored
          }
        });
        
        // Check if this is an outbound call with custom context
        let greetingPrompt = 'कहें: नमस्ते';
        const outboundContext = conversations.get(`outbound_${toNumber}`);
        
        // Check for order context from Shopify
        const orderContext = global.orderContexts?.get(toNumber);
        
        if (orderContext && orderContext.orderVariables) {
          console.log('� Order context found for call');
          console.log('   Customer:', orderContext.orderVariables.customer_first_name);
          console.log('   Product:', orderContext.orderVariables.product_name);
          console.log('   Amount:', orderContext.orderVariables.order_amount);
          
          // Build greeting with order variables
          const vars = orderContext.orderVariables;
          greetingPrompt = `आप ${vars.customer_first_name} को उनके Kaia Bags ऑर्डर की पुष्टि करने के लिए कॉल कर रहे हैं। 

ऑर्डर विवरण:
- ग्राहक: ${vars.customer_first_name} (${vars.customer_full_name})
- उत्पाद: ${vars.product_name}
- राशि: ${vars.order_amount} रुपये
- डिलीवरी: ${vars.delivery_date} (${vars.delivery_days})
- शहर: ${vars.delivery_city}
- भुगतान: ${vars.payment_method}

कॉल शुरू करें: नमस्ते ${vars.customer_first_name}, मैं Kaia Bags से आपके हाल के ऑर्डर की पुष्टि करने के लिए कॉल कर रही हूं`;
          
          // Store variables in conversation for later use
          conversations.set(callSid, [{
            role: 'system',
            content: `ऑर्डर वेरिएबल: customer_first_name=${vars.customer_first_name}, product_name=${vars.product_name}, order_amount=${vars.order_amount}, delivery_date=${vars.delivery_date}`
          }]);
          
          // Clean up context after use
          global.orderContexts.delete(toNumber);
          
        } else if (direction === 'outbound' || outboundContext) {
          console.log('📤 Outbound call detected');
          
          if (outboundContext) {
            console.log('📝 Using custom context:', outboundContext);
            
            if (outboundContext.customerName && outboundContext.customMessage) {
              greetingPrompt = `आप ${outboundContext.customerName} को Kaia Bags से उनके ऑर्डर की पुष्टि करने के लिए कॉल कर रहे हैं। कहें: नमस्ते ${outboundContext.customerName}, मैं Kaia Bags से कॉल कर रही हूं। ${outboundContext.customMessage} क्या मैं ${outboundContext.customerName} से बात कर रही हूं`;
            } else if (outboundContext.customerName) {
              greetingPrompt = `आप ${outboundContext.customerName} को Kaia Bags से कॉल कर रहे हैं। कहें: नमस्ते ${outboundContext.customerName}, मैं Kaia Bags से आपके ऑर्डर की पुष्टि करने के लिए कॉल कर रही हूं। क्या मैं ${outboundContext.customerName} से बात कर रही हूं`;
            } else if (outboundContext.customMessage) {
              greetingPrompt = `आप Kaia Bags से कॉल कर रहे हैं। कहें: नमस्ते, मैं Kaia Bags से कॉल कर रही हूं। ${outboundContext.customMessage}`;
            }
            
            // Clean up context after use
            conversations.delete(`outbound_${toNumber}`);
          } else {
            greetingPrompt = 'आप Kaia Bags से कॉल कर रहे हैं। कहें: नमस्ते, मैं Kaia Bags से आपके ऑर्डर की पुष्टि करने के लिए कॉल कर रही हूं। मैं किससे बात कर रही हूं';
          }
        }
        
        // Get AI greeting
        const greeting = await getAIResponse(callSid, greetingPrompt);
        console.log('🤖 AI says:', greeting);
        
        // Get callData for TTS
        const callData = activeCalls.get(callSid);
        
        // Convert to speech with Sarvam AI (persistent WebSocket)
        await textToSpeech(greeting, 'hi-IN', ws, streamSid, callData);
      }
      
      // Handle MEDIA event (incoming audio from caller) - TRUE STREAMING
      else if (data.event === 'media') {
        if (callSid && activeCalls.has(callSid)) {
          const callData = activeCalls.get(callSid);
          const audioPayload = data.media?.payload;
          
          if (audioPayload) {
            perfTimestamps.T1_audioReceived = Date.now();
            
            // Convert µ-law to PCM for processing
            const mulawBuffer = Buffer.from(audioPayload, 'base64');
            const pcmBuffer = mulawToPcm(mulawBuffer);
            
            // Initialize Transcribe stream if not exists
            if (!callData.transcribeStream && !isTranscribing) {
              console.log('\n🎤 ===== STARTING TRANSCRIBE STREAM =====');
              isTranscribing = true;
              
              // Start continuous Transcribe streaming
              startTranscribeStream(callSid, streamSid, ws, callData, perfTimestamps)
                .then(() => {
                  console.log('✅ Transcribe stream ended');
                  isTranscribing = false;
                })
                .catch(error => {
                  console.error('❌ Transcribe stream error:', error);
                  isTranscribing = false;
                });
            }
            
            // Stream audio directly to Transcribe (no buffering!)
            if (callData.transcribeStream) {
              try {
                callData.transcribeStream.write(pcmBuffer);
              } catch (error) {
                console.error('❌ Error writing to Transcribe stream:', error.message);
              }
            }
          }
        }
      }
      
      // Handle STOP event
      else if (data.event === 'stop') {
        console.log('\n📞 ===== CALL ENDED =====');
        console.log('   Reason:', data.stop?.reason);
        
        if (callSid && activeCalls.has(callSid)) {
          const callData = activeCalls.get(callSid);
          const duration = (new Date() - callData.startTime) / 1000;
          console.log(`   Duration: ${duration.toFixed(2)}s`);
          
          // VOCODE-INSPIRED: Log interrupt statistics
          if (callData.interruptStats) {
            const stats = getInterruptStats(callData);
            console.log('\n📊 ===== INTERRUPT STATISTICS =====');
            console.log(`   Total Interrupts: ${stats.totalInterrupts}`);
            console.log(`   Successful: ${stats.successfulInterrupts}`);
            console.log(`   Blocked: ${stats.ignoredInterrupts}`);
            console.log(`   Interrupts/min: ${stats.interruptsPerMinute}`);
            console.log(`   Call Duration: ${stats.callDurationSeconds}s`);
            if (stats.blockReasons.length > 0) {
              console.log('   Recent Blocks:', stats.blockReasons.map(r => r.reason).join(', '));
            }
          }
          
          // Close persistent Sarvam WebSocket
          if (callData.sarvamWs && callData.sarvamWs.readyState === WebSocket.OPEN) {
            console.log('   🔌 Closing persistent Sarvam WebSocket...');
            callData.sarvamWs.close();
          }
          
          // Clean up TTS controller
          ttsControllers.delete(callSid);
          
          conversations.delete(callSid);
          activeCalls.delete(callSid);
        }
      }
      
      // Handle MARK event
      else if (data.event === 'mark') {
        console.log('✅ Mark received:', data.mark?.name);
      }
      
      // Handle DTMF event
      else if (data.event === 'dtmf') {
        console.log('📱 DTMF digit:', data.dtmf?.digit);
      }
      
    } catch (error) {
      console.error('❌ Message error:', error.message);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket disconnected');
    if (callSid) {
      // Close persistent Sarvam WebSocket
      const callData = activeCalls.get(callSid);
      if (callData && callData.sarvamWs && callData.sarvamWs.readyState === WebSocket.OPEN) {
        console.log('   🔌 Closing persistent Sarvam WebSocket...');
        callData.sarvamWs.close();
      }
      
      // Clean up TTS controller
      ttsControllers.delete(callSid);
      
      conversations.delete(callSid);
      activeCalls.delete(callSid);
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
  
  // Keep-alive ping
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);
});

// Get AI response using Groq (ULTRA FAST)
async function getAIResponse(callId, userMessage) {
  try {
    if (!conversations.has(callId)) {
      conversations.set(callId, []);
    }
    
    const history = conversations.get(callId);
    history.push({ role: 'user', content: userMessage });
    
    // OPTIMIZATION: Keep only last 10 messages (5 exchanges) for better quality
    const trimmedHistory = history.slice(-10);
    
    // Build conversation history for Groq
    const messages = [
      { role: 'system', content: AGENT_PROMPT },
      ...trimmedHistory
    ];
    
    // Use Groq with Llama 3.3 70B (ULTRA FAST - OPTIMIZED)
    const completion = await groq.chat.completions.create({
      messages: messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,           // OPTIMIZED: Lower for focused responses
      max_tokens: 120,            // OPTIMIZED: Enough for 2-3 complete sentences (matches streaming)
      top_p: 0.9,
      stop: ['\n\n\n', 'धन्यवाद। आपका दिन शुभ हो।', 'Thank you. Have a great day.']  // Only stop on complete closing
    });
    
    const aiResponse = completion.choices[0]?.message?.content?.trim() || 'नमस्ते!';
    history.push({ role: 'assistant', content: aiResponse });
    
    return aiResponse;
  } catch (error) {
    console.error('❌ Groq error:', error.message);
    return 'नमस्ते! मैं आपकी कैसे मदद कर सकती हूं?';
  }
}

// Clean text for TTS - remove special characters that cause weird pronunciation
function cleanTextForTTS(text) {
  return text
    .replace(/[?!*_\[\]{}|\\#~`^$]/g, '')
    .replace(/[@]/g, ' at ')
    .replace(/[&]/g, ' and ')
    .replace(/[+]/g, ' plus ')
    .replace(/[=]/g, ' equals ')
    .replace(/[%]/g, ' percent ')
    .replace(/[\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// VOCODE-INSPIRED: Check if interrupt should be allowed
function shouldAllowInterrupt(callData, confidence = 1.0, transcriptLength = 0) {
  const stats = callData.interruptStats;
  const now = Date.now();
  
  // Check 1: Max interrupts per call
  if (stats.count >= INTERRUPT_CONFIG.maxInterruptsPerCall) {
    if (INTERRUPT_CONFIG.enableLogging) {
      console.log(`   ⚠️ INTERRUPT BLOCKED: Max interrupts reached (${stats.count}/${INTERRUPT_CONFIG.maxInterruptsPerCall})`);
    }
    stats.ignoredInterrupts++;
    stats.reasons.push({ time: now, reason: 'max_interrupts_reached' });
    return false;
  }
  
  // Check 2: Confidence threshold
  if (confidence < INTERRUPT_CONFIG.minConfidence) {
    if (INTERRUPT_CONFIG.enableLogging) {
      console.log(`   ⚠️ INTERRUPT BLOCKED: Low confidence (${confidence.toFixed(2)} < ${INTERRUPT_CONFIG.minConfidence})`);
    }
    stats.ignoredInterrupts++;
    stats.reasons.push({ time: now, reason: 'low_confidence', confidence });
    return false;
  }
  
  // Check 3: Rapid interrupts (prevent spam)
  if (stats.lastInterruptTime && (now - stats.lastInterruptTime) < INTERRUPT_CONFIG.rapidInterruptThresholdMs) {
    if (INTERRUPT_CONFIG.enableLogging) {
      console.log(`   ⚠️ INTERRUPT BLOCKED: Too rapid (${now - stats.lastInterruptTime}ms < ${INTERRUPT_CONFIG.rapidInterruptThresholdMs}ms)`);
    }
    stats.ignoredInterrupts++;
    stats.reasons.push({ time: now, reason: 'too_rapid', timeSinceLastMs: now - stats.lastInterruptTime });
    return false;
  }
  
  // Check 4: Minimum transcript length (avoid noise)
  if (transcriptLength > 0 && transcriptLength < 3) {
    if (INTERRUPT_CONFIG.enableLogging) {
      console.log(`   ⚠️ INTERRUPT BLOCKED: Transcript too short (${transcriptLength} chars)`);
    }
    stats.ignoredInterrupts++;
    stats.reasons.push({ time: now, reason: 'transcript_too_short', length: transcriptLength });
    return false;
  }
  
  return true;
}

// VOCODE-INSPIRED: Track successful interrupt
function trackInterrupt(callData, transcription = '') {
  const stats = callData.interruptStats;
  const now = Date.now();
  
  stats.count++;
  stats.successfulInterrupts++;
  stats.timestamps.push(now);
  stats.lastInterruptTime = now;
  
  if (INTERRUPT_CONFIG.enableLogging) {
    console.log(`   📊 INTERRUPT #${stats.count}: "${transcription}"`);
    console.log(`   📈 Stats: ${stats.successfulInterrupts} successful, ${stats.ignoredInterrupts} blocked`);
  }
}

// VOCODE-INSPIRED: Get interrupt statistics
function getInterruptStats(callData) {
  const stats = callData.interruptStats;
  const callDuration = (Date.now() - callData.startTime.getTime()) / 1000;
  
  return {
    totalInterrupts: stats.count,
    successfulInterrupts: stats.successfulInterrupts,
    ignoredInterrupts: stats.ignoredInterrupts,
    interruptsRemaining: INTERRUPT_CONFIG.maxInterruptsPerCall - stats.count,
    callDurationSeconds: callDuration.toFixed(1),
    interruptsPerMinute: (stats.count / (callDuration / 60)).toFixed(2),
    lastInterruptTime: stats.lastInterruptTime,
    blockReasons: stats.reasons.slice(-5)  // Last 5 block reasons
  };
}

// Stop current TTS for a call - TRUE REAL-TIME INTERRUPTION
async function stopCurrentTTS(callSid) {
  console.log(`🔇 TRUE REAL-TIME INTERRUPTION - Stopping TTS for call: ${callSid}`);
  
  // Stop any ongoing AI generation IMMEDIATELY
  const controller = ttsControllers.get(callSid);
  if (controller) {
    console.log('   ⏹️ Aborting AI generation immediately...');
    controller.abort();
    ttsControllers.delete(callSid);
  }
  
  // Close Sarvam WebSocket IMMEDIATELY (don't wait)
  const callData = activeCalls.get(callSid);
  if (callData) {
    // Mark as interrupted so message handler stops sending audio
    callData.isInterrupted = true;
    console.log('   🚫 Marked as interrupted - stopping audio stream');
    
    // CRITICAL: Send CLEAR command to Smartflo to stop ALL queued audio immediately
    if (callData.ws && callData.streamSid) {
      console.log('   🧹 Sending CLEAR command to stop ALL audio playback immediately...');
      try {
        callData.ws.send(JSON.stringify({
          event: 'clear',
          streamSid: callData.streamSid
        }));
        console.log('   ✅ CLEAR command sent - all audio stopped immediately');
      } catch (e) {
        console.log('   ⚠️ Error sending clear command:', e.message);
      }
      
      // Also send PAUSE marker as backup
      console.log('   ⏸️ Sending PAUSE marker as backup...');
      try {
        callData.ws.send(JSON.stringify({
          event: 'mark',
          streamSid: callData.streamSid,
          mark: {
            name: 'pause_audio'
          }
        }));
        console.log('   ✅ PAUSE marker sent');
      } catch (e) {
        console.log('   ⚠️ Error sending pause marker:', e.message);
      }
    }
    
    if (callData.sarvamWs) {
      console.log('   🔌 Force closing Sarvam WebSocket immediately...');
      try {
        // Force close without waiting
        callData.sarvamWs.close(1000, 'User interrupted');
      } catch (e) {
        console.log('   ⚠️ Error closing WebSocket:', e.message);
      }
    }
    
    // Reset all Sarvam connection state IMMEDIATELY
    callData.sarvamWs = null;
    callData.sarvamConfigured = false;
    callData.sarvamConnecting = false;
    callData.sarvamConnectionPromise = null;
    callData.sarvamHandlerAttached = false;  // Force re-attach handler
    
    // Clear any pending TTS chunks
    callData.ttsQueue = [];
    callData.audioBuffer = [];
    callData.mediaChunk = 1;  // Reset chunk counter
  }
  
  console.log('   ⏳ Waiting 300ms for audio buffer to clear completely...');
  // CRITICAL FIX: Wait for Smartflo buffer to actually clear before continuing
  await new Promise(resolve => setTimeout(resolve, 300));
  console.log('   ✅ Buffer cleared - ready for new response without audio breaks');
}

// Initialize persistent Sarvam WebSocket for the call (OPTIMIZED for minimal latency)
function initializeSarvamWebSocket(callData, detectedLanguage = 'hi-IN') {
  return new Promise((resolve, reject) => {
    console.log('   🔌 Initializing persistent Sarvam WebSocket...');

    const sarvamWs = new WebSocket('wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v2&send_completion_event=true', {
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY
      }
    });

    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      console.error('   ❌ Sarvam WebSocket connection timeout (5s)');
      sarvamWs.close();
      reject(new Error('WebSocket connection timeout'));
    }, 5000);

    // Select voice based on detected language
    const speaker = (detectedLanguage === 'en-IN' || detectedLanguage === 'en-US') 
      ? (process.env.SARVAM_VOICE_ENGLISH || 'shubh')
      : (process.env.SARVAM_VOICE_HINDI || 'ritu');
    const targetLanguage = (detectedLanguage === 'en-IN' || detectedLanguage === 'en-US') ? 'en-IN' : 'hi-IN';

    sarvamWs.on('open', () => {
      clearTimeout(timeout);
      console.log('   ✅ Persistent Sarvam WebSocket connected');

      // OPTIMIZED CONFIG for natural speech clarity
      const configMessage = {
        type: 'config',
        data: {
          target_language_code: targetLanguage,
          speaker: speaker,
          pitch: 0,
          pace: 1.0,                      // OPTIMIZED: Slower pace for clarity (was 1.1)
          loudness: 1.0,                  
          speech_sample_rate: 8000,       // 8kHz for telephony
          enable_preprocessing: true,     // ENABLED for better quality (was false)
          output_audio_codec: 'mulaw'     // µ-law format directly
        }
      };

      console.log('   📤 Sending optimized config (pace: 1.1, natural clarity)');
      sarvamWs.send(JSON.stringify(configMessage));

      callData.sarvamWs = sarvamWs;
      callData.sarvamConfigured = true;
      callData.sarvamSpeaker = speaker;
      callData.sarvamLanguage = targetLanguage;

      resolve(sarvamWs);
    });

    sarvamWs.on('error', (error) => {
      clearTimeout(timeout);
      console.error('   ❌ Persistent Sarvam WebSocket error:', error.message);
      reject(error);
    });

    sarvamWs.on('close', () => {
      clearTimeout(timeout);
      console.log('   🔌 Persistent Sarvam WebSocket closed');
      callData.sarvamWs = null;
      callData.sarvamConfigured = false;
    });
  });
}


// Text-to-Speech using Sarvam AI (Direct WebSocket - Optimized)
// SIMPLIFIED: Direct communication without unnecessary overhead
async function textToSpeech(text, detectedLanguage = 'hi-IN', ws, streamSid, callData) {
  try {
    // Clean text before sending to TTS
    const cleanedText = cleanTextForTTS(text);
    console.log('   Original text:', text);
    console.log('   Cleaned text:', cleanedText);
    console.log('   Text length:', cleanedText.length, 'characters');

    // BEST PRACTICE: Connection lock to prevent race conditions
    // If WebSocket doesn't exist or is closed
    if (!callData.sarvamWs || callData.sarvamWs.readyState !== WebSocket.OPEN) {
      console.log('   ⚠️ Sarvam WebSocket not ready, attempting connection...');
      
      // If another request is already creating the connection, wait for it
      if (callData.sarvamConnecting && callData.sarvamConnectionPromise) {
        console.log('   ⏳ Waiting for existing WebSocket connection...');
        try {
          await Promise.race([
            callData.sarvamConnectionPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 3000))
          ]);
          console.log('   ✅ WebSocket ready, proceeding...');
        } catch (err) {
          console.log('   ⚠️ Connection wait failed:', err.message);
          console.log('   🔄 Creating new connection...');
          callData.sarvamConnecting = false;
          callData.sarvamConnectionPromise = null;
        }
      }
      // If no one is creating the connection, create it now
      if (!callData.sarvamConnecting) {
        console.log('   🔄 Creating persistent Sarvam WebSocket...');
        callData.sarvamConnecting = true;  // Set lock
        
        // Store the promise so other requests can wait for it
        callData.sarvamConnectionPromise = initializeSarvamWebSocket(callData, detectedLanguage)
          .then(() => {
            callData.sarvamConnecting = false;  // Release lock
            callData.sarvamConnectionPromise = null;
            console.log('   ✅ Persistent WebSocket ready for use');
          })
          .catch((error) => {
            callData.sarvamConnecting = false;  // Release lock on error
            callData.sarvamConnectionPromise = null;
            console.error('   ❌ WebSocket connection failed:', error.message);
            throw error;
          });
        
        try {
          await callData.sarvamConnectionPromise;
        } catch (err) {
          console.error('   ❌ Failed to establish WebSocket:', err.message);
          throw err;
        }
      }
    }

    const sarvamWs = callData.sarvamWs;

    if (!sarvamWs || sarvamWs.readyState !== WebSocket.OPEN) {
      console.error('   ❌ CRITICAL: Sarvam WebSocket still not connected after connection attempt');
      console.error('   WebSocket state:', sarvamWs ? `readyState=${sarvamWs.readyState}` : 'null');
      throw new Error('Sarvam WebSocket not available after connection attempt');
    }

    console.log('   ♻️ Reusing persistent Sarvam WebSocket');
    console.log('   🎵 Voice:', callData.sarvamSpeaker, '(', callData.sarvamLanguage, ')');
    console.log('   📊 WebSocket state: OPEN, ready to send');

    // DIRECT PROCESSING: Attach message handler BEFORE sending text
    // IMPORTANT: Always attach fresh handler (old one may be stale)
    console.log('   🌐 Setting up message handler...');
    
    // Remove old listeners to prevent duplicates
    sarvamWs.removeAllListeners('message');
    
    // Reset interrupted flag for this new response
    callData.isInterrupted = false;
    
    // Attach fresh message handler
    const messageHandler = (data) => {
      try {
        // Check if this response was interrupted - if so, ignore audio
        if (callData.isInterrupted) {
          console.log('   🚫 Response interrupted - ignoring audio chunk');
          return;
        }
        
        console.log('   📨 Sarvam message received, size:', data.length, 'bytes');
        
        const message = JSON.parse(data);
        console.log('   📦 Message type:', message.type);

        // Handle audio chunks directly
        if (message.type === 'audio' && message.data && message.data.audio) {
          // Double-check if interrupted (in case flag changed)
          if (callData.isInterrupted) {
            console.log('   🚫 Interrupted - discarding audio chunk');
            return;
          }
          
          console.log('   🎵 Audio chunk received from Sarvam');
          
          // Decode base64 audio chunk
          const audioChunk = Buffer.from(message.data.audio, 'base64');
          console.log('   📊 Audio chunk size:', audioChunk.length, 'bytes');
          
          // Sarvam sends µ-law format directly
          const mulawAudio = audioChunk;

          // STREAM IMMEDIATELY to Smartflo
          if (ws && streamSid && callData) {
            console.log('   📤 Streaming to Smartflo...');
            ws.send(JSON.stringify({
              event: 'media',
              streamSid: streamSid,
              media: {
                payload: mulawAudio.toString('base64'),
                chunk: callData.mediaChunk++
              }
            }));
            console.log(`   ✅ Streamed audio chunk: ${audioChunk.length} bytes to caller`);
          } else {
            console.error('   ❌ Cannot stream - missing ws, streamSid, or callData');
          }
        }
        // Handle completion event
        else if (message.type === 'event' && message.data) {
          const eventType = message.data.event || message.data.event_type;
          console.log('   📌 Event received:', eventType);
          if (eventType === 'completion' || eventType === 'final') {
            console.log(`   ✅ TTS Complete!`);
          }
        }
        // Handle errors
        else if (message.type === 'error') {
          console.error(`   ❌ Sarvam error: ${message.data.message || 'Unknown'}`);
        }
        // Log unknown message types
        else {
          console.log('   ℹ️ Unknown message type:', message.type);
          console.log('   📋 Message:', JSON.stringify(message).substring(0, 100));
        }
      } catch (err) {
        console.error('   ❌ Message handler error:', err.message);
        console.error('   📋 Raw data:', data.toString().substring(0, 200));
      }
    };
    
    sarvamWs.on('message', messageHandler);
    console.log('   ✅ Fresh message handler attached');

    // Send text chunk immediately (direct!)
    const textMessage = {
      type: 'text',
      data: {
        text: cleanedText
      }
    };

    console.log('   📨 Sending text message to Sarvam...');
    sarvamWs.send(JSON.stringify(textMessage));
    console.log(`   ✅ Text sent (direct)`);

    // Send flush to start generation immediately
    console.log('   🔄 Sending flush command...');
    sarvamWs.send(JSON.stringify({
      type: 'flush'
    }));
    console.log('   ✅ Flush sent - TTS generation started');

    return true;

  } catch (error) {
    console.error('❌ Sarvam AI TTS error:', error.message);
    return null;
  }
}

function mulawToPcm(mulawBuffer) {
  const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2);
  
  for (let i = 0; i < mulawBuffer.length; i++) {
    const pcm = mulawToLinear(mulawBuffer[i]);
    pcmBuffer.writeInt16LE(pcm, i * 2);
  }
  
  return pcmBuffer;
}

// µ-law decoding (µ-law to PCM)
function mulawToLinear(mulaw) {
  mulaw = ~mulaw;
  const sign = mulaw & 0x80;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0F;
  
  let sample = ((mantissa << 3) + 0x84) << exponent;
  if (sign) sample = -sample;
  
  return sample;
}

// TRUE STREAMING: Continuous Transcribe stream (no buffering)
async function startTranscribeStream(callSid, streamSid, ws, callData, perfTimestamps) {
  const { PassThrough } = require('stream');
  
  console.log('🎤 Starting continuous Transcribe stream...');
  
  // Create a PassThrough stream for audio chunks
  const audioStream = new PassThrough();
  callData.transcribeStream = audioStream;
  
  // Convert stream to async generator for Transcribe
  async function* audioGenerator() {
    for await (const chunk of audioStream) {
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  }
  
  try {
    const command = new StartStreamTranscriptionCommand({
      // ✅ BILINGUAL CONFIGURATION - Auto Language Identification
      IdentifyLanguage: true,  // Enable automatic language detection
      LanguageOptions: 'hi-IN,en-IN',  // Support Hindi and English
      PreferredLanguage: 'hi-IN',  // Prefer Hindi (matches greeting)
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 8000,
      AudioStream: audioGenerator(),
      EnablePartialResultsStabilization: true,
      PartialResultsStability: 'high'
    });
    
    console.log('🎤 Transcribe Configuration:');
    console.log('   ✅ Auto Language Detection: ENABLED');
    console.log('   ✅ Supported Languages: Hindi (hi-IN), English (en-IN)');
    console.log('   ✅ Preferred Language: Hindi (hi-IN)');
    console.log('   ✅ Sample Rate: 8000 Hz');
    console.log('   ✅ Partial Results: HIGH stability');
    
    const response = await transcribeClient.send(command);
    
    let firstPartialReceived = false;
    let detectedLanguage = null;  // Track detected language
    let isProcessingResponse = false;  // ANTI-OVERLAP: Prevent concurrent AI processing
    
    console.log('✅ Transcribe stream started - listening for speech (Hindi/English auto-detect)...');
    
    // Process transcription results in real-time
    for await (const event of response.TranscriptResultStream) {
      if (event.TranscriptEvent) {
        const results = event.TranscriptEvent.Transcript.Results;
        
        if (results && results.length > 0) {
          const result = results[0];
          
          // Capture detected language
          if (result.LanguageCode && !detectedLanguage) {
            detectedLanguage = result.LanguageCode;
            console.log('\n🌍 ===== LANGUAGE DETECTED =====');
            console.log('   Language:', detectedLanguage === 'hi-IN' ? 'Hindi (हिंदी)' : detectedLanguage === 'en-IN' ? 'English' : detectedLanguage);
            console.log('   Code:', detectedLanguage);
            console.log('   ✅ AWS Transcribe is processing in:', detectedLanguage);
            console.log('   ✅ TTS will use:', detectedLanguage === 'hi-IN' ? 'Hindi voice (Sarvam)' : 'English voice (Sarvam)');
            
            // Store detected language for TTS voice selection
            callData.detectedLanguage = detectedLanguage;
          }
          
          const alternatives = result.Alternatives;
          
          if (alternatives && alternatives.length > 0) {
            const transcript = alternatives[0].Transcript;
            const confidence = alternatives[0].Confidence || 0;
            
            if (!firstPartialReceived && transcript) {
              perfTimestamps.T2_firstPartial = Date.now();
              firstPartialReceived = true;
              console.log('   ⚡ First partial:', Date.now() - perfTimestamps.T1_audioReceived, 'ms');
              
              // VOCODE-INSPIRED: Validate interrupt before allowing
              console.log('   🎤 Speech detected - checking interrupt conditions...');
              console.log('   📊 Confidence:', confidence.toFixed(2), '| Transcript:', transcript.substring(0, 20));
              
              if (shouldAllowInterrupt(callData, confidence, transcript.length)) {
                console.log('   ✅ INTERRUPT ALLOWED - Stopping TTS immediately');
                console.log('   ⏸️ PAUSING to listen to user...');
                trackInterrupt(callData, transcript);
                await stopCurrentTTS(callSid);  // ← Added await
              } else {
                console.log('   ❌ INTERRUPT BLOCKED - Continuing agent speech');
              }
            }
            
            // Final result (after silence detected by Transcribe)
            if (!result.IsPartial && transcript && transcript.trim().length > 0) {
              perfTimestamps.T3_finalTranscript = Date.now();
              
              console.log('\n📝 ===== FINAL TRANSCRIPT (USER FINISHED SPEAKING) =====');
              console.log('   Customer said:', transcript);
              console.log('   Language:', detectedLanguage || 'detecting...');
              console.log('   Language Code:', result.LanguageCode || 'N/A');
              console.log('   Confidence:', confidence.toFixed(2));
              console.log('   Transcript Length:', transcript.length, 'characters');
              console.log('   STT Latency:', perfTimestamps.T3_finalTranscript - perfTimestamps.T1_audioReceived, 'ms');
              console.log('   ✅ User finished speaking - now responding...');
              
              // Detailed language analysis
              if (detectedLanguage === 'hi-IN') {
                console.log('   ✅ Confirmed: Processing as HINDI');
              } else if (detectedLanguage === 'en-IN') {
                console.log('   ✅ Confirmed: Processing as ENGLISH');
              } else {
                console.log('   ⚠️ Language not detected yet, using default: Hindi');
              }
              
              // Note: Confidence is often 0.00 for Hindi, so we process all transcripts
              
              // ANTI-OVERLAP: Only process if not already processing
              if (isProcessingResponse) {
                console.log('   ⏸️ Already processing response, skipping...');
                console.log('   ⚠️ This might indicate a problem - lock should be released');
                return;
              }
              
              console.log('   ✅ Starting AI processing (lock acquired)');
              
              // AGGRESSIVE INTERRUPTION: Stop TTS immediately (don't check if it's running)
              console.log('   🔇 Stopping any ongoing TTS immediately...');
              await stopCurrentTTS(callSid);  // ← Added await
              
              isProcessingResponse = true;  // Set lock
              
              try {
                // Process with AI immediately
                console.log('\n🤖 ===== STREAMING AI → TTS =====');
                await streamAIResponseToTTS(callSid, transcript, streamSid, ws, callData, perfTimestamps);
                
                // Log performance
                const totalLatency = perfTimestamps.T6_sarvamReturned - perfTimestamps.T1_audioReceived;
                console.log('\n📊 ===== PERFORMANCE METRICS =====');
                console.log(`   🎯 Total E2E Latency: ${totalLatency}ms`);
                console.log(`   🎤 STT Latency: ${perfTimestamps.T3_finalTranscript - perfTimestamps.T1_audioReceived}ms`);
                console.log(`   🤖 AI Latency: ${perfTimestamps.T4_firstAIToken - perfTimestamps.T3_finalTranscript}ms`);
                console.log(`   🔊 TTS Latency: ${perfTimestamps.T6_sarvamReturned - perfTimestamps.T4_firstAIToken}ms`);
                console.log(`   ✅ Target: <1000ms | Actual: ${totalLatency}ms | Status: ${totalLatency < 1000 ? '✅ GOOD' : '⚠️ SLOW'}\n`);
                
              } catch (error) {
                console.error('❌ Error processing AI response:', error);
              } finally {
                isProcessingResponse = false;  // Release lock
                console.log('   ✅ AI processing complete (lock released)');
                // Reset timestamp for next turn
                perfTimestamps.T1_audioReceived = Date.now();
              }
            }
            // Partials are logged but not processed (final transcripts only)
          }
        }
      }
    }
    
    console.log('✅ Transcribe stream ended');
    
  } catch (error) {
    console.error('❌ Transcribe stream error:', error.message);
    callData.transcribeStream = null;
  }
}

// Shared chunking logic for both Groq and Gemini
function shouldSendChunk(wordCount, tokenBuffer, firstAudioSent) {
  const hasSentenceEnd = /[.!?।]\s*$/.test(tokenBuffer.trim());
  const hasNaturalBreak = /[,;]\s*$/.test(tokenBuffer.trim());
  
  // FIRST CHUNK: Send immediately with 2-3 words
  if (!firstAudioSent && wordCount >= 2) return true;
  
  // SUBSEQUENT CHUNKS: Continuous flow (4-6 words)
  if (firstAudioSent && ((wordCount >= 4 && hasSentenceEnd) || 
      (wordCount >= 5 && hasNaturalBreak) || wordCount >= 6)) return true;
  
  return false;
}

async function streamAIResponseToTTS(callId, userMessage, streamSid, ws, callData, perfTimestamps) {
  // Create AbortController for this TTS session
  const controller = new AbortController();
  ttsControllers.set(callId, controller);
  
  try {
    if (!conversations.has(callId)) {
      conversations.set(callId, []);
    }

    const history = conversations.get(callId);
    history.push({ role: 'user', content: userMessage });

    // OPTIMIZATION: Keep only last 10 messages (5 exchanges) for better quality
    const trimmedHistory = history.slice(-10);

    // Build conversation history
    const messages = [
      { role: 'system', content: AGENT_PROMPT },
      ...trimmedHistory
    ];

    let aiResponse = '';
    let tokenBuffer = '';
    let wordCount = 0;
    let firstToken = true;
    let firstAudioSent = false;
    let useGemini = false;

    // Try Groq first (PRIMARY - ULTRA FAST!)
    if (groq) {
      try {
        console.log('   Using: Groq (Llama 3.3 70B - PRIMARY - ULTRA FAST!)');
        console.log('   Model: llama-3.3-70b-versatile');

        // Stream response from Groq (BALANCED: Full responses + Fast streaming)
        const stream = await groq.chat.completions.create({
          messages: messages,
          model: 'llama-3.3-70b-versatile',
          temperature: 0.7,           // Focused responses
          max_tokens: 120,            // OPTIMIZED: Enough for 2-3 complete sentences in Hindi
          top_p: 0.9,                 
          stop: ['\n\n\n', 'धन्यवाद। आपका दिन शुभ हो।', 'Thank you. Have a great day.'],  // Only stop on complete closing
          stream: true
        });

        // TRUE STREAMING: Process tokens as they arrive
        for await (const chunk of stream) {
          // Check if TTS was interrupted
          if (controller.signal.aborted) {
            console.log('   ⏹️ AI generation interrupted by user speech');
            break;
          }
          
          const content = chunk.choices[0]?.delta?.content || '';

          if (content) {
            if (firstToken) {
              perfTimestamps.T4_firstAIToken = Date.now();
              console.log('   ⚡ First AI token:', Date.now() - perfTimestamps.T3_finalTranscript, 'ms (GROQ ULTRA FAST ✅)');
              firstToken = false;
            }

            aiResponse += content;
            tokenBuffer += content;

            // Count words in buffer
            const words = tokenBuffer.trim().split(/\s+/);
            wordCount = words.length;

            // CONTINUOUS STREAMING: Use shared chunking logic (Groq primary)
            if (shouldSendChunk(wordCount, tokenBuffer, firstAudioSent)) {
              const textToSpeak = tokenBuffer.trim();

              if (textToSpeak.length > 0) {
                console.log(`   📤 Sending to TTS: "${textToSpeak}" (${wordCount} words)`);

                // Send to TTS in parallel (non-blocking)
                streamTextToSpeechChunk(textToSpeak, streamSid, ws, callData, perfTimestamps, !firstAudioSent)
                  .catch(err => console.error('❌ TTS error:', err.message));

                firstAudioSent = true;
                tokenBuffer = '';
                wordCount = 0;
              }
            }
          }
        }

      } catch (groqError) {
        console.error('❌ Groq error:', groqError.message);
        console.log('   Falling back to Gemini...');
        useGemini = true;
        // Reset for Gemini attempt
        aiResponse = '';
        tokenBuffer = '';
        wordCount = 0;
        firstToken = true;
        firstAudioSent = false;
      }
    } else {
      useGemini = true;
    }

    // Fallback to Gemini if Groq fails or not available
    if (useGemini && vertexAI) {
      console.log('   Using: Gemini 1.5 Flash (Vertex AI - Fallback)');
      console.log('   Model: gemini-1.5-flash-001');

      const generativeModel = vertexAI.getGenerativeModel({
        model: 'gemini-1.5-flash-001',
        systemInstruction: AGENT_PROMPT,
        generationConfig: {
          temperature: 0.7,        
          maxOutputTokens: 120,    // OPTIMIZED: Enough for 2-3 complete sentences in Hindi
          topP: 0.85,              
          topK: 30,                
          stopSequences: ['\n\n\n', 'धन्यवाद। आपका दिन शुभ हो।', 'Thank you. Have a great day.']  // Only stop on complete closing
        }
      });

      // Build chat history for Gemini (exclude system messages and validate)
      const chatHistory = history
        .filter(msg => msg.role !== 'system')
        .filter(msg => msg.content && msg.content.trim().length > 0)  // Validate content
        .map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }));

      const chat = generativeModel.startChat({
        history: chatHistory.slice(0, -1) // Exclude current message
      });

      // Stream response from Gemini
      const result = await chat.sendMessageStream(userMessage);

      console.log('   🌊 Gemini streaming started (Fallback mode)');

      // TRUE STREAMING: Process tokens as they arrive
      let tokenCount = 0;
      for await (const chunk of result.stream) {
        // Check if TTS was interrupted
        if (controller.signal.aborted) {
          console.log('   ⏹️ AI generation interrupted by user speech');
          break;
        }
        
        const content = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (content) {
          tokenCount++;
          
          if (firstToken) {
            perfTimestamps.T4_firstAIToken = Date.now();
            console.log('   ⚡ First AI token received:', Date.now() - perfTimestamps.T3_finalTranscript, 'ms (Gemini Fallback)');
            firstToken = false;
          }

            aiResponse += content;
            tokenBuffer += content;

            // Count words in buffer
            const words = tokenBuffer.trim().split(/\s+/);
            wordCount = words.length;

            // CONTINUOUS STREAMING: Use shared chunking logic (Gemini fallback)
            if (shouldSendChunk(wordCount, tokenBuffer, firstAudioSent)) {
              const textToSpeak = tokenBuffer.trim();

              if (textToSpeak.length > 0) {
                console.log(`   📤 Sending to TTS: "${textToSpeak}" (${wordCount} words)`);

                // Send to TTS in parallel (non-blocking)
                streamTextToSpeechChunk(textToSpeak, streamSid, ws, callData, perfTimestamps, !firstAudioSent)
                  .catch(err => console.error('❌ TTS error:', err.message));

                firstAudioSent = true;
                tokenBuffer = '';
                wordCount = 0;
              }
            }
        }
      }
    }

    // Send any remaining tokens
    if (tokenBuffer.trim().length > 0) {
      console.log(`   📤 Sending final chunk: "${tokenBuffer.trim()}"`);
      await streamTextToSpeechChunk(tokenBuffer.trim(), streamSid, ws, callData, perfTimestamps, !firstAudioSent);
    }

    perfTimestamps.T5_lastAIToken = Date.now();

    aiResponse = aiResponse.trim();
    
    // QUALITY VALIDATION: Ensure response is not empty or too long
    if (!aiResponse || aiResponse.length === 0) {
      console.log('   ⚠️ Empty AI response, using fallback');
      const detectedLanguage = callData.detectedLanguage || 'hi-IN';
      aiResponse = detectedLanguage === 'en-IN' ? 
        'I am here to help you' : 
        'मैं आपकी मदद के लिए यहां हूं';
    }
    
    // QUALITY CHECK: Limit response length (max 3 sentences)
    const sentences = aiResponse.split(/[.!?।]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 3) {
      aiResponse = sentences.slice(0, 3).join('. ') + '.';
      console.log('   ⚠️ Response too long, truncated to 3 sentences');
    }
    
    console.log('   ✅ Complete response: "' + aiResponse + '"');
    console.log('   Total AI time:', perfTimestamps.T5_lastAIToken - perfTimestamps.T3_finalTranscript, 'ms');

    history.push({ role: 'assistant', content: aiResponse });

  } catch (error) {
    console.error('❌ AI error:', error.message);

    // Fallback response
    const fallback = 'नमस्ते! मैं आपकी कैसे मदद कर सकती हूं?';
    await streamTextToSpeechChunk(fallback, streamSid, ws, callData, perfTimestamps, true);
  } finally {
    // Clean up AbortController
    ttsControllers.delete(callId);
  }
}


async function streamTextToSpeechChunk(text, streamSid, ws, callData, perfTimestamps, isFirstChunk) {
  try {
    console.log('   📝 Text chunk:', text);
    console.log('   🔊 Using: Sarvam AI TTS (TRUE STREAMING - WebSocket, NO GAPS)');
    
    const startTime = Date.now();
    
    // Use detected language from callData (set by Transcribe)
    const detectedLanguage = callData.detectedLanguage || 'hi-IN';
    
    console.log('   🌍 Detected Language:', detectedLanguage);
    console.log('   📤 Sending to TTS...');
    
    // TRUE STREAMING: textToSpeech now streams directly to Smartflo via WebSocket
    // NO ARTIFICIAL GAPS - Sarvam handles timing internally for natural, clear audio
    const result = await textToSpeech(text, detectedLanguage, ws, streamSid, callData);
    
    if (!result) {
      console.error('   ❌ TTS failed - no audio sent');
      return;
    }
    
    if (isFirstChunk) {
      perfTimestamps.T6_sarvamReturned = Date.now();
      const ttLatency = perfTimestamps.T6_sarvamReturned - perfTimestamps.T4_firstAIToken;
      console.log('   ⚡ First audio ready:', ttLatency, 'ms from first token');
      console.log('   📊 TTS Latency:', ttLatency, 'ms (target: <500ms)');
    }
    
    const chunkLatency = Date.now() - startTime;
    console.log(`   ✅ Audio streaming complete! (${chunkLatency}ms total, smooth playback)`);
    
  } catch (error) {
    console.error('❌ TTS chunk error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Voice Activity Detection removed - Transcribe handles this automatically with built-in VAD

// Start server
server.listen(PORT, () => {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  const wsUrl = publicUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  
  console.log('\n🚀 ===== AI Calling Agent Started (BILINGUAL - Hindi + English) =====');
  console.log('📍 Port:', PORT);
  console.log('💻 Platform:', os.platform(), os.arch());
  console.log('\n🌐 Public URLs:');
  console.log('   HTTP:', publicUrl);
  console.log('   WebSocket:', wsUrl + '/ws/smartflo/audio');
  console.log('\n🔗 Endpoints:');
  console.log('   API Dialplan:', publicUrl + '/api/dialplan');
  console.log('   Health:', publicUrl + '/');
  console.log('\n🎙️ Services (BILINGUAL - TRUE STREAMING):');
  console.log('   ✅ Groq AI (Llama 3.3 70B - PRIMARY - ULTRA FAST!)');
  console.log('   ✅ Gemini 2.0 Flash (Vertex AI - Fallback, 2K req/min)');
  console.log('   ✅ AWS Transcribe STT (Hindi/English Auto-Detect - True Streaming)');
  console.log('   ✅ Sarvam AI TTS (Hindi/English 8kHz - TRUE STREAMING 200-300ms!)');
  console.log('   ✅ Smartflo Protocol Compliant');
  console.log('\n⚡ Optimizations:');
  console.log('   ✅ No buffer layer (600ms saved)');
  console.log('   ✅ Transcribe built-in VAD (automatic)');
  console.log('   ✅ Automatic language detection (1-3s)');
  console.log('   ✅ Dynamic voice selection (Hindi/English)');
  console.log('   ✅ Gemini 2.0 Flash streaming (no rate limits!)');
  console.log('   ✅ Target latency: <1000ms (ULTRA human-like)');
  console.log('\n🌍 Languages:');
  console.log('   ✅ हिंदी (Hindi) - PRIMARY (Always start here)');
  console.log('   ✅ English - SECONDARY (Auto-switch if customer prefers)');
  console.log('   ✅ Auto-Detection: Enabled via AWS Transcribe');
  console.log('\n📞 Smartflo:');
  console.log('   DID:', process.env.SMARTFLO_DID_NUMBER);
  console.log('   WebSocket:', wsUrl + '/ws/smartflo/audio');
  console.log('\n✅ Ready for bilingual end-to-end streaming!\n');
});
