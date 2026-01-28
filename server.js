const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = '123123'; // process.env.ADMIN_KEY || '123123';
const SESSION_HEADER = 'x-session-token';

async function getSessionFromRequest(req) {
  const token = req.header(SESSION_HEADER) || (req.header('authorization') || '').replace(/Bearer\s+/i, '');
  if (!token) return null;
  try {
    const session = await db.getSessionByToken(token);
    return session || null;
  } catch (err) {
    console.error('Session lookup failed', err);
    return null;
  }
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (err) {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
    return [];
  }
  return [];
}

function stringifyList(value) {
  if (!value) return '[]';
  if (Array.isArray(value)) return JSON.stringify(value.filter(Boolean));
  if (typeof value === 'string') return JSON.stringify(parseList(value));
  return '[]';
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseBoolean(value) {
  if (value === true || value === false) return value;
  if (value == null) return false;
  return ['1', 'true', 'on', 'yes'].includes(String(value).toLowerCase());
}

function normalizeVacancy(row) {
  if (!row) return row;
  return {
    id: row.id,
    contactName: row.contact_name,
    phone: row.phone,
    locationText: row.location_text,
    categoryIds: parseList(row.category_ids),
    title: row.title,
    description: row.description,
    dateTime: row.date_time,
    isFlexibleTime: !!row.is_flexible_time,
    schedule: parseList(row.schedule),
    payAmount: row.pay_amount,
    payType: row.pay_type,
    tags: parseList(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id
  };
}

function normalizeProfile(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    categories: parseList(row.categories),
    headline: row.headline,
    availability: parseList(row.availability),
    payMin: row.pay_min,
    payType: row.pay_type,
    city: row.city,
    locationText: row.location_text,
    about: row.about,
    experienceLevel: row.experience_level,
    languages: parseList(row.languages),
    workFormat: parseList(row.work_format),
    contactMethods: parseList(row.contact_methods),
    age: row.age,
    tags: parseList(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id
  };
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create table if not exists
db.init();

// Public: create application (from employer)
app.post('/api/applications', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);

    const data = req.body;
    const id = await db.createApplication({
      name: data.name || '',
      contact: data.contact || '',
      address: data.address || '',
      category: data.category || '',
      otherCategoryText: data.otherCategoryText || '',
      description: data.description || '',
      datetime: data.datetime || '',
      price: data.price || '',
      created_at: new Date().toISOString(),
      user_id: session ? session.user_id : null
    });
    console.log('New application created:', id, data);
    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Public list of vacancies (for seekers)
app.get('/api/applications/public', async (req, res) => {
  try {
    const rows = await db.getAllApplications();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: get all applications (requires admin key)
app.get('/api/admin/applications', async (req, res) => {
  const key = req.header('x-admin-key') || req.query.adminKey;
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const rows = await db.getAllApplications();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: get single application
app.get('/api/admin/applications/:id', async (req, res) => {
  const key = req.header('x-admin-key') || req.query.adminKey;
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const row = await db.getApplicationById(req.params.id);
    res.json(row || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin export CSV
app.get('/api/admin/export', async (req, res) => {
  const key = req.header('x-admin-key') || req.query.adminKey;
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const rows = await db.getAllApplications();
    const header = 'id,name,contact,address,category,otherCategoryText,description,datetime,price,created_at\n';
    const csv = rows.map(r => [r.id, escapeCsv(r.name), escapeCsv(r.contact), escapeCsv(r.address), escapeCsv(r.category), escapeCsv(r.otherCategoryText), escapeCsv(r.description), escapeCsv(r.datetime), escapeCsv(r.price), r.created_at].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tokmaker_applications.csv"');
    res.send(header + csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public: update application
app.put('/api/applications/:id', async (req, res) => {
  try {
    const adminKey = req.header('x-admin-key') || req.query.adminKey;
    const session = await getSessionFromRequest(req);

    const appRow = await db.getApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ success: false, error: 'Application not found' });

    const isAdmin = adminKey && adminKey === ADMIN_KEY;
    const isOwner = session && appRow.user_id && session.user_id === appRow.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Forbidden' });

    const data = req.body;
    const changes = await db.updateApplication(appRow.id, {
      name: data.name || '',
      contact: data.contact || '',
      category: data.category || '',
      description: data.description || '',
      datetime: data.datetime || '',
      price: data.price || ''
    });
    if (changes === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }
    console.log('Application updated:', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Public: delete application
app.delete('/api/applications/:id', async (req, res) => {
  try {
    const adminKey = req.header('x-admin-key') || req.query.adminKey;
    const session = await getSessionFromRequest(req);

    const appRow = await db.getApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ success: false, error: 'Application not found' });

    const isAdmin = adminKey && adminKey === ADMIN_KEY;
    const isOwner = session && appRow.user_id && session.user_id === appRow.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Forbidden' });

    console.log('DELETE request received for ID:', req.params.id);
    const changes = await db.deleteApplication(appRow.id);
    if (changes === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }
    console.log('Application deleted successfully:', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Authenticated: get own applications
app.get('/api/applications/my', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const rows = await db.getApplicationsByUserId(session.user_id);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== VACANCIES ==========
app.get('/api/vacancies', async (req, res) => {
  try {
    const filters = {
      query: req.query.query || '',
      categories: parseList(req.query.category || req.query.categories),
      schedule: parseList(req.query.schedule || req.query.availability),
      payMin: req.query.payMin,
      payMax: req.query.payMax,
      date: req.query.date,
      flexibleOnly: parseBoolean(req.query.flexibleOnly),
      limit: req.query.limit,
      offset: req.query.offset
    };
    const rows = await db.searchVacancies(filters);
    res.json(rows.map(normalizeVacancy));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vacancies/my', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const rows = await db.getVacanciesByUserId(session.user_id);
    res.json(rows.map(normalizeVacancy));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vacancies/:id', async (req, res) => {
  try {
    const row = await db.getVacancyById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Vacancy not found' });
    res.json(normalizeVacancy(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vacancies', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = req.body || {};
    const contactName = data.contactName || data.contact_name || '';
    const phone = data.phone || '';
    const title = data.title || '';
    const description = data.description || '';
    const categoryIds = data.categoryIds || data.category_ids || [];
    const locationText = data.locationText || data.location_text || '';
    const schedule = data.schedule || [];
    const isFlexibleTime = parseBoolean(data.isFlexibleTime || data.is_flexible_time);
    const dateTime = isFlexibleTime ? null : (data.dateTime || data.date_time || '');
    const payAmount = toNumber(data.payAmount || data.pay_amount);
    const payType = data.payType || data.pay_type || '';
    const tags = data.tags || '';

    if (!contactName || !phone || !title || !description || parseList(categoryIds).length === 0) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const now = new Date().toISOString();
    const id = await db.createVacancy({
      contact_name: contactName,
      phone,
      location_text: locationText,
      category_ids: stringifyList(categoryIds),
      title,
      description,
      date_time: dateTime,
      is_flexible_time: isFlexibleTime ? 1 : 0,
      schedule: stringifyList(schedule),
      pay_amount: payAmount,
      pay_type: payType,
      tags: stringifyList(tags),
      created_at: now,
      updated_at: now,
      user_id: session.user_id
    });

    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/vacancies/:id', async (req, res) => {
  try {
    const adminKey = req.header('x-admin-key') || req.query.adminKey;
    const session = await getSessionFromRequest(req);
    if (!adminKey && !session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const vacancy = await db.getVacancyById(req.params.id);
    if (!vacancy) return res.status(404).json({ success: false, error: 'Vacancy not found' });

    const isAdmin = adminKey && adminKey === ADMIN_KEY;
    const isOwner = session && vacancy.user_id && session.user_id === vacancy.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Forbidden' });

    const data = req.body || {};
    const contactName = data.contactName || data.contact_name || '';
    const phone = data.phone || '';
    const title = data.title || '';
    const description = data.description || '';
    const categoryIds = data.categoryIds || data.category_ids || [];
    const locationText = data.locationText || data.location_text || '';
    const schedule = data.schedule || [];
    const isFlexibleTime = parseBoolean(data.isFlexibleTime || data.is_flexible_time);
    const dateTime = isFlexibleTime ? null : (data.dateTime || data.date_time || '');
    const payAmount = toNumber(data.payAmount || data.pay_amount);
    const payType = data.payType || data.pay_type || '';
    const tags = data.tags || '';

    if (!contactName || !phone || !title || !description || parseList(categoryIds).length === 0) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const changes = await db.updateVacancy(vacancy.id, {
      contact_name: contactName,
      phone,
      location_text: locationText,
      category_ids: stringifyList(categoryIds),
      title,
      description,
      date_time: dateTime,
      is_flexible_time: isFlexibleTime ? 1 : 0,
      schedule: stringifyList(schedule),
      pay_amount: payAmount,
      pay_type: payType,
      tags: stringifyList(tags),
      updated_at: new Date().toISOString()
    });

    if (changes === 0) return res.status(404).json({ success: false, error: 'Vacancy not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/vacancies/:id', async (req, res) => {
  try {
    const adminKey = req.header('x-admin-key') || req.query.adminKey;
    const session = await getSessionFromRequest(req);
    if (!adminKey && !session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const vacancy = await db.getVacancyById(req.params.id);
    if (!vacancy) return res.status(404).json({ success: false, error: 'Vacancy not found' });

    const isAdmin = adminKey && adminKey === ADMIN_KEY;
    const isOwner = session && vacancy.user_id && session.user_id === vacancy.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Forbidden' });

    const changes = await db.deleteVacancy(vacancy.id);
    if (changes === 0) return res.status(404).json({ success: false, error: 'Vacancy not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== WORKER PROFILES ==========
app.get('/api/profiles', async (req, res) => {
  try {
    const filters = {
      query: req.query.query || '',
      categories: parseList(req.query.category || req.query.categories),
      availability: parseList(req.query.availability),
      payMin: req.query.payMin,
      city: req.query.city,
      location: req.query.location,
      limit: req.query.limit,
      offset: req.query.offset
    };
    const rows = await db.searchWorkerProfiles(filters);
    res.json(rows.map(normalizeProfile));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/profiles/my', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const rows = await db.getWorkerProfilesByUserId(session.user_id);
    res.json(rows.map(normalizeProfile));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/profiles/:id', async (req, res) => {
  try {
    const row = await db.getWorkerProfileById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Profile not found' });
    res.json(normalizeProfile(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profiles', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = req.body || {};
    const name = data.name || '';
    const phone = data.phone || '';
    const categories = data.categories || [];
    const headline = data.headline || '';
    const availability = data.availability || [];
    const payMin = toNumber(data.payMin || data.pay_min);
    const payType = data.payType || data.pay_type || '';
    const city = data.city || '';
    const locationText = data.locationText || data.location_text || '';
    const about = data.about || '';
    const experienceLevel = data.experienceLevel || data.experience_level || '';
    const languages = data.languages || [];
    const workFormat = data.workFormat || data.work_format || [];
    const contactMethods = data.contactMethods || data.contact_methods || [];
    const age = toNumber(data.age);
    const tags = data.tags || '';

    if (!name || !phone || parseList(categories).length === 0 || !headline || parseList(availability).length === 0 || !payType || payMin == null || !city || !locationText || !about) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const now = new Date().toISOString();
    const id = await db.createWorkerProfile({
      name,
      phone,
      categories: stringifyList(categories),
      headline,
      availability: stringifyList(availability),
      pay_min: payMin,
      pay_type: payType,
      city,
      location_text: locationText,
      about,
      experience_level: experienceLevel,
      languages: stringifyList(languages),
      work_format: stringifyList(workFormat),
      contact_methods: stringifyList(contactMethods),
      age,
      tags: stringifyList(tags),
      created_at: now,
      updated_at: now,
      user_id: session.user_id
    });

    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/profiles/:id', async (req, res) => {
  try {
    const adminKey = req.header('x-admin-key') || req.query.adminKey;
    const session = await getSessionFromRequest(req);
    if (!adminKey && !session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const profile = await db.getWorkerProfileById(req.params.id);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

    const isAdmin = adminKey && adminKey === ADMIN_KEY;
    const isOwner = session && profile.user_id && session.user_id === profile.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Forbidden' });

    const data = req.body || {};
    const name = data.name || '';
    const phone = data.phone || '';
    const categories = data.categories || [];
    const headline = data.headline || '';
    const availability = data.availability || [];
    const payMin = toNumber(data.payMin || data.pay_min);
    const payType = data.payType || data.pay_type || '';
    const city = data.city || '';
    const locationText = data.locationText || data.location_text || '';
    const about = data.about || '';
    const experienceLevel = data.experienceLevel || data.experience_level || '';
    const languages = data.languages || [];
    const workFormat = data.workFormat || data.work_format || [];
    const contactMethods = data.contactMethods || data.contact_methods || [];
    const age = toNumber(data.age);
    const tags = data.tags || '';

    if (!name || !phone || parseList(categories).length === 0 || !headline || parseList(availability).length === 0 || !payType || payMin == null || !city || !locationText || !about) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const changes = await db.updateWorkerProfile(profile.id, {
      name,
      phone,
      categories: stringifyList(categories),
      headline,
      availability: stringifyList(availability),
      pay_min: payMin,
      pay_type: payType,
      city,
      location_text: locationText,
      about,
      experience_level: experienceLevel,
      languages: stringifyList(languages),
      work_format: stringifyList(workFormat),
      contact_methods: stringifyList(contactMethods),
      age,
      tags: stringifyList(tags),
      updated_at: new Date().toISOString()
    });

    if (changes === 0) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/profiles/:id', async (req, res) => {
  try {
    const adminKey = req.header('x-admin-key') || req.query.adminKey;
    const session = await getSessionFromRequest(req);
    if (!adminKey && !session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const profile = await db.getWorkerProfileById(req.params.id);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

    const isAdmin = adminKey && adminKey === ADMIN_KEY;
    const isOwner = session && profile.user_id && session.user_id === profile.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Forbidden' });

    const changes = await db.deleteWorkerProfile(profile.id);
    if (changes === 0) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auth: register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const user = await db.getUserByEmail(email);
    if (user) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    const userId = await db.createUser({ name, email, password: hashedPassword });

    const token = crypto.randomBytes(32).toString('hex');
    await db.createSession(userId, token);

    console.log('User registered:', email);
    res.json({
      success: true,
      token,
      user: { id: userId, name, email }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auth: login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password !== hashedPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await db.createSession(user.id, token);

    console.log('User logged in:', email);
    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Catch-all 404 handler (ВАЖНО: должен быть ПОСЛЕ всех остальных routes)
app.use((req, res) => {
  console.log('404 - Not found:', req.method, req.path);
  res.status(404).json({ error: 'Endpoint not found', path: req.path, method: req.method });
});

function escapeCsv(s) {
  if (s == null) return '';
  return '"' + String(s).replace(/"/g, '""') + '"';
}

app.listen(PORT, () => {
  console.log(`JARDAM4Y server running on http://localhost:${PORT}`);
  console.log('ADMIN_KEY=' + ADMIN_KEY);
});
