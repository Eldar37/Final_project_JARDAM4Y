const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'tokmaker.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('DB Error:', err);
    process.exit(1);
  }
});

const email = 'admin@tokmaker.kg';
const password = '123';
const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

console.log(`Checking user: ${email}`);
console.log(`Expected Hash for '123': ${hashedPassword}`);

db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
  if (err) {
    console.error('Query Error:', err);
  } else {
    if (row) {
      console.log('User found:', row);
      if (row.password === hashedPassword) {
        console.log('Password match: YES');
      } else {
        console.log('Password match: NO');
        console.log('Stored Hash:', row.password);
      }
    } else {
      console.log('User NOT found');
    }
  }
  db.close();
});
