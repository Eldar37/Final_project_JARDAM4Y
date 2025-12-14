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

const name = 'Admin';
const email = 'admin@tokmaker.kg';
const password = '123';
const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
const createdAt = new Date().toISOString();

const sql = `INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, ?)`;

db.run(sql, [name, email, hashedPassword, createdAt], function (err) {
    if (err) {
        console.error('Error creating user:', err.message);
    } else {
        console.log(`User ${email} created successfully with ID: ${this.lastID}`);
    }
    db.close();
});
