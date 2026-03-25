const dashboardState = {
  activeTab: 'service',
  services: [],
  vacancies: [],
  selectedItem: null
};

document.addEventListener('DOMContentLoaded', () => {
  initDashboard().catch((err) => {
    console.error(err);
    showDashboardMessage('Не удалось открыть личный кабинет.', 'error');
  });
});

function dashboardPath() {
  return `${location.pathname}${location.search}`;
}

function dashboardAuthUrl(next = dashboardPath()) {
  return `/auth.html?next=${encodeURIComponent(next)}`;
}

function getDashboardToken() {
  return localStorage.getItem('token') || '';
}

function getDashboardHeaders() {
  const token = getDashboardToken();
  return token ? { 'x-session-token': token } : {};
}

function showDashboardMessage(text, type) {
  const element = document.getElementById('dashboardMessage');
  if (!element) return;
  element.textContent = text;
  element.className = `message show ${type}`;
  setTimeout(() => element.classList.remove('show'), 3500);
}

function escapeDashboardHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function formatDashboardPay(amount, type) {
  if (amount == null || amount === '') return 'Договорная';
  const label = type === 'hour' ? 'за час' : type === 'shift' ? 'за смену' : 'за работу';
  return `${amount} сом ${label}`;
}

function formatDashboardDate(value) {
  if (!value) return 'По договоренности';
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

function dashboardTitle(item, tab) {
  if (tab === 'service') return item.headline || item.name || 'Услуга';
  return item.title || 'Вакансия';
}

function redirectDashboardToAuth() {
  location.href = dashboardAuthUrl('/dashboard.html');
}

async function initDashboard() {
  if (!getDashboardToken()) {
    redirectDashboardToAuth();
    return;
  }

  const meResponse = await fetch('/api/auth/me', { headers: { ...getDashboardHeaders() } });
  if (!meResponse.ok) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    redirectDashboardToAuth();
    return;
  }

  bindDashboardEvents();
  await loadDashboardData();
}

function bindDashboardEvents() {
  document.querySelectorAll('.dashboard-tab').forEach((button) => {
    button.addEventListener('click', () => {
      dashboardState.activeTab = button.dataset.tab === 'vacancy' ? 'vacancy' : 'service';
      document.querySelectorAll('.dashboard-tab').forEach((tabButton) => tabButton.classList.remove('active'));
      button.classList.add('active');
      renderDashboardList();
    });
  });

  document.getElementById('createServiceBtn').addEventListener('click', () => {
    location.href = '/service-form.html';
  });

  document.getElementById('createVacancyBtn').addEventListener('click', () => {
    location.href = '/vacancy-form.html';
  });

  document.getElementById('dashboardLogoutBtn').addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { ...getDashboardHeaders() } });
    } catch (err) {
      console.error(err);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      location.href = '/';
    }
  });

  document.getElementById('dashboardModalClose').addEventListener('click', closeDashboardModal);
  document.getElementById('dashboardModal').addEventListener('click', (event) => {
    if (event.target.id === 'dashboardModal') closeDashboardModal();
  });

  document.getElementById('dashboardList').addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]');
    const card = event.target.closest('.job-card');
    const id = action ? action.dataset.id : (card ? card.dataset.id : '');
    if (!id) return;

    const tab = (action ? action.dataset.tab : (card ? card.dataset.tab : 'service')) === 'vacancy' ? 'vacancy' : 'service';
    const collection = tab === 'service' ? dashboardState.services : dashboardState.vacancies;
    const item = collection.find((entry) => String(entry.id) === String(id));
    if (!item) return;

    if (!action) {
      openDashboardModal(tab, item);
      return;
    }

    if (action.dataset.action === 'view') {
      openDashboardModal(tab, item);
      return;
    }

    if (action.dataset.action === 'edit') {
      location.href = tab === 'service' ? `/service-form.html?id=${id}` : `/vacancy-form.html?id=${id}`;
      return;
    }

    if (action.dataset.action === 'delete') {
      await deleteDashboardItem(tab, item.id);
    }
  });

  document.getElementById('dashboardEditBtn').addEventListener('click', () => {
    if (!dashboardState.selectedItem) return;
    const { tab, item } = dashboardState.selectedItem;
    location.href = tab === 'service' ? `/service-form.html?id=${item.id}` : `/vacancy-form.html?id=${item.id}`;
  });

  document.getElementById('dashboardDeleteBtn').addEventListener('click', async () => {
    if (!dashboardState.selectedItem) return;
    await deleteDashboardItem(dashboardState.selectedItem.tab, dashboardState.selectedItem.item.id);
  });
}

async function loadDashboardData() {
  const loader = document.getElementById('dashboardLoader');
  loader.style.display = 'block';

  try {
    const [servicesRes, vacanciesRes] = await Promise.all([
      fetch('/api/profiles/my', { headers: { ...getDashboardHeaders() } }),
      fetch('/api/vacancies/my', { headers: { ...getDashboardHeaders() } })
    ]);

    if (servicesRes.status === 401 || vacanciesRes.status === 401) {
      redirectDashboardToAuth();
      return;
    }

    dashboardState.services = servicesRes.ok ? await servicesRes.json() : [];
    dashboardState.vacancies = vacanciesRes.ok ? await vacanciesRes.json() : [];

    document.getElementById('dashboardServicesCount').textContent = String(dashboardState.services.length);
    document.getElementById('dashboardVacanciesCount').textContent = String(dashboardState.vacancies.length);

    renderDashboardList();
  } finally {
    loader.style.display = 'none';
  }
}

function renderDashboardList() {
  const list = document.getElementById('dashboardList');
  const empty = document.getElementById('dashboardEmpty');
  const items = dashboardState.activeTab === 'service' ? dashboardState.services : dashboardState.vacancies;

  if (!items.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = dashboardState.activeTab === 'service'
      ? 'У вас пока нет услуг. Создайте первую карточку услуги.'
      : 'У вас пока нет вакансий. Создайте первую вакансию.';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = items.map((item) => {
    if (dashboardState.activeTab === 'service') {
      const availability = (item.availability || []).map((slot) => `<span class="tag">${escapeDashboardHtml(slot)}</span>`).join(' ');
      return `
        <article class="job-card" data-id="${item.id}" data-tab="service">
          <div class="job-header">
            <h3>${escapeDashboardHtml(dashboardTitle(item, 'service'))}</h3>
            <span class="job-salary">${escapeDashboardHtml(formatDashboardPay(item.payMin, item.payType))}</span>
          </div>
          <div class="job-description">${escapeDashboardHtml((item.about || '').slice(0, 160))}${item.about && item.about.length > 160 ? '...' : ''}</div>
          <div class="tag">📍 ${escapeDashboardHtml(item.city || 'Город не указан')}${item.locationText ? `, ${escapeDashboardHtml(item.locationText)}` : ''}</div>
          ${availability ? `<div class="chip-group">${availability}</div>` : ''}
          <div class="card-actions">
            <button class="btn secondary" data-action="view" data-tab="service" data-id="${item.id}">Открыть</button>
            <button class="btn" data-action="edit" data-tab="service" data-id="${item.id}">Редактировать</button>
            <button class="btn btn-delete" data-action="delete" data-tab="service" data-id="${item.id}">Удалить</button>
          </div>
        </article>
      `;
    }

    const schedule = (item.schedule || []).map((slot) => `<span class="tag">${escapeDashboardHtml(slot)}</span>`).join(' ');
    const timeText = item.isFlexibleTime ? 'По договоренности' : formatDashboardDate(item.dateTime);
    return `
      <article class="job-card" data-id="${item.id}" data-tab="vacancy">
        <div class="job-header">
          <h3>${escapeDashboardHtml(dashboardTitle(item, 'vacancy'))}</h3>
          <span class="job-salary">${escapeDashboardHtml(formatDashboardPay(item.payAmount, item.payType))}</span>
        </div>
        <div class="job-description">${escapeDashboardHtml((item.description || '').slice(0, 160))}${item.description && item.description.length > 160 ? '...' : ''}</div>
        <div class="tag">📍 ${escapeDashboardHtml(item.locationText || 'Локация не указана')}</div>
        <div class="tag">🕒 ${escapeDashboardHtml(timeText)}</div>
        ${schedule ? `<div class="chip-group">${schedule}</div>` : ''}
        <div class="card-actions">
          <button class="btn secondary" data-action="view" data-tab="vacancy" data-id="${item.id}">Открыть</button>
          <button class="btn" data-action="edit" data-tab="vacancy" data-id="${item.id}">Редактировать</button>
          <button class="btn btn-delete" data-action="delete" data-tab="vacancy" data-id="${item.id}">Удалить</button>
        </div>
      </article>
    `;
  }).join('');
}

function openDashboardModal(tab, item) {
  dashboardState.selectedItem = { tab, item };
  const detail = document.getElementById('dashboardDetail');
  const modal = document.getElementById('dashboardModal');

  if (tab === 'service') {
    const categories = (item.categories || []).map((entry) => `<span class="tag">${escapeDashboardHtml(entry)}</span>`).join(' ');
    const availability = (item.availability || []).map((entry) => `<span class="tag">${escapeDashboardHtml(entry)}</span>`).join(' ');
    detail.innerHTML = `
      ${item.photoUrl ? `<div class="modal-media"><img src="${escapeDashboardHtml(item.photoUrl)}" alt="${escapeDashboardHtml(dashboardTitle(item, tab))}"></div>` : ''}
      <h2>${escapeDashboardHtml(dashboardTitle(item, tab))}</h2>
      <div class="detail-pill-row">${categories || ''} ${availability || ''}</div>
      <div class="modal-detail-grid">
        <div class="modal-detail-card">
          <h3>Описание услуги</h3>
          <p>${escapeDashboardHtml(item.about || 'Описание не указано.')}</p>
          <p><strong>Оплата:</strong> ${escapeDashboardHtml(formatDashboardPay(item.payMin, item.payType))}</p>
          <p><strong>Город:</strong> ${escapeDashboardHtml(item.city || 'Не указан')}</p>
          <p><strong>Район:</strong> ${escapeDashboardHtml(item.locationText || 'Не указан')}</p>
        </div>
        <div class="modal-detail-card">
          <h3>Контакты и детали</h3>
          <p><strong>Имя:</strong> ${escapeDashboardHtml(item.name || 'Не указано')}</p>
          <p><strong>Телефон:</strong> ${escapeDashboardHtml(item.phone || 'Не указан')}</p>
          <p><strong>Опыт:</strong> ${escapeDashboardHtml(item.experienceLevel || 'Не указан')}</p>
          <p><strong>Языки:</strong> ${escapeDashboardHtml((item.languages || []).join(', ') || 'Не указаны')}</p>
          <p><strong>Формат:</strong> ${escapeDashboardHtml((item.workFormat || []).join(', ') || 'Не указан')}</p>
          <p><strong>Связь:</strong> ${escapeDashboardHtml((item.contactMethods || []).join(', ') || 'Не указана')}</p>
        </div>
      </div>
    `;
  } else {
    const categories = (item.categoryIds || []).map((entry) => `<span class="tag">${escapeDashboardHtml(entry)}</span>`).join(' ');
    const schedule = (item.schedule || []).map((entry) => `<span class="tag">${escapeDashboardHtml(entry)}</span>`).join(' ');
    const timeText = item.isFlexibleTime ? 'По договоренности' : formatDashboardDate(item.dateTime);
    detail.innerHTML = `
      ${item.photoUrl ? `<div class="modal-media"><img src="${escapeDashboardHtml(item.photoUrl)}" alt="${escapeDashboardHtml(dashboardTitle(item, tab))}"></div>` : ''}
      <h2>${escapeDashboardHtml(dashboardTitle(item, tab))}</h2>
      <div class="detail-pill-row">${categories || ''} ${schedule || ''}</div>
      <div class="modal-detail-grid">
        <div class="modal-detail-card">
          <h3>Описание вакансии</h3>
          <p>${escapeDashboardHtml(item.description || 'Описание не указано.')}</p>
          <p><strong>Оплата:</strong> ${escapeDashboardHtml(formatDashboardPay(item.payAmount, item.payType))}</p>
          <p><strong>Локация:</strong> ${escapeDashboardHtml(item.locationText || 'Не указана')}</p>
          <p><strong>Дата:</strong> ${escapeDashboardHtml(timeText)}</p>
        </div>
        <div class="modal-detail-card">
          <h3>Контакт</h3>
          <p><strong>Имя:</strong> ${escapeDashboardHtml(item.contactName || 'Не указано')}</p>
          <p><strong>Телефон:</strong> ${escapeDashboardHtml(item.phone || 'Не указан')}</p>
          <p><strong>График:</strong> ${escapeDashboardHtml((item.schedule || []).join(', ') || 'Не указан')}</p>
          <p><strong>Теги:</strong> ${escapeDashboardHtml((item.tags || []).join(', ') || 'Не указаны')}</p>
        </div>
      </div>
    `;
  }

  modal.style.display = 'flex';
}

function closeDashboardModal() {
  dashboardState.selectedItem = null;
  document.getElementById('dashboardModal').style.display = 'none';
}

async function deleteDashboardItem(tab, id) {
  const label = tab === 'service' ? 'услугу' : 'вакансию';
  if (!confirm(`Удалить ${label}?`)) return;

  const url = tab === 'service' ? `/api/profiles/${id}` : `/api/vacancies/${id}`;
  const response = await fetch(url, { method: 'DELETE', headers: { ...getDashboardHeaders() } });
  const payload = await response.json().catch(() => ({ success: false, error: 'Ошибка сервера' }));

  if (response.status === 401) {
    redirectDashboardToAuth();
    return;
  }

  if (!response.ok || !payload.success) {
    showDashboardMessage(payload.error || 'Не удалось удалить карточку.', 'error');
    return;
  }

  if (tab === 'service') {
    dashboardState.services = dashboardState.services.filter((item) => String(item.id) !== String(id));
    document.getElementById('dashboardServicesCount').textContent = String(dashboardState.services.length);
  } else {
    dashboardState.vacancies = dashboardState.vacancies.filter((item) => String(item.id) !== String(id));
    document.getElementById('dashboardVacanciesCount').textContent = String(dashboardState.vacancies.length);
  }

  if (dashboardState.selectedItem && String(dashboardState.selectedItem.item.id) === String(id)) {
    closeDashboardModal();
  }

  renderDashboardList();
  showDashboardMessage(tab === 'service' ? 'Услуга удалена.' : 'Вакансия удалена.', 'success');
}
