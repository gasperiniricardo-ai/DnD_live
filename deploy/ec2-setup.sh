#!/usr/bin/env bash
# One-time setup on a fresh EC2 instance (Ubuntu 22.04/24.04).
# Run this manually over SSH the first time. After this, GitHub Actions
# handles every future deploy.
set -euo pipefail

APP_DIR="/home/ubuntu/aster-app"
REPO_URL="$1"   # e.g. git@github.com:yourname/aster-valion.git or https URL

if [ -z "$REPO_URL" ]; then
  echo "Usage: ./ec2-setup.sh <repo-url>"
  exit 1
fi

echo "==> Updating system"
sudo apt-get update -y
sudo apt-get upgrade -y

echo "==> Installing Node.js 20.x"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

echo "==> Installing PM2 (process manager)"
sudo npm install -g pm2

echo "==> Installing Nginx (reverse proxy)"
sudo apt-get install -y nginx

echo "==> Cloning repository"
if [ ! -d "$APP_DIR" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "Repo already exists at $APP_DIR, pulling latest"
  cd "$APP_DIR" && git pull
fi

cd "$APP_DIR"
npm ci --omit=dev

echo "==> Starting app with PM2"
pm2 start server/index.js --name aster-app --update-env || pm2 restart aster-app
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo "==> Configuring Nginx reverse proxy (port 80 -> 3000)"
sudo tee /etc/nginx/sites-available/aster-app > /dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/aster-app /etc/nginx/sites-enabled/aster-app
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "==> Done. The app should be reachable on http://<EC2_PUBLIC_IP>/"
echo "==> Remember to open port 80 (and 22 for SSH) in the EC2 security group."
