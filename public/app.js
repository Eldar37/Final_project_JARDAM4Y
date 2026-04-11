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

document.addEventListener('DOMContentLoaded', async () => {
  await syncStoredUser();
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

function readWrappedListResponse(payload) {
  if (Array.isArray(payload)) {
    return { items: payload, total: payload.length, facets: {} };
  }
  if (payload && typeof payload === 'object' && Array.isArray(payload.items)) {
    return {
      items: payload.items,
      total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : payload.items.length,
      facets: payload.facets || {}
    };
  }
  return { items: [], total: 0, facets: {} };
}

function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
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

function getCurrentPath() {
  return `${location.pathname}${location.search}`;
}

function redirectToAuth(next = getCurrentPath()) {
  location.href = `/auth.html?next=${encodeURIComponent(next)}`;
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

async function syncStoredUser() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const res = await fetch('/api/auth/me', { headers: { ...getTokenHeader() } });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || !payload.success || !payload.user) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return null;
    }

    localStorage.setItem('user', JSON.stringify(payload.user));
    return payload.user;
  } catch (err) {
    return getCurrentUser();
  }
}

function isAdminUser(currentUser) {
  return !!(currentUser && (currentUser.isAdmin || currentUser.is_admin));
}

function isOwner(currentUser, itemUserId) {
  if (!currentUser || currentUser.id == null || itemUserId == null) return false;
  return String(currentUser.id) === String(itemUserId);
}

function canManageItem(currentUser, itemUserId) {
  return isAdminUser(currentUser) || isOwner(currentUser, itemUserId);
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

function setSidebarOpen(sidebar, backdrop, isOpen) {
  if (!sidebar) return;
  sidebar.classList.toggle('is-open', isOpen);
  if (backdrop) backdrop.classList.toggle('is-open', isOpen);
  document.body.style.overflow = isOpen && window.innerWidth < 768 ? 'hidden' : '';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildVacancyDetailMarkup(item, categories, schedule, timeText) {
  const scheduleText = (item.schedule || []).length
    ? item.schedule.map(slot => escapeHtml(slot)).join(', ')
    : 'РќРµ СѓРєР°Р·Р°РЅ';
  const tagsText = (item.tags || []).length
    ? item.tags.map(tag => escapeHtml(tag)).join(', ')
    : 'РќРµ СѓРєР°Р·Р°РЅС‹';

  return `
    ${item.photoUrl ? `<div class="modal-media"><img src="${escapeHtml(item.photoUrl)}" alt="${escapeHtml(item.title || 'Р’Р°РєР°РЅСЃРёСЏ')}"></div>` : ''}
    <h2>${escapeHtml(item.title || 'Р’Р°РєР°РЅСЃРёСЏ')}</h2>
    <div class="detail-pill-row">${categories || ''} ${schedule || ''}</div>
    <div class="modal-detail-grid">
      <div class="modal-detail-card">
        <h3>РћРїРёСЃР°РЅРёРµ РІР°РєР°РЅСЃРёРё</h3>
        <p>${escapeHtml(item.description || 'РћРїРёСЃР°РЅРёРµ РЅРµ СѓРєР°Р·Р°РЅРѕ.')}</p>
        <p><strong>РћРїР»Р°С‚Р°:</strong> ${escapeHtml(formatPay(item.payAmount, item.payType))}</p>
        <p><strong>Р›РѕРєР°С†РёСЏ:</strong> ${escapeHtml(item.locationText || 'РќРµ СѓРєР°Р·Р°РЅР°')}</p>
        <p><strong>Р”Р°С‚Р° / РІСЂРµРјСЏ:</strong> ${escapeHtml(timeText)}</p>
      </div>
      <div class="modal-detail-card">
        <h3>РљРѕРЅС‚Р°РєС‚С‹ Рё РґРµС‚Р°Р»Рё</h3>
        <p><strong>РРјСЏ:</strong> ${escapeHtml(item.contactName || 'РќРµ СѓРєР°Р·Р°РЅРѕ')}</p>
        <p><strong>РўРµР»РµС„РѕРЅ:</strong> ${escapeHtml(item.phone || 'РќРµ СѓРєР°Р·Р°РЅ')}</p>
        <p><strong>Р“СЂР°С„РёРє:</strong> ${scheduleText}</p>
        <p><strong>РўРµРіРё:</strong> ${tagsText}</p>
      </div>
    </div>
  `;
}

function buildProfileDetailMarkup(item, categories, availability) {
  const languagesText = (item.languages || []).length
    ? item.languages.map(value => escapeHtml(value)).join(', ')
    : 'РќРµ СѓРєР°Р·Р°РЅС‹';
  const formatText = (item.workFormat || []).length
    ? item.workFormat.map(value => escapeHtml(value)).join(', ')
    : 'РќРµ СѓРєР°Р·Р°РЅ';
  const contactMethodsText = (item.contactMethods || []).length
    ? item.contactMethods.map(value => escapeHtml(value)).join(', ')
    : 'РќРµ СѓРєР°Р·Р°РЅР°';

  return `
    ${item.photoUrl ? `<div class="modal-media"><img src="${escapeHtml(item.photoUrl)}" alt="${escapeHtml(item.headline || item.name || 'РЈСЃР»СѓРіР°')}"></div>` : ''}
    <h2>${escapeHtml(item.headline || item.name || 'РЈСЃР»СѓРіР°')}</h2>
    <div class="detail-pill-row">${categories || ''} ${availability || ''}</div>
    <div class="modal-detail-grid">
      <div class="modal-detail-card">
        <h3>РћРїРёСЃР°РЅРёРµ СѓСЃР»СѓРіРё</h3>
        <p>${escapeHtml(item.about || 'РћРїРёСЃР°РЅРёРµ РЅРµ СѓРєР°Р·Р°РЅРѕ.')}</p>
        <p><strong>РћРїР»Р°С‚Р°:</strong> ${escapeHtml(formatPay(item.payMin, item.payType))}</p>
        <p><strong>Р“РѕСЂРѕРґ:</strong> ${escapeHtml(item.city || 'РќРµ СѓРєР°Р·Р°РЅ')}</p>
        <p><strong>Р Р°Р№РѕРЅ:</strong> ${escapeHtml(item.locationText || 'РќРµ СѓРєР°Р·Р°РЅ')}</p>
      </div>
      <div class="modal-detail-card">
        <h3>РљРѕРЅС‚Р°РєС‚С‹ Рё РґРµС‚Р°Р»Рё</h3>
        <p><strong>РРјСЏ:</strong> ${escapeHtml(item.name || 'РќРµ СѓРєР°Р·Р°РЅРѕ')}</p>
        <p><strong>РўРµР»РµС„РѕРЅ:</strong> ${escapeHtml(item.phone || 'РќРµ СѓРєР°Р·Р°РЅ')}</p>
        <p><strong>РћРїС‹С‚:</strong> ${escapeHtml(item.experienceLevel || 'РќРµ СѓРєР°Р·Р°РЅ')}</p>
        <p><strong>РЇР·С‹РєРё:</strong> ${languagesText}</p>
        <p><strong>Р¤РѕСЂРјР°С‚:</strong> ${formatText}</p>
        <p><strong>РЎРІСЏР·СЊ:</strong> ${contactMethodsText}</p>
      </div>
    </div>
  `;
}

async function uploadImageFile(file) {
  if (!file) throw new Error('Image file is required');
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/uploads/image', {
    method: 'POST',
    headers: { ...getTokenHeader() },
    body: formData
  });
  const payload = await res.json();
  if (!res.ok || !payload.success) {
    throw new Error(payload.error || 'Image upload failed');
  }
  return payload.url;
}

function createWizardController(config) {
  const {
    form,
    stepSelector = '.wizard-step',
    prevBtnId,
    nextBtnId,
    submitActionsId,
    stepTextId,
    percentTextId,
    rangeId
  } = config;

  const steps = Array.from(form.querySelectorAll(stepSelector));
  if (steps.length === 0) return null;

  const prevBtn = document.getElementById(prevBtnId);
  const nextBtn = document.getElementById(nextBtnId);
  const submitActions = document.getElementById(submitActionsId);
  const stepText = document.getElementById(stepTextId);
  const percentText = document.getElementById(percentTextId);
  const range = document.getElementById(rangeId);

  let currentStep = 1;
  const totalSteps = steps.length;

  function validateStep(stepElement) {
    const fields = Array.from(stepElement.querySelectorAll('input, select, textarea'));
    for (const field of fields) {
      if (!field.checkValidity) continue;
      if (field.disabled) continue;
      if (field.type === 'hidden') continue;
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  }

  function render() {
    steps.forEach((step, index) => {
      const isActive = index === currentStep - 1;
      step.hidden = !isActive;
    });

    const percent = Math.round((currentStep / totalSteps) * 100);
    if (stepText) stepText.textContent = `Шаг ${currentStep} из ${totalSteps}`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (range) range.value = String(percent);

    if (prevBtn) prevBtn.disabled = currentStep === 1;
    if (nextBtn) nextBtn.hidden = currentStep === totalSteps;
    if (submitActions) submitActions.hidden = currentStep !== totalSteps;
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentStep > 1) {
        currentStep -= 1;
        render();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const current = steps[currentStep - 1];
      if (!validateStep(current)) return;
      if (currentStep < totalSteps) {
        currentStep += 1;
        render();
      }
    });
  }

  render();

  return {
    render,
    goToStep: (stepNumber) => {
      const parsed = Number(stepNumber);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= totalSteps) {
        currentStep = parsed;
        render();
      }
    },
    goToLast: () => {
      currentStep = totalSteps;
      render();
    }
  };
}

function createPhotoUploadController(config) {
  const {
    form,
    messageEl,
    fileInputId,
    hiddenInputId,
    previewWrapId,
    previewImgId,
    removeBtnId
  } = config;

  const fileInput = document.getElementById(fileInputId);
  const hiddenInput = document.getElementById(hiddenInputId);
  const previewWrap = document.getElementById(previewWrapId);
  const previewImg = document.getElementById(previewImgId);
  const removeBtn = document.getElementById(removeBtnId);

  if (!fileInput || !hiddenInput || !previewWrap || !previewImg || !removeBtn) {
    return {
      setPhotoUrl: () => {},
      clear: () => {}
    };
  }

  const setPhotoUrl = (url) => {
    const next = String(url || '').trim();
    hiddenInput.value = next;
    if (next) {
      previewImg.src = next;
      previewWrap.hidden = false;
    } else {
      previewImg.src = '';
      previewWrap.hidden = true;
    }
  };

  const clear = () => {
    fileInput.value = '';
    setPhotoUrl('');
  };

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    fileInput.disabled = true;
    try {
      const uploadedUrl = await uploadImageFile(file);
      setPhotoUrl(uploadedUrl);
      showMessage(messageEl, 'Фото загружено.', 'success');
    } catch (err) {
      showMessage(messageEl, err.message || 'Не удалось загрузить фото.', 'error');
      fileInput.value = '';
    } finally {
      fileInput.disabled = false;
    }
  });

  removeBtn.addEventListener('click', () => {
    clear();
  });

  form.addEventListener('reset', () => {
    clear();
  });

  return { setPhotoUrl, clear };
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
    redirectToAuth(getCurrentPath());
    return;
  }

  const categoryGroup = createChipGroup(document.getElementById('vacancyCategories'), CATEGORIES);
  const scheduleGroup = createChipGroup(document.getElementById('vacancySchedule'), AVAILABILITY_OPTIONS);
  const wizard = createWizardController({
    form,
    prevBtnId: 'vacancyPrevStep',
    nextBtnId: 'vacancyNextStep',
    submitActionsId: 'vacancySubmitActions',
    stepTextId: 'vacancyWizardStepText',
    percentTextId: 'vacancyWizardPercent',
    rangeId: 'vacancyWizardRange'
  });
  const photoController = createPhotoUploadController({
    form,
    messageEl: message,
    fileInputId: 'vacancyPhotoInput',
    hiddenInputId: 'vacancyPhotoUrl',
    previewWrapId: 'vacancyPhotoPreviewWrap',
    previewImgId: 'vacancyPhotoPreview',
    removeBtnId: 'vacancyPhotoRemove'
  });

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
      if (form.photoUrl) form.photoUrl.value = data.photoUrl || '';
      photoController.setPhotoUrl(data.photoUrl || '');

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
      tags: form.tags.value,
      photoUrl: (form.photoUrl && form.photoUrl.value) ? form.photoUrl.value.trim() : ''
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
          photoController.clear();
          updateDateState();
          if (wizard) wizard.goToStep(1);
        }
      } else {
        if (res.status === 401) {
          redirectToAuth(getCurrentPath());
          return;
        }
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
    redirectToAuth(getCurrentPath());
    return;
  }

  const categoriesGroup = createChipGroup(document.getElementById('profileCategories'), CATEGORIES);
  const availabilityGroup = createChipGroup(document.getElementById('profileAvailability'), AVAILABILITY_OPTIONS);
  const wizard = createWizardController({
    form,
    prevBtnId: 'profilePrevStep',
    nextBtnId: 'profileNextStep',
    submitActionsId: 'profileSubmitActions',
    stepTextId: 'profileWizardStepText',
    percentTextId: 'profileWizardPercent',
    rangeId: 'profileWizardRange'
  });
  const photoController = createPhotoUploadController({
    form,
    messageEl: message,
    fileInputId: 'profilePhotoInput',
    hiddenInputId: 'profilePhotoUrl',
    previewWrapId: 'profilePhotoPreviewWrap',
    previewImgId: 'profilePhotoPreview',
    removeBtnId: 'profilePhotoRemove'
  });

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');

  if (editId) {
    title.textContent = 'Редактировать услугу';
    submitBtn.textContent = 'Сохранить услугу';
    loadProfile(editId);
  }

  async function loadProfile(id) {
    try {
      const res = await fetch(`/api/profiles/${id}`);
      if (!res.ok) throw new Error('Не удалось загрузить услугу');
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
      if (form.photoUrl) form.photoUrl.value = data.photoUrl || '';
      photoController.setPhotoUrl(data.photoUrl || '');

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
      tags: form.tags.value,
      photoUrl: (form.photoUrl && form.photoUrl.value) ? form.photoUrl.value.trim() : ''
    };

    if (!payload.name || !payload.phone || payload.categories.length === 0 || !payload.headline || payload.availability.length === 0 || !payload.payType || !payload.payMin || !payload.city || !payload.locationText || !payload.about) {
      showMessage(message, 'Заполните все обязательные поля услуги.', 'error');
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
        showMessage(message, editId ? 'Услуга обновлена.' : 'Услуга опубликована.', 'success');
        if (!editId) {
          form.reset();
          categoriesGroup.setSelected([]);
          availabilityGroup.setSelected([]);
          setCheckboxValues(form, 'languages', []);
          setCheckboxValues(form, 'workFormat', []);
          setCheckboxValues(form, 'contactMethods', []);
          photoController.clear();
          if (wizard) wizard.goToStep(1);
        }
      } else {
        if (res.status === 401) {
          redirectToAuth(getCurrentPath());
          return;
        }
        showMessage(message, result.error || 'Ошибка сохранения.', 'error');
      }
    } catch (err) {
      showMessage(message, 'Ошибка сети. Попробуйте ещё раз.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? 'Сохранить услугу' : 'Опубликовать услугу';
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
  const resultsCount = document.getElementById('vacancyResultsCount');

  const searchInput = document.getElementById('vacancySearch');
  const searchBtn = document.getElementById('vacancySearchBtn');
  const applyBtn = document.getElementById('vacancyApplyBtn');
  const resetBtn = document.getElementById('vacancyResetBtn');

  const payMinInput = document.getElementById('vacancyPayMin');
  const payMaxInput = document.getElementById('vacancyPayMax');
  const dateInput = document.getElementById('vacancyDate');
  const flexibleOnlyInput = document.getElementById('vacancyFlexibleOnly');
  const activeFiltersContainer = document.getElementById('vacancyActiveFilters');

  const sidebar = document.getElementById('vacancySidebar');
  const sidebarOpenBtn = document.getElementById('vacancyOpenFilters');
  const sidebarCloseBtn = document.getElementById('vacancySidebarClose');
  const sidebarBackdrop = document.getElementById('vacancySidebarBackdrop');

  const categoryGroup = createChipGroup(document.getElementById('vacancyFilterCategories'), CATEGORIES);
  const scheduleGroup = createChipGroup(document.getElementById('vacancyFilterSchedule'), AVAILABILITY_OPTIONS);

  const state = {
    page: 1,
    pageSize: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  };

  const modal = document.getElementById('vacancyModal');
  const modalDetail = document.getElementById('vacancyDetail');
  const closeModal = document.getElementById('closeVacancy');
  const editBtn = document.getElementById('vacancyEditBtn');
  const deleteBtn = document.getElementById('vacancyDeleteBtn');

  if (closeModal) closeModal.addEventListener('click', () => hideModal(modal));
  if (sidebarOpenBtn) sidebarOpenBtn.addEventListener('click', () => setSidebarOpen(sidebar, sidebarBackdrop, true));
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', () => setSidebarOpen(sidebar, sidebarBackdrop, false));
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', () => setSidebarOpen(sidebar, sidebarBackdrop, false));

  function applyUrlState() {
    const params = new URLSearchParams(window.location.search);
    searchInput.value = params.get('query') || '';
    categoryGroup.setSelected(parseList(params.get('category')));
    scheduleGroup.setSelected(parseList(params.get('schedule')));
    payMinInput.value = params.get('payMin') || '';
    payMaxInput.value = params.get('payMax') || '';
    dateInput.value = params.get('date') || '';
    flexibleOnlyInput.checked = params.get('flexibleOnly') === '1' || params.get('flexibleOnly') === 'true';

    const page = Number(params.get('page'));
    const pageSize = Number(params.get('pageSize'));
    if (Number.isInteger(page) && page > 0) state.page = page;
    if (Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 50) state.pageSize = pageSize;
    if (params.get('sortBy')) state.sortBy = params.get('sortBy');
    if (params.get('sortOrder')) state.sortOrder = params.get('sortOrder');
  }

  function collectFilterState() {
    return {
      query: searchInput.value.trim(),
      categories: parseList(document.getElementById('vacancyFilterCategoriesInput').value),
      schedule: parseList(document.getElementById('vacancyFilterScheduleInput').value),
      payMin: payMinInput.value,
      payMax: payMaxInput.value,
      date: dateInput.value,
      flexibleOnly: flexibleOnlyInput.checked
    };
  }

  function syncUrl(filters) {
    const next = new URLSearchParams();
    if (filters.query) next.set('query', filters.query);
    if (filters.categories.length) next.set('category', filters.categories.join(','));
    if (filters.schedule.length) next.set('schedule', filters.schedule.join(','));
    if (filters.payMin) next.set('payMin', filters.payMin);
    if (filters.payMax) next.set('payMax', filters.payMax);
    if (filters.date) next.set('date', filters.date);
    if (filters.flexibleOnly) next.set('flexibleOnly', '1');
    if (state.page !== 1) next.set('page', String(state.page));
    if (state.pageSize !== 20) next.set('pageSize', String(state.pageSize));
    if (state.sortBy !== 'createdAt') next.set('sortBy', state.sortBy);
    if (state.sortOrder !== 'desc') next.set('sortOrder', state.sortOrder);
    const query = next.toString();
    history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
    return next;
  }

  function renderActiveFilters(filters) {
    if (!activeFiltersContainer) return;
    const tags = [];
    if (filters.query) tags.push({ key: 'query', value: filters.query, label: `Поиск: ${filters.query}` });
    filters.categories.forEach(value => tags.push({ key: 'category', value, label: value }));
    filters.schedule.forEach(value => tags.push({ key: 'schedule', value, label: value }));
    if (filters.payMin) tags.push({ key: 'payMin', value: filters.payMin, label: `Оплата от ${filters.payMin}` });
    if (filters.payMax) tags.push({ key: 'payMax', value: filters.payMax, label: `Оплата до ${filters.payMax}` });
    if (filters.date) tags.push({ key: 'date', value: filters.date, label: `Дата: ${filters.date}` });
    if (filters.flexibleOnly) tags.push({ key: 'flexibleOnly', value: '1', label: 'По договорённости' });

    if (tags.length === 0) {
      activeFiltersContainer.innerHTML = '<span class="tag">Нет активных фильтров</span>';
      return;
    }

    activeFiltersContainer.innerHTML = tags
      .map(tag => `
        <span class="active-filter-chip">
          ${escapeHtml(tag.label)}
          <button type="button" data-remove="${escapeHtml(tag.key)}" data-value="${escapeHtml(tag.value)}" aria-label="Удалить фильтр">×</button>
        </span>
      `)
      .join('');
  }

  async function loadVacancies(options = {}) {
    const filters = collectFilterState();
    const urlParams = syncUrl(filters);
    renderActiveFilters(filters);

    const requestParams = new URLSearchParams(urlParams.toString());
    requestParams.set('page', String(state.page));
    requestParams.set('pageSize', String(state.pageSize));
    requestParams.set('sortBy', state.sortBy);
    requestParams.set('sortOrder', state.sortOrder);

    setLoading(loader, true);
    list.innerHTML = '';
    empty.style.display = 'none';

    try {
      const res = await fetch(`/api/vacancies?${requestParams.toString()}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Не удалось загрузить вакансии');

      const { items, total } = readWrappedListResponse(payload);
      if (resultsCount) resultsCount.textContent = String(total);
      setLoading(loader, false);

      if (!Array.isArray(items) || items.length === 0) {
        empty.style.display = 'block';
        return;
      }

      list.innerHTML = items.map(renderVacancyCard).join('');
      if (options.closeSidebar) setSidebarOpen(sidebar, sidebarBackdrop, false);
    } catch (err) {
      setLoading(loader, false);
      showMessage(message, err.message || 'Не удалось загрузить вакансии.', 'error');
    }
  }

  function renderVacancyCard(item) {
    const canEdit = canManageItem(currentUser, item.userId);
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
          <button class="btn secondary" data-action="view" data-id="${item.id}">Подробнее</button>
          ${canEdit ? `<button class="btn" data-action="edit" data-id="${item.id}">Редактировать</button>` : ''}
          ${canEdit ? `<button class="btn btn-delete" data-action="delete" data-id="${item.id}">Удалить</button>` : ''}
        </div>
      </div>
    `;
  }

  function showVacancy(item) {
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

    const canEdit = canManageItem(currentUser, item.userId);
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

  function showVacancy(item) {
    const categories = (item.categoryIds || []).map(cat => `<span class="tag">${escapeHtml(cat)}</span>`).join(' ');
    const schedule = (item.schedule || []).map(s => `<span class="tag">${escapeHtml(s)}</span>`).join(' ');
    const timeText = item.isFlexibleTime ? 'РџРѕ РґРѕРіРѕРІРѕСЂС‘РЅРЅРѕСЃС‚Рё' : (item.dateTime ? new Date(item.dateTime).toLocaleString('ru-RU') : 'вЂ”');

    modalDetail.innerHTML = buildVacancyDetailMarkup(item, categories, schedule, timeText);

    const canEdit = canManageItem(currentUser, item.userId);
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
        if (res.status === 401) {
          redirectToAuth(getCurrentPath());
          return;
        }
        showMessage(message, result.error || 'Ошибка удаления.', 'error');
      }
    } catch (err) {
      showMessage(message, 'Ошибка сети при удалении.', 'error');
    }
  }

  list.addEventListener('click', async (event) => {
    const actionBtn = event.target.closest('[data-action]');
    const card = event.target.closest('.job-card');
    const id = actionBtn ? actionBtn.dataset.id : (card ? card.dataset.id : '');
    if (!id) return;

    if (!actionBtn) {
      try {
        const res = await fetch(`/api/vacancies/${id}`);
        const data = await res.json();
        showVacancy(data);
      } catch (err) {
        showMessage(message, 'Не удалось открыть вакансию.', 'error');
      }
      return;
    }

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

  if (activeFiltersContainer) {
    activeFiltersContainer.addEventListener('click', (event) => {
      const removeBtn = event.target.closest('[data-remove]');
      if (!removeBtn) return;
      const key = removeBtn.dataset.remove;
      const value = removeBtn.dataset.value;

      if (key === 'query') searchInput.value = '';
      if (key === 'category') categoryGroup.setSelected(categoryGroup.getSelected().filter(item => item !== value));
      if (key === 'schedule') scheduleGroup.setSelected(scheduleGroup.getSelected().filter(item => item !== value));
      if (key === 'payMin') payMinInput.value = '';
      if (key === 'payMax') payMaxInput.value = '';
      if (key === 'date') dateInput.value = '';
      if (key === 'flexibleOnly') flexibleOnlyInput.checked = false;

      state.page = 1;
      loadVacancies();
    });
  }

  function applyPreset(name) {
    if (name === 'today') {
      dateInput.value = new Date().toISOString().slice(0, 10);
      flexibleOnlyInput.checked = false;
    }
    if (name === 'flexible') {
      flexibleOnlyInput.checked = true;
      dateInput.value = '';
    }
    if (name === 'budget' && !payMaxInput.value) {
      payMaxInput.value = '1000';
    }
    state.page = 1;
    loadVacancies({ closeSidebar: true });
  }

  document.querySelectorAll('#vacancySidebar .preset-btn').forEach(button => {
    button.addEventListener('click', () => applyPreset(button.dataset.preset));
  });

  const debouncedSearch = debounce(() => {
    state.page = 1;
    loadVacancies();
  }, 320);

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const value = searchInput.value.trim();
      if (value.length === 0 || value.length >= 3) debouncedSearch();
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        state.page = 1;
        loadVacancies();
      }
    });
  }

  if (searchBtn) searchBtn.addEventListener('click', () => {
    state.page = 1;
    loadVacancies();
  });
  if (applyBtn) applyBtn.addEventListener('click', () => {
    state.page = 1;
    loadVacancies({ closeSidebar: true });
  });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    categoryGroup.setSelected([]);
    scheduleGroup.setSelected([]);
    payMinInput.value = '';
    payMaxInput.value = '';
    dateInput.value = '';
    flexibleOnlyInput.checked = false;
    state.page = 1;
    loadVacancies({ closeSidebar: true });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) setSidebarOpen(sidebar, sidebarBackdrop, false);
  });

  applyUrlState();
  loadVacancies();
}
function initProfilesList() {
  const list = document.getElementById('profilesList');
  if (!list) return;

  const currentUser = getCurrentUser();
  const message = document.getElementById('pageMessage');
  const loader = document.getElementById('profilesLoader');
  const empty = document.getElementById('profilesEmpty');
  const resultsCount = document.getElementById('profileResultsCount');

  const searchInput = document.getElementById('profileSearch');
  const searchBtn = document.getElementById('profileSearchBtn');
  const applyBtn = document.getElementById('profileApplyBtn');
  const resetBtn = document.getElementById('profileResetBtn');
  const payMinInput = document.getElementById('profilePayMin');
  const cityInput = document.getElementById('profileCity');
  const locationInput = document.getElementById('profileLocation');
  const activeFiltersContainer = document.getElementById('profileActiveFilters');

  const sidebar = document.getElementById('profileSidebar');
  const sidebarOpenBtn = document.getElementById('profileOpenFilters');
  const sidebarCloseBtn = document.getElementById('profileSidebarClose');
  const sidebarBackdrop = document.getElementById('profileSidebarBackdrop');

  const categoriesGroup = createChipGroup(document.getElementById('profileFilterCategories'), CATEGORIES);
  const availabilityGroup = createChipGroup(document.getElementById('profileFilterAvailability'), AVAILABILITY_OPTIONS);

  const state = {
    page: 1,
    pageSize: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  };

  const modal = document.getElementById('profileModal');
  const modalDetail = document.getElementById('profileDetail');
  const closeModal = document.getElementById('closeProfile');
  const editBtn = document.getElementById('profileEditBtn');
  const deleteBtn = document.getElementById('profileDeleteBtn');

  if (closeModal) closeModal.addEventListener('click', () => hideModal(modal));
  if (sidebarOpenBtn) sidebarOpenBtn.addEventListener('click', () => setSidebarOpen(sidebar, sidebarBackdrop, true));
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', () => setSidebarOpen(sidebar, sidebarBackdrop, false));
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', () => setSidebarOpen(sidebar, sidebarBackdrop, false));

  function applyUrlState() {
    const params = new URLSearchParams(window.location.search);
    searchInput.value = params.get('query') || '';
    categoriesGroup.setSelected(parseList(params.get('category')));
    availabilityGroup.setSelected(parseList(params.get('availability')));
    payMinInput.value = params.get('payMin') || '';
    cityInput.value = params.get('city') || '';
    locationInput.value = params.get('location') || '';

    const page = Number(params.get('page'));
    const pageSize = Number(params.get('pageSize'));
    if (Number.isInteger(page) && page > 0) state.page = page;
    if (Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 50) state.pageSize = pageSize;
    if (params.get('sortBy')) state.sortBy = params.get('sortBy');
    if (params.get('sortOrder')) state.sortOrder = params.get('sortOrder');
  }

  function collectFilterState() {
    return {
      query: searchInput.value.trim(),
      categories: parseList(document.getElementById('profileFilterCategoriesInput').value),
      availability: parseList(document.getElementById('profileFilterAvailabilityInput').value),
      payMin: payMinInput.value,
      city: cityInput.value,
      location: locationInput.value.trim()
    };
  }

  function syncUrl(filters) {
    const next = new URLSearchParams();
    if (filters.query) next.set('query', filters.query);
    if (filters.categories.length) next.set('category', filters.categories.join(','));
    if (filters.availability.length) next.set('availability', filters.availability.join(','));
    if (filters.payMin) next.set('payMin', filters.payMin);
    if (filters.city) next.set('city', filters.city);
    if (filters.location) next.set('location', filters.location);
    if (state.page !== 1) next.set('page', String(state.page));
    if (state.pageSize !== 20) next.set('pageSize', String(state.pageSize));
    if (state.sortBy !== 'createdAt') next.set('sortBy', state.sortBy);
    if (state.sortOrder !== 'desc') next.set('sortOrder', state.sortOrder);
    const query = next.toString();
    history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
    return next;
  }

  function renderActiveFilters(filters) {
    if (!activeFiltersContainer) return;
    const tags = [];
    if (filters.query) tags.push({ key: 'query', value: filters.query, label: `Поиск: ${filters.query}` });
    filters.categories.forEach(value => tags.push({ key: 'category', value, label: value }));
    filters.availability.forEach(value => tags.push({ key: 'availability', value, label: value }));
    if (filters.payMin) tags.push({ key: 'payMin', value: filters.payMin, label: `Оплата от ${filters.payMin}` });
    if (filters.city) tags.push({ key: 'city', value: filters.city, label: `Город: ${filters.city}` });
    if (filters.location) tags.push({ key: 'location', value: filters.location, label: `Район: ${filters.location}` });

    if (tags.length === 0) {
      activeFiltersContainer.innerHTML = '<span class="tag">Нет активных фильтров</span>';
      return;
    }

    activeFiltersContainer.innerHTML = tags
      .map(tag => `
        <span class="active-filter-chip">
          ${escapeHtml(tag.label)}
          <button type="button" data-remove="${escapeHtml(tag.key)}" data-value="${escapeHtml(tag.value)}" aria-label="Удалить фильтр">×</button>
        </span>
      `)
      .join('');
  }

  async function loadProfiles(options = {}) {
    const filters = collectFilterState();
    const urlParams = syncUrl(filters);
    renderActiveFilters(filters);

    const requestParams = new URLSearchParams(urlParams.toString());
    requestParams.set('page', String(state.page));
    requestParams.set('pageSize', String(state.pageSize));
    requestParams.set('sortBy', state.sortBy);
    requestParams.set('sortOrder', state.sortOrder);

    setLoading(loader, true);
    list.innerHTML = '';
    empty.style.display = 'none';

    try {
      const res = await fetch(`/api/profiles?${requestParams.toString()}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Не удалось загрузить услуги');

      const { items, total } = readWrappedListResponse(payload);
      if (resultsCount) resultsCount.textContent = String(total);
      setLoading(loader, false);

      if (!Array.isArray(items) || items.length === 0) {
        empty.style.display = 'block';
        return;
      }

      list.innerHTML = items.map(renderProfileCard).join('');
      if (options.closeSidebar) setSidebarOpen(sidebar, sidebarBackdrop, false);
    } catch (err) {
      setLoading(loader, false);
      showMessage(message, err.message || 'Не удалось загрузить услуги.', 'error');
    }
  }

  function renderProfileCard(item) {
    const canEdit = canManageItem(currentUser, item.userId);
    const categories = (item.categories || []).map(cat => `<span class="tag">${escapeHtml(cat)}</span>`).join(' ');
    const availability = (item.availability || []).map(s => `<span class="tag">${escapeHtml(s)}</span>`).join(' ');
    const payText = formatPay(item.payMin, item.payType);

    return `
      <div class="job-card" data-id="${item.id}">
        <div class="job-header">
          <h3>${escapeHtml(item.headline || item.name || 'Услуга')}</h3>
          <span class="job-salary">${escapeHtml(payText)}</span>
        </div>
        <div class="job-category">${categories || 'Без категории'}</div>
        <div class="job-description">${escapeHtml((item.about || '').slice(0, 140))}${item.about && item.about.length > 140 ? '…' : ''}</div>
        <div class="tag">📍 ${escapeHtml(item.city || 'Город не указан')}${item.locationText ? `, ${escapeHtml(item.locationText)}` : ''}</div>
        ${availability ? `<div class="chip-group">${availability}</div>` : ''}
        <div class="card-actions">
          <button class="btn secondary" data-action="view" data-id="${item.id}">Подробнее</button>
          ${canEdit ? `<button class="btn" data-action="edit" data-id="${item.id}">Редактировать</button>` : ''}
          ${canEdit ? `<button class="btn btn-delete" data-action="delete" data-id="${item.id}">Удалить</button>` : ''}
        </div>
      </div>
    `;
  }

  function showProfile(item) {
    const categories = (item.categories || []).map(cat => `<span class="tag">${escapeHtml(cat)}</span>`).join(' ');
    const availability = (item.availability || []).map(s => `<span class="tag">${escapeHtml(s)}</span>`).join(' ');

    modalDetail.innerHTML = `
      <h2>${escapeHtml(item.headline || item.name || 'Услуга')}</h2>
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

    const canEdit = canManageItem(currentUser, item.userId);
    if (editBtn) editBtn.style.display = canEdit ? 'inline-block' : 'none';
    if (deleteBtn) deleteBtn.style.display = canEdit ? 'inline-block' : 'none';

    if (canEdit) {
      editBtn.onclick = () => location.href = `/service-form.html?id=${item.id}`;
      deleteBtn.onclick = () => handleDelete(item.id);
    } else {
      if (editBtn) editBtn.onclick = null;
      if (deleteBtn) deleteBtn.onclick = null;
    }

    showModal(modal);
  }

  function showProfile(item) {
    const categories = (item.categories || []).map(cat => `<span class="tag">${escapeHtml(cat)}</span>`).join(' ');
    const availability = (item.availability || []).map(s => `<span class="tag">${escapeHtml(s)}</span>`).join(' ');

    modalDetail.innerHTML = buildProfileDetailMarkup(item, categories, availability);

    const canEdit = canManageItem(currentUser, item.userId);
    if (editBtn) editBtn.style.display = canEdit ? 'inline-block' : 'none';
    if (deleteBtn) deleteBtn.style.display = canEdit ? 'inline-block' : 'none';

    if (canEdit) {
      editBtn.onclick = () => location.href = `/service-form.html?id=${item.id}`;
      deleteBtn.onclick = () => handleDelete(item.id);
    } else {
      if (editBtn) editBtn.onclick = null;
      if (deleteBtn) deleteBtn.onclick = null;
    }

    showModal(modal);
  }

  async function handleDelete(id) {
    if (!confirm('Удалить услугу?')) return;
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE', headers: { ...getTokenHeader() } });
      const result = await res.json();
      if (result.success) {
        hideModal(modal);
        loadProfiles();
        showMessage(message, 'Услуга удалена.', 'success');
      } else {
        if (res.status === 401) {
          redirectToAuth(getCurrentPath());
          return;
        }
        showMessage(message, result.error || 'Ошибка удаления.', 'error');
      }
    } catch (err) {
      showMessage(message, 'Ошибка сети при удалении.', 'error');
    }
  }

  list.addEventListener('click', async (event) => {
    const actionBtn = event.target.closest('[data-action]');
    const card = event.target.closest('.job-card');
    const id = actionBtn ? actionBtn.dataset.id : (card ? card.dataset.id : '');
    if (!id) return;

    if (!actionBtn) {
      try {
        const res = await fetch(`/api/profiles/${id}`);
        const data = await res.json();
        showProfile(data);
      } catch (err) {
        showMessage(message, 'Не удалось открыть услугу.', 'error');
      }
      return;
    }

    if (actionBtn.dataset.action === 'edit') {
      location.href = `/service-form.html?id=${id}`;
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
        showMessage(message, 'Не удалось открыть услугу.', 'error');
      }
    }
  });

  if (activeFiltersContainer) {
    activeFiltersContainer.addEventListener('click', (event) => {
      const removeBtn = event.target.closest('[data-remove]');
      if (!removeBtn) return;
      const key = removeBtn.dataset.remove;
      const value = removeBtn.dataset.value;

      if (key === 'query') searchInput.value = '';
      if (key === 'category') categoriesGroup.setSelected(categoriesGroup.getSelected().filter(item => item !== value));
      if (key === 'availability') availabilityGroup.setSelected(availabilityGroup.getSelected().filter(item => item !== value));
      if (key === 'payMin') payMinInput.value = '';
      if (key === 'city') cityInput.value = '';
      if (key === 'location') locationInput.value = '';

      state.page = 1;
      loadProfiles();
    });
  }

  function applyPreset(name) {
    if (name === 'city_tokmok') cityInput.value = 'Токмок';
    if (name === 'budget' && !payMinInput.value) payMinInput.value = '500';
    if (name === 'weekend') {
      const selected = new Set(availabilityGroup.getSelected());
      selected.add('Выходные');
      availabilityGroup.setSelected(Array.from(selected));
    }
    state.page = 1;
    loadProfiles({ closeSidebar: true });
  }

  document.querySelectorAll('#profileSidebar .preset-btn').forEach(button => {
    button.addEventListener('click', () => applyPreset(button.dataset.preset));
  });

  const debouncedSearch = debounce(() => {
    state.page = 1;
    loadProfiles();
  }, 320);

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const value = searchInput.value.trim();
      if (value.length === 0 || value.length >= 3) debouncedSearch();
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        state.page = 1;
        loadProfiles();
      }
    });
  }

  if (searchBtn) searchBtn.addEventListener('click', () => {
    state.page = 1;
    loadProfiles();
  });
  if (applyBtn) applyBtn.addEventListener('click', () => {
    state.page = 1;
    loadProfiles({ closeSidebar: true });
  });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    categoriesGroup.setSelected([]);
    availabilityGroup.setSelected([]);
    payMinInput.value = '';
    cityInput.value = '';
    locationInput.value = '';
    state.page = 1;
    loadProfiles({ closeSidebar: true });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) setSidebarOpen(sidebar, sidebarBackdrop, false);
  });

  applyUrlState();
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
        tr.innerHTML = `<td>${r.id}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.contact)}</td><td>${escapeHtml(r.address || '—')}</td><td>${escapeHtml(r.category || r.otherCategoryText || '')}</td><td>${escapeHtml(r.price || '')}</td><td>${escapeHtml(r.created_at || '')}</td>`;
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
