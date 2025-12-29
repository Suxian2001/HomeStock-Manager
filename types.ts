export interface Item {
  id: string;
  name: string;
  category: string;
  location: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  image: string | null;
  note: string;
  createdAt: string;
  archived?: boolean;
  archivedAt?: string;
  notificationsDisabled?: boolean;
  lastNotificationDate?: string;
}

export interface FilterState {
  search: string;
  category: string;
  location: string;
  status: 'all' | 'expiring' | 'expired' | 'safe';
}

export interface SortConfig {
  key: keyof Item;
  direction: 'asc' | 'desc';
}
