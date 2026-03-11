#!/bin/bash

# EC2 Deployment Setup Script
# This script sets up a fresh Ubuntu EC2 instance for the AI Calling Agent

set -e

echo "=========================================="
echo "EC2 Setup for AI Calling Agent"
echo "=========================================="

# Update system
echo "Step 1: Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
echo "Step 2: Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
echo "Node.js version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install PM2 globally
echo "Step 3: Installing PM2 (process manager)..."
sudo npm install -g pm2

# Install Nginx
echo "Step 4: Installing Nginx..."
sudo apt install -y nginx

# Install Git
echo "Step 5: Installing Git..."
sudo apt install -y git

# Install curl and wget
echo "Step 6: Installing utilities..."
sudo apt install -y curl wget

# Create app directory
echo "Step 7: Creating app directory..."
sudo mkdir -p /var/www/ai-calling-agent
sudo chown -R ubuntu:ubuntu /var/www/ai-calling-agent

# Enable Nginx
echo "Step 8: Enabling Nginx..."
sudo systemctl enable nginx
sudo systemctl start nginx

# Setup PM2 to start on boot
echo "Step 9: Setting up PM2 startup..."
sudo pm2 startup ubuntu -u ubuntu --hp /home/ubuntu
sudo pm2 save

echo "=========================================="
echo "✅ EC2 Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Clone your repository:"
echo "   cd /var/www/ai-calling-agent"
echo "   git clone <your-repo-url> ."
echo ""
echo "2. Install dependencies:"
echo "   npm install"
echo ""
echo "3. Create .env file with your credentials"
echo ""
echo "4. Start the app with PM2:"
echo "   pm2 start server-production.js --name 'ai-calling-agent'"
echo ""
echo "5. Configure Nginx (see nginx-config.conf)"
echo ""
