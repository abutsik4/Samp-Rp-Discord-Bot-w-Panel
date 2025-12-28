#!/bin/bash

# Jepsencloud Bot - Quick Deployment Script
# Usage: ./deploy.sh [production|staging|local]

set -e

ENVIRONMENT=${1:-production}
BOT_DIR="/opt/jepsencloud-bot"
LOG_FILE="/tmp/jepsencloud-deploy.log"

echo "🚀 Jepsencloud Bot Deployment Script"
echo "📍 Environment: $ENVIRONMENT"
echo "📁 Directory: $BOT_DIR"
echo "📝 Log: $LOG_FILE"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}✓${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

error() {
    echo -e "${RED}✗${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: $1" >> "$LOG_FILE"
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - WARNING: $1" >> "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
    fi
    NODE_VERSION=$(node -v)
    log "Node.js: $NODE_VERSION"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
    fi
    log "npm installed"
    
    # Check if directory exists
    if [ ! -d "$BOT_DIR" ]; then
        error "Directory $BOT_DIR does not exist"
    fi
    log "Directory $BOT_DIR exists"
}

# Backup current deployment
backup_deployment() {
    log "Creating backup..."
    BACKUP_DIR="$BOT_DIR/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup critical files
    [ -f "$BOT_DIR/.env" ] && cp "$BOT_DIR/.env" "$BACKUP_DIR/"
    [ -f "$BOT_DIR/data/stats.db" ] && cp "$BOT_DIR/data/stats.db" "$BACKUP_DIR/stats.db.backup"
    
    log "Backup created at $BACKUP_DIR"
}

# Install dependencies
install_dependencies() {
    log "Installing dependencies..."
    cd "$BOT_DIR"
    npm install
    log "Dependencies installed"
}

# Validate code
validate_code() {
    log "Validating code..."
    cd "$BOT_DIR"
    npm run check || error "Code validation failed"
    log "Code validation passed"
}

# Setup environment
setup_environment() {
    log "Setting up environment for $ENVIRONMENT..."
    
    if [ "$ENVIRONMENT" = "production" ]; then
        # Check if .env exists
        if [ ! -f "$BOT_DIR/.env" ]; then
            error ".env file not found. Please create .env file before deployment."
        fi
        
        # Verify production settings
        if ! grep -q "NODE_ENV=production" "$BOT_DIR/.env"; then
            warn "NODE_ENV not set to production in .env"
        fi
        
        if ! grep -q "TRUST_PROXY=1" "$BOT_DIR/.env"; then
            warn "TRUST_PROXY not enabled in .env"
        fi
        
        log "Production environment ready"
        
    elif [ "$ENVIRONMENT" = "staging" ]; then
        log "Staging environment ready"
        
    elif [ "$ENVIRONMENT" = "local" ]; then
        log "Local environment ready"
    fi
}

# Start/restart bot
start_bot() {
    log "Starting bot..."
    
    cd "$BOT_DIR"
    
    # Check if pm2 is installed globally
    if command -v pm2 &> /dev/null; then
        log "Using PM2 to start bot"
        # Ensure single process name consistent with ecosystem.config.js
        pm2 delete jepsencloud-bot 2>/dev/null || true
        pm2 restart jepsencloud-panel --update-env || pm2 start ecosystem.config.js
        pm2 save
        log "Bot started with PM2 (jepsencloud-panel)"
    else
        warn "PM2 not found. Consider installing: npm install -g pm2"
        warn "Starting bot in foreground (not recommended for production)"
        npm start &
        log "Bot started (consider using PM2 for production)"
    fi
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    sleep 2
    
    # Check if bot is listening
    if netstat -tlnp 2>/dev/null | grep -q ":5012"; then
        log "Bot is listening on port 5012"
    else
        error "Bot is not listening on port 5012"
    fi
    
    # Try to reach health endpoint
    if curl -s http://localhost:5012/panel > /dev/null 2>&1; then
        log "Health check passed"
    else
        error "Health check failed"
    fi
    
    log "Deployment verified successfully"
}

# Print deployment summary
print_summary() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║               DEPLOYMENT COMPLETED SUCCESSFULLY              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📍 Access Points:"
    echo "   Local:      http://localhost:5012/panel"
    echo "   Production: https://panel.jepsencloud.com/panel"
    echo ""
    echo "🎯 Verification Dashboard:"
    echo "   https://panel.jepsencloud.com/panel/verification-dashboard"
    echo ""
    echo "📊 API Endpoints:"
    echo "   /panel/api/:botKey/verify/user-stats"
    echo "   /panel/api/:botKey/verify/message-counted"
    echo "   /panel/api/:botKey/verify/results"
    echo ""
    echo "📝 Log file: $LOG_FILE"
    echo ""
    echo "💡 Next steps:"
    echo "   1. Test the dashboard"
    echo "   2. Verify all features work"
    echo "   3. Monitor logs for any issues"
    echo ""
    echo "✅ Status: Ready for use!"
    echo ""
}

# Main deployment flow
main() {
    log "Starting deployment process"
    
    check_prerequisites
    backup_deployment
    install_dependencies
    validate_code
    setup_environment
    start_bot
    verify_deployment
    print_summary
    
    log "Deployment completed successfully"
}

# Run main function
main
