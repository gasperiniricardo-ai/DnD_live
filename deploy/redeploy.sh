#!/usr/bin/env bash
# Run on the EC2 instance by the GitHub Actions workflow on every push to main.
set -euo pipefail

APP_DIR="/home/ec2-user/aster-app"
cd "$APP_DIR"

echo "==> Pulling latest changes"
git fetch origin main
git reset --hard origin/main

echo "==> Installing dependencies"
npm ci --omit=dev

echo "==> Restarting app"
pm2 restart aster-app --update-env

echo "==> Deploy finished at $(date)"
