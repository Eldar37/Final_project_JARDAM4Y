const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'tokmaker.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('DB Error:', err);
  else console.log('Connected to SQLite database');
});

exports.init = () => {
  db.run(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      address TEXT,
      category TEXT,
      otherCategoryText TEXT,
      description TEXT,
      datetime TEXT,
      price TEXT,
      created_at TEXT,
      user_id INTEGER
    )
  `);

  // ensure legacy databases get the user_id column
  db.all(`PRAGMA table_info(applications)`, (err, rows) => {
    if (err) {
      console.error('PRAGMA table_info error', err);
      return;
    }
    const columns = Array.isArray(rows) ? rows.map(r => r.name) : [];
    const addColumnIfMissing = (name, type) => {
      if (!columns.includes(name)) {
        db.run(`ALTER TABLE applications ADD COLUMN ${name} ${type}`, alterErr => {
          if (alterErr) console.error(`Failed adding ${name} to applications`, alterErr);
          else console.log(`${name} column added to applications`);
        });
      }
    };
    addColumnIfMissing('user_id', 'INTEGER');
    addColumnIfMissing('address', 'TEXT');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  console.log('Tables initialized');
};

// ========== APPLICATIONS ==========
exports.createApplication = (data) => {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO applications (name, contact, address, category, otherCategoryText, description, datetime, price, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(sql, [data.name, data.contact, data.address, data.category, data.otherCategoryText, data.description, data.datetime, data.price, data.created_at, data.user_id || null], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
};

exports.getAllApplications = () => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM applications ORDER BY created_at DESC`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.getApplicationById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM applications WHERE id = ?`, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.getApplicationsByUserId = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC`, [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.updateApplication = (id, data) => {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE applications 
      SET name=?, contact=?, category=?, description=?, datetime=?, price=?
      WHERE id=?
    `;
    db.run(sql, [data.name, data.contact, data.category, data.description, data.datetime, data.price, id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

exports.deleteApplication = (id) => {
  return new Promise((resolve, reject) => {
    const sql = `DELETE FROM applications WHERE id = ?`;
    db.run(sql, [id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

// ========== USERS ==========
exports.getUserByEmail = (email) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.createUser = (data) => {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, ?)`;
    db.run(sql, [data.name, data.email, data.password, new Date().toISOString()], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
};

// ========== SESSIONS ==========
exports.createSession = (userId, token) => {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO sessions (user_id, token, created_at) VALUES (?, ?, ?)`;
    db.run(sql, [userId, token, new Date().toISOString()], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
};

exports.getSessionByToken = (token) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM sessions WHERE token = ?`, [token], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};
