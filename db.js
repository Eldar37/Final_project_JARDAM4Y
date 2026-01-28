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

  db.run(`
    CREATE TABLE IF NOT EXISTS vacancies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      location_text TEXT,
      category_ids TEXT,
      title TEXT NOT NULL,
      description TEXT,
      date_time TEXT,
      is_flexible_time INTEGER DEFAULT 0,
      schedule TEXT,
      pay_amount REAL,
      pay_type TEXT,
      tags TEXT,
      created_at TEXT,
      updated_at TEXT,
      user_id INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS worker_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      categories TEXT,
      headline TEXT,
      availability TEXT,
      pay_min REAL,
      pay_type TEXT,
      city TEXT,
      location_text TEXT,
      about TEXT,
      experience_level TEXT,
      languages TEXT,
      work_format TEXT,
      contact_methods TEXT,
      age INTEGER,
      tags TEXT,
      created_at TEXT,
      updated_at TEXT,
      user_id INTEGER
    )
  `);

  const ensureColumns = (table, columns) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) {
        console.error(`PRAGMA table_info error for ${table}`, err);
        return;
      }
      const existing = Array.isArray(rows) ? rows.map(r => r.name) : [];
      columns.forEach(({ name, type }) => {
        if (!existing.includes(name)) {
          db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`, alterErr => {
            if (alterErr) console.error(`Failed adding ${name} to ${table}`, alterErr);
            else console.log(`${name} column added to ${table}`);
          });
        }
      });
    });
  };

  ensureColumns('vacancies', [
    { name: 'contact_name', type: 'TEXT' },
    { name: 'phone', type: 'TEXT' },
    { name: 'location_text', type: 'TEXT' },
    { name: 'category_ids', type: 'TEXT' },
    { name: 'title', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'date_time', type: 'TEXT' },
    { name: 'is_flexible_time', type: 'INTEGER' },
    { name: 'schedule', type: 'TEXT' },
    { name: 'pay_amount', type: 'REAL' },
    { name: 'pay_type', type: 'TEXT' },
    { name: 'tags', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT' },
    { name: 'updated_at', type: 'TEXT' },
    { name: 'user_id', type: 'INTEGER' }
  ]);

  ensureColumns('worker_profiles', [
    { name: 'name', type: 'TEXT' },
    { name: 'phone', type: 'TEXT' },
    { name: 'categories', type: 'TEXT' },
    { name: 'headline', type: 'TEXT' },
    { name: 'availability', type: 'TEXT' },
    { name: 'pay_min', type: 'REAL' },
    { name: 'pay_type', type: 'TEXT' },
    { name: 'city', type: 'TEXT' },
    { name: 'location_text', type: 'TEXT' },
    { name: 'about', type: 'TEXT' },
    { name: 'experience_level', type: 'TEXT' },
    { name: 'languages', type: 'TEXT' },
    { name: 'work_format', type: 'TEXT' },
    { name: 'contact_methods', type: 'TEXT' },
    { name: 'age', type: 'INTEGER' },
    { name: 'tags', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT' },
    { name: 'updated_at', type: 'TEXT' },
    { name: 'user_id', type: 'INTEGER' }
  ]);

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

// ========== VACANCIES ==========
exports.createVacancy = (data) => {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO vacancies (
        contact_name,
        phone,
        location_text,
        category_ids,
        title,
        description,
        date_time,
        is_flexible_time,
        schedule,
        pay_amount,
        pay_type,
        tags,
        created_at,
        updated_at,
        user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
      sql,
      [
        data.contact_name,
        data.phone,
        data.location_text,
        data.category_ids,
        data.title,
        data.description,
        data.date_time,
        data.is_flexible_time,
        data.schedule,
        data.pay_amount,
        data.pay_type,
        data.tags,
        data.created_at,
        data.updated_at,
        data.user_id || null
      ],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

exports.getVacancyById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM vacancies WHERE id = ?`, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.getVacanciesByUserId = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM vacancies WHERE user_id = ? ORDER BY created_at DESC`, [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.searchVacancies = (filters) => {
  return new Promise((resolve, reject) => {
    const conditions = [];
    const params = [];

    if (filters.query) {
      const like = `%${filters.query}%`;
      conditions.push(`(title LIKE ? OR description LIKE ? OR tags LIKE ? OR location_text LIKE ? OR category_ids LIKE ?)`);
      params.push(like, like, like, like, like);
    }

    if (Array.isArray(filters.categories) && filters.categories.length) {
      const chunk = filters.categories.map(() => `category_ids LIKE ?`).join(' OR ');
      conditions.push(`(${chunk})`);
      filters.categories.forEach(cat => params.push(`%${cat}%`));
    }

    if (Array.isArray(filters.schedule) && filters.schedule.length) {
      const chunk = filters.schedule.map(() => `schedule LIKE ?`).join(' OR ');
      conditions.push(`(${chunk})`);
      filters.schedule.forEach(item => params.push(`%${item}%`));
    }

    if (filters.payMin != null && filters.payMin !== '') {
      conditions.push(`pay_amount >= ?`);
      params.push(Number(filters.payMin));
    }

    if (filters.payMax != null && filters.payMax !== '') {
      conditions.push(`pay_amount <= ?`);
      params.push(Number(filters.payMax));
    }

    if (filters.date) {
      conditions.push(`date(date_time) = date(?)`);
      params.push(filters.date);
    }

    if (filters.flexibleOnly) {
      conditions.push(`is_flexible_time = 1`);
    }

    let sql = `SELECT * FROM vacancies`;
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY created_at DESC`;

    if (filters.limit != null) {
      sql += ` LIMIT ?`;
      params.push(Number(filters.limit));
    }
    if (filters.offset != null) {
      sql += ` OFFSET ?`;
      params.push(Number(filters.offset));
    }

    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.updateVacancy = (id, data) => {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE vacancies
      SET contact_name=?,
          phone=?,
          location_text=?,
          category_ids=?,
          title=?,
          description=?,
          date_time=?,
          is_flexible_time=?,
          schedule=?,
          pay_amount=?,
          pay_type=?,
          tags=?,
          updated_at=?
      WHERE id=?
    `;
    db.run(
      sql,
      [
        data.contact_name,
        data.phone,
        data.location_text,
        data.category_ids,
        data.title,
        data.description,
        data.date_time,
        data.is_flexible_time,
        data.schedule,
        data.pay_amount,
        data.pay_type,
        data.tags,
        data.updated_at,
        id
      ],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
};

exports.deleteVacancy = (id) => {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM vacancies WHERE id = ?`, [id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

// ========== WORKER PROFILES ==========
exports.createWorkerProfile = (data) => {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO worker_profiles (
        name,
        phone,
        categories,
        headline,
        availability,
        pay_min,
        pay_type,
        city,
        location_text,
        about,
        experience_level,
        languages,
        work_format,
        contact_methods,
        age,
        tags,
        created_at,
        updated_at,
        user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
      sql,
      [
        data.name,
        data.phone,
        data.categories,
        data.headline,
        data.availability,
        data.pay_min,
        data.pay_type,
        data.city,
        data.location_text,
        data.about,
        data.experience_level,
        data.languages,
        data.work_format,
        data.contact_methods,
        data.age,
        data.tags,
        data.created_at,
        data.updated_at,
        data.user_id || null
      ],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

exports.getWorkerProfileById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM worker_profiles WHERE id = ?`, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.getWorkerProfilesByUserId = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM worker_profiles WHERE user_id = ? ORDER BY created_at DESC`, [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.searchWorkerProfiles = (filters) => {
  return new Promise((resolve, reject) => {
    const conditions = [];
    const params = [];

    if (filters.query) {
      const like = `%${filters.query}%`;
      conditions.push(`(headline LIKE ? OR about LIKE ? OR tags LIKE ? OR location_text LIKE ? OR city LIKE ? OR categories LIKE ?)`);
      params.push(like, like, like, like, like, like);
    }

    if (Array.isArray(filters.categories) && filters.categories.length) {
      const chunk = filters.categories.map(() => `categories LIKE ?`).join(' OR ');
      conditions.push(`(${chunk})`);
      filters.categories.forEach(cat => params.push(`%${cat}%`));
    }

    if (Array.isArray(filters.availability) && filters.availability.length) {
      const chunk = filters.availability.map(() => `availability LIKE ?`).join(' OR ');
      conditions.push(`(${chunk})`);
      filters.availability.forEach(item => params.push(`%${item}%`));
    }

    if (filters.payMin != null && filters.payMin !== '') {
      conditions.push(`pay_min >= ?`);
      params.push(Number(filters.payMin));
    }

    if (filters.city) {
      conditions.push(`city = ?`);
      params.push(filters.city);
    }

    if (filters.location) {
      conditions.push(`location_text LIKE ?`);
      params.push(`%${filters.location}%`);
    }

    let sql = `SELECT * FROM worker_profiles`;
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY created_at DESC`;

    if (filters.limit != null) {
      sql += ` LIMIT ?`;
      params.push(Number(filters.limit));
    }
    if (filters.offset != null) {
      sql += ` OFFSET ?`;
      params.push(Number(filters.offset));
    }

    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.updateWorkerProfile = (id, data) => {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE worker_profiles
      SET name=?,
          phone=?,
          categories=?,
          headline=?,
          availability=?,
          pay_min=?,
          pay_type=?,
          city=?,
          location_text=?,
          about=?,
          experience_level=?,
          languages=?,
          work_format=?,
          contact_methods=?,
          age=?,
          tags=?,
          updated_at=?
      WHERE id=?
    `;
    db.run(
      sql,
      [
        data.name,
        data.phone,
        data.categories,
        data.headline,
        data.availability,
        data.pay_min,
        data.pay_type,
        data.city,
        data.location_text,
        data.about,
        data.experience_level,
        data.languages,
        data.work_format,
        data.contact_methods,
        data.age,
        data.tags,
        data.updated_at,
        id
      ],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
};

exports.deleteWorkerProfile = (id) => {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM worker_profiles WHERE id = ?`, [id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};
