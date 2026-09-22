#!/usr/bin/env bash

set -e

ENV=$1
DOMAIN=$2

if [ -z "$ENV" ] || [ -z "$DOMAIN" ]; then
    echo "Usage: $0 {dev|test|prod} <domain>"
    echo "  Example: $0 dev domain.com"
    echo "  Example: $0 prod domain.com"
    exit 1
fi

BASE="/opt/metnex/$ENV"
ENV_FILE="$BASE/.env"

mkdir -p $BASE

gen_pass() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

gen_jwt() {
    openssl rand -base64 64 | tr -d "\n"
}

POSTGRES_PASSWORD=$(gen_pass)
REDIS_PASSWORD=$(gen_pass)
MINIO_PASSWORD=$(gen_pass)
JWT_SECRET=$(gen_jwt)

case "$ENV" in
dev)
    POSTGRES_DB=metnex_dev
    MINIO_CONSOLE_PORT=9090
    ORIGIN=https://metnex-dev.$DOMAIN
    API=https://metnex-api-dev.$DOMAIN
    ;;
test)
    POSTGRES_DB=metnex_test
    MINIO_CONSOLE_PORT=9091
    ORIGIN=https://metnex-test.$DOMAIN
    API=https://metnex-api-test.$DOMAIN
    ;;
prod)
    POSTGRES_DB=metnex
    MINIO_CONSOLE_PORT=9092
    ORIGIN=https://metnex.$DOMAIN
    API=https://metnex-api.$DOMAIN
    ;;
*)
    echo "Invalid environment: $ENV (use dev, test or prod)"
    exit 1
esac

cat > $ENV_FILE <<EOF
# Ortam kimliği
ENV=$ENV

# PostgreSQL
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB

# Redis
REDIS_PASSWORD=$REDIS_PASSWORD

# MinIO
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=$MINIO_PASSWORD
MINIO_CONSOLE_PORT=$MINIO_CONSOLE_PORT

# Uygulama bağlantıları
DATABASE_URL=postgresql://metnex:$POSTGRES_PASSWORD@postgres/$POSTGRES_DB
REDIS_URL=redis://:$REDIS_PASSWORD@redis
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d
ALLOWED_ORIGINS=$ORIGIN
NEXT_PUBLIC_API_URL=$API
EOF

chmod 600 $ENV_FILE

echo
echo "Environment created:"
echo "$ENV_FILE"
echo
