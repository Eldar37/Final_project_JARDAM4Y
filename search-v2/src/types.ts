export type SortState = {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  facets: Record<string, unknown>;
  sort: SortState;
};

export type FilterState = {
  query: string;
  categories: string[];
  availability: string[];
  payMin: string;
  payMax: string;
  city: string;
  location: string;
  date: string;
  flexibleOnly: boolean;
};

export type VacancyCardDTO = {
  id: number;
  contactName: string;
  phone: string;
  locationText: string;
  categoryIds: string[];
  title: string;
  description: string;
  dateTime: string | null;
  isFlexibleTime: boolean;
  schedule: string[];
  payAmount: number | null;
  payType: string;
  tags: string[];
  photoUrl: string;
  createdAt: string;
  updatedAt: string;
  userId: number | null;
  isFavorite: boolean;
};

export type ProfileCardDTO = {
  id: number;
  name: string;
  phone: string;
  categories: string[];
  headline: string;
  availability: string[];
  payMin: number | null;
  payType: string;
  city: string;
  locationText: string;
  about: string;
  experienceLevel: string;
  languages: string[];
  workFormat: string[];
  contactMethods: string[];
  age: number | null;
  tags: string[];
  photoUrl: string;
  createdAt: string;
  updatedAt: string;
  userId: number | null;
  isFavorite: boolean;
};

export type ServiceCardDTO = ProfileCardDTO;

export type UserDTO = {
  id: number;
  name: string;
  email: string;
};

export type FavoriteEntityType = 'vacancy' | 'profile';

export type FavoritePayload = {
  entityType: FavoriteEntityType;
  entityId: number;
  createdAt: string;
  item: VacancyCardDTO | ProfileCardDTO;
};

export type FavoritesResponse = {
  items: FavoritePayload[];
  totals: {
    vacancy: number;
    profile: number;
  };
};
