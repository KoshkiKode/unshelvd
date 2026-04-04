const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('GRANT ALL PRIVILEGES ON DATABASE unshelvd TO unshelvd')
  .then(() => { console.log('Granted!'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
