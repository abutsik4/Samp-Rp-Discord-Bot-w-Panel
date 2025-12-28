#!/bin/bash

# Automated Message Count Verification Wrapper
# Uses existing bot infrastructure

cd /opt/jepsencloud-bot

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Automated Message Count Verification                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Load environment
export DISCORD_TOKEN=$(grep DISCORD_TOKEN .env | cut -d= -f2 | tr -d '\r')

if [ -z "$DISCORD_TOKEN" ]; then
  echo "❌ Could not load DISCORD_TOKEN from .env"
  exit 1
fi

GUILD_ID="${1:-537187880842559499}"

echo "📍 Guild ID: $GUILD_ID"
echo "🔄 Starting automated verification..."
echo ""
echo "⏳ This will take time (2-5 min per user with many messages)"
echo "   Press Ctrl+C to cancel"
echo ""

node scripts/auto-verify-all-users.js "$GUILD_ID"
