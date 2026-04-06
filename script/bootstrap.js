import pg from 'pg';
const { Client } = pg;

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }

  // Unix socket connections (Cloud SQL) don't use SSL
  const isUnixSocket = process.env.DATABASE_URL.includes("host=/");
  const client = new Client({ 
    connectionString: process.env.DATABASE_URL,
    ssl: isUnixSocket ? false : { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('Connected to bootstrap DB');
    
    // Fix permissions and CLEAN SLATE the database for the first deployment
    // This resolves "relation already exists" if previous failed deploy left junk.
    console.log('Fixing permissions and resetting schema...');
    
    // Ensure unshelvd user owns the DB
    await client.query('ALTER DATABASE unshelvd OWNER TO unshelvd;');
    
    // Drop and recreate public schema to ensure a clean state for drizzle
    await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');
    await client.query('GRANT ALL ON SCHEMA public TO unshelvd;');
    
    // Also insure the drizzle meta schema is clean
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE;');
    await client.query('CREATE SCHEMA drizzle;');
    await client.query('GRANT ALL ON SCHEMA drizzle TO unshelvd;');
    
    console.log('✅ Database bootstrap complete (Cleaned public & drizzle schemas)!');
  } catch (err) {
    console.error('❌ Bootstrap failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

bootstrap();
