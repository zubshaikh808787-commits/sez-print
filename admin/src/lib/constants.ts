import type { PrinterId, Role, SuggestionStatus } from './types';

export const PRINTERS: { id: PrinterId; label: string; color: string }[] = [
  { id: 'dev', label: 'Dev', color: '#214668' },
  { id: 'labelx', label: 'LabelX', color: '#17A6B8' },
  { id: 'tez', label: 'Tez', color: '#C4A15A' },
  { id: 'td404', label: 'TD-404', color: '#E07A5F' },
  { id: 'josh', label: 'Josh', color: '#7D6B5D' },
];

export const CATEGORIES = ['Jewelry', 'Shipping', 'Cable', 'Retail', 'Food', 'Office', 'Photo'];

export const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'owner', label: 'Owner', hint: 'Manages the team and the rest of the desk' },
  { id: 'editor', label: 'Editor', hint: 'Publishes the library and updates feedback' },
  { id: 'viewer', label: 'Viewer', hint: 'Looks at counts and feedback' },
];

export const SUGGESTION_STATUSES: { id: SuggestionStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'reviewing', label: 'Reviewing' },
  { id: 'planned', label: 'Planned' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'shipped', label: 'Shipped' },
];

export const COOKIE = 'sez_session';
export const SESSION_MS = 12 * 24 * 60 * 60 * 1000;
