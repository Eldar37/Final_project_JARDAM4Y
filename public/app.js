// Shared frontend logic for vacancies and worker profiles
const CATEGORIES = [
  'Дети / Няня',
  'Дом и уборка',
  'Доставка / Курьер',
  'Кафе и обслуживание',
  'Помощник на мероприятиях',
  'Склад / Подсобные работы',
  'Репетиторство / Обучение',
  'SMM / Дизайн / Тексты',
  'Ремонт / Мастер на час',
  'Другое'
];

const AVAILABILITY_OPTIONS = ['Утро', 'День', 'Вечер', 'Ночь', 'Выходные'];

const PAY_TYPE_LABELS = {
  hour: 'за час',
  shift: 'за смену',
  fixed: 'за работу'
};

document.addEventListener('DOMContentLoaded', () => {
  initVacancyForm();
  initProfileForm();
  initVacanciesList();
  initProfilesList();
  initAdminPanel();
});

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
  return JSON.stringify(parseList(value));
}

function createChipGroup(container, options, initialValues = []) {
  if (!container) return null;
  const targetId = container.dataset.target;
  const targetInput = targetId ? document.getElementById(targetId) : null;
  const selected = new Set(initialValues);

  const render = () => {
    container.innerHTML = options
      .map(option => {
        const active = selected.has(option) ? 'active' : '';
        return `<button type="button" class="chip ${active}" data-value="${escapeHtml(option)}">${escapeHtml(option)}</button>`;
      })
      .join('');
  };

  const sync = () => {
    if (targetInput) targetInput.value = stringifyList(Array.from(selected));
  };

  render();
  sync();

  container.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    const value = chip.dataset.value;
    if (selected.has(value)) {
      selected.delete(value);
      chip.classList.remove('active');
    } else {
      selected.add(value);
      chip.classList.add('active');
    }
    sync();
  });

  return {
    getSelected: () => Array.from(selected),
    setSelected: (values = []) => {
      selected.clear();
      values.forEach(v => selected.add(v));
      render();
      sync();
    }
  };
}

function showMessage(element, text, type) {
  if (!element) return;
  element.textContent = text;
  element.className = `message show ${type}`;
  setTimeout(() => element.classList.remove('show'), 4000);
}

function setLoading(element, isLoading) {
  if (!element) return;
  element.style.display = isLoading ? 'block' : 'none';
}

function getTokenHeader() {
  const token = localStorage.getItem('token');
  return token ? { 'x-session-token': token } : {};
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch (err) {
    return {};
  }
}

function isOwner(currentUser, itemUserId) {
  if (!currentUser || currentUser.id == null || itemUserId == null) return false;
  return String(currentUser.id) === String(itemUserId);
}

function isValidPhone(value) {
  const cleaned = String(value || '').replace(/\s+/g, '');
  return /^[+]?\d{7,15}$/.test(cleaned);
}

function formatPay(amount, type) {
  if (amount == null || amount === '') return 'Договорная';
  const label = PAY_TYPE_LABELS[type] || 'за работу';
  return `${amount} сом ${label}`;
}

function setCheckboxValues(form, name, values = []) {
  const set = new Set(values);
  form.querySelectorAll(`input[name="${name}"]`).forEach(input => {
    input.checked = set.has(input.value);
  });
}

function getCheckboxValues(form, name) {
  return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(input => input.value);
}

function initVacancyForm() {
  const form = document.getElementById('vacancyForm');
  if (!form) return;

  const message = document.getElementById('formMessage');
  const submitBtn = document.getElementById('vacancySubmit');
  const title = document.getElementById('vacancyFormTitle');
  const dateInput = form.querySelector('input[name="dateTime"]');
  const flexibleInput = form.querySelector('input[name="isFlexibleTime"]');
  const requireAuth = form.dataset.requiresAuth === 'true';

  if (requireAuth && !localStorage.getItem('token')) {
    location.href = '/auth.html';
    return;
  }

  const categoryGroup = createChipGroup(document.getElementById('vacancyCategories'), CATEGORIES);
  const scheduleGroup = createChipGroup(document.getElementById('vacancySchedule'), AVAILABILITY_OPTIONS);

  function updateDateState() {
    if (!flexibleInput || !dateInput) return;
    if (flexibleInput.checked) {
      dateInput.value = '';
      dateInput.disabled = true;
    } else {
      dateInput.disabled = false;
    }
  }

  if (flexibleInput) {
    flexibleInput.addEventListener('change', updateDateState);
  }

  updateDateState();

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');

  if (editId) {
    title.textContent = 'Редактировать вакансию';
    submitBtn.textContent = 'Сохранить изменения';
    loadVacancy(editId);
  }

  async function loadVacancy(id) {
    try {
      setLoading(message, false);
      const res = await fetch(`/api/vacancies/${id}`);
      if (!res.ok) throw new Error('Не удалось загрузить вакансию');
      const data = await res.json();

      form.contactName.value = data.contactName || '';
      form.phone.value = data.phone || '';
      form.locationText.value = data.locationText || '';
      form.title.value = data.title || '';
      form.description.value = data.description || '';
      form.dateTime.value = data.dateTime || '';
      form.isFlexibleTime.checked = !!data.isFlexibleTime;
      form.payAmount.value = data.payAmount || '';
      form.payType.value = data.payType || '';
      form.tags.value = (data.tags || []).join(', ');

      categoryGroup.setSelected(data.categoryIds || []);
      scheduleGroup.setSelected(data.schedule || []);
      updateDateState();
    } catch (err) {
      showMessage(message, err.message, 'error');
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      contactName: form.contactName.value.trim(),
      phone: form.phone.value.trim(),
      locationText: form.locationText.value.trim(),
      categoryIds: parseList(form.categoryIds.value),
      title: form.title.value.trim(),
      description: form.description.value.trim(),
      dateTime: form.dateTime.value,
      isFlexibleTime: form.isFlexibleTime.checked,
      schedule: parseList(form.schedule.value),
      payAmount: form.payAmount.value,
      payType: form.payType.value,
      tags: form.tags.value
    };

    if (!payload.contactName || !payload.phone || !payload.title || !payload.description || payload.categoryIds.length === 0) {
      showMessage(message, 'Заполните обязательные поля (контакт, телефон, категория, заголовок, описание).', 'error');
      return;
    }

    if (!isValidPhone(payload.phone)) {
      showMessage(message, 'Введите корректный номер телефона.', 'error');
      return;
    }

    if (payload.description.length > 1000) {
      showMessage(message, 'Описание слишком длинное (до 1000 символов).', 'error');
      return;
    }

    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/vacancies/${editId}` : '/api/vacancies';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохранение...';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getTokenHeader() },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.success) {
        showMessage(message, editId ? 'Вакансия обновлена.' : 'Вакансия опубликована.', 'success');
        if (!editId) {
          form.reset();
          categoryGroup.setSelected([]);
          scheduleGroup.setSelected([]);
          updateDateState();
        }
      } else {
        showMessage(message, result.error || 'Ошибка сохранения.', 'error');
      }
    } catch (err) {
      showMessage(message, 'Ошибка сети. Попробуйте ещё раз.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? 'Сохранить изменения' : 'Опубликовать вакансию';
    }
  });
}

function initProfileForm() {
  const form = document.getElementById('profileForm');
  if (!form) return;

  const message = document.getElementById('formMessage');
  const submitBtn = document.getElementById('profileSubmit');
  const title = document.getElementById('profileFormTitle');
  const requireAuth = form.dataset.requiresAuth === 'true';

  if (requireAuth && !localStorage.getItem('token')) {
    location.href = '/auth.html';
    return;
  }

  const categoriesGroup = createChipGroup(document.getElementById('profileCategories'), CATEGORIES);
  const availabilityGroup = createChipGroup(document.getElementById('profileAvailability'), AVAILABILITY_OPTIONS);

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');

  if (editId) {
    title.textContent = 'Редактировать профиль';
    submitBtn.textContent = 'Сохранить профиль';
    loadProfile(editId);
  }

  async function loadProfile(id) {
    try {
      const res = await fetch(`/api/profiles/${id}`);
      if (!res.ok) throw new Error('Не удалось загрузить профиль');
      const data = await res.json();

      form.name.value = data.name || '';
      form.phone.value = data.phone || '';
      form.headline.value = data.headline || '';
      form.payMin.value = data.payMin || '';
      form.payType.value = data.payType || '';
      form.city.value = data.city || '';
      form.locationText.value = data.locationText || '';
      form.about.value = data.about || '';
      form.experienceLevel.value = data.experienceLevel || '';
      form.age.value = data.age || '';
      form.tags.value = (data.tags || []).join(', ');

      categoriesGroup.setSelected(data.categories || []);
      availabilityGroup.setSelected(data.availability || []);
      setCheckboxValues(form, 'languages', data.languages || []);
      setCheckboxValues(form, 'workFormat', data.workFormat || []);
      setCheckboxValues(form, 'contactMethods', data.contactMethods || []);
    } catch (err) {
      showMessage(message, err.message, 'error');
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      categories: parseList(form.categories.value),
      headline: form.headline.value.trim(),
      availability: parseList(form.availability.value),
      payMin: form.payMin.value,
      payType: form.payType.value,
      city: form.city.value,
      locationText: form.locationText.value.trim(),
      about: form.about.value.trim(),
      experienceLevel: form.experienceLevel.value,
      languages: getCheckboxValues(form, 'languages'),
      workFormat: getCheckboxValues(form, 'workFormat'),
      contactMethods: getCheckboxValues(form, 'contactMethods'),
      age: form.age.value,
      tags: form.tags.value
    };

    if (!payload.name || !payload.phone || payload.categories.length === 0 || !payload.headline || payload.availability.length === 0 || !payload.payType || !payload.payMin || !payload.city || !payload.locationText || !payload.about) {
      showMessage(message, 'Заполните все обязательные поля профиля.', 'error');
      return;
    }

    if (!isValidPhone(payload.phone)) {
      showMessage(message, 'Введите корректный номер телефона.', 'error');
      return;
    }

    if (payload.about.length > 800) {
      showMessage(message, 'Описание слишком длинное (до 800 символов).', 'error');
      return;
    }

    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/profiles/${editId}` : '/api/profiles';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохранение...';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getTokenHeader() },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.success) {
        showMessage(message, editId ? 'Профиль обновлён.' : 'Профиль опубликован.', 'success');
        if (!editId) {
          form.reset();
          categoriesGroup.setSelected([]);
          availabilityGroup.setSelected([]);
          setCheckboxValues(form, 'languages', []);
          setCheckboxValues(form, 'workFormat', []);
          setCheckboxValues(form, 'contactMethods', []);
        }
      } else {
        showMessage(message, result.error || 'Ошибка сохранения.', 'error');
      }
    } catch (err) {
      showMessage(message, 'Ошибка сети. Попробуйте ещё раз.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? 'Сохранить профиль' : 'Опубликовать профиль';
    }
  });
}

function initVacanciesList() {
  const list = document.getElementById('vacanciesList');
  if (!list) return;

  const currentUser = getCurrentUser();
  const message = document.getElementById('pageMessage');
  const loader = document.getElementById('vacanciesLoader');
  const empty = document.getElementById('vacanciesEmpty');
  const searchInput = document.getElementById('vacancySearch');
  const searchBtn = document.getElementById('vacancySearchBtn');
  const resetBtn = document.getElementById('vacancyResetBtn');
  const payMinInput = document.getElementById('vacancyPayMin');
  const payMaxInput = document.getElementById('vacancyPayMax');
  const dateInput = document.getElementById('vacancyDate');
  const flexibleOnlyInput = document.getElementById('vacancyFlexibleOnly');

  const categoryGroup = createChipGroup(document.getElementById('vacancyFilterCategories'), CATEGORIES);
  const scheduleGroup = createChipGroup(document.getElementById('vacancyFilterSchedule'), AVAILABILITY_OPTIONS);

  const params = new URLSearchParams(window.location.search);
  searchInput.value = params.get('query') || '';
  categoryGroup.setSelected(parseList(params.get('category')));
  scheduleGroup.setSelected(parseList(params.get('schedule')));
  payMinInput.value = params.get('payMin') || '';
  payMaxInput.value = params.get('payMax') || '';
  dateInput.value = params.get('date') || '';
  flexibleOnlyInput.checked = params.get('flexibleOnly') === 'true' || params.get('flexibleOnly') === '1';

  const modal = document.getElementById('vacancyModal');
  const modalDetail = document.getElementById('vacancyDetail');
  const closeModal = document.getElementById('closeVacancy');
  const editBtn = document.getElementById('vacancyEditBtn');
  const deleteBtn = document.getElementById('vacancyDeleteBtn');
  let currentVacancyId = null;

  if (closeModal) closeModal.addEventListener('click', () => hideModal(modal));

  function updateUrl() {
    const next = new URLSearchParams();
    if (searchInput.value.trim()) next.set('query', searchInput.value.trim());
    const categories = parseList(document.getElementById('vacancyFilterCategoriesInput').value);
    const schedule = parseList(document.getElementById('vacancyFilterScheduleInput').value);
    if (categories.length) next.set('category', categories.join(','));
    if (schedule.length) next.set('schedule', schedule.join(','));
    if (payMinInput.value) next.set('payMin', payMinInput.value);
    if (payMaxInput.value) next.set('payMax', payMaxInput.value);
    if (dateInput.value) next.set('date', dateInput.value);
    if (flexibleOnlyInput.checked) next.set('flexibleOnly', '1');
    const query = next.toString();
    history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
    return next;
  }

  async function loadVacancies() {
    const params = updateUrl();
    setLoading(loader, true);
    list.innerHTML = '';
    empty.style.display = 'none';

    try {
      const res = await fetch(`/api/vacancies?${params.toString()}`);
      const items = await res.json();
      setLoading(loader, false);
      if (!Array.isArray(items) || items.length === 0) {
        empty.style.display = 'block';
        return;
      }

      list.innerHTML = items.map(renderVacancyCard).join('');
    } catch (err) {
      setLoading(loader, false);
      showMessage(message, 'Не удалось загрузить вакансии.', 'error');
    }
  }

  function renderVacancyCard(item) {
    const canEdit = isOwner(currentUser, item.userId);
    const categories = (item.categoryIds || []).map(cat => `<span class="tag">${escapeHtml(cat)}</span>`).join(' ');
    const schedule = (item.schedule || []).map(s => `<span class="tag">${escapeHtml(s)}</span>`).join(' ');
    const timeText = item.isFlexibleTime ? 'По договорённости' : (item.dateTime ? new Date(item.dateTime).toLocaleString('ru-RU') : '—');
    const payText = formatPay(item.payAmount, item.payType);

    return `
      <div class="job-card" data-id="${item.id}">
        <div class="job-header">
          <h3>${escapeHtml(item.title || 'Без названия')}</h3>
          <span class="job-salary">${escapeHtml(payText)}</span>
        </div>
        <div class="job-category">${categories || 'Без категории'}</div>
        <div class="job-description">${escapeHtml((item.description || '').slice(0, 140))}${item.description && item.description.length > 140 ? '…' : ''}</div>
        <div class="tag">📍 ${escapeHtml(item.locationText || 'Район не указан')}</div>
        <div class="tag">🕒 ${escapeHtml(timeText)}</div>
        ${schedule ? `<div class="chip-group">${schedule}</div>` : ''}
        <div class="card-actions">
          <button class="btn secondary" data-action="view" data-id="${item.id}">Открыть</button>
          ${canEdit ? `<button class="btn" data-action="edit" data-id="${item.id}">Редактировать</button>` : ''}
          ${canEdit ? `<button class="btn btn-delete" data-action="delete" data-id="${item.id}">Удалить</button>` : ''}
        </div>
      </div>
    `;
  }

  function showVacancy(item) {
    currentVacancyId = item.id;
    const categories = (item.categoryIds || []).map(cat => `<span class="tag">${escapeHtml(cat)}</span>`).join(' ');
    const schedule = (item.schedule || []).map(s => `<span class="tag">${escapeHtml(s)}</span>`).join(' ');
    const timeText = item.isFlexibleTime ? 'По договорённости' : (item.dateTime ? new Date(item.dateTime).toLocaleString('ru-RU') : '—');

    modalDetail.innerHTML = `
      <h2>${escapeHtml(item.title || 'Вакансия')}</h2>
      <p>${escapeHtml(item.description || '')}</p>
      <p><strong>Категории:</strong> ${categories || '—'}</p>
      <p><strong>График:</strong> ${schedule || '—'}</p>
      <p><strong>Дата / время:</strong> ${escapeHtml(timeText)}</p>
      <p><strong>Район:</strong> ${escapeHtml(item.locationText || '—')}</p>
      <p><strong>Контакт:</strong> ${escapeHtml(item.phone || '—')} (${escapeHtml(item.contactName || '—')})</p>
      <p><strong>Оплата:</strong> ${escapeHtml(formatPay(item.payAmount, item.payType))}</p>
      ${item.tags && item.tags.length ? `<p><strong>Теги:</strong> ${item.tags.map(tag => escapeHtml(tag)).join(', ')}</p>` : ''}
    `;

    const canEdit = isOwner(currentUser, item.userId);
    if (editBtn) editBtn.style.display = canEdit ? 'inline-block' : 'none';
    if (deleteBtn) deleteBtn.style.display = canEdit ? 'inline-block' : 'none';

    if (canEdit) {
      editBtn.onclick = () => location.href = `/vacancy-form.html?id=${item.id}`;
      deleteBtn.onclick = () => handleDelete(item.id);
    } else {
      if (editBtn) editBtn.onclick = null;
      if (deleteBtn) deleteBtn.onclick = null;
    }

    showModal(modal);
  }

  async function handleDelete(id) {
    if (!confirm('Удалить вакансию?')) return;
    try {
      const res = await fetch(`/api/vacancies/${id}`, { method: 'DELETE', headers: { ...getTokenHeader() } });
      const result = await res.json();
      if (result.success) {
        hideModal(modal);
        loadVacancies();
        showMessage(message, 'Вакансия удалена.', 'success');
      } else {
        showMessage(message, result.error || 'Ошибка удаления.', 'error');
      }
    } catch (err) {
      showMessage(message, 'Ошибка сети при удалении.', 'error');
    }
  }

  list.addEventListener('click', async (event) => {
    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;
    const id = actionBtn.dataset.id;
    if (!id) return;

    if (actionBtn.dataset.action === 'edit') {
      location.href = `/vacancy-form.html?id=${id}`;
      return;
    }

    if (actionBtn.dataset.action === 'delete') {
      handleDelete(id);
      return;
    }

    if (actionBtn.dataset.action === 'view') {
      try {
        const res = await fetch(`/api/vacancies/${id}`);
        const data = await res.json();
        showVacancy(data);
      } catch (err) {
        showMessage(message, 'Не удалось открыть вакансию.', 'error');
      }
    }
  });

  if (searchBtn) searchBtn.addEventListener('click', loadVacancies);
  if (resetBtn) resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    categoryGroup.setSelected([]);
    scheduleGroup.setSelected([]);
    payMinInput.value = '';
    payMaxInput.value = '';
    dateInput.value = '';
    flexibleOnlyInput.checked = false;
    loadVacancies();
  });

  loadVacancies();
}

function initProfilesList() {
  const list = document.getElementById('profilesList');
  if (!list) return;

  const currentUser = getCurrentUser();
  const message = document.getElementById('pageMessage');
  const loader = document.getElementById('profilesLoader');
  const empty = document.getElementById('profilesEmpty');
  const searchInput = document.getElementById('profileSearch');
  const searchBtn = document.getElementById('profileSearchBtn');
  const resetBtn = document.getElementById('profileResetBtn');
  const payMinInput = document.getElementById('profilePayMin');
  const cityInput = document.getElementById('profileCity');
  const locationInput = document.getElementById('profileLocation');

  const categoriesGroup = createChipGroup(document.getElementById('profileFilterCategories'), CATEGORIES);
  const availabilityGroup = createChipGroup(document.getElementById('profileFilterAvailability'), AVAILABILITY_OPTIONS);

  const params = new URLSearchParams(window.location.search);
  searchInput.value = params.get('query') || '';
  categoriesGroup.setSelected(parseList(params.get('category')));
  availabilityGroup.setSelected(parseList(params.get('availability')));
  payMinInput.value = params.get('payMin') || '';
  cityInput.value = params.get('city') || '';
  locationInput.value = params.get('location') || '';

  const modal = document.getElementById('profileModal');
  const modalDetail = document.getElementById('profileDetail');
  const closeModal = document.getElementById('closeProfile');
  const editBtn = document.getElementById('profileEditBtn');
  const deleteBtn = document.getElementById('profileDeleteBtn');
  let currentProfileId = null;

  if (closeModal) closeModal.addEventListener('click', () => hideModal(modal));

  function updateUrl() {
    const next = new URLSearchParams();
    if (searchInput.value.trim()) next.set('query', searchInput.value.trim());
    const categories = parseList(document.getElementById('profileFilterCategoriesInput').value);
    const availability = parseList(document.getElementById('profileFilterAvailabilityInput').value);
    if (categories.length) next.set('category', categories.join(','));
    if (availability.length) next.set('availability', availability.join(','));
    if (payMinInput.value) next.set('payMin', payMinInput.value);
    if (cityInput.value) next.set('city', cityInput.value);
    if (locationInput.value) next.set('location', locationInput.value);
    const query = next.toString();
    history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
    return next;
  }

  async function loadProfiles() {
    const params = updateUrl();
    setLoading(loader, true);
    list.innerHTML = '';
    empty.style.display = 'none';

    try {
      const res = await fetch(`/api/profiles?${params.toString()}`);
      const items = await res.json();
      setLoading(loader, false);
      if (!Array.isArray(items) || items.length === 0) {
        empty.style.display = 'block';
        return;
      }

      list.innerHTML = items.map(renderProfileCard).join('');
    } catch (err) {
      setLoading(loader, false);
      showMessage(message, 'Не удалось загрузить профили.', 'error');
    }
  }

  function renderProfileCard(item) {
    const canEdit = isOwner(currentUser, item.userId);
    const categories = (item.categories || []).map(cat => `<span class="tag">${escapeHtml(cat)}</span>`).join(' ');
    const availability = (item.availability || []).map(s => `<span class="tag">${escapeHtml(s)}</span>`).join(' ');
    const payText = formatPay(item.payMin, item.payType);

    return `
      <div class="job-card" data-id="${item.id}">
        <div class="job-header">
          <h3>${escapeHtml(item.headline || item.name || 'Профиль')}</h3>
          <span class="job-salary">${escapeHtml(payText)}</span>
        </div>
        <div class="job-category">${categories || 'Без категории'}</div>
        <div class="job-description">${escapeHtml((item.about || '').slice(0, 140))}${item.about && item.about.length > 140 ? '…' : ''}</div>
        <div class="tag">📍 ${escapeHtml(item.city || 'Город не указан')}${item.locationText ? `, ${escapeHtml(item.locationText)}` : ''}</div>
        ${availability ? `<div class="chip-group">${availability}</div>` : ''}
        <div class="card-actions">
          <button class="btn secondary" data-action="view" data-id="${item.id}">Открыть</button>
          ${canEdit ? `<button class="btn" data-action="edit" data-id="${item.id}">Редактировать</button>` : ''}
          ${canEdit ? `<button class="btn btn-delete" data-action="delete" data-id="${item.id}">Удалить</button>` : ''}
        </div>
      </div>
    `;
  }

  function showProfile(item) {
    currentProfileId = item.id;
    const categories = (item.categories || []).map(cat => `<span class="tag">${escapeHtml(cat)}</span>`).join(' ');
    const availability = (item.availability || []).map(s => `<span class="tag">${escapeHtml(s)}</span>`).join(' ');

    modalDetail.innerHTML = `
      <h2>${escapeHtml(item.headline || item.name || 'Профиль')}</h2>
      <p>${escapeHtml(item.about || '')}</p>
      <p><strong>Категории:</strong> ${categories || '—'}</p>
      <p><strong>Доступность:</strong> ${availability || '—'}</p>
      <p><strong>Город:</strong> ${escapeHtml(item.city || '—')}</p>
      <p><strong>Район:</strong> ${escapeHtml(item.locationText || '—')}</p>
      <p><strong>Оплата:</strong> ${escapeHtml(formatPay(item.payMin, item.payType))}</p>
      <p><strong>Контакт:</strong> ${escapeHtml(item.phone || '—')} (${escapeHtml(item.name || '—')})</p>
      ${item.languages && item.languages.length ? `<p><strong>Языки:</strong> ${item.languages.map(l => escapeHtml(l)).join(', ')}</p>` : ''}
      ${item.experienceLevel ? `<p><strong>Опыт:</strong> ${escapeHtml(item.experienceLevel)}</p>` : ''}
      ${item.workFormat && item.workFormat.length ? `<p><strong>Формат:</strong> ${item.workFormat.map(w => escapeHtml(w)).join(', ')}</p>` : ''}
      ${item.contactMethods && item.contactMethods.length ? `<p><strong>Связь:</strong> ${item.contactMethods.map(c => escapeHtml(c)).join(', ')}</p>` : ''}
    `;

    const canEdit = isOwner(currentUser, item.userId);
    if (editBtn) editBtn.style.display = canEdit ? 'inline-block' : 'none';
    if (deleteBtn) deleteBtn.style.display = canEdit ? 'inline-block' : 'none';

    if (canEdit) {
      editBtn.onclick = () => location.href = `/profile-form.html?id=${item.id}`;
      deleteBtn.onclick = () => handleDelete(item.id);
    } else {
      if (editBtn) editBtn.onclick = null;
      if (deleteBtn) deleteBtn.onclick = null;
    }

    showModal(modal);
  }

  async function handleDelete(id) {
    if (!confirm('Удалить профиль?')) return;
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE', headers: { ...getTokenHeader() } });
      const result = await res.json();
      if (result.success) {
        hideModal(modal);
        loadProfiles();
        showMessage(message, 'Профиль удалён.', 'success');
      } else {
        showMessage(message, result.error || 'Ошибка удаления.', 'error');
      }
    } catch (err) {
      showMessage(message, 'Ошибка сети при удалении.', 'error');
    }
  }

  list.addEventListener('click', async (event) => {
    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;
    const id = actionBtn.dataset.id;
    if (!id) return;

    if (actionBtn.dataset.action === 'edit') {
      location.href = `/profile-form.html?id=${id}`;
      return;
    }

    if (actionBtn.dataset.action === 'delete') {
      handleDelete(id);
      return;
    }

    if (actionBtn.dataset.action === 'view') {
      try {
        const res = await fetch(`/api/profiles/${id}`);
        const data = await res.json();
        showProfile(data);
      } catch (err) {
        showMessage(message, 'Не удалось открыть профиль.', 'error');
      }
    }
  });

  if (searchBtn) searchBtn.addEventListener('click', loadProfiles);
  if (resetBtn) resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    categoriesGroup.setSelected([]);
    availabilityGroup.setSelected([]);
    payMinInput.value = '';
    cityInput.value = '';
    locationInput.value = '';
    loadProfiles();
  });

  loadProfiles();
}

function showModal(modal) {
  if (!modal) return;
  modal.style.display = 'flex';
}

function hideModal(modal) {
  if (!modal) return;
  modal.style.display = 'none';
}

// Admin page (legacy)
function initAdminPanel() {
  const loginBtn = document.getElementById('loginBtn');
  const exportBtn = document.getElementById('exportBtn');
  if (loginBtn) loginBtn.addEventListener('click', async () => {
    const key = document.getElementById('adminKey').value;
    if (!key) {
      alert('Введите ключ');
      return;
    }
    try {
      const res = await fetch('/api/admin/applications', { headers: { 'x-admin-key': key } });
      if (!res.ok) {
        alert('Неверный ключ');
        return;
      }
      const rows = await res.json();
      document.getElementById('adminArea').style.display = 'block';
      const tbody = document.querySelector('#appsTable tbody');
      tbody.innerHTML = '';
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.id}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.contact)}</td><td>${escapeHtml(r.address || '—')}</td><td>${escapeHtml(r.category || r.otherCategoryText)}</td><td>${escapeHtml(r.price || '')}</td><td>${escapeHtml(r.created_at)}</td>`;
        tbody.appendChild(tr);
      });
      exportBtn.dataset.key = key;
    } catch (err) {
      alert('Ошибка');
    }
  });

  if (exportBtn) exportBtn.addEventListener('click', () => {
    const key = exportBtn.dataset.key || prompt('Введите ключ администратора для экспорта');
    if (!key) return;
    window.location = `/api/admin/export?adminKey=${encodeURIComponent(key)}`;
  });
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
