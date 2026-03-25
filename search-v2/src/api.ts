import type {
  FavoriteEntityType,
  FavoritesResponse,
  FavoritePayload,
  PaginatedResponse,
  ProfileCardDTO,
  ServiceCardDTO,
  UserDTO,
  VacancyCardDTO
} from './types';

function getSessionToken() {
  return window.localStorage.getItem('token') || '';
}

function getAuthHeaders() {
  const token = getSessionToken();
  return token ? { 'x-session-token': token } : {};
}

async function parseJsonResponse(response: Response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload && payload.error ? payload.error : 'Request failed');
  }
  return payload;
}

function normalizeVacancy(item: Partial<VacancyCardDTO>): VacancyCardDTO {
  return {
    id: Number(item.id) || 0,
    contactName: item.contactName || '',
    phone: item.phone || '',
    locationText: item.locationText || '',
    categoryIds: Array.isArray(item.categoryIds) ? item.categoryIds : [],
    title: item.title || '',
    description: item.description || '',
    dateTime: item.dateTime || null,
    isFlexibleTime: !!item.isFlexibleTime,
    schedule: Array.isArray(item.schedule) ? item.schedule : [],
    payAmount: typeof item.payAmount === 'number' ? item.payAmount : (item.payAmount == null ? null : Number(item.payAmount)),
    payType: item.payType || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    photoUrl: item.photoUrl || '',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || '',
    userId: item.userId == null ? null : Number(item.userId),
    isFavorite: !!item.isFavorite
  };
}

function normalizeProfile(item: Partial<ProfileCardDTO>): ProfileCardDTO {
  return {
    id: Number(item.id) || 0,
    name: item.name || '',
    phone: item.phone || '',
    categories: Array.isArray(item.categories) ? item.categories : [],
    headline: item.headline || '',
    availability: Array.isArray(item.availability) ? item.availability : [],
    payMin: typeof item.payMin === 'number' ? item.payMin : (item.payMin == null ? null : Number(item.payMin)),
    payType: item.payType || '',
    city: item.city || '',
    locationText: item.locationText || '',
    about: item.about || '',
    experienceLevel: item.experienceLevel || '',
    languages: Array.isArray(item.languages) ? item.languages : [],
    workFormat: Array.isArray(item.workFormat) ? item.workFormat : [],
    contactMethods: Array.isArray(item.contactMethods) ? item.contactMethods : [],
    age: typeof item.age === 'number' ? item.age : (item.age == null ? null : Number(item.age)),
    tags: Array.isArray(item.tags) ? item.tags : [],
    photoUrl: item.photoUrl || '',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || '',
    userId: item.userId == null ? null : Number(item.userId),
    isFavorite: !!item.isFavorite
  };
}

function normalizePaginatedResponse<T>(payload: any, normalizeItem: (item: any) => T): PaginatedResponse<T> {
  const rawItems = Array.isArray(payload && payload.items) ? payload.items : [];
  const items = rawItems.map(normalizeItem);
  return {
    items,
    total: Number(payload && payload.total) || items.length,
    page: Number(payload && payload.page) || 1,
    pageSize: Number(payload && payload.pageSize) || 20,
    facets: (payload && payload.facets) || {},
    sort: (payload && payload.sort) || { sortBy: 'createdAt', sortOrder: 'desc' }
  };
}

export async function fetchVacancies(params: URLSearchParams): Promise<PaginatedResponse<VacancyCardDTO>> {
  const response = await fetch(`/api/vacancies?${params.toString()}`, {
    headers: { ...getAuthHeaders() }
  });
  const payload = await parseJsonResponse(response);
  return normalizePaginatedResponse(payload, normalizeVacancy);
}

export async function fetchProfiles(params: URLSearchParams): Promise<PaginatedResponse<ProfileCardDTO>> {
  const response = await fetch(`/api/profiles?${params.toString()}`, {
    headers: { ...getAuthHeaders() }
  });
  const payload = await parseJsonResponse(response);
  return normalizePaginatedResponse(payload, normalizeProfile);
}

export async function fetchServices(params: URLSearchParams): Promise<PaginatedResponse<ServiceCardDTO>> {
  return fetchProfiles(params);
}

export async function fetchCurrentUser(): Promise<UserDTO> {
  const response = await fetch('/api/auth/me', {
    headers: { ...getAuthHeaders() }
  });
  const payload = await parseJsonResponse(response);
  return payload.user as UserDTO;
}

export async function logoutCurrentSession() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { ...getAuthHeaders() }
  });
  await parseJsonResponse(response);
}

function normalizeFavoritePayload(item: any): FavoritePayload | null {
  if (!item || (item.entityType !== 'vacancy' && item.entityType !== 'profile')) return null;
  if (!item.item || typeof item.item !== 'object') return null;
  return {
    entityType: item.entityType,
    entityId: Number(item.entityId) || 0,
    createdAt: item.createdAt || '',
    item: item.entityType === 'vacancy' ? normalizeVacancy(item.item) : normalizeProfile(item.item)
  };
}

export async function fetchFavorites(): Promise<FavoritesResponse> {
  const response = await fetch('/api/favorites', {
    headers: { ...getAuthHeaders() }
  });
  const payload = await parseJsonResponse(response);
  const items = Array.isArray(payload && payload.items)
    ? payload.items.map(normalizeFavoritePayload).filter(Boolean) as FavoritePayload[]
    : [];
  return {
    items,
    totals: {
      vacancy: Number(payload && payload.totals && payload.totals.vacancy) || 0,
      profile: Number(payload && payload.totals && payload.totals.profile) || 0
    }
  };
}

export async function addFavorite(entityType: FavoriteEntityType, entityId: number) {
  const response = await fetch('/api/favorites', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ entityType, entityId })
  });
  await parseJsonResponse(response);
}

export async function removeFavorite(entityType: FavoriteEntityType, entityId: number) {
  const response = await fetch(`/api/favorites/${entityType}/${entityId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() }
  });
  await parseJsonResponse(response);
}

export async function deleteVacancy(entityId: number) {
  const response = await fetch(`/api/vacancies/${entityId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() }
  });
  await parseJsonResponse(response);
}

export async function deleteService(entityId: number) {
  const response = await fetch(`/api/profiles/${entityId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() }
  });
  await parseJsonResponse(response);
}
