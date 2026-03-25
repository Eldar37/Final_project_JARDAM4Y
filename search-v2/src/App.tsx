import { useEffect, useMemo, useState } from 'react';
import {
  addFavorite,
  deleteService,
  deleteVacancy,
  fetchCurrentUser,
  fetchFavorites,
  fetchServices,
  fetchVacancies,
  logoutCurrentSession,
  removeFavorite
} from './api';
import type { FavoriteEntityType, FilterState, ServiceCardDTO, UserDTO, VacancyCardDTO } from './types';

type EntityTab = 'service' | 'vacancy';
type RouteMode = 'search' | 'favorites';
type DetailState =
  | { tab: 'service'; item: ServiceCardDTO }
  | { tab: 'vacancy'; item: VacancyCardDTO }
  | null;

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
const CITY_OPTIONS = ['Токмок', 'Бишкек', 'Кант', 'Кара-Балта', 'Чуй', 'Другое'];
const defaultFilters: FilterState = {
  query: '',
  categories: [],
  availability: [],
  payMin: '',
  payMax: '',
  city: '',
  location: '',
  date: '',
  flexibleOnly: false
};

function parseList(value: string | null) {
  if (!value) return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function getCurrentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function getAuthUrl(next = getCurrentPath()) {
  return `/auth.html?next=${encodeURIComponent(next)}`;
}

function formatPay(amount: number | null, type: string) {
  if (amount == null || Number.isNaN(amount)) return 'Договорная';
  const label = type === 'hour' ? 'за час' : type === 'shift' ? 'за смену' : 'за работу';
  return `${amount} сом ${label}`;
}

function formatDate(value: string | null | undefined) {
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

function cropText(value: string, max = 150) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

function formatServiceTitle(item: ServiceCardDTO) {
  return item.headline || item.name || 'Услуга';
}

function isOwner(currentUser: UserDTO | null, itemUserId: number | null) {
  if (!currentUser || itemUserId == null) return false;
  return String(currentUser.id) === String(itemUserId);
}

function getPathConfig() {
  const pathname = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const routeMode: RouteMode = pathname.includes('/favorites') ? 'favorites' : 'search';
  const pathTab: EntityTab = pathname.includes('/vacancies') ? 'vacancy' : 'service';
  const rawQueryTab = params.get('tab');
  const queryTab: EntityTab | '' =
    rawQueryTab === 'vacancy' ? 'vacancy' : (rawQueryTab === 'service' || rawQueryTab === 'profile' ? 'service' : '');
  const activeTab: EntityTab = queryTab || pathTab;
  const inlineTabs = pathname.includes('/marketplace') || pathname.includes('/favorites');
  return { pathname, routeMode, activeTab, inlineTabs };
}

function sanitizeFiltersForTab(filters: FilterState, tab: EntityTab): FilterState {
  if (tab === 'service') {
    return { ...filters, payMax: '', date: '', flexibleOnly: false };
  }
  return { ...filters, city: '', location: '' };
}

function readFiltersFromUrl(tab: EntityTab): FilterState {
  const params = new URLSearchParams(window.location.search);
  return sanitizeFiltersForTab({
    query: params.get('query') || '',
    categories: parseList(params.get('category')),
    availability: parseList(params.get('availability') || params.get('schedule')),
    payMin: params.get('payMin') || '',
    payMax: params.get('payMax') || '',
    city: params.get('city') || '',
    location: params.get('location') || '',
    date: params.get('date') || '',
    flexibleOnly: params.get('flexibleOnly') === '1' || params.get('flexibleOnly') === 'true'
  }, tab);
}

function buildQuery(filters: FilterState, tab: EntityTab, inlineTabs: boolean) {
  const params = new URLSearchParams();
  if (inlineTabs) params.set('tab', tab);
  if (filters.query) params.set('query', filters.query);
  if (filters.categories.length) params.set('category', filters.categories.join(','));
  if (filters.availability.length) params.set(tab === 'service' ? 'availability' : 'schedule', filters.availability.join(','));
  if (filters.payMin) params.set('payMin', filters.payMin);
  if (tab === 'vacancy') {
    if (filters.payMax) params.set('payMax', filters.payMax);
    if (filters.date) params.set('date', filters.date);
    if (filters.flexibleOnly) params.set('flexibleOnly', '1');
  } else {
    if (filters.city) params.set('city', filters.city);
    if (filters.location) params.set('location', filters.location);
  }
  return params;
}

function includesText(value: string, query: string) {
  if (!query) return true;
  return value.toLowerCase().includes(query.toLowerCase());
}

function filterFavoriteVacancies(items: VacancyCardDTO[], filters: FilterState) {
  return items.filter((item) => {
    if (filters.query) {
      const haystack = `${item.title} ${item.description} ${item.locationText} ${item.contactName}`.toLowerCase();
      if (!haystack.includes(filters.query.toLowerCase())) return false;
    }
    if (filters.categories.length && !filters.categories.every(cat => item.categoryIds.includes(cat))) return false;
    if (filters.availability.length && !filters.availability.every(slot => item.schedule.includes(slot))) return false;
    if (filters.payMin && (item.payAmount == null || Number(item.payAmount) < Number(filters.payMin))) return false;
    if (filters.payMax && (item.payAmount == null || Number(item.payAmount) > Number(filters.payMax))) return false;
    if (filters.flexibleOnly && !item.isFlexibleTime) return false;
    if (filters.date) {
      const itemDate = item.dateTime ? item.dateTime.slice(0, 10) : '';
      if (itemDate !== filters.date) return false;
    }
    return true;
  });
}

function filterFavoriteServices(items: ServiceCardDTO[], filters: FilterState) {
  return items.filter((item) => {
    if (filters.query) {
      const haystack = `${item.name} ${item.headline} ${item.about} ${item.locationText} ${item.city}`.toLowerCase();
      if (!haystack.includes(filters.query.toLowerCase())) return false;
    }
    if (filters.categories.length && !filters.categories.every(cat => item.categories.includes(cat))) return false;
    if (filters.availability.length && !filters.availability.every(slot => item.availability.includes(slot))) return false;
    if (filters.payMin && (item.payMin == null || Number(item.payMin) < Number(filters.payMin))) return false;
    if (filters.city && item.city !== filters.city) return false;
    if (filters.location && !includesText(item.locationText || '', filters.location)) return false;
    return true;
  });
}

function mapAppliedFilterTags(filters: FilterState, tab: EntityTab) {
  const tags: Array<{ key: keyof FilterState; value: string; label: string }> = [];
  if (filters.query) tags.push({ key: 'query', value: filters.query, label: `Поиск: ${filters.query}` });
  filters.categories.forEach(value => tags.push({ key: 'categories', value, label: value }));
  filters.availability.forEach(value => tags.push({ key: 'availability', value, label: value }));
  if (filters.payMin) tags.push({ key: 'payMin', value: filters.payMin, label: `Оплата от ${filters.payMin}` });
  if (tab === 'vacancy') {
    if (filters.payMax) tags.push({ key: 'payMax', value: filters.payMax, label: `Оплата до ${filters.payMax}` });
    if (filters.date) tags.push({ key: 'date', value: filters.date, label: `Дата: ${filters.date}` });
    if (filters.flexibleOnly) tags.push({ key: 'flexibleOnly', value: '1', label: 'По договоренности' });
  } else {
    if (filters.city) tags.push({ key: 'city', value: filters.city, label: `Город: ${filters.city}` });
    if (filters.location) tags.push({ key: 'location', value: filters.location, label: `Район: ${filters.location}` });
  }
  return tags;
}

function isUnauthorizedError(error: unknown) {
  return error instanceof Error && /unauthorized/i.test(error.message);
}

export default function App() {
  const pathConfig = useMemo(() => getPathConfig(), []);
  const [activeTab, setActiveTab] = useState<EntityTab>(pathConfig.activeTab);
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => readFiltersFromUrl(pathConfig.activeTab));
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() => readFiltersFromUrl(pathConfig.activeTab));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [vacancies, setVacancies] = useState<VacancyCardDTO[]>([]);
  const [services, setServices] = useState<ServiceCardDTO[]>([]);
  const [favoriteVacancies, setFavoriteVacancies] = useState<VacancyCardDTO[]>([]);
  const [favoriteServices, setFavoriteServices] = useState<ServiceCardDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [favoritesCounter, setFavoritesCounter] = useState({ vacancy: 0, profile: 0 });
  const [pendingFavoriteKeys, setPendingFavoriteKeys] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<DetailState>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserDTO | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const routeMode = pathConfig.routeMode;
  const activeFilterTags = useMemo(() => mapAppliedFilterTags(appliedFilters, activeTab), [appliedFilters, activeTab]);
  const favoritesTotal = favoritesCounter.vacancy + favoritesCounter.profile;
  const filteredFavoriteVacancies = useMemo(() => filterFavoriteVacancies(favoriteVacancies, appliedFilters), [favoriteVacancies, appliedFilters]);
  const filteredFavoriteServices = useMemo(() => filterFavoriteServices(favoriteServices, appliedFilters), [favoriteServices, appliedFilters]);
  const vacancyItems = routeMode === 'favorites' ? filteredFavoriteVacancies : vacancies;
  const serviceItems = routeMode === 'favorites' ? filteredFavoriteServices : services;
  const activeItemsCount = activeTab === 'vacancy' ? vacancyItems.length : serviceItems.length;
  const resultsCount = routeMode === 'favorites' ? activeItemsCount : total;
  const isMarketplaceScreen = pathConfig.pathname.includes('/marketplace');
  const isFavoritesScreen = pathConfig.pathname.includes('/favorites');
  const detailIsOwner = !!detail && isOwner(currentUser, detail.item.userId);

  async function refreshFavorites() {
    const token = window.localStorage.getItem('token');
    if (!token) {
      setFavoriteVacancies([]);
      setFavoriteServices([]);
      setFavoritesCounter({ vacancy: 0, profile: 0 });
      return;
    }
    try {
      const payload = await fetchFavorites();
      const vacanciesOnly = payload.items.filter(entry => entry.entityType === 'vacancy').map(entry => entry.item as VacancyCardDTO);
      const servicesOnly = payload.items.filter(entry => entry.entityType === 'profile').map(entry => entry.item as ServiceCardDTO);
      setFavoriteVacancies(vacanciesOnly);
      setFavoriteServices(servicesOnly);
      setFavoritesCounter(payload.totals);
    } catch {
      setFavoriteVacancies([]);
      setFavoriteServices([]);
      setFavoritesCounter({ vacancy: 0, profile: 0 });
    }
  }

  function redirectToAuth(next = getCurrentPath()) {
    window.location.href = getAuthUrl(next);
  }

  function openProtectedPath(path: string) {
    if (!currentUser) {
      redirectToAuth(path);
      return;
    }
    window.location.href = path;
  }

  useEffect(() => {
    let canceled = false;
    async function loadSession() {
      const token = window.localStorage.getItem('token');
      if (!token) {
        if (!canceled) {
          setCurrentUser(null);
          setSessionReady(true);
        }
        return;
      }
      try {
        const user = await fetchCurrentUser();
        if (!canceled) setCurrentUser(user);
      } catch {
        window.localStorage.removeItem('token');
        window.localStorage.removeItem('user');
        if (!canceled) setCurrentUser(null);
      } finally {
        if (!canceled) setSessionReady(true);
      }
    }
    loadSession();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (routeMode === 'favorites' && !currentUser) {
      redirectToAuth(getCurrentPath());
      return;
    }
    refreshFavorites();
  }, [sessionReady, currentUser, routeMode]);

  useEffect(() => {
    const params = buildQuery(appliedFilters, activeTab, pathConfig.inlineTabs);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [activeTab, appliedFilters, pathConfig.inlineTabs]);

  useEffect(() => {
    if (routeMode !== 'search') return;
    let canceled = false;
    setLoading(true);
    setError('');
    const params = buildQuery(appliedFilters, activeTab, false);
    params.set('page', '1');
    params.set('pageSize', '20');
    params.set('sortBy', 'createdAt');
    params.set('sortOrder', 'desc');
    const request = activeTab === 'vacancy' ? fetchVacancies(params) : fetchServices(params);
    request
      .then((response) => {
        if (canceled) return;
        if (activeTab === 'vacancy') setVacancies(response.items as VacancyCardDTO[]);
        else setServices(response.items as ServiceCardDTO[]);
        setTotal(response.total);
      })
      .catch((err) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить список');
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [activeTab, appliedFilters, routeMode]);

  useEffect(() => {
    if (detail && detail.tab !== activeTab && routeMode !== 'favorites') {
      setDetail(null);
    }
  }, [activeTab, detail, routeMode]);

  function applyFilters() {
    setAppliedFilters(sanitizeFiltersForTab(draftFilters, activeTab));
    setMobileFiltersOpen(false);
  }

  function resetFilters() {
    const cleared = sanitizeFiltersForTab(defaultFilters, activeTab);
    setDraftFilters(cleared);
    setAppliedFilters(cleared);
    setMobileFiltersOpen(false);
  }

  function updateDraft<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setDraftFilters(prev => ({ ...prev, [key]: value }));
  }

  function toggleDraftArrayValue(key: 'categories' | 'availability', value: string) {
    setDraftFilters((prev) => {
      const nextValues = new Set(prev[key]);
      if (nextValues.has(value)) nextValues.delete(value);
      else nextValues.add(value);
      return { ...prev, [key]: Array.from(nextValues) };
    });
  }

  function removeFilterTag(key: keyof FilterState, value: string) {
    setDraftFilters((prev) => {
      const next = { ...prev };
      if (key === 'categories' || key === 'availability') {
        next[key] = prev[key].filter(item => item !== value) as FilterState[typeof key];
      } else if (key === 'flexibleOnly') {
        next.flexibleOnly = false;
      } else {
        next[key] = '' as FilterState[typeof key];
      }
      const sanitized = sanitizeFiltersForTab(next, activeTab);
      setAppliedFilters(sanitized);
      return sanitized;
    });
  }

  function applyPreset(preset: 'today' | 'flexible' | 'budget' | 'tokmok' | 'weekend') {
    const next = { ...draftFilters };
    if (preset === 'today') next.date = new Date().toISOString().slice(0, 10);
    if (preset === 'flexible') {
      next.flexibleOnly = true;
      next.date = '';
    }
    if (preset === 'budget') {
      if (activeTab === 'vacancy') next.payMax = next.payMax || '1000';
      else next.payMin = next.payMin || '500';
    }
    if (preset === 'tokmok') next.city = 'Токмок';
    if (preset === 'weekend' && !next.availability.includes('Выходные')) {
      next.availability = [...next.availability, 'Выходные'];
    }

    const sanitized = sanitizeFiltersForTab(next, activeTab);
    setDraftFilters(sanitized);
    setAppliedFilters(sanitized);
    setMobileFiltersOpen(false);
  }

  function handleTabChange(nextTab: EntityTab) {
    if (nextTab === activeTab) return;

    if (pathConfig.pathname.includes('/vacancies') || pathConfig.pathname.includes('/services')) {
      const target = nextTab === 'vacancy' ? '/vacancies' : '/services';
      const params = buildQuery(sanitizeFiltersForTab(appliedFilters, nextTab), nextTab, false);
      const query = params.toString();
      window.location.href = query ? `${target}?${query}` : target;
      return;
    }

    const sanitized = sanitizeFiltersForTab(draftFilters, nextTab);
    setActiveTab(nextTab);
    setDraftFilters(sanitized);
    setAppliedFilters(sanitized);
  }

  async function handleFavoriteToggle(entityType: FavoriteEntityType, entityId: number, isFavorite: boolean) {
    if (!currentUser) {
      redirectToAuth(getCurrentPath());
      return;
    }

    const key = `${entityType}:${entityId}`;
    setPendingFavoriteKeys(prev => ({ ...prev, [key]: true }));

    try {
      if (isFavorite) {
        await removeFavorite(entityType, entityId);
      } else {
        await addFavorite(entityType, entityId);
      }

      const nextFavorite = !isFavorite;
      if (entityType === 'vacancy') {
        setVacancies(prev => prev.map(item => (item.id === entityId ? { ...item, isFavorite: nextFavorite } : item)));
      } else {
        setServices(prev => prev.map(item => (item.id === entityId ? { ...item, isFavorite: nextFavorite } : item)));
      }

      setDetail(prev => {
        if (!prev || prev.item.id !== entityId) return prev;
        if (entityType === 'vacancy' && prev.tab === 'vacancy') return { ...prev, item: { ...prev.item, isFavorite: nextFavorite } };
        if (entityType === 'profile' && prev.tab === 'service') return { ...prev, item: { ...prev.item, isFavorite: nextFavorite } };
        return prev;
      });

      await refreshFavorites();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        redirectToAuth(getCurrentPath());
        return;
      }
      setError(err instanceof Error ? err.message : 'Не удалось обновить избранное');
    } finally {
      setPendingFavoriteKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleDeleteDetail() {
    if (!detail) return;
    const entityLabel = detail.tab === 'service' ? 'услугу' : 'вакансию';
    if (!window.confirm(`Удалить ${entityLabel}?`)) return;

    setDeletePending(true);
    setError('');
    try {
      if (detail.tab === 'service') {
        await deleteService(detail.item.id);
        setServices(prev => prev.filter(item => item.id !== detail.item.id));
        setFavoriteServices(prev => prev.filter(item => item.id !== detail.item.id));
      } else {
        await deleteVacancy(detail.item.id);
        setVacancies(prev => prev.filter(item => item.id !== detail.item.id));
        setFavoriteVacancies(prev => prev.filter(item => item.id !== detail.item.id));
      }

      if (routeMode === 'search' && detail.tab === activeTab) {
        setTotal(prev => Math.max(0, prev - 1));
      }

      setDetail(null);
      await refreshFavorites();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        redirectToAuth(getCurrentPath());
        return;
      }
      setError(err instanceof Error ? err.message : 'Не удалось удалить карточку');
    } finally {
      setDeletePending(false);
    }
  }

  function handleEditDetail() {
    if (!detail) return;
    const path = detail.tab === 'service'
      ? `/service-form.html?id=${detail.item.id}`
      : `/vacancy-form.html?id=${detail.item.id}`;
    openProtectedPath(path);
  }

  const pageTitle = isFavoritesScreen
    ? 'Избранные карточки'
    : isMarketplaceScreen
      ? 'Услуги и вакансии в одном месте'
      : activeTab === 'service'
        ? 'Поиск услуг'
        : 'Поиск вакансий';

  const pageSubtitle = routeMode === 'favorites'
    ? 'Сохраненные карточки под рукой.'
    : '';

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/jardam4y-logo.svg" alt="JARDAM4Y by Enactus IUCA" className="brand-logo" />
          <div className="brand-copy">
            <p>Социальная платформа услуг, вакансий и взаимопомощи.</p>
          </div>
        </div>

        <div className="top-actions">
          <button type="button" className="action-btn" onClick={() => openProtectedPath('/service-form.html')}>
            + Создать услугу
          </button>
          <button type="button" className="action-btn" onClick={() => openProtectedPath('/vacancy-form.html')}>
            + Создать вакансию
          </button>
          <button type="button" className="ghost-btn" onClick={() => openProtectedPath('/dashboard.html')}>
            Кабинет
          </button>
          <button
            type="button"
            className={`icon-btn ${isFavoritesScreen ? 'active' : ''}`}
            onClick={() => openProtectedPath('/favorites')}
            aria-label="Избранное"
          >
            ❤ <span>{favoritesTotal}</span>
          </button>
          {currentUser ? (
            <>
              <span className="user-pill">{currentUser.name}</span>
              <button
                type="button"
                className="ghost-btn"
                onClick={async () => {
                  try {
                    await logoutCurrentSession();
                  } catch {
                    // ignore local logout failures
                  } finally {
                    window.localStorage.removeItem('token');
                    window.localStorage.removeItem('user');
                    window.location.href = getCurrentPath();
                  }
                }}
              >
                Выйти
              </button>
            </>
          ) : (
            <button type="button" className="ghost-btn" onClick={() => redirectToAuth(getCurrentPath())}>
              Войти
            </button>
          )}
        </div>
      </header>

      <div className="tabs-row">
        <button type="button" className={activeTab === 'service' ? 'tab active' : 'tab'} onClick={() => handleTabChange('service')}>
          Услуги
        </button>
        <button type="button" className={activeTab === 'vacancy' ? 'tab active' : 'tab'} onClick={() => handleTabChange('vacancy')}>
          Вакансии
        </button>
      </div>

      <div className="layout">
        <aside className={`sidebar ${mobileFiltersOpen ? 'open' : ''}`}>
          <div className="sidebar-head">
            <h2>Фильтры</h2>
            <button type="button" className="close-filters" onClick={() => setMobileFiltersOpen(false)}>×</button>
          </div>

          <div className="panel">
            <label className="field-label">
              Поиск
              <input
                value={draftFilters.query}
                onChange={(e) => updateDraft('query', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyFilters();
                  }
                }}
                placeholder={activeTab === 'service' ? 'Название услуги, описание, район...' : 'Название вакансии, описание, район...'}
              />
            </label>
          </div>

          <div className="panel">
            <p className="field-title">Быстрые пресеты</p>
            <div className="preset-grid">
              {activeTab === 'service' ? (
                <>
                  <button type="button" onClick={() => applyPreset('tokmok')}>Только Токмок</button>
                  <button type="button" onClick={() => applyPreset('weekend')}>Выходные</button>
                  <button type="button" onClick={() => applyPreset('budget')}>От 500 сом</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => applyPreset('today')}>Сегодня</button>
                  <button type="button" onClick={() => applyPreset('flexible')}>Гибкий график</button>
                  <button type="button" onClick={() => applyPreset('budget')}>Бюджет до 1000</button>
                </>
              )}
            </div>
          </div>

          <div className="panel">
            <p className="field-title">Категории</p>
            <div className="chips">
              {CATEGORIES.map((category) => (
                <button
                  type="button"
                  key={category}
                  className={draftFilters.categories.includes(category) ? 'chip active' : 'chip'}
                  onClick={() => toggleDraftArrayValue('categories', category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <p className="field-title">{activeTab === 'service' ? 'Доступность' : 'График'}</p>
            <div className="chips">
              {AVAILABILITY_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={draftFilters.availability.includes(option) ? 'chip active' : 'chip'}
                  onClick={() => toggleDraftArrayValue('availability', option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <label className="field-label">
              Оплата от
              <input type="number" min="0" value={draftFilters.payMin} onChange={(e) => updateDraft('payMin', e.target.value)} />
            </label>
            {activeTab === 'vacancy' && (
              <label className="field-label">
                Оплата до
                <input type="number" min="0" value={draftFilters.payMax} onChange={(e) => updateDraft('payMax', e.target.value)} />
              </label>
            )}
          </div>

          {activeTab === 'service' && (
            <div className="panel">
              <label className="field-label">
                Город
                <select value={draftFilters.city} onChange={(e) => updateDraft('city', e.target.value)}>
                  <option value="">Любой</option>
                  {CITY_OPTIONS.map(city => <option key={city} value={city}>{city}</option>)}
                </select>
              </label>
              <label className="field-label">
                Район
                <input value={draftFilters.location} onChange={(e) => updateDraft('location', e.target.value)} />
              </label>
            </div>
          )}

          {activeTab === 'vacancy' && (
            <div className="panel">
              <label className="field-label">
                Дата
                <input type="date" value={draftFilters.date} onChange={(e) => updateDraft('date', e.target.value)} />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={draftFilters.flexibleOnly}
                  onChange={(e) => updateDraft('flexibleOnly', e.target.checked)}
                />
                Только по договоренности
              </label>
            </div>
          )}

          <div className="sidebar-actions">
            <button type="button" className="primary-btn" onClick={applyFilters}>Применить</button>
            <button type="button" className="ghost-btn" onClick={resetFilters}>Сбросить</button>
          </div>
        </aside>

        <div className={`backdrop ${mobileFiltersOpen ? 'show' : ''}`} onClick={() => setMobileFiltersOpen(false)} />

        <main className="results">
          <div className="results-head">
            <div>
              {pageSubtitle && <span className="results-kicker">{pageSubtitle}</span>}
              <h2>{pageTitle}</h2>
              <p>Найдено: <strong>{resultsCount}</strong></p>
            </div>
            <button type="button" className="mobile-filter-btn" onClick={() => setMobileFiltersOpen(true)}>
              Фильтры
            </button>
          </div>

          <div className="active-filters">
            {activeFilterTags.length === 0 && <span className="tag">Нет активных фильтров</span>}
            {activeFilterTags.map((tag) => (
              <span className="tag removable" key={`${tag.key}:${tag.value}`}>
                {tag.label}
                <button type="button" onClick={() => removeFilterTag(tag.key, tag.value)}>×</button>
              </span>
            ))}
          </div>

          {!sessionReady && <div className="state-box">Проверяем сессию...</div>}
          {loading && routeMode === 'search' && <div className="state-box">Загружаем карточки...</div>}
          {error && <div className="state-box error">{error}</div>}

          {!loading && !error && activeTab === 'service' && serviceItems.length === 0 && (
            <div className="state-box">
              Услуги не найдены. Попробуйте изменить запрос или сбросить часть фильтров.
            </div>
          )}

          {!loading && !error && activeTab === 'vacancy' && vacancyItems.length === 0 && (
            <div className="state-box">
              Вакансии не найдены. Попробуйте изменить запрос или сбросить часть фильтров.
            </div>
          )}

          {activeTab === 'service' && serviceItems.length > 0 && (
            <div className="cards-grid">
              {serviceItems.map((item) => {
                const favoriteKey = `profile:${item.id}`;
                const favoritePending = !!pendingFavoriteKeys[favoriteKey];
                const mine = isOwner(currentUser, item.userId);

                return (
                  <article
                    key={item.id}
                    className={`card clickable-card ${mine ? 'owner-card' : ''}`}
                    onClick={() => setDetail({ tab: 'service', item })}
                  >
                    <div className="card-media">
                      {item.photoUrl ? (
                        <img src={item.photoUrl} alt={formatServiceTitle(item)} loading="lazy" />
                      ) : (
                        <div className="placeholder">Фото не добавлено</div>
                      )}
                    </div>
                    <div className="card-head">
                      <div>
                        <h3>{formatServiceTitle(item)}</h3>
                        {mine && <span className="owner-badge">Моя карточка</span>}
                      </div>
                      <button
                        type="button"
                        className={item.isFavorite ? 'heart active' : 'heart'}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleFavoriteToggle('profile', item.id, !!item.isFavorite);
                        }}
                        disabled={favoritePending}
                        aria-label="Добавить в избранное"
                      >
                        ❤
                      </button>
                    </div>
                    <p className="pay">{formatPay(item.payMin, item.payType)}</p>
                    <p className="desc">{cropText(item.about || 'Описание не указано.')}</p>
                    <p className="meta">📍 {item.city || 'Город не указан'}{item.locationText ? `, ${item.locationText}` : ''}</p>
                    {item.availability.length > 0 && (
                      <div className="small-chips">
                        {item.availability.map(slot => <span key={slot} className="tag">{slot}</span>)}
                      </div>
                    )}
                    <div className="card-actions">
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDetail({ tab: 'service', item });
                        }}
                      >
                        Подробнее
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {activeTab === 'vacancy' && vacancyItems.length > 0 && (
            <div className="cards-grid">
              {vacancyItems.map((item) => {
                const favoriteKey = `vacancy:${item.id}`;
                const favoritePending = !!pendingFavoriteKeys[favoriteKey];
                const mine = isOwner(currentUser, item.userId);

                return (
                  <article
                    key={item.id}
                    className={`card clickable-card ${mine ? 'owner-card' : ''}`}
                    onClick={() => setDetail({ tab: 'vacancy', item })}
                  >
                    <div className="card-media">
                      {item.photoUrl ? (
                        <img src={item.photoUrl} alt={item.title || 'Вакансия'} loading="lazy" />
                      ) : (
                        <div className="placeholder">Фото не добавлено</div>
                      )}
                    </div>
                    <div className="card-head">
                      <div>
                        <h3>{item.title || 'Вакансия'}</h3>
                        {mine && <span className="owner-badge">Моя карточка</span>}
                      </div>
                      <button
                        type="button"
                        className={item.isFavorite ? 'heart active' : 'heart'}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleFavoriteToggle('vacancy', item.id, !!item.isFavorite);
                        }}
                        disabled={favoritePending}
                        aria-label="Добавить в избранное"
                      >
                        ❤
                      </button>
                    </div>
                    <p className="pay">{formatPay(item.payAmount, item.payType)}</p>
                    <p className="desc">{cropText(item.description || 'Описание не указано.')}</p>
                    <p className="meta">📍 {item.locationText || 'Локация не указана'}</p>
                    <p className="meta">🕒 {item.isFlexibleTime ? 'По договоренности' : formatDate(item.dateTime)}</p>
                    {item.schedule.length > 0 && (
                      <div className="small-chips">
                        {item.schedule.map(slot => <span key={slot} className="tag">{slot}</span>)}
                      </div>
                    )}
                    <div className="card-actions">
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDetail({ tab: 'vacancy', item });
                        }}
                      >
                        Подробнее
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {detail && (
        <div className="detail-modal" onClick={() => setDetail(null)}>
          <div className="detail-dialog" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="detail-close" onClick={() => setDetail(null)}>×</button>

            <div className="detail-grid">
              <div className="detail-media">
                {detail.item.photoUrl ? (
                  <img
                    src={detail.item.photoUrl}
                    alt={detail.tab === 'service' ? formatServiceTitle(detail.item) : detail.item.title || 'Вакансия'}
                  />
                ) : (
                  <div className="detail-placeholder">Фото не добавлено</div>
                )}
              </div>

              <div className="detail-content">
                {detail.tab === 'service' ? (
                  <>
                    <div className="detail-head">
                      <div>
                        <h2>{formatServiceTitle(detail.item)}</h2>
                        <p className="detail-subtitle">{detail.item.name || 'Исполнитель'} · {formatPay(detail.item.payMin, detail.item.payType)}</p>
                      </div>
                      {detailIsOwner && <span className="owner-badge">Моя карточка</span>}
                    </div>

                    <div className="detail-tags">
                      {detail.item.categories.map(category => <span key={category} className="tag">{category}</span>)}
                    </div>

                    <div className="detail-section">
                      <h3>Описание услуги</h3>
                      <p>{detail.item.about || 'Описание не указано.'}</p>
                    </div>

                    <div className="detail-columns">
                      <div className="detail-section">
                        <h3>Локация</h3>
                        <p><strong>Город:</strong> {detail.item.city || 'Не указан'}</p>
                        <p><strong>Район:</strong> {detail.item.locationText || 'Не указан'}</p>
                      </div>
                      <div className="detail-section">
                        <h3>Контакты</h3>
                        <p><strong>Имя:</strong> {detail.item.name || 'Не указано'}</p>
                        <p><strong>Телефон:</strong> {detail.item.phone || 'Не указан'}</p>
                      </div>
                    </div>

                    <div className="detail-columns">
                      <div className="detail-section">
                        <h3>Доступность</h3>
                        <p>{detail.item.availability.length ? detail.item.availability.join(', ') : 'Не указана'}</p>
                      </div>
                      <div className="detail-section">
                        <h3>Дополнительно</h3>
                        <p><strong>Опыт:</strong> {detail.item.experienceLevel || 'Не указан'}</p>
                        <p><strong>Возраст:</strong> {detail.item.age || 'Не указан'}</p>
                      </div>
                    </div>

                    {(detail.item.languages.length > 0 || detail.item.workFormat.length > 0 || detail.item.contactMethods.length > 0) && (
                      <div className="detail-columns">
                        <div className="detail-section">
                          <h3>Языки</h3>
                          <p>{detail.item.languages.length ? detail.item.languages.join(', ') : 'Не указаны'}</p>
                        </div>
                        <div className="detail-section">
                          <h3>Формат и связь</h3>
                          <p><strong>Формат:</strong> {detail.item.workFormat.length ? detail.item.workFormat.join(', ') : 'Не указан'}</p>
                          <p><strong>Связь:</strong> {detail.item.contactMethods.length ? detail.item.contactMethods.join(', ') : 'Не указана'}</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="detail-head">
                      <div>
                        <h2>{detail.item.title || 'Вакансия'}</h2>
                        <p className="detail-subtitle">{formatPay(detail.item.payAmount, detail.item.payType)}</p>
                      </div>
                      {detailIsOwner && <span className="owner-badge">Моя карточка</span>}
                    </div>

                    <div className="detail-tags">
                      {detail.item.categoryIds.map(category => <span key={category} className="tag">{category}</span>)}
                    </div>

                    <div className="detail-section">
                      <h3>Описание вакансии</h3>
                      <p>{detail.item.description || 'Описание не указано.'}</p>
                    </div>

                    <div className="detail-columns">
                      <div className="detail-section">
                        <h3>Контакт</h3>
                        <p><strong>Имя:</strong> {detail.item.contactName || 'Не указано'}</p>
                        <p><strong>Телефон:</strong> {detail.item.phone || 'Не указан'}</p>
                      </div>
                      <div className="detail-section">
                        <h3>Условия</h3>
                        <p><strong>Локация:</strong> {detail.item.locationText || 'Не указана'}</p>
                        <p><strong>Дата:</strong> {detail.item.isFlexibleTime ? 'По договоренности' : formatDate(detail.item.dateTime)}</p>
                      </div>
                    </div>

                    <div className="detail-columns">
                      <div className="detail-section">
                        <h3>График</h3>
                        <p>{detail.item.schedule.length ? detail.item.schedule.join(', ') : 'Не указан'}</p>
                      </div>
                      <div className="detail-section">
                        <h3>Дополнительно</h3>
                        <p><strong>Теги:</strong> {detail.item.tags.length ? detail.item.tags.join(', ') : 'Не указаны'}</p>
                        <p><strong>Создано:</strong> {formatDate(detail.item.createdAt)}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {detailIsOwner && (
              <div className="detail-actions">
                <button type="button" className="ghost-btn" onClick={handleEditDetail}>Редактировать</button>
                <button type="button" className="danger-btn" onClick={handleDeleteDetail} disabled={deletePending}>
                  {deletePending ? 'Удаление...' : 'Удалить'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="site-footer">
        <div className="footer-grid">
          <div className="footer-block footer-brand-block">
            <img src="/jardam4y-logo.svg" alt="JARDAM4Y by Enactus IUCA" className="footer-logo" />
            <p>JARDAM4Y - социальная платформа для поиска услуг, вакансий и прямой связи между людьми.</p>
          </div>
          <div className="footer-block">
            <h3>Контакты</h3>
            <a href="tel:+996554118320" className="footer-link">+996 554 118 320</a>
            <a href="https://www.instagram.com/enactus.iuca.kg" target="_blank" rel="noreferrer" className="footer-link">
              instagram.com/enactus.iuca.kg
            </a>
          </div>
          <div className="footer-block">
            <h3>О проекте</h3>
            <p>Инициатива Enactus IUCA для удобного и аккуратного цифрового сервиса помощи и подработки.</p>
          </div>
        </div>
        <div className="footer-note">© 2026 JARDAM4Y · Enactus IUCA</div>
      </footer>

      <button type="button" className="floating-filter-btn" onClick={() => setMobileFiltersOpen(true)}>
        Фильтры
      </button>
    </div>
  );
}
