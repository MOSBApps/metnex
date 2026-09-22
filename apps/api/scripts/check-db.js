/* eslint-disable @typescript-eslint/no-var-requires */
// No default connection: a missing or malformed DATABASE_URL must stop the run instead of
// silently targeting some other database. Messages never contain the value.
function resolveDatabaseUrl(env = process.env) {
  const value = (env.DATABASE_URL || '').trim();
  if (!value) {
    throw new Error('DATABASE_URL is required');
  }
  let protocol;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new Error('DATABASE_URL is invalid');
  }
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    throw new Error('DATABASE_URL is invalid');
  }
  return value;
}

function maskUrl(url) {
  return url.replace(/:[^:@]+@/, ':****@');
}

async function checkConnection() {
  require('dotenv/config');
  let dbUrl;
  try {
    dbUrl = resolveDatabaseUrl();
  } catch (err) {
    console.error(`\n❌ ${err.message} (set it in apps/api/.env or the environment; ./dev.sh writes it for local development)\n`);
    process.exit(1);
  }

  const { Client } = require('pg');
  const client = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 3000,
  });

  try {
    await client.connect();
    await client.end();
  } catch (err) {
    const maskedUrl = maskUrl(dbUrl);
    console.error('\n❌ Veritabanı bağlantısı başarısız! (Database connection failed)');
    console.error(`   Hedef Adres (Target): ${maskedUrl}`);
    console.error(`   Hata Detayı (Error): ${err.message}`);
    console.error('\n💡 Çözüm (Fix): Lütfen Docker veritabanı konteynerini başlatın:');
    console.error('   docker compose -f infra/docker/docker-compose.dev.yml up -d\n');
    process.exit(1);
  }
}

module.exports = { resolveDatabaseUrl, maskUrl };

if (require.main === module) {
  checkConnection();
}
