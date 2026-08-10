#!/bin/bash
set -e

APP_DIR="/home/ubuntu/projects/Trainer-Ai-Backend"

cd "$APP_DIR"

echo "⏳ Pulling latest code..."
/usr/bin/git restore .
/usr/bin/git pull origin main

echo "⏳ Installing dependencies..."
/usr/bin/npm install

echo "⏳ Generating Prisma Client..."
/usr/bin/npx prisma generate

echo "⏳ Running database migrations..."
/usr/bin/npx prisma migrate deploy

echo "⏳ Building..."
/usr/bin/npm run build

echo "⏳ Restarting service..."
sudo /usr/bin/systemctl restart trainer-ai-backend.service

echo "✅ Deployment complete"
