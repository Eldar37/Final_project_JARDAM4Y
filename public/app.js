// Общий фронтенд-скрипт для простого MVP
document.addEventListener('DOMContentLoaded', () => {
  // Employer page
  const form = document.getElementById('applicationForm');
  if (form) {
    const token = localStorage.getItem('token');
    const modal = document.getElementById('categoriesModal');
    const openBtn = document.getElementById('openCategories');
    const closeBtn = document.getElementById('closeCategories');
    const categoryInput = document.getElementById('categoryInput');
    const otherContainer = document.getElementById('otherCategoryContainer');

    openBtn.addEventListener('click', () => modal.style.display = 'flex');
    closeBtn.addEventListener('click', () => modal.style.display = 'none');
    document.querySelectorAll('.category-list .cat').forEach(b => b.addEventListener('click', (e) => {
      const txt = e.target.textContent.trim();
      categoryInput.value = txt;
      modal.style.display = 'none';
      otherContainer.style.display = txt === 'Другие услуги' ? 'block' : 'none';
    }));

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      // Simple validation
      if (!data.name || !data.contact || !data.category) {
        alert('Пожалуйста, заполните имя, контакт и категорию.');
        return;
      }
      try {
        const res = await fetch('/api/applications', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'x-session-token': token } : {}), body: JSON.stringify(data) });
        const json = await res.json();
        if (json.success) {
          location.href = '/?sent=1';
        } else {
          alert(json.error || 'Ошибка при отправке');
        }
      } catch (err) { alert('Ошибка сети'); }
    });
  }

  // Vacancies page
  const vacanciesList = document.getElementById('vacanciesList');
  if (vacanciesList) loadVacancies();

  async function loadVacancies() {
    const res = await fetch('/api/applications/public');
    const items = await res.json();
    vacanciesList.innerHTML = '';
    items.forEach(it => {
      const el = document.createElement('div'); el.className = 'vacancy card';
      el.innerHTML = `<div class="meta"><strong>${escapeHtml(it.category || it.otherCategoryText || '—')}</strong><div>${escapeHtml(it.description || '')}</div><div class="muted">${escapeHtml(it.contact)}</div></div><div class="price">${escapeHtml(it.price || '')}</div>`;
      el.addEventListener('click', () => showVacancy(it));
      vacanciesList.appendChild(el);
    });
  }

  const vacancyModal = document.getElementById('vacancyModal');
  const vacancyDetail = document.getElementById('vacancyDetail');
  const closeVacancy = document.getElementById('closeVacancy');
  if (closeVacancy) closeVacancy.addEventListener('click', () => vacancyModal.style.display = 'none');

  function showVacancy(it) {
    if (!vacancyModal) return;
    vacancyDetail.innerHTML = `<h3>${escapeHtml(it.category || it.otherCategoryText || '—')}</h3>
      <p>${escapeHtml(it.description || '')}</p>
      <p><b>Адрес:</b> ${escapeHtml(it.address || '—')}</p>
      <p><b>Контакт:</b> ${escapeHtml(it.contact)}</p>
      <p><b>Дата/время:</b> ${escapeHtml(it.datetime || '—')}</p>
      <p><b>Цена:</b> ${escapeHtml(it.price || 'Договорная')}</p>`;
    vacancyModal.style.display = 'flex';
  }

  // Admin page
  const loginBtn = document.getElementById('loginBtn');
  const exportBtn = document.getElementById('exportBtn');
  if (loginBtn) loginBtn.addEventListener('click', async () => {
    const key = document.getElementById('adminKey').value;
    if (!key) { alert('Введите ключ'); return; }
    try {
      const res = await fetch('/api/admin/applications', { headers: { 'x-admin-key': key } });
      if (!res.ok) { alert('Неверный ключ'); return; }
      const rows = await res.json();
      document.getElementById('adminArea').style.display = 'block';
      const tbody = document.querySelector('#appsTable tbody'); tbody.innerHTML = '';
      rows.forEach(r => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${r.id}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.contact)}</td><td>${escapeHtml(r.address || '—')}</td><td>${escapeHtml(r.category || r.otherCategoryText)}</td><td>${escapeHtml(r.price || '')}</td><td>${escapeHtml(r.created_at)}</td>`; tbody.appendChild(tr); });
      // store key for export
      exportBtn.dataset.key = key;
    } catch (err) { alert('Ошибка'); }
  });
  if (exportBtn) exportBtn.addEventListener('click', () => {
    const key = exportBtn.dataset.key || prompt('Введите ключ администратора для экспорта');
    if (!key) return; window.location = `/api/admin/export?adminKey=${encodeURIComponent(key)}`;
  });
});

function escapeHtml(s) { if (!s) return ''; return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }