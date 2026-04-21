require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });

  try {
    await pool.query(
      'UPDATE settings SET startTime = ?, cutoff_time = ? WHERE id = 1',
      ['09:00', '23:59:00']
    );
    console.log('Settings updated successfully!');

    const [[s]] = await pool.query('SELECT * FROM settings WHERE id = 1');
    console.log('Updated row:', s);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
