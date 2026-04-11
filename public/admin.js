function getAdminToken() {
  return localStorage.getItem('token') || '';
}

function getAdminHeaders(extra = {}) {
  const token = getAdminToken();
  return token ? { ...extra, 'x-session-token': token } : { ...extra };
}

function showAdminMessage(text, type) {
  const element = document.getElementById('adminMessage');
  if (!element) return;
  element.textContent = text;
  element.className = `message show ${type}`;
  setTimeout(() => element.classList.remove('show'), 4000);
}

function escapeAdminHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function formatAdminDate(value) {
  if (!value) return 'Не указано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function setAdminAccess(isVisible) {
  const authCard = document.getElementById('adminAuthCard');
  const adminArea = document.getElementById('adminArea');
  if (authCard) authCard.style.display = isVisible ? 'none' : 'block';
  if (adminArea) adminArea.style.display = isVisible ? 'block' : 'none';
}

async function fetchAdminJson(url) {
  const response = await fetch(url, { headers: { ...getAdminHeaders() } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload && payload.error ? payload.error : 'Request failed');
  }
  return payload;
}

async function loadAdminPanel() {
  const token = getAdminToken();
  if (!token) {
    setAdminAccess(false);
    return;
  }

  try {
    const mePayload = await fetchAdminJson('/api/auth/me');
    if (!mePayload.user || !mePayload.user.isAdmin) {
      setAdminAccess(false);
      showAdminMessage('У этого аккаунта нет прав администратора.', 'error');
      return;
    }

    localStorage.setItem('user', JSON.stringify(mePayload.user));
    setAdminAccess(true);

    const [applications, profiles, vacancies] = await Promise.all([
      fetchAdminJson('/api/applications/my'),
      fetchAdminJson('/api/profiles/my'),
      fetchAdminJson('/api/vacancies/my')
    ]);

    document.getElementById('adminApplicationsCount').textContent = String(applications.length);
    document.getElementById('adminProfilesCount').textContent = String(profiles.length);
    document.getElementById('adminVacanciesCount').textContent = String(vacancies.length);

    const tbody = document.querySelector('#appsTable tbody');
    const empty = document.getElementById('adminEmpty');
    if (!tbody || !empty) return;

    if (!applications.length) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = applications.map((item) => `
      <tr>
        <td>${item.id}</td>
        <td>${escapeAdminHtml(item.name)}</td>
        <td>${escapeAdminHtml(item.contact)}</td>
        <td>${escapeAdminHtml(item.address || 'Не указано')}</td>
        <td>${escapeAdminHtml(item.category || item.otherCategoryText || 'Не указано')}</td>
        <td>${escapeAdminHtml(item.price || 'Не указано')}</td>
        <td>${escapeAdminHtml(formatAdminDate(item.created_at))}</td>
      </tr>
    `).join('');
  } catch (err) {
    if (/unauthorized/i.test(err.message || '')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setAdminAccess(false);
      return;
    }

    showAdminMessage(err.message || 'Не удалось загрузить админ-панель.', 'error');
  }
}

async function exportApplicationsCsv() {
  try {
    const response = await fetch('/api/admin/export', { headers: { ...getAdminHeaders() } });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload && payload.error ? payload.error : 'Export failed');
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'jardam4y_applications.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    showAdminMessage(err.message || 'Не удалось выгрузить CSV.', 'error');
  }
}

async function logoutAdmin() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { ...getAdminHeaders() }
    });
  } catch (err) {
    console.error(err);
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.href = '/';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('adminLoginBtn');
  const exportBtn = document.getElementById('exportBtn');
  const refreshBtn = document.getElementById('adminRefreshBtn');
  const manageCardsBtn = document.getElementById('adminManageCardsBtn');
  const dashboardBtn = document.getElementById('adminDashboardBtn');
  const logoutBtn = document.getElementById('adminLogoutBtn');

  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      location.href = '/auth.html?next=%2Fadmin.html';
    });
  }

  if (exportBtn) exportBtn.addEventListener('click', exportApplicationsCsv);
  if (refreshBtn) refreshBtn.addEventListener('click', loadAdminPanel);
  if (manageCardsBtn) manageCardsBtn.addEventListener('click', () => location.href = '/dashboard.html');
  if (dashboardBtn) dashboardBtn.addEventListener('click', () => location.href = '/dashboard.html');
  if (logoutBtn) logoutBtn.addEventListener('click', logoutAdmin);

  loadAdminPanel();
});
