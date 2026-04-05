import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
const { Client } = pg;

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }

  const client = new Client({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('Connected to seed DB');
    
    // Check if data already exists
    const res = await client.query('SELECT count(*) FROM users');
    if (parseInt(res.rows[0].count) > 0) {
      console.log('Database already has users, skipping seed.');
      return;
    }

    console.log('Seeding database with demo data...');

    // Hash password
    const demoHash = await bcrypt.hash('DemoPassword!234', 12);

    // Insert Admin
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminPass!123';
    const adminHash = await bcrypt.hash(adminPass, 12);
    await client.query(
      'INSERT INTO users (username, display_name, email, password, role, location) VALUES ($1, $2, $3, $4, $5, $6)',
      ['admin', 'Unshelv\'d Admin', 'admin@unshelvd.com', adminHash, 'admin', 'Battle Creek, MI']
    );

    // Insert Demo Users
    const userResult = await client.query(
      'INSERT INTO users (username, display_name, email, password, bio, location) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      ['bookworm', 'Jane Reader', 'jane@example.com', demoHash, 'Avid reader and collector.', 'Portland, OR']
    );
    const janeId = userResult.rows[0].id;

    // Insert Demo Books
    await client.query(
      'INSERT INTO books (user_id, title, author, condition, status, price, genre) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [janeId, 'Sapiens', 'Yuval Noah Harari', 'like-new', 'for-sale', 15.99, 'History']
    );

    console.log('✅ Seeding complete!');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
