const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT current_user, current_database()')
  .then(r => { console.log(r.rows[0]); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
