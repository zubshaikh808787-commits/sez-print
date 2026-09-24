export type Role = 'owner' | 'editor' | 'viewer';

export type Admin = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
};

export type AdminRecord = Admin & { passwordHash: string };

export type Device = {
  id: string;
  model: string;
  platform: 'ios' | 'android';
  firstSeen: string;
  lastSeen: string;
};

export type PrinterId = 'dev' | 'labelx' | 'tez' | 'td404' | 'josh';

export type PrintEvent = {
  id: string;
  deviceId: string;
  templateId: string;
  printer: PrinterId;
  at: string;
};

export type TemplateStatus = 'draft' | 'published';

export type Template = {
  id: string;
  name: string;
  category: string;
  widthMm: number;
  heightMm: number;
  previewUrl: string;
  document: Record<string, unknown>;
  status: TemplateStatus;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AssetKind = 'clipart' | 'sticker';

export type Asset = {
  id: string;
  kind: AssetKind;
  name: string;
  fileUrl: string;
  mime: string;
  createdAt: string;
};

export type Review = {
  id: string;
  rating: number;
  text: string;
  templateId: string;
  deviceId: string;
  createdAt: string;
};

export type SuggestionStatus = 'new' | 'reviewing' | 'planned' | 'rejected' | 'shipped';

export type Suggestion = {
  id: string;
  text: string;
  deviceId: string;
  status: SuggestionStatus;
  note: string;
  createdAt: string;
};

export type Database = {
  version: 1;
  admins: AdminRecord[];
  devices: Device[];
  prints: PrintEvent[];
  templates: Template[];
  clipart: Asset[];
  stickers: Asset[];
  reviews: Review[];
  suggestions: Suggestion[];
};

export type Telemetry = {
  devices: { total: number; active7d: number };
  templates: { published: number; drafts: number };
  prints: { today: number; last3: number; last7: number; month: number; lifetime: number };
  byTemplate: { id: string; name: string; category: string; count: number }[];
  byPrinter: { id: PrinterId; label: string; count: number }[];
  recent: { id: string; templateName: string; printer: string; device: string; at: string }[];
};
