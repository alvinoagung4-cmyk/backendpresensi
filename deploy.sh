#!/bin/bash
# ============================================
# DEPLOY AUTOMATION SCRIPT (Opsional)
# ============================================

# Jika ingin automated deployment ke Railway, bisa pakai script ini
# Requirement: Git & Railway CLI installed

echo "🚀 Attendance Backend - Deploy Automation"
echo "=========================================="

# Check if .git exists
if [ ! -d ".git" ]; then
    echo "❌ Not a git repository. Initialize git first:"
    echo "   git init"
    echo "   git remote add origin https://github.com/YOUR_USERNAME/projectone-backend.git"
    exit 1
fi

# Commit changes
echo "📝 Committing changes..."
git add .
git commit -m "Release backend for production deployment"

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push -u origin main

echo "✅ Done!"
echo ""
echo "Next steps:"
echo "1. Open https://railway.app"
echo "2. New Project → Deploy from GitHub"
echo "3. Select 'projectone-backend' repository"
echo "4. Railway will auto-deploy"
echo "5. Add PostgreSQL service"
echo "6. Configure environment variables"
echo ""
echo "When ready, update Flutter app:"
echo "Edit lib/services/api_service.dart and set:"
echo "  isProduction = true"
echo "  _productionUrl = 'your-railway-url/api'"
