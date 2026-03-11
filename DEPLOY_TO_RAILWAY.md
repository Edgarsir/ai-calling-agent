# Deploy to Railway - Step by Step

## 🚀 5-Minute Deployment Guide

### Step 1: Prepare Your Project

Your project is ready! All files are configured.

### Step 2: Create Railway Account

1. Go to: **https://railway.app**
2. Click **"Login"**
3. Choose **"Login with GitHub"** (easiest)
4. Authorize Railway

### Step 3: Create New Project

1. Click **"New Project"**
2. Choose **"Deploy from GitHub repo"**
3. If you don't have GitHub repo, choose **"Empty Project"** instead

### Step 4: Deploy Files

**If using GitHub:**
- Select your repository
- Railway will auto-detect Node.js

**If using Empty Project:**
1. Click **"+ New"** → **"GitHub Repo"**
2. Or use Railway CLI:
   ```powershell
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```

### Step 5: Add Environment Variables

1. Click on your service
2. Go to **"Variables"** tab
3. Click **"New Variable"**
4. Add these one by one:

```
GROQ_API_KEY=your_groq_api_key_here
SMARTFLO_API_KEY=e14eaea9-51d2-46e9-9ebb-6c60cdff8a1e
SMARTFLO_DID_NUMBER=918069879428
PORT=3000
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=CClPnjrg5vRi2ZDCV9De+cdzY3fzKtMx10BPZFiD
AWS_REGION=ap-south-1
POLLY_VOICE_ID=Kajal
POLLY_ENGINE=neural
```

### Step 6: Configure Start Command

1. Go to **"Settings"** tab
2. Under **"Deploy"** section
3. Set **Start Command:** `node server-full.js`
4. Click **"Save"**

### Step 7: Generate Domain

1. Go to **"Settings"** tab
2. Under **"Networking"** section
3. Click **"Generate Domain"**
4. Copy your URL: `https://your-app.up.railway.app`

### Step 8: Update Smartflo

1. **Go to Smartflo portal**
2. **Update Voice Bot:**
   - Settings → Channels → Voice Bot
   - Edit "New bot"
   - Change URL to: `wss://your-app.up.railway.app/ws/smartflo/audio`
   - Save

3. **Update API Dialplan:**
   - API Connect → API Dialplan
   - Edit "AI Voice Agent"
   - Change URL to: `https://your-app.up.railway.app/api/dialplan`
   - Save

### Step 9: Test!

Call: **918069879428**

**You should see in Railway logs:**
```
📞 your_aws_secret_key_hereyour_aws_secret_key_here= INCOMING CALL your_aws_secret_key_hereyour_aws_secret_key_here=
🔌 WebSocket Connected
🤖 AI says: ...
```

**✅ IT WILL WORK!**

---

## 🎯 Alternative: Use Railway CLI

If you prefer command line:

```powershell
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Link to project
railway link

# Add environment variables
railway variables set GROQ_API_KEY=your_groq_api_key_here

# Deploy
railway up

# Get URL
railway domain
```

---

## 💡 Why This Fixes Everything:

| Issue | ngrok Free | Railway |
|-------|------------|---------|
| Warning page | ❌ Yes | ✅ No |
| WebSocket works | ❌ Blocked | ✅ Works |
| Permanent URL | ❌ Changes | ✅ Fixed |
| Cost | Free | Free |
| Call connects | ❌ No | ✅ Yes |

---

## 🆘 Troubleshooting:

**If deployment fails:**
- Check that `package.json` exists
- Check that `node_modules` is in `.gitignore`
- Check start command is `node server-full.js`

**If app crashes:**
- Check Railway logs
- Verify all environment variables are set
- Check AWS credentials are valid

---

## ✅ After Deployment:

Your AI calling agent will:
- ✅ Answer calls
- ✅ Connect WebSocket
- ✅ Stream audio (when AWS credentials fixed)
- ✅ Use Groq AI for responses
- ✅ Stay connected during call

**No more disconnects!** 🎉

---

## 📞 Support:

If you need help:
- Railway docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Or ask me!

---

**Ready to deploy? Go to https://railway.app and follow the steps above!** 🚀
