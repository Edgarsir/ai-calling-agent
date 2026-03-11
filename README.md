# AI Calling Agent - Bilingual (Hindi + English)

Professional AI-powered calling agent with real-time barge-in support, built for production deployment on AWS EC2 and Railway.

## 🎯 Features

- ✅ **Bilingual Support** - Hindi & English with auto-detection
- ✅ **Real-Time Barge-In** - Pause and listen like NVIDIA/Google Gemini
- ✅ **True Streaming** - No buffer layer, <1000ms latency
- ✅ **Multiple AI Models** - Groq (primary) + Gemini (fallback)
- ✅ **Professional TTS** - Sarvam AI with natural speech
- ✅ **AWS Transcribe** - Accurate speech-to-text
- ✅ **Smartflo Integration** - Tata Smartflo VoIP platform
- ✅ **Shopify Integration** - Order confirmation calls

## 🚀 Quick Start

### Prerequisites
- Node.js >= 20.0.0
- npm or yarn
- AWS credentials (for Transcribe)
- Groq API key
- Sarvam API key
- Google Cloud credentials (optional, for Gemini fallback)

### Installation

```bash
# Clone repository
git clone https://github.com/Edgarsir/ai-calling-agent.git
cd ai-calling-agent

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

### Environment Variables

```env
# Groq AI (Primary)
GROQ_API_KEY=your_groq_api_key

# Sarvam TTS
SARVAM_API_KEY=your_sarvam_api_key
SARVAM_VOICE_HINDI=ritu
SARVAM_VOICE_ENGLISH=shubh

# AWS Transcribe
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=ap-south-1

# Google Vertex AI (Fallback)
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}
GOOGLE_PROJECT_ID=your_project_id
GOOGLE_LOCATION=us-central1

# Smartflo VoIP
SMARTFLO_API_KEY=your_smartflo_key
SMARTFLO_API_TOKEN=your_smartflo_token
SMARTFLO_DID_NUMBER=918065253312
SMARTFLO_API_URL=https://api.smartflo.in/api/click-to-call

# Server
PORT=3000
NODE_ENV=production
PUBLIC_URL=https://your-domain.com
```

### Local Development

```bash
npm run dev
```

### Production Deployment

```bash
npm start
```

## 📦 Deployment Options

### Option 1: Railway (Recommended for Quick Start)
```bash
npm install -g @railway/cli
railway login
railway up
```

### Option 2: AWS EC2 (Recommended for Production)

See [EC2_DEPLOYMENT_GUIDE.md](./EC2_DEPLOYMENT_GUIDE.md)

```bash
# On EC2 instance
git clone https://github.com/Edgarsir/ai-calling-agent.git
cd ai-calling-agent
npm install
npm start
```

### Option 3: Docker

```bash
docker build -t ai-calling-agent .
docker run -p 3000:3000 --env-file .env ai-calling-agent
```

## 🔌 API Endpoints

### Health Check
```
GET /
```

### Incoming Calls (Smartflo)
```
POST /api/dialplan
```

### Make Outbound Call
```
POST /api/make-call
Body: {
  "to_number": "919876543210",
  "message": "Optional custom message",
  "customer_name": "Optional customer name"
}
```

### WebSocket (Audio Streaming)
```
WS /ws/smartflo/audio
```

## 📊 Performance

- **STT Latency:** 50-100ms
- **AI Response:** 150-300ms
- **TTS Latency:** 400-600ms
- **Total E2E:** 600-1000ms
- **Barge-In Response:** 10-50ms

## 🎯 Architecture

```
Caller
  ↓
Smartflo VoIP
  ↓
WebSocket (Audio Stream)
  ↓
AWS Transcribe (STT)
  ↓
Groq/Gemini (AI)
  ↓
Sarvam (TTS)
  ↓
WebSocket (Audio Stream)
  ↓
Smartflo VoIP
  ↓
Caller
```

## 📚 Documentation

- [EC2 Deployment Guide](./EC2_DEPLOYMENT_GUIDE.md)
- [Railway Deployment](./DEPLOY_TO_RAILWAY.md)
- [Real-Time Barge-In](./REAL_TIME_BARGE_IN.md)
- [Pause and Listen](./PAUSE_AND_LISTEN.md)
- [Voice Quality Optimization](./VOICE_QUALITY_OPTIMIZATION.md)

## 🔧 Configuration

### Sarvam TTS Voices

**Hindi:**
- `ritu` - Female (default)
- `arjun` - Male

**English:**
- `shubh` - Male (default)
- `maya` - Female

### AI Models

**Primary:** Groq Llama 3.3 70B (Ultra-fast)
**Fallback:** Google Gemini 1.5 Flash

## 🐛 Troubleshooting

### Voice Cracking
- Reduce Sarvam pace to 1.0
- Enable preprocessing
- Check network latency

### High Latency
- Check Groq rate limits
- Verify AWS Transcribe quota
- Monitor network connectivity

### Barge-In Not Working
- Verify Smartflo WebSocket connection
- Check PAUSE marker support
- Review logs for interruption events

## 📞 Support

For issues and questions:
1. Check logs: `npm start 2>&1 | tee app.log`
2. Review documentation
3. Check GitHub issues
4. Contact support

## 📄 License

ISC

## 👨‍💻 Author

Harsh Sharma

## 🙏 Acknowledgments

- Groq for ultra-fast AI
- AWS for Transcribe
- Sarvam AI for TTS
- Google Cloud for Vertex AI
- Tata Smartflo for VoIP platform

---

**Ready to deploy?** Start with [EC2_DEPLOYMENT_GUIDE.md](./EC2_DEPLOYMENT_GUIDE.md)
