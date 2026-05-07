#!/bin/bash
# QuickPrint - Deployment Script
# Usage: ./scripts/deploy.sh [worker|pages|all|db]

set -e

ACTION=${1:-all}
WORKER_DIR="workers"
PAGES_DIR="pages"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[QuickPrint]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

log "QuickPrint Deployment Script"
echo "================================"

case $ACTION in
  db)
    log "Running database migrations..."
    cd $WORKER_DIR
    wrangler d1 migrations apply quickprint-db
    success "Migrations applied!"
    log "Seeding default data..."
    wrangler d1 execute quickprint-db --file=../migrations/seed.sql
    success "Database seeded!"
    ;;

  worker)
    log "Deploying Cloudflare Worker..."
    cd $WORKER_DIR
    wrangler deploy
    success "Worker deployed!"
    ;;

  pages)
    log "Building frontend..."
    cd $PAGES_DIR
    npm run build
    success "Build complete!"
    log "Deploying to Cloudflare Pages..."
    wrangler pages deploy dist --project-name quickprint
    success "Pages deployed!"
    ;;

  all)
    log "Full deployment..."
    
    # Build pages
    log "Building frontend..."
    cd $PAGES_DIR
    npm run build
    success "Build complete!"
    cd ..
    
    # Deploy worker
    log "Deploying Worker..."
    cd $WORKER_DIR
    wrangler deploy
    success "Worker deployed!"
    cd ..
    
    # Deploy pages
    log "Deploying Pages..."
    cd $PAGES_DIR
    wrangler pages deploy dist --project-name quickprint
    success "Pages deployed!"
    cd ..
    
    success "Full deployment complete! 🚀"
    ;;

  setup)
    log "First-time setup..."
    
    log "Installing dependencies..."
    npm install
    cd workers && npm install && cd ..
    cd pages && npm install && cd ..
    success "Dependencies installed!"
    
    log "Creating D1 database..."
    cd workers
    wrangler d1 create quickprint-db
    warn "Copy the database_id above into workers/wrangler.toml"
    
    log "Creating R2 bucket..."
    wrangler r2 bucket create quickprint-files
    success "R2 bucket created!"
    
    warn "Next steps:"
    echo "1. Update workers/wrangler.toml with your D1 database_id"
    echo "2. Run: wrangler secret put JWT_SECRET"
    echo "3. Run: wrangler secret put RAZORPAY_KEY_SECRET"
    echo "4. Run: ./scripts/deploy.sh db"
    echo "5. Run: ./scripts/deploy.sh all"
    ;;

  *)
    echo "Usage: $0 [setup|db|worker|pages|all]"
    echo ""
    echo "  setup  - First-time setup (create D1, R2)"
    echo "  db     - Run migrations + seed"
    echo "  worker - Deploy Cloudflare Worker only"
    echo "  pages  - Build + deploy Pages only"
    echo "  all    - Deploy everything"
    exit 1
    ;;
esac