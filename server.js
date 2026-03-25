const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const SESSION_HEADER = 'x-session-token';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_NUMBER = 100000;

const publicDir = path.join(__dirname, 'public');
const searchV2Index = path.join(publicDir, 'search-v2', 'index.html');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const allowedImageMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`);
  }
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedImageMime.has(file.mimetype)) {
      cb(new Error('Only jpg, png, webp images are allowed'));
      return;
    }
    cb(null, true);
  }
});

if (!ADMIN_KEY) {
  console.warn('ADMIN_KEY is not set. Admin endpoints are disabled.');
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
  if (value == null || value === '') return false;
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
    photoUrl: row.photo_url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
    isFavorite: false
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
    photoUrl: row.photo_url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
    isFavorite: false
  };
}

function withFavoriteFlag(items, favoriteIds) {
  const favoriteSet = new Set((favoriteIds || []).map(id => Number(id)));
  return items.map(item => ({
    ...item,
    isFavorite: favoriteSet.has(Number(item.id))
  }));
}

function normalizeEntityType(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'vacancy' || v === 'profile') return v;
  return '';
}

function normalizePhotoUrl(value, fallback = '') {
  if (value == null) return fallback || '';
  if (typeof value !== 'string') return fallback || '';
  const trimmed = value.trim();
  return trimmed;
}

function getTokenFromRequest(req) {
  return req.header(SESSION_HEADER) || (req.header('authorization') || '').replace(/Bearer\s+/i, '');
}

async function getSessionFromRequest(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    const session = await db.getSessionByToken(token);
    return session || null;
  } catch (err) {
    console.error('Session lookup failed', err);
    return null;
  }
}

function readAdminKey(req) {
  return req.header('x-admin-key') || req.query.adminKey;
}

function requireAdmin(req, res) {
  if (!ADMIN_KEY) {
    res.status(503).json({ error: 'Admin key is not configured' });
    return false;
  }
  const key = readAdminKey(req);
  if (!key || key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function parseFiltersPayload(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') {
    throw new Error('Invalid filters payload');
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    throw new Error('filters must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('filters must be an object');
  }
  return parsed;
}

function parseBoundedInt(value, field, min, max, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${field} must be an integer`);
  if (parsed < min || parsed > max) throw new Error(`${field} must be between ${min} and ${max}`);
  return parsed;
}

function parsePaginationAndSort(source, allowedSortBy, defaultSortBy) {
  let page;
  let pageSize;

  if ((source.limit != null && source.limit !== '') || (source.offset != null && source.offset !== '')) {
    const limit = parseBoundedInt(source.limit, 'limit', 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    const offset = parseBoundedInt(source.offset, 'offset', 0, Number.MAX_SAFE_INTEGER, 0);
    pageSize = limit;
    page = Math.floor(offset / limit) + 1;
  } else {
    page = parseBoundedInt(source.page, 'page', 1, MAX_PAGE_NUMBER, 1);
    pageSize = parseBoundedInt(source.pageSize, 'pageSize', 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  }

  const sortBy = source.sortBy || defaultSortBy;
  if (!allowedSortBy.includes(sortBy)) {
    throw new Error(`sortBy must be one of: ${allowedSortBy.join(', ')}`);
  }

  const sortOrder = String(source.sortOrder || 'desc').toLowerCase();
  if (!['asc', 'desc'].includes(sortOrder)) {
    throw new Error('sortOrder must be asc or desc');
  }

  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset, sortBy, sortOrder };
}

function hashLegacySha256(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function isBcryptHash(value) {
  return typeof value === 'string' && value.startsWith('$2');
}

async function hashPassword(password) {
  const rounds = Number.isInteger(BCRYPT_ROUNDS) && BCRYPT_ROUNDS > 0 ? BCRYPT_ROUNDS : 12;
  return bcrypt.hash(password, rounds);
}

function escapeCsv(s) {
  if (s == null) return '';
  return `"${String(s).replace(/"/g, '""')}"`;
}

function logMetric(name, payload = {}) {
  try {
    console.log(`[metric] ${name} ${JSON.stringify(payload)}`);
  } catch (err) {
    console.log(`[metric] ${name}`);
  }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get(['/', '/index.html'], (req, res) => {
  res.redirect(302, '/marketplace');
});

// Search/catalog routes are served only by the React bundle.
app.get(['/vacancies', '/services', '/marketplace', '/favorites'], (req, res) => {
  const hasV2Bundle = fs.existsSync(searchV2Index);
  if (hasV2Bundle) {
    res.sendFile(searchV2Index);
    return;
  }

  res.status(500).send('Search UI bundle is missing. Build search-v2 before starting the server.');
});

app.get('/worker.html', (req, res) => {
  res.redirect(302, '/vacancies');
});

app.get('/employer.html', (req, res) => {
  res.redirect(302, '/services');
});

app.use((req, res, next) => {
  const noStore = req.path.endsWith('.html') || req.path === '/brand-logo.svg' || req.path === '/jardam4y-logo.svg';
  if (noStore) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadsDir));

db.init();

app.post('/api/uploads/image', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });

    upload.single('image')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message || 'Upload failed' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ success: false, error: 'Image file is required' });
        return;
      }
      const url = `/uploads/${req.file.filename}`;
      res.json({ success: true, url });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Public: create application
app.post('/api/applications', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    const data = req.body || {};
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
    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/applications/public', async (req, res) => {
  try {
    const rows = await db.getAllApplications();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/applications', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await db.getAllApplications();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/applications/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const row = await db.getApplicationById(req.params.id);
    res.json(row || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/export', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await db.getAllApplications();
    const header = 'id,name,contact,address,category,otherCategoryText,description,datetime,price,created_at\n';
    const csv = rows
      .map(r => [
        r.id,
        escapeCsv(r.name),
        escapeCsv(r.contact),
        escapeCsv(r.address),
        escapeCsv(r.category),
        escapeCsv(r.otherCategoryText),
        escapeCsv(r.description),
        escapeCsv(r.datetime),
        escapeCsv(r.price),
        r.created_at
      ].join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tokmaker_applications.csv"');
    res.send(header + csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/applications/:id', async (req, res) => {
  try {
    const adminKey = readAdminKey(req);
    const session = await getSessionFromRequest(req);
    const appRow = await db.getApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ success: false, error: 'Application not found' });

    const isAdmin = !!ADMIN_KEY && adminKey && adminKey === ADMIN_KEY;
    const isOwner = session && appRow.user_id && session.user_id === appRow.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Forbidden' });

    const data = req.body || {};
    const changes = await db.updateApplication(appRow.id, {
      name: data.name || '',
      contact: data.contact || '',
      category: data.category || '',
      description: data.description || '',
      datetime: data.datetime || '',
      price: data.price || ''
    });
    if (changes === 0) return res.status(404).json({ success: false, error: 'Application not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/applications/:id', async (req, res) => {
  try {
    const adminKey = readAdminKey(req);
    const session = await getSessionFromRequest(req);
    const appRow = await db.getApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ success: false, error: 'Application not found' });

    const isAdmin = !!ADMIN_KEY && adminKey && adminKey === ADMIN_KEY;
    const isOwner = session && appRow.user_id && session.user_id === appRow.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Forbidden' });

    const changes = await db.deleteApplication(appRow.id);
    if (changes === 0) return res.status(404).json({ success: false, error: 'Application not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

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

// ========== FAVORITES ==========
app.get('/api/favorites', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const entityType = normalizeEntityType(req.query.entityType);
    if (req.query.entityType && !entityType) {
      return res.status(400).json({ success: false, error: 'entityType must be vacancy or profile' });
    }

    const rows = await db.getFavoritesByUser(session.user_id, entityType || '');
    const items = (await Promise.all(rows.map(async (row) => {
      if (row.entity_type === 'vacancy') {
        const vacancy = await db.getVacancyById(row.entity_id);
        if (!vacancy) return null;
        return {
          entityType: 'vacancy',
          entityId: row.entity_id,
          createdAt: row.created_at,
          item: { ...normalizeVacancy(vacancy), isFavorite: true }
        };
      }
      if (row.entity_type === 'profile') {
        const profile = await db.getWorkerProfileById(row.entity_id);
        if (!profile) return null;
        return {
          entityType: 'profile',
          entityId: row.entity_id,
          createdAt: row.created_at,
          item: { ...normalizeProfile(profile), isFavorite: true }
        };
      }
      return null;
    }))).filter(Boolean);
    const totals = {
      vacancy: items.filter(item => item.entityType === 'vacancy').length,
      profile: items.filter(item => item.entityType === 'profile').length
    };
    res.json({ success: true, items, totals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/favorites', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const entityType = normalizeEntityType(req.body && req.body.entityType);
    const entityId = Number(req.body && req.body.entityId);
    if (!entityType) return res.status(400).json({ success: false, error: 'entityType must be vacancy or profile' });
    if (!Number.isInteger(entityId) || entityId <= 0) return res.status(400).json({ success: false, error: 'entityId must be positive integer' });

    if (entityType === 'vacancy') {
      const item = await db.getVacancyById(entityId);
      if (!item) return res.status(404).json({ success: false, error: 'Vacancy not found' });
    } else {
      const item = await db.getWorkerProfileById(entityId);
      if (!item) return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    await db.addFavorite(session.user_id, entityType, entityId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/favorites/:entityType/:entityId', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const entityType = normalizeEntityType(req.params.entityType);
    const entityId = Number(req.params.entityId);
    if (!entityType) return res.status(400).json({ success: false, error: 'entityType must be vacancy or profile' });
    if (!Number.isInteger(entityId) || entityId <= 0) return res.status(400).json({ success: false, error: 'entityId must be positive integer' });

    await db.removeFavorite(session.user_id, entityType, entityId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== VACANCIES ==========
app.get('/api/vacancies', async (req, res) => {
  const startedAt = Date.now();
  try {
    const session = await getSessionFromRequest(req);
    const payloadFilters = parseFiltersPayload(req.query.filters);
    const source = { ...payloadFilters, ...req.query };
    const paging = parsePaginationAndSort(source, ['createdAt', 'title', 'payAmount', 'dateTime'], 'createdAt');

    const filters = {
      query: source.query || '',
      categories: parseList(source.category || source.categories),
      schedule: parseList(source.schedule || source.availability),
      payMin: source.payMin,
      payMax: source.payMax,
      date: source.date,
      flexibleOnly: parseBoolean(source.flexibleOnly),
      sortBy: paging.sortBy,
      sortOrder: paging.sortOrder,
      limit: paging.pageSize,
      offset: paging.offset
    };

    const facetFilters = {
      query: filters.query,
      categories: filters.categories,
      schedule: filters.schedule,
      payMin: filters.payMin,
      payMax: filters.payMax,
      date: filters.date,
      flexibleOnly: filters.flexibleOnly
    };

    const [rows, total, facets, favoriteIds] = await Promise.all([
      db.searchVacancies(filters),
      db.countVacancies(facetFilters),
      db.getVacancyFacets(facetFilters),
      session ? db.getFavoriteIdsByUser(session.user_id, 'vacancy') : Promise.resolve([])
    ]);

    let items = rows.map(normalizeVacancy);
    if (session) {
      items = withFavoriteFlag(items, favoriteIds);
    }
    if (String(source.legacy || '') === '1') {
      res.json(items);
      return;
    }

    res.json({
      items,
      total,
      page: paging.page,
      pageSize: paging.pageSize,
      facets,
      sort: { sortBy: paging.sortBy, sortOrder: paging.sortOrder }
    });
    logMetric('search_requests', {
      scope: 'vacancies',
      total,
      latency_ms: Date.now() - startedAt
    });
  } catch (err) {
    logMetric('search_requests', {
      scope: 'vacancies',
      error: true,
      latency_ms: Date.now() - startedAt
    });
    if (/must be|Invalid|filters/i.test(err.message)) {
      res.status(400).json({ error: err.message });
      return;
    }
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
    const session = await getSessionFromRequest(req);
    const row = await db.getVacancyById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Vacancy not found' });
    let item = normalizeVacancy(row);
    if (session) {
      const favoriteIds = await db.getFavoriteIdsByUser(session.user_id, 'vacancy');
      item = withFavoriteFlag([item], favoriteIds)[0];
    }
    res.json(item);
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
    const photoUrl = normalizePhotoUrl(data.photoUrl ?? data.photo_url);

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
      photo_url: photoUrl || null,
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
    const adminKey = readAdminKey(req);
    const session = await getSessionFromRequest(req);
    if (!adminKey && !session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const vacancy = await db.getVacancyById(req.params.id);
    if (!vacancy) return res.status(404).json({ success: false, error: 'Vacancy not found' });

    const isAdmin = !!ADMIN_KEY && adminKey && adminKey === ADMIN_KEY;
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
    const photoUrl = normalizePhotoUrl(data.photoUrl ?? data.photo_url, vacancy.photo_url || '');

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
      photo_url: photoUrl || null,
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
  const startedAt = Date.now();
  try {
    const adminKey = readAdminKey(req);
    const session = await getSessionFromRequest(req);
    if (!adminKey && !session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const vacancy = await db.getVacancyById(req.params.id);
    if (!vacancy) return res.status(404).json({ success: false, error: 'Vacancy not found' });

    const isAdmin = !!ADMIN_KEY && adminKey && adminKey === ADMIN_KEY;
    const isOwner = session && vacancy.user_id && session.user_id === vacancy.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Forbidden' });

    const changes = await db.deleteVacancy(vacancy.id);
    if (changes === 0) return res.status(404).json({ success: false, error: 'Vacancy not found' });
    await db.removeFavoritesByEntity('vacancy', vacancy.id);
    logMetric('delete_attempt', { scope: 'vacancy', success: true, latency_ms: Date.now() - startedAt });
    res.json({ success: true });
  } catch (err) {
    logMetric('delete_attempt', { scope: 'vacancy', success: false, latency_ms: Date.now() - startedAt });
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== WORKER PROFILES ==========
app.get('/api/profiles', async (req, res) => {
  const startedAt = Date.now();
  try {
    const session = await getSessionFromRequest(req);
    const payloadFilters = parseFiltersPayload(req.query.filters);
    const source = { ...payloadFilters, ...req.query };
    const paging = parsePaginationAndSort(source, ['createdAt', 'headline', 'payMin', 'city'], 'createdAt');

    const filters = {
      query: source.query || '',
      categories: parseList(source.category || source.categories),
      availability: parseList(source.availability),
      payMin: source.payMin,
      city: source.city,
      location: source.location,
      sortBy: paging.sortBy,
      sortOrder: paging.sortOrder,
      limit: paging.pageSize,
      offset: paging.offset
    };

    const facetFilters = {
      query: filters.query,
      categories: filters.categories,
      availability: filters.availability,
      payMin: filters.payMin,
      city: filters.city,
      location: filters.location
    };

    const [rows, total, facets, favoriteIds] = await Promise.all([
      db.searchWorkerProfiles(filters),
      db.countWorkerProfiles(facetFilters),
      db.getWorkerProfileFacets(facetFilters),
      session ? db.getFavoriteIdsByUser(session.user_id, 'profile') : Promise.resolve([])
    ]);

    let items = rows.map(normalizeProfile);
    if (session) {
      items = withFavoriteFlag(items, favoriteIds);
    }
    if (String(source.legacy || '') === '1') {
      res.json(items);
      return;
    }

    res.json({
      items,
      total,
      page: paging.page,
      pageSize: paging.pageSize,
      facets,
      sort: { sortBy: paging.sortBy, sortOrder: paging.sortOrder }
    });
    logMetric('search_requests', {
      scope: 'profiles',
      total,
      latency_ms: Date.now() - startedAt
    });
  } catch (err) {
    logMetric('search_requests', {
      scope: 'profiles',
      error: true,
      latency_ms: Date.now() - startedAt
    });
    if (/must be|Invalid|filters/i.test(err.message)) {
      res.status(400).json({ error: err.message });
      return;
    }
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
    const session = await getSessionFromRequest(req);
    const row = await db.getWorkerProfileById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Profile not found' });
    let item = normalizeProfile(row);
    if (session) {
      const favoriteIds = await db.getFavoriteIdsByUser(session.user_id, 'profile');
      item = withFavoriteFlag([item], favoriteIds)[0];
    }
    res.json(item);
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
    const photoUrl = normalizePhotoUrl(data.photoUrl ?? data.photo_url);

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
      photo_url: photoUrl || null,
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
    const adminKey = readAdminKey(req);
    const session = await getSessionFromRequest(req);
    if (!adminKey && !session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const profile = await db.getWorkerProfileById(req.params.id);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

    const isAdmin = !!ADMIN_KEY && adminKey && adminKey === ADMIN_KEY;
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
    const photoUrl = normalizePhotoUrl(data.photoUrl ?? data.photo_url, profile.photo_url || '');

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
      photo_url: photoUrl || null,
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
  const startedAt = Date.now();
  try {
    const adminKey = readAdminKey(req);
    const session = await getSessionFromRequest(req);
    if (!adminKey && !session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const profile = await db.getWorkerProfileById(req.params.id);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

    const isAdmin = !!ADMIN_KEY && adminKey && adminKey === ADMIN_KEY;
    const isOwner = session && profile.user_id && session.user_id === profile.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, error: 'Forbidden' });

    const changes = await db.deleteWorkerProfile(profile.id);
    if (changes === 0) return res.status(404).json({ success: false, error: 'Profile not found' });
    await db.removeFavoritesByEntity('profile', profile.id);
    logMetric('delete_attempt', { scope: 'profile', success: true, latency_ms: Date.now() - startedAt });
    res.json({ success: true });
  } catch (err) {
    logMetric('delete_attempt', { scope: 'profile', success: false, latency_ms: Date.now() - startedAt });
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== AUTH ==========
app.get('/api/auth/me', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const user = await db.getUserById(session.user_id);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(400).json({ success: false, error: 'Missing session token' });
    await db.deleteSessionByToken(token);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/logout-all', async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const deleted = await db.deleteSessionsByUserId(session.user_id);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const userId = await db.createUser({ name, email, password: passwordHash });
    const token = crypto.randomBytes(32).toString('hex');
    await db.createSession(userId, token);

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

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const user = await db.getUserByEmail(email);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    let passwordValid = false;
    const stored = user.password || '';

    if (isBcryptHash(stored)) {
      passwordValid = await bcrypt.compare(password, stored);
    } else {
      const legacyHash = hashLegacySha256(password);
      if (legacyHash === stored) {
        passwordValid = true;
        const upgradedHash = await hashPassword(password);
        await db.updateUserPassword(user.id, upgradedHash);
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await db.createSession(user.id, token);

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

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path, method: req.method });
});

app.listen(PORT, () => {
  console.log(`JARDAM4Y server running on http://localhost:${PORT}`);
});
