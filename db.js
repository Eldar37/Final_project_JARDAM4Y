const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'tokmaker.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('DB Error:', err);
  else console.log('Connected to SQLite database');
});

const VACANCY_SORT_COLUMNS = {
  createdAt: 'created_at',
  title: 'title',
  payAmount: 'pay_amount',
  dateTime: 'date_time'
};

const PROFILE_SORT_COLUMNS = {
  createdAt: 'created_at',
  headline: 'headline',
  payMin: 'pay_min',
  city: 'city'
};

function parseTextList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
  } catch (err) {
    // fallback below
  }
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapToFacetArray(map) {
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

function bumpCount(map, value) {
  if (!value) return;
  map.set(value, (map.get(value) || 0) + 1);
}

function normalizeSortColumn(mapping, sortBy, fallbackKey) {
  if (sortBy && mapping[sortBy]) return mapping[sortBy];
  return mapping[fallbackKey];
}

function normalizeSortDirection(sortOrder) {
  return String(sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
}

function buildVacancySearchQuery(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.query) {
    const like = `%${filters.query}%`;
    conditions.push('(title LIKE ? OR description LIKE ? OR tags LIKE ? OR location_text LIKE ? OR category_ids LIKE ?)');
    params.push(like, like, like, like, like);
  }

  const categories = parseTextList(filters.categories);
  if (categories.length) {
    const chunk = categories.map(() => 'category_ids LIKE ?').join(' OR ');
    conditions.push(`(${chunk})`);
    categories.forEach(cat => params.push(`%${cat}%`));
  }

  const schedule = parseTextList(filters.schedule);
  if (schedule.length) {
    const chunk = schedule.map(() => 'schedule LIKE ?').join(' OR ');
    conditions.push(`(${chunk})`);
    schedule.forEach(item => params.push(`%${item}%`));
  }

  const payMin = toNumber(filters.payMin);
  if (payMin != null) {
    conditions.push('pay_amount >= ?');
    params.push(payMin);
  }

  const payMax = toNumber(filters.payMax);
  if (payMax != null) {
    conditions.push('pay_amount <= ?');
    params.push(payMax);
  }

  if (filters.date) {
    conditions.push('date(date_time) = date(?)');
    params.push(filters.date);
  }

  if (filters.flexibleOnly) {
    conditions.push('is_flexible_time = 1');
  }

  const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, params };
}

function buildProfileSearchQuery(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.query) {
    const like = `%${filters.query}%`;
    conditions.push('(headline LIKE ? OR about LIKE ? OR tags LIKE ? OR location_text LIKE ? OR city LIKE ? OR categories LIKE ?)');
    params.push(like, like, like, like, like, like);
  }

  const categories = parseTextList(filters.categories);
  if (categories.length) {
    const chunk = categories.map(() => 'categories LIKE ?').join(' OR ');
    conditions.push(`(${chunk})`);
    categories.forEach(cat => params.push(`%${cat}%`));
  }

  const availability = parseTextList(filters.availability);
  if (availability.length) {
    const chunk = availability.map(() => 'availability LIKE ?').join(' OR ');
    conditions.push(`(${chunk})`);
    availability.forEach(item => params.push(`%${item}%`));
  }

  const payMin = toNumber(filters.payMin);
  if (payMin != null) {
    conditions.push('pay_min >= ?');
    params.push(payMin);
  }

  if (filters.city) {
    conditions.push('city = ?');
    params.push(filters.city);
  }

  if (filters.location) {
    conditions.push('location_text LIKE ?');
    params.push(`%${filters.location}%`);
  }

  const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, params };
}

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

  db.all('PRAGMA table_info(applications)', (err, rows) => {
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
      photo_url TEXT,
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
      photo_url TEXT,
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

  db.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      created_at TEXT,
      UNIQUE(user_id, entity_type, entity_id),
      FOREIGN KEY(user_id) REFERENCES users(id)
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
    { name: 'photo_url', type: 'TEXT' },
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
    { name: 'photo_url', type: 'TEXT' },
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

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_vacancies_created_at ON vacancies(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_vacancies_user_id ON vacancies(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_vacancies_pay_amount ON vacancies(pay_amount)',
    'CREATE INDEX IF NOT EXISTS idx_vacancies_date_time ON vacancies(date_time)',
    'CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON worker_profiles(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON worker_profiles(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_profiles_pay_min ON worker_profiles(pay_min)',
    'CREATE INDEX IF NOT EXISTS idx_profiles_city ON worker_profiles(city)',
    'CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_favorites_entity ON favorites(entity_type, entity_id)'
  ];

  indexes.forEach(sql => db.run(sql));
  console.log('Tables and indexes initialized');
};

// ========== APPLICATIONS ==========
exports.createApplication = (data) => {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO applications (name, contact, address, category, otherCategoryText, description, datetime, price, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
      sql,
      [data.name, data.contact, data.address, data.category, data.otherCategoryText, data.description, data.datetime, data.price, data.created_at, data.user_id || null],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

exports.getAllApplications = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM applications ORDER BY created_at DESC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.getApplicationById = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM applications WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.getApplicationsByUserId = (userId) => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
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
    db.run('DELETE FROM applications WHERE id = ?', [id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

// ========== USERS ==========
exports.getUserByEmail = (email) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.getUserById = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.createUser = (data) => {
  return new Promise((resolve, reject) => {
    const sql = 'INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, ?)';
    db.run(sql, [data.name, data.email, data.password, new Date().toISOString()], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
};

exports.updateUserPassword = (userId, passwordHash) => {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET password = ? WHERE id = ?';
    db.run(sql, [passwordHash, userId], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

// ========== SESSIONS ==========
exports.createSession = (userId, token) => {
  return new Promise((resolve, reject) => {
    const sql = 'INSERT INTO sessions (user_id, token, created_at) VALUES (?, ?, ?)';
    db.run(sql, [userId, token, new Date().toISOString()], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
};

exports.getSessionByToken = (token) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM sessions WHERE token = ?', [token], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.deleteSessionByToken = (token) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM sessions WHERE token = ?', [token], function (err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });
};

exports.deleteSessionsByUserId = (userId) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM sessions WHERE user_id = ?', [userId], function (err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });
};

// ========== FAVORITES ==========
exports.addFavorite = (userId, entityType, entityId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR IGNORE INTO favorites (user_id, entity_type, entity_id, created_at)
      VALUES (?, ?, ?, ?)
    `;
    db.run(sql, [userId, entityType, entityId, new Date().toISOString()], function (err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });
};

exports.removeFavorite = (userId, entityType, entityId) => {
  return new Promise((resolve, reject) => {
    const sql = 'DELETE FROM favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?';
    db.run(sql, [userId, entityType, entityId], function (err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });
};

exports.removeFavoritesByEntity = (entityType, entityId) => {
  return new Promise((resolve, reject) => {
    const sql = 'DELETE FROM favorites WHERE entity_type = ? AND entity_id = ?';
    db.run(sql, [entityType, entityId], function (err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });
};

exports.getFavoritesByUser = (userId, entityType = '') => {
  return new Promise((resolve, reject) => {
    const sql = entityType
      ? 'SELECT * FROM favorites WHERE user_id = ? AND entity_type = ? ORDER BY created_at DESC'
      : 'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC';
    const params = entityType ? [userId, entityType] : [userId];
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.getFavoriteIdsByUser = (userId, entityType) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT entity_id FROM favorites WHERE user_id = ? AND entity_type = ?';
    db.all(sql, [userId, entityType], (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []).map(row => row.entity_id));
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
        photo_url,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
      sql,
      [
        data.contact_name,
        data.phone,
        data.photo_url || null,
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
    db.get('SELECT * FROM vacancies WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.getVacanciesByUserId = (userId) => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM vacancies WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.searchVacancies = (filters = {}) => {
  return new Promise((resolve, reject) => {
    const { whereSql, params } = buildVacancySearchQuery(filters);
    const sortColumn = normalizeSortColumn(VACANCY_SORT_COLUMNS, filters.sortBy, 'createdAt');
    const sortDirection = normalizeSortDirection(filters.sortOrder);
    const sqlParams = [...params];

    let sql = `SELECT * FROM vacancies${whereSql} ORDER BY ${sortColumn} ${sortDirection}, id DESC`;

    const limit = toNumber(filters.limit);
    const offset = toNumber(filters.offset);
    if (limit != null) {
      sql += ' LIMIT ?';
      sqlParams.push(limit);
    }
    if (offset != null) {
      sql += ' OFFSET ?';
      sqlParams.push(offset);
    }

    db.all(sql, sqlParams, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.countVacancies = (filters = {}) => {
  return new Promise((resolve, reject) => {
    const { whereSql, params } = buildVacancySearchQuery(filters);
    db.get(`SELECT COUNT(*) AS total FROM vacancies${whereSql}`, params, (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.total : 0);
    });
  });
};

exports.getVacancyFacets = (filters = {}) => {
  return new Promise((resolve, reject) => {
    const { whereSql, params } = buildVacancySearchQuery(filters);
    const sql = `SELECT category_ids, schedule, pay_amount, is_flexible_time FROM vacancies${whereSql}`;
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      const categoryMap = new Map();
      const scheduleMap = new Map();
      let payMin = null;
      let payMax = null;
      let flexibleCount = 0;

      (rows || []).forEach((row) => {
        parseTextList(row.category_ids).forEach(value => bumpCount(categoryMap, value));
        parseTextList(row.schedule).forEach(value => bumpCount(scheduleMap, value));

        const amount = toNumber(row.pay_amount);
        if (amount != null) {
          payMin = payMin == null ? amount : Math.min(payMin, amount);
          payMax = payMax == null ? amount : Math.max(payMax, amount);
        }

        if (row.is_flexible_time) flexibleCount += 1;
      });

      resolve({
        categories: mapToFacetArray(categoryMap),
        schedule: mapToFacetArray(scheduleMap),
        pay: { min: payMin, max: payMax },
        flexibleCount
      });
    });
  });
};

exports.updateVacancy = (id, data) => {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE vacancies
      SET contact_name=?,
          phone=?,
          photo_url=?,
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
        data.photo_url || null,
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
    db.run('DELETE FROM vacancies WHERE id = ?', [id], function (err) {
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
        photo_url,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
      sql,
      [
        data.name,
        data.phone,
        data.photo_url || null,
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
    db.get('SELECT * FROM worker_profiles WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.getWorkerProfilesByUserId = (userId) => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM worker_profiles WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.searchWorkerProfiles = (filters = {}) => {
  return new Promise((resolve, reject) => {
    const { whereSql, params } = buildProfileSearchQuery(filters);
    const sortColumn = normalizeSortColumn(PROFILE_SORT_COLUMNS, filters.sortBy, 'createdAt');
    const sortDirection = normalizeSortDirection(filters.sortOrder);
    const sqlParams = [...params];

    let sql = `SELECT * FROM worker_profiles${whereSql} ORDER BY ${sortColumn} ${sortDirection}, id DESC`;

    const limit = toNumber(filters.limit);
    const offset = toNumber(filters.offset);
    if (limit != null) {
      sql += ' LIMIT ?';
      sqlParams.push(limit);
    }
    if (offset != null) {
      sql += ' OFFSET ?';
      sqlParams.push(offset);
    }

    db.all(sql, sqlParams, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.countWorkerProfiles = (filters = {}) => {
  return new Promise((resolve, reject) => {
    const { whereSql, params } = buildProfileSearchQuery(filters);
    db.get(`SELECT COUNT(*) AS total FROM worker_profiles${whereSql}`, params, (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.total : 0);
    });
  });
};

exports.getWorkerProfileFacets = (filters = {}) => {
  return new Promise((resolve, reject) => {
    const { whereSql, params } = buildProfileSearchQuery(filters);
    const sql = `SELECT categories, availability, city, pay_min FROM worker_profiles${whereSql}`;
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      const categoryMap = new Map();
      const availabilityMap = new Map();
      const cityMap = new Map();
      let payMin = null;
      let payMax = null;

      (rows || []).forEach((row) => {
        parseTextList(row.categories).forEach(value => bumpCount(categoryMap, value));
        parseTextList(row.availability).forEach(value => bumpCount(availabilityMap, value));
        bumpCount(cityMap, row.city);

        const amount = toNumber(row.pay_min);
        if (amount != null) {
          payMin = payMin == null ? amount : Math.min(payMin, amount);
          payMax = payMax == null ? amount : Math.max(payMax, amount);
        }
      });

      resolve({
        categories: mapToFacetArray(categoryMap),
        availability: mapToFacetArray(availabilityMap),
        cities: mapToFacetArray(cityMap),
        pay: { min: payMin, max: payMax }
      });
    });
  });
};

exports.updateWorkerProfile = (id, data) => {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE worker_profiles
      SET name=?,
          phone=?,
          photo_url=?,
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
        data.photo_url || null,
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
    db.run('DELETE FROM worker_profiles WHERE id = ?', [id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};
