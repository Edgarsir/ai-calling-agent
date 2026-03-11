# AWS EC2 Deployment Guide

Complete guide to deploy AI Calling Agent on AWS EC2.

## 🚀 Step 1: Launch EC2 Instance

### Instance Configuration
- **AMI:** Ubuntu 22.04 LTS (ami-0c55b159cbfafe1f0)
- **Instance Type:** t3.medium (2 vCPU, 4GB RAM)
- **Storage:** 30GB gp3
- **Security Group:** Allow ports 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (App)

### Security Group Rules
```
Inbound:
- SSH (22): 0.0.0.0/0
- HTTP (80): 0.0.0.0/0
- HTTPS (443): 0.0.0.0/0
- Custom TCP (3000): 0.0.0.0/0

Outbound:
- All traffic
```

## 🔑 Step 2: Connect to Instance

```bash
# SSH into instance
ssh -i your-key.pem ubuntu@your-instance-ip

# Update system
sudo apt update && sudo apt upgrade -y
```

## 📦 Step 3: Install Dependencies

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Git
sudo apt install -y git

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Verify installations
node --version
npm --version
git --version
```

## 🔐 Step 4: Clone Repository

```bash
# Clone your repository
git clone https://github.com/Edgarsir/ai-calling-agent.git
cd ai-calling-agent

# Install dependencies
npm install
```

## 🔧 Step 5: Configure Environment

```bash
# Create .env file
nano .env
```

Paste your environment variables:

```env
# Groq AI
GROQ_API_KEY=your_groq_api_key

# Sarvam TTS
SARVAM_API_KEY=your_sarvam_api_key
SARVAM_VOICE_HINDI=ritu
SARVAM_VOICE_ENGLISH=shubh

# AWS Transcribe
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=ap-south-1

# Google Vertex AI
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}
GOOGLE_PROJECT_ID=your_project_id
GOOGLE_LOCATION=us-central1

# Smartflo
SMARTFLO_API_KEY=your_smartflo_key
SMARTFLO_API_TOKEN=your_smartflo_token
SMARTFLO_DID_NUMBER=918065253312
SMARTFLO_API_URL=https://api.smartflo.in/api/click-to-call

# Server
PORT=3000
NODE_ENV=production
PUBLIC_URL=https://your-domain.com
```

Save: `Ctrl+X` → `Y` → `Enter`

## 🚀 Step 6: Start Application with PM2

```bash
# Start application
pm2 start server-production.js --name "ai-calling-agent"

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Copy and run the command it outputs

# Check status
pm2 status
pm2 logs ai-calling-agent
```

## 🌐 Step 7: Configure Nginx Reverse Proxy

```bash
# Create Nginx config
sudo nano /etc/nginx/sites-available/ai-calling-agent
```

Paste:

```nginx
upstream ai_calling_agent {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy settings
    location / {
        proxy_pass http://ai_calling_agent;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # WebSocket support
    location /ws/ {
        proxy_pass http://ai_calling_agent;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

Save: `Ctrl+X` → `Y` → `Enter`

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/ai-calling-agent /etc/nginx/sites-enabled/

# Test Nginx config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

## 🔒 Step 8: Setup SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --standalone -d your-domain.com

# Auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## ✅ Step 9: Verify Deployment

```bash
# Check application status
pm2 status

# Check logs
pm2 logs ai-calling-agent

# Test API
curl https://your-domain.com/

# Test WebSocket
wscat -c wss://your-domain.com/ws/smartflo/audio
```

## 📊 Step 10: Monitoring & Maintenance

### Monitor Application
```bash
# Real-time logs
pm2 logs ai-calling-agent

# Monitor resources
pm2 monit

# Restart application
pm2 restart ai-calling-agent

# Stop application
pm2 stop ai-calling-agent

# Start application
pm2 start ai-calling-agent
```

### Update Application
```bash
# Pull latest code
git pull origin main

# Install new dependencies
npm install

# Restart application
pm2 restart ai-calling-agent
```

## 🔧 Troubleshooting

### Application won't start
```bash
# Check logs
pm2 logs ai-calling-agent

# Check port 3000
sudo lsof -i :3000

# Kill process on port 3000
sudo kill -9 $(lsof -t -i:3000)
```

### Nginx not working
```bash
# Test config
sudo nginx -t

# Check Nginx status
sudo systemctl status nginx

# Restart Nginx
sudo systemctl restart nginx
```

### SSL certificate issues
```bash
# Renew certificate
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal
```

## 📈 Performance Optimization

### Increase Node.js Memory
```bash
# Edit PM2 config
pm2 start server-production.js --name "ai-calling-agent" --max-memory-restart 1G
```

### Enable Gzip Compression
Add to Nginx config:
```nginx
gzip on;
gzip_types text/plain application/json;
gzip_min_length 1000;
```

### Setup CloudFront CDN
1. Go to AWS CloudFront
2. Create distribution
3. Point to your EC2 instance
4. Update DNS records

## 🔐 Security Best Practices

1. **Use Security Groups** - Restrict access to necessary ports
2. **Enable SSL/TLS** - Always use HTTPS
3. **Rotate API Keys** - Regularly update credentials
4. **Monitor Logs** - Check for suspicious activity
5. **Backup Data** - Regular backups of configuration
6. **Update System** - Keep OS and packages updated

## 📞 Support

For issues:
1. Check PM2 logs: `pm2 logs ai-calling-agent`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Check system logs: `sudo journalctl -xe`

---

**Your AI Calling Agent is now live on EC2!** 🚀
