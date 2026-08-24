export type ClipartShape =
  | { t: 'c'; x: number; y: number; r: number; f?: 0; sw?: number }
  | { t: 'e'; x: number; y: number; rx: number; ry: number; f?: 0; sw?: number }
  | { t: 'r'; x: number; y: number; w: number; h: number; rx?: number; f?: 0; sw?: number }
  | { t: 'p'; d: string; f?: 0; sw?: number }
  | { t: 'l'; a: number; b: number; c: number; d: number; sw?: number }
  | { t: 'pg'; pts: string; f?: 0; sw?: number }
  | { t: 'pl'; pts: string; sw?: number };

export const CLIPART_SIDEBAR = [
  'Commercial Retail',
  'Industry Icon',
  'General Icon',
  'Education',
  'Home & Office',
  'Operator',
  'Other Operator',
  'Other Electric Grid',
  'Other Bank',
  'Other Traffic',
  'Other CATV',
  'Petroleum',
  'Other Petroleum',
] as const;

export type ClipartSidebar = (typeof CLIPART_SIDEBAR)[number];

export const CLIPART_PILLS = [
  'Animal',
  'Flower & Plant',
  'Traffic',
  'Party',
  'Commodity',
  'Home Appliance',
] as const;

export type ClipartPill = (typeof CLIPART_PILLS)[number];

export interface ClipartItem {
  id: string;
  label: string;
  shapes: ClipartShape[];
}

function n(value: string): number[] {
  return value.split(',').map(Number);
}

function parsePart(part: string): ClipartShape {
  const sep = part.indexOf(':');
  const key = part.slice(0, sep);
  const value = part.slice(sep + 1);
  switch (key) {
    case 'c': {
      const [x, y, r] = n(value);
      return { t: 'c', x, y, r };
    }
    case 'cs': {
      const [x, y, r] = n(value);
      return { t: 'c', x, y, r, f: 0 };
    }
    case 'e': {
      const [x, y, rx, ry] = n(value);
      return { t: 'e', x, y, rx, ry };
    }
    case 'es': {
      const [x, y, rx, ry] = n(value);
      return { t: 'e', x, y, rx, ry, f: 0 };
    }
    case 'r': {
      const [x, y, w, h, rx] = n(value);
      return { t: 'r', x, y, w, h, rx };
    }
    case 'rs': {
      const [x, y, w, h, rx] = n(value);
      return { t: 'r', x, y, w, h, rx, f: 0 };
    }
    case 'p':
      return { t: 'p', d: value };
    case 'ps':
      return { t: 'p', d: value, f: 0 };
    case 'l': {
      const [a, b, c, d] = n(value);
      return { t: 'l', a, b, c, d };
    }
    case 'pg':
      return { t: 'pg', pts: value };
    case 'pl':
      return { t: 'pl', pts: value };
    default:
      return { t: 'p', d: 'M12 2l3 7h7l-5.5 4.2L18 21l-6-4-6 4 1.5-7.8L2 9h7z' };
  }
}

function icon(id: string, label: string, compact: string): ClipartItem {
  return { id, label, shapes: compact.split('|').map(parsePart) };
}

const SIDEBAR_ICON_MAP: Record<ClipartSidebar, ClipartItem[]> = {
  'Commercial Retail': [
    icon('sr-cart', 'Cart', 'ps:M3 5h2l1 12h13l2-8H7|c:9,20,1.4|c:17,20,1.4'),
    icon('sr-bag', 'Bag', 'ps:M6 8h12l-1 12H7z|l:9,8,9,6|l:15,8,15,6|ps:M9 6c0-1.7 1.3-3 3-3s3 1.3 3 3'),
    icon('sr-tag', 'Tag', 'ps:M4 12l8-8h8v8l-8 8z|c:16,8,1.3'),
    icon('sr-barcode', 'Barcode', 'r:4,5,1.4,14|r:7,5,0.8,14|r:9.5,5,2,14|r:13,5,0.8,14|r:15.5,5,1.6,14|r:18.5,5,1.2,14'),
    icon('sr-gift', 'Gift', 'rs:5,10,14,10,1|rs:5,6,14,4,1|l:12,6,12,20|l:5,10,19,10|ps:M8 6c0-2 2-3 4-1 2-2 4-1 4 1'),
    icon('sr-card', 'Card', 'rs:3,6,18,12,2|l:3,11,21,11|r:5,14,6,2,0.5'),
    icon('sr-percent', 'Sale', 'cs:7,8,2|cs:17,16,2|l:8,18,16,6'),
    icon('sr-receipt', 'Receipt', 'ps:M7 3h10v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z|l:10,8,16,8|l:10,12,16,12|l:10,16,14,16'),
    icon('sr-store', 'Store', 'ps:M3 10l2-6h14l2 6z|r:4,10,16,11|r:10,14,4,7'),
    icon('sr-coin', 'Coin', 'cs:12,12,8|cs:12,12,5|l:12,8,12,16'),
    icon('sr-scale', 'Scale', 'l:12,4,12,20|l:6,20,18,20|ps:M12 7l7 4H5z'),
    icon('sr-box', 'Box', 'ps:M4 8l8-4 8 4v10l-8 4-8-4z|l:12,4,12,22|l:4,8,20,8'),
  ],
  'Industry Icon': [
    icon('in-factory', 'Factory', 'r:3,10,6,11|r:9,14,12,7|pg:9,14 9,7 14,14|r:16,8,3,6|r:5,4,2,6'),
    icon('in-wrench', 'Wrench', 'ps:M14 4a4 4 0 00-5.7 5.7L4 14v4h4l4.3-4.3A4 4 0 0014 4zm2 2a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z'),
    icon('in-gear', 'Gear', 'cs:12,12,4|p:M12 2l1.5 3.2 3.4-.6 1.5 3.2 3.2 1.5-.6 3.4L24 12l-3 1.5.6 3.4-3.2 1.5-1.5 3.2-3.4-.6L12 24l-1.5-3.2-3.4.6-1.5-3.2-3.2-1.5.6-3.4L0 12l3-1.5L2.4 7.1 5.6 5.6 7.1 2.4 10.5 3z'),
    icon('in-hammer', 'Hammer', 'r:10,3,8,5,1|r:11,8,2.4,13,0.4|r:8,18,9,3,0.6'),
    icon('in-bolt', 'Bolt', 'p:M13 2L6 13h5l-1 9 8-12h-5z'),
    icon('in-cpu', 'CPU', 'rs:6,6,12,12,2|r:9,9,6,6|l:9,2,9,6|l:15,2,15,6|l:9,18,9,22|l:15,18,15,22|l:2,9,6,9|l:2,15,6,15|l:18,9,22,9|l:18,15,22,15'),
    icon('in-anvil', 'Anvil', 'r:4,8,16,3|r:8,11,8,6|r:5,17,14,3'),
    icon('in-helmet', 'Helmet', 'ps:M4 14a8 8 0 0116 0v2H4z|r:3,16,18,3,1'),
    icon('in-crane', 'Crane', 'l:5,20,5,4|l:5,4,18,4|l:18,4,18,8|r:16,8,4,3|r:3,20,6,2'),
    icon('in-pipe', 'Pipe', 'rs:3,9,18,6,2|cs:5,12,2.5|cs:19,12,2.5'),
    icon('in-nut', 'Nut', 'pg:12,3 20,8 20,16 12,21 4,16 4,8|cs:12,12,3.5'),
    icon('in-drill', 'Drill', 'r:3,10,10,4,1|pg:13,9 21,12 13,15|r:5,8,3,8,0.5'),
  ],
  'General Icon': [
    icon('gn-star', 'Star', 'p:M12 2l2.8 7H22l-6 4.4 2.3 7.1L12 16.5 5.7 20.5 8 13.4 2 9h7.2z'),
    icon('gn-heart', 'Heart', 'p:M12 21s-8-5.2-8-10a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 4.8-8 10-8 10z'),
    icon('gn-check', 'Check', 'cs:12,12,9|pl:7,12 11,16 17,8'),
    icon('gn-info', 'Info', 'cs:12,12,9|c:12,7.5,1.1|r:11.1,10.5,1.8,7,0.4'),
    icon('gn-warn', 'Warning', 'pg:12,3 22,20 2,20|r:11.1,10,1.8,5,0.4|c:12,17.5,1.1'),
    icon('gn-pin', 'Pin', 'ps:M12 21s7-7.2 7-11.2A7 7 0 005 9.8C5 13.8 12 21 12 21z|c:12,10,2.2'),
    icon('gn-flag', 'Flag', 'l:6,3,6,21|p:M6 4h12l-3 4 3 4H6z'),
    icon('gn-home', 'Home', 'pg:3,12 12,4 21,12|r:6,12,12,9|r:10,15,4,6'),
    icon('gn-plus', 'Plus', 'cs:12,12,9|l:12,7,12,17|l:7,12,17,12'),
    icon('gn-minus', 'Minus', 'cs:12,12,9|l:7,12,17,12'),
    icon('gn-cross', 'Cross', 'cs:12,12,9|l:8,8,16,16|l:16,8,8,16'),
    icon('gn-arrow', 'Arrow', 'ps:M5 12h12|pl:13,7 19,12 13,17'),
    icon('gn-lock', 'Lock', 'rs:6,11,12,10,2|ps:M8 11V8a4 4 0 018 0v3'),
    icon('gn-key', 'Key', 'cs:8,12,4|r:11,11,10,2,0.5|r:17,9,2,3|r:20,9,2,3'),
    icon('gn-eye', 'Eye', 'es:12,12,9,6|c:12,12,2.6'),
    icon('gn-bell', 'Bell', 'ps:M6 16V11a6 6 0 0112 0v5l2 2H4z|ps:M10 20a2 2 0 004 0'),
  ],
  Education: [
    icon('ed-book', 'Book', 'ps:M5 4h11a3 3 0 013 3v13H8a3 3 0 00-3 3V4z|l:8,4,8,20'),
    icon('ed-pencil', 'Pencil', 'p:M4 20l4-1 11-11-3-3L5 16z|l:16,5,19,8'),
    icon('ed-grad', 'Graduate', 'pg:3,10 12,6 21,10 12,14z|l:12,14,12,19|ps:M19 11v5c-2 2-5 3-7 3'),
    icon('ed-ruler', 'Ruler', 'rs:4,8,16,8,1|l:8,8,8,12|l:12,8,12,14|l:16,8,16,12'),
    icon('ed-pack', 'Backpack', 'rs:6,8,12,13,3|ps:M9 8V6a3 3 0 016 0v2|r:9,12,6,4,1'),
    icon('ed-globe', 'Globe', 'cs:12,12,8|es:12,12,3.5,8|l:4,12,20,12'),
    icon('ed-flask', 'Flask', 'l:9,3,9,10|l:15,3,15,10|ps:M9 10l-4 9h14l-4-9z'),
    icon('ed-atom', 'Atom', 'cs:12,12,2|es:12,12,9,4|es:12,12,4,9'),
    icon('ed-abc', 'ABC', 'ps:M5 18L9 6h2l4 12|l:6.5,14,12.5,14|r:16,8,5,2|r:18,8,1.4,10'),
    icon('ed-board', 'Board', 'rs:3,4,18,13,1|l:12,17,12,21|l:8,21,16,21|l:7,8,17,8|l:7,12,14,12'),
    icon('ed-cap', 'Cap', 'e:12,8,8,4|r:8,8,8,6|l:16,8,16,16'),
    icon('ed-medal', 'Medal', 'cs:12,15,6|pg:8,3 12,9 16,3 14,10 10,10z'),
  ],
  'Home & Office': [
    icon('ho-house', 'House', 'pg:2,12 12,3 22,12|r:5,12,14,9|r:10,15,4,6'),
    icon('ho-lamp', 'Lamp', 'pg:8,4 16,4 14,11 10,11z|l:12,11,12,18|l:8,18,16,18|r:9,18,6,2'),
    icon('ho-chair', 'Chair', 'r:7,6,10,7,2|l:8,13,8,20|l:16,13,16,20|l:6,20,18,20|l:7,13,17,13'),
    icon('ho-folder', 'Folder', 'ps:M3 7h6l2 2h10v11H3z'),
    icon('ho-printer', 'Printer', 'rs:6,3,12,6,1|r:4,9,16,8,1|r:8,13,8,6'),
    icon('ho-calendar', 'Calendar', 'rs:4,5,16,16,2|l:4,10,20,10|l:8,3,8,7|l:16,3,16,7|r:7,13,3,3|r:14,13,3,3'),
    icon('ho-desk', 'Desk', 'r:3,12,18,2|l:5,14,5,20|l:19,14,19,20|r:8,6,8,6,1'),
    icon('ho-clock', 'Clock', 'cs:12,12,9|l:12,12,12,7|l:12,12,16,14'),
    icon('ho-trash', 'Trash', 'ps:M6 8h12l-1 13H7z|l:4,8,20,8|r:9,4,6,4,1'),
    icon('ho-clip', 'Clip', 'ps:M8 12v-3a4 4 0 018 0v8a3 3 0 01-6 0V10'),
    icon('ho-pin2', 'Pushpin', 'c:12,7,3.5|l:12,10,12,20|pg:9,10 15,10 12,14z'),
    icon('ho-mail', 'Mail', 'rs:3,6,18,12,2|pl:3,6 12,13 21,6'),
  ],
  Operator: [
    icon('op-person', 'Person', 'c:12,7,3.5|ps:M5 20c0-4.5 3-7 7-7s7 2.5 7 7'),
    icon('op-phone', 'Phone', 'rs:7,3,10,18,3|r:10,5,4,1.4,0.6|c:12,18,1.1'),
    icon('op-head', 'Headset', 'ps:M5 13V11a7 7 0 0114 0v2|r:3,13,3,6,1|r:18,13,3,6,1|l:6,19,10,19'),
    icon('op-mail', 'Envelope', 'rs:3,6,18,12,2|pl:3,6 12,13 21,6'),
    icon('op-chat', 'Chat', 'ps:M4 5h16v11H8l-4 4z'),
    icon('op-bell', 'Bell', 'ps:M6 16V11a6 6 0 0112 0v5l2 2H4z|ps:M10 20a2 2 0 004 0'),
    icon('op-badge', 'Badge', 'cs:12,12,8|c:12,10,3|ps:M8 16c1.5-2 6.5-2 8 0'),
    icon('op-mic', 'Mic', 'rs:9,3,6,10,3|l:12,13,12,17|l:8,17,16,17|ps:M7 12a5 5 0 0010 0'),
    icon('op-call', 'Call', 'ps:M6 4c6 0 10 4 14 10l-4 3-3-3c-1.5 2-3 3.5-5 5l-3-3C7 12 6 8 6 4z'),
    icon('op-team', 'Team', 'c:8,8,2.5|c:16,8,2.5|c:12,11,2.5|ps:M3 20c0-3 2-5 5-5|ps:M16 15c3 0 5 2 5 5|ps:M8 20c0-3 2-4 4-4s4 1 4 4'),
    icon('op-id', 'ID Card', 'rs:3,6,18,12,2|c:8,12,2.4|r:12,10,6,2|r:12,14,5,1.4'),
    icon('op-clock', 'Shift', 'cs:12,12,9|l:12,7,12,12|l:12,12,16,14'),
  ],
  'Other Operator': [
    icon('oo-mic', 'Mic', 'rs:9,3,6,10,3|ps:M7 12a5 5 0 0010 0|l:12,17,12,20|l:8,20,16,20'),
    icon('oo-video', 'Video', 'rs:3,7,13,10,2|pg:16,10 21,7 21,17 16,14z'),
    icon('oo-signal', 'Signal', 'l:5,18,5,14|l:9,18,9,11|l:13,18,13,8|l:17,18,17,5'),
    icon('oo-net', 'Network', 'c:12,5,2|c:5,18,2|c:19,18,2|l:12,7,5,16|l:12,7,19,16|l:5,18,19,18'),
    icon('oo-server', 'Server', 'rs:4,4,16,5,1|rs:4,10,16,5,1|rs:4,16,16,4,1|c:7,6.5,0.8|c:7,12.5,0.8'),
    icon('oo-cloud', 'Cloud', 'ps:M7 18h11a4 4 0 000-8 5.5 5.5 0 00-10.5 2A3.5 3.5 0 007 18z'),
    icon('oo-wifi', 'Wi-Fi', 'ps:M5 10a10 10 0 0114 0|ps:M8 13a6 6 0 018 0|c:12,17.5,1.4'),
    icon('oo-router', 'Router', 'rs:4,12,16,7,2|l:8,12,8,8|l:16,12,16,7|c:8,16,1|c:12,16,1|c:16,16,1'),
    icon('oo-usb', 'USB', 'l:12,4,12,16|pg:9,4 15,4 12,1z|rs:9,16,6,5,1'),
    icon('oo-link', 'Link', 'ps:M9 12a4 4 0 010-5l2-2a4 4 0 015.6 5.6l-1 1|ps:M15 12a4 4 0 010 5l-2 2a4 4 0 01-5.6-5.6l1-1'),
  ],
  'Other Electric Grid': [
    icon('el-power', 'Power', 'cs:12,12,9|ps:M12 7v6|ps:M8.5 9.5a5 5 0 107 0'),
    icon('el-outlet', 'Outlet', 'rs:5,4,14,16,3|c:9,10,1.2|c:15,10,1.2|r:10.5,14,3,2,1'),
    icon('el-battery', 'Battery', 'rs:3,8,16,8,2|r:19,10,2,4,0.5|r:5,10,10,4'),
    icon('el-plug', 'Plug', 'l:8,3,8,8|l:16,3,16,8|rs:6,8,12,8,2|l:12,16,12,21'),
    icon('el-light', 'Light', 'cs:12,10,6|r:10,16,4,2|l:10,19,14,19|l:12,2,12,4|l:4,6,6,8|l:20,6,18,8'),
    icon('el-flash', 'Flash', 'p:M13 2L6 13h5l-1 9 8-12h-5z'),
    icon('el-solar', 'Solar', 'r:8,8,8,8|l:12,3,12,7|l:12,17,12,21|l:3,12,7,12|l:17,12,21,12|l:5,5,8,8|l:16,8,19,5|l:5,19,8,16|l:16,16,19,19'),
    icon('el-tower', 'Tower', 'pg:12,3 14,21 10,21z|l:7,10,17,10|l:6,15,18,15'),
    icon('el-meter', 'Meter', 'cs:12,13,8|pl:12,13 12,8|pl:12,13 16,15'),
    icon('el-switch', 'Switch', 'rs:6,4,12,16,6|c:12,9,3.5'),
  ],
  'Other Bank': [
    icon('bk-bank', 'Bank', 'pg:3,10 12,4 21,10|r:5,10,14,9|l:8,10,8,19|l:12,10,12,19|l:16,10,16,19|r:4,19,16,2'),
    icon('bk-rupee', 'Rupee', 'cs:12,12,9|l:8,8,16,8|l:8,12,16,12|ps:M10 8v4c0 4 6 4 6 8'),
    icon('bk-lock', 'Safe', 'rs:4,5,16,15,2|cs:12,13,4|c:12,13,1.4'),
    icon('bk-doc', 'Document', 'ps:M7 3h8l5 5v13H7z|l:15,3,15,8h5|l:10,13,16,13|l:10,17,14,17'),
    icon('bk-chart', 'Chart', 'l:4,20,20,20|l:4,20,4,4|pl:6,16 10,10 14,13 19,6'),
    icon('bk-atm', 'ATM', 'rs:5,3,14,18,2|rs:8,6,8,6,1|r:8,15,8,3,0.5'),
    icon('bk-wallet', 'Wallet', 'rs:3,7,18,12,2|r:14,11,6,4,1'),
    icon('bk-vault', 'Vault', 'cs:12,12,9|cs:12,12,5|c:17,12,1.2'),
    icon('bk-stack', 'Notes', 'rs:5,8,14,10,1|rs:4,6,14,10,1|rs:6,10,14,10,1'),
    icon('bk-percent', 'Rate', 'cs:8,8,2.4|cs:16,16,2.4|l:8,18,16,6'),
  ],
  'Other Traffic': [
    icon('ot-car', 'Car', 'ps:M4 15l2-5h12l2 5z|r:3,15,18,4,1|c:7,19,2|c:17,19,2'),
    icon('ot-bus', 'Bus', 'rs:5,4,14,14,3|r:5,18,4,3|r:15,18,4,3|r:8,7,8,5'),
    icon('ot-sign', 'Sign', 'rs:6,3,12,10,1|l:12,13,12,21|l:8,21,16,21'),
    icon('ot-light', 'Signal', 'rs:8,2,8,20,4|c:12,7,2.2|c:12,12,2.2|c:12,17,2.2'),
    icon('ot-road', 'Road', 'pg:8,3 16,3 20,21 4,21z|l:12,5,12,9|l:12,12,12,16'),
    icon('ot-park', 'Parking', 'rs:5,3,14,18,2|ps:M9 7h4a3 3 0 010 6H9z|l:9,7,9,17'),
    icon('ot-bike', 'Bike', 'cs:7,16,4|cs:17,16,4|l:7,16,11,8h4|l:11,8,17,16'),
    icon('ot-walk', 'Walk', 'c:13,4.5,2|ps:M8 22l3-8 3 3 2 5|l:11,14,8,12|l:14,11,17,13'),
    icon('ot-stop', 'Stop', 'pg:8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8'),
    icon('ot-cone', 'Cone', 'pg:12,3 20,20 4,20z|r:6,12,12,2'),
  ],
  'Other CATV': [
    icon('tv-set', 'TV', 'rs:3,5,18,12,2|l:8,17,12,21|l:16,17,12,21'),
    icon('tv-play', 'Play', 'rs:3,6,18,12,2|pg:10,9 16,12 10,15z'),
    icon('tv-film', 'Film', 'rs:4,5,16,14,1|r:4,5,3,14|r:17,5,3,14|r:5,8,1.4,1.4|r:5,14,1.4,1.4|r:17.6,8,1.4,1.4|r:17.6,14,1.4,1.4'),
    icon('tv-speaker', 'Speaker', 'rs:7,3,10,18,3|c:12,15,3|c:12,7,1.5'),
    icon('tv-remote', 'Remote', 'rs:8,2,8,20,3|c:12,7,1.6|c:10,12,1|c:14,12,1|c:10,16,1|c:14,16,1'),
    icon('tv-wifi', 'Wi-Fi', 'ps:M4 10a12 12 0 0116 0|ps:M7 13a8 8 0 0110 0|c:12,18,1.5'),
    icon('tv-cam', 'Camera', 'rs:3,8,18,11,2|pg:9,8 11,5 13,5 15,8|c:12,13.5,3'),
    icon('tv-disc', 'Disc', 'cs:12,12,8|cs:12,12,2.5'),
  ],
  Petroleum: [
    icon('pe-drop', 'Drop', 'ps:M12 3s7 8 7 12a7 7 0 11-14 0c0-4 7-12 7-12z'),
    icon('pe-fuel', 'Fuel', 'rs:6,5,9,16,1|r:15,8,4,8,1|l:15,10,18,10|r:8,8,5,4'),
    icon('pe-flame', 'Flame', 'ps:M12 21c4 0 7-3 7-8 0-4-3-7-5-9-1 3-3 4-3 7 0-2-2-4-3-6-3 3-5 6-5 10 0 4 3 6 9 6z'),
    icon('pe-cyl', 'Cylinder', 'e:12,6,6,3|e:12,18,6,3|l:6,6,6,18|l:18,6,18,18'),
    icon('pe-gauge', 'Gauge', 'cs:12,14,8|pl:12,14 8,9|l:6,14,8,14|l:16,14,18,14'),
    icon('pe-truck', 'Tanker', 'rs:3,10,12,7,1|e:18,13,4,4|c:7,19,2|c:16,19,2'),
    icon('pe-well', 'Well', 'r:10,3,4,10|cs:12,16,6|l:6,16,18,16'),
    icon('pe-can', 'Can', 'rs:7,5,10,16,2|r:9,3,6,3,1|l:9,10,15,10'),
    icon('pe-valve', 'Valve', 'c:12,12,4|l:12,3,12,8|l:12,16,12,21|l:3,12,8,12|l:16,12,21,12'),
    icon('pe-drum', 'Drum', 'e:12,6,7,3|e:12,18,7,3|l:5,6,5,18|l:19,6,19,18'),
  ],
  'Other Petroleum': [
    icon('op-barrel', 'Barrel', 'e:12,5,6,2.5|e:12,19,6,2.5|l:6,5,6,19|l:18,5,18,19|l:6,12,18,12'),
    icon('op-pipe', 'Pipeline', 'rs:2,10,20,4,2|l:8,8,8,16|l:16,8,16,16'),
    icon('op-refine', 'Refinery', 'r:4,12,5,9|r:10,8,4,13|r:16,5,4,16|r:5,6,2,6'),
    icon('op-haz', 'Hazard', 'pg:12,3 22,21 2,21|pg:12,8 16,18 8,18'),
    icon('op-thermo', 'Thermo', 'rs:10,3,4,12,2|c:12,18,4'),
    icon('op-drop2', 'Oil', 'ps:M8 14s4-8 4-11c0 3 4 11 4 11a4 4 0 11-8 0z'),
    icon('op-tank', 'Tank', 'rs:3,8,18,10,4|l:6,8,6,5h4'),
    icon('op-flare', 'Flare', 'l:12,22,12,10|pg:12,3 15,10 9,10z'),
    icon('op-mask', 'Mask', 'ps:M4 12h16v4a6 6 0 01-16 0z|l:8,12,8,8|l:16,12,16,8'),
    icon('op-glove', 'Glove', 'ps:M8 21V10a2 2 0 014 0v4h1V8a2 2 0 014 0v7h1V11a2 2 0 014 0v10H8z'),
  ],
};

const PILL_ICON_MAP: Record<ClipartPill, ClipartItem[]> = {
  Animal: [
    icon('an-cat', 'Cat', 'c:12,14,7|pg:5,10 3.5,3 10,9|pg:19,10 20.5,3 14,9|c:9.5,13,1|c:14.5,13,1|pl:10,16.5 12,18 14,16.5'),
    icon('an-dog', 'Dog', 'e:13,14,7,6|c:8,9,4|pg:5,7 4,3 8,6|pg:10,6 11,3 12,6|c:7,8.5,0.8|e:18,16,2.5,1.5'),
    icon('an-bird', 'Bird', 'e:12,13,7,5|pg:18,12 23,10 18,15|c:8,12,1.2|pg:10,8 14,4 15,9'),
    icon('an-fish', 'Fish', 'e:11,12,7,4.5|pg:18,12 23,8 23,16z|c:7,11,1|pg:11,8 13,4 14,9'),
    icon('an-rabbit', 'Rabbit', 'c:12,15,6|e:8,7,2,5|e:14,7,2,5|c:10,14,1|c:14,14,1'),
    icon('an-turtle', 'Turtle', 'e:12,13,8,6|c:20,13,2.2|e:5,10,2,1.4|e:5,16,2,1.4|e:10,19.5,2,1.2|e:15,19.5,2,1.2'),
    icon('an-paw', 'Paw', 'c:12,15,4.5|c:6.5,10,2.2|c:10,7,2.2|c:14,7,2.2|c:17.5,10,2.2'),
    icon('an-horse', 'Horse', 'e:13,14,7,5|pg:6,12 3,7 8,10|c:7,10,2.5|l:18,12,21,7'),
    icon('an-cow', 'Cow', 'e:13,14,7,5.5|c:7,10,3|pg:5,8 4,4 8,8|pg:9,8 10,4 11,8|c:19,16,2'),
    icon('an-pig', 'Pig', 'e:12,13,8,6|c:6,10,2|e:12,16,3,2|c:10.5,16,0.7|c:13.5,16,0.7'),
    icon('an-hen', 'Hen', 'e:13,14,6.5,5|c:8,10,3|pg:5,10 2,8 6,12|pg:16,9 19,5 18,11'),
    icon('an-duck', 'Duck', 'e:13,14,6.5,5|c:8,9,3|pg:5,9 1,9 6,11|c:7,8,0.7'),
    icon('an-owl', 'Owl', 'e:12,14,7,7|c:9,12,2.4|c:15,12,2.4|c:9,12,0.9|c:15,12,0.9|pg:8,6 12,9 16,6'),
    icon('an-bear', 'Bear', 'c:12,14,7|c:6,8,2.6|c:18,8,2.6|c:10,13,1.1|c:14,13,1.1|e:12,16.5,2,1.3'),
    icon('an-mouse', 'Mouse', 'e:14,14,6,5|c:8,10,3.5|c:6,8,2.6|c:10,8,2.2|c:7,10,0.7'),
    icon('an-fox', 'Fox', 'pg:4,18 12,5 20,18z|pg:8,18 12,11 16,18|c:10,14,0.8|c:14,14,0.8'),
    icon('an-lion', 'Lion', 'c:12,13,5|cs:12,13,8|pg:8,7 12,3 16,7|e:18,16,2,1.4'),
    icon('an-ele', 'Elephant', 'e:14,13,6,5|c:8,12,3.5|ps:M6 13c-3 2-3 6 0 7|e:19,16,2.4,1.6'),
    icon('an-frog', 'Frog', 'e:12,15,8,6|c:7,9,2.6|c:17,9,2.6|c:7,9,1|c:17,9,1'),
    icon('an-bee', 'Bee', 'e:12,13,5,3.5|l:8,10,5,7|l:16,10,19,7|e:12,13,2,3.5|l:7,13,17,13'),
    icon('an-bug', 'Bug', 'e:12,14,5,6|l:8,10,5,7|l:16,10,19,7|l:8,18,5,21|l:16,18,19,21|c:12,9,2'),
    icon('an-snail', 'Snail', 'cs:15,13,5|cs:15,13,2.5|e:8,16,5,2.5|pl:4,16 3,10'),
    icon('an-crab', 'Crab', 'e:12,14,6,4|l:6,12,2,8|l:18,12,22,8|l:6,16,3,20|l:18,16,21,20|c:10,13,0.8|c:14,13,0.8'),
    icon('an-whale', 'Whale', 'e:11,14,8,5|pg:18,13 23,9 22,16z|c:7,12.5,1'),
  ],
  'Flower & Plant': [
    icon('fl-flower', 'Flower', 'c:12,12,3|c:12,6,3|c:12,18,3|c:6,12,3|c:18,12,3|c:7.5,7.5,2.4|c:16.5,7.5,2.4|c:7.5,16.5,2.4|c:16.5,16.5,2.4'),
    icon('fl-tulip', 'Tulip', 'ps:M12 20V11|ps:M8 21c4-1 8-1 8 0|ps:M12 11c-4-1-5-7 0-8 5 1 4 7 0 8z'),
    icon('fl-sunf', 'Sunflower', 'c:12,12,4|c:12,5,2.4|c:12,19,2.4|c:5,12,2.4|c:19,12,2.4|c:7,7,2.2|c:17,7,2.2|c:7,17,2.2|c:17,17,2.2'),
    icon('fl-leaf', 'Leaf', 'ps:M5 19c8-2 12-8 14-16-8 2-14 8-14 16z|l:6,18,16,6'),
    icon('fl-tree', 'Tree', 'pg:12,2 20,14 4,14z|r:10,14,4,8'),
    icon('fl-pine', 'Pine', 'pg:12,2 18,9 6,9z|pg:8,9 16,9 20,16 4,16z|r:11,16,2,6'),
    icon('fl-cactus', 'Cactus', 'r:10,5,4,16,2|r:4,10,6,3,1.5|r:14,8,6,3,1.5'),
    icon('fl-clover', 'Clover', 'c:12,8,3.4|c:8,13,3.4|c:16,13,3.4|l:12,14,12,21'),
    icon('fl-rose', 'Rose', 'cs:12,10,6|cs:12,10,3.5|l:12,16,12,21|ps:M8 19c4-2 8 0 8 0'),
    icon('fl-daisy', 'Daisy', 'c:12,12,3|e:12,6,2,3.5|e:12,18,2,3.5|e:6,12,3.5,2|e:18,12,3.5,2'),
    icon('fl-pot', 'Pot', 'r:8,12,8,8,1|ps:M12 12V6|c:12,5,2|ps:M9 8c2 2 4 2 6 0'),
    icon('fl-sprout', 'Sprout', 'l:12,21,12,12|ps:M12 12c-5-1-6-7-1-8|ps:M12 12c5-1 6-7 1-8'),
    icon('fl-wheat', 'Wheat', 'l:12,21,12,4|c:10,6,1.5|c:14,8,1.5|c:10,10,1.5|c:14,12,1.5|c:10,14,1.5|c:14,16,1.5'),
    icon('fl-apple', 'Apple', 'ps:M12 6c-2-3 2-4 3-2-4 0-8 4-8 9a7 7 0 0014 0c0-5-4-9-9-9z'),
    icon('fl-cherry', 'Cherry', 'c:8,16,4|c:16,16,4|l:8,12,12,5|l:16,12,12,5'),
    icon('fl-mushroom', 'Mushroom', 'ps:M5 12a7 7 0 0114 0H5z|r:10,12,4,8,1'),
  ],
  Traffic: [
    icon('tr-car', 'Car', 'ps:M4 15l2.5-5.5h11L20 15z|r:3,15,18,4,1|c:7,19,2.1|c:17,19,2.1|r:8,11,3,2|r:13,11,3,2'),
    icon('tr-van', 'Van', 'rs:3,8,18,9,2|pg:14,8 21,8 21,13 14,13z|c:7,19,2|c:17,19,2'),
    icon('tr-truck', 'Truck', 'rs:2,9,13,8,1|r:15,11,7,6,1|c:7,19,2|c:17,19,2'),
    icon('tr-bus', 'Bus', 'rs:5,3,14,16,3|c:8,20.5,1.8|c:16,20.5,1.8|r:8,6,8,6|l:12,6,12,12'),
    icon('tr-train', 'Train', 'rs:6,3,12,15,3|c:9,20,2|c:15,20,2|r:8,6,8,5|l:6,13,18,13'),
    icon('tr-plane', 'Plane', 'p:M12 2l3 8h7l-5 4 2 8-7-5-7 5 2-8-5-4h7z'),
    icon('tr-ship', 'Ship', 'pg:4,14 20,14 17,20 7,20z|r:10,6,4,8|pg:12,3 16,6 8,6z'),
    icon('tr-boat', 'Boat', 'ps:M4 16l2 4h12l2-4z|l:12,6,12,16|pg:12,6 18,12 12,12z'),
    icon('tr-bike', 'Bike', 'cs:7,16,4|cs:17,16,4|l:7,16,11,8h5l1,8|l:11,8,8,16'),
    icon('tr-scooter', 'Scooter', 'cs:7,18,3|cs:18,18,3|l:7,18,12,8h5|l:12,8,12,18'),
    icon('tr-taxi', 'Taxi', 'ps:M4 15l2-5h12l2 5z|r:3,15,18,4,1|c:7,19,2|c:17,19,2|r:10,6,4,2'),
    icon('tr-police', 'Police', 'ps:M4 15l2-5h12l2 5z|r:3,15,18,4,1|c:7,19,2|c:17,19,2|pg:10,6 14,6 13,9 11,9z'),
    icon('tr-ambulance', 'Ambulance', 'rs:3,9,13,8,1|r:16,11,5,6,1|c:8,19,2|c:17,19,2|l:8,11,8,15|l:6,13,10,13'),
    icon('tr-tractor', 'Tractor', 'cs:8,16,5|cs:18,16,3.2|r:10,8,8,6|r:6,10,5,4'),
    icon('tr-helicopter', 'Heli', 'l:4,6,20,6|e:12,13,6,4|l:12,9,12,6|l:18,13,22,13|r:10,17,4,2'),
    icon('tr-rocket', 'Rocket', 'ps:M12 2c4 4 4 10 4 14l-4 6-4-6c0-4 0-10 4-14z|pg:8,16 5,21 9,18|pg:16,16 19,21 15,18'),
  ],
  Party: [
    icon('pa-cake', 'Cake', 'r:5,12,14,8,1|r:7,8,10,4,1|pg:10,4 12,8 14,4 12,2z|l:8,12,8,20|l:12,12,12,20|l:16,12,16,20'),
    icon('pa-gift', 'Gift', 'rs:5,10,14,10,1|rs:5,6,14,4,1|l:12,6,12,20|ps:M8 6c0-2 2-3 4-1 2-2 4-1 4 1'),
    icon('pa-balloon', 'Balloon', 'e:12,9,5,7|l:12,16,12,22|ps:M12 22c2-1 3 0 3 0'),
    icon('pa-star', 'Star', 'p:M12 2l2.8 7H22l-6 4.4 2.3 7.1L12 16.5 5.7 20.5 8 13.4 2 9h7.2z'),
    icon('pa-crown', 'Crown', 'pg:3,16 5,7 9,12 12,5 15,12 19,7 21,16z'),
    icon('pa-diamond', 'Diamond', 'pg:12,3 20,10 12,21 4,10z'),
    icon('pa-ring', 'Ring', 'cs:12,13,7|cs:12,13,4|e:12,5,3,2'),
    icon('pa-snow', 'Snowflake', 'l:12,3,12,21|l:4,7,20,17|l:20,7,4,17|l:3,12,21,12'),
    icon('pa-sun', 'Sun', 'c:12,12,4|l:12,2,12,5|l:12,19,12,22|l:2,12,5,12|l:19,12,22,12|l:5,5,7.5,7.5|l:16.5,16.5,19,19|l:19,5,16.5,7.5|l:7.5,16.5,5,19'),
    icon('pa-moon', 'Moon', 'ps:M14 4a8 8 0 108 8 7 7 0 01-8-8z'),
    icon('pa-music', 'Music', 'c:8,18,3|c:17,16,3|l:11,18,11,6|l:20,16,20,4|l:11,6,20,4'),
    icon('pa-cam', 'Camera', 'rs:3,8,18,11,2|pg:9,8 11,5 13,5 15,8|c:12,13.5,3.2'),
    icon('pa-ball', 'Ball', 'cs:12,12,8|es:12,12,8,3|l:4,12,20,12'),
    icon('pa-cup', 'Trophy', 'ps:M8 5h8v6a4 4 0 01-8 0z|r:10,15,4,3|r:8,18,8,3|ps:M8 8H5a3 3 0 003 5|ps:M16 8h3a3 3 0 01-3 5'),
    icon('pa-flag', 'Flag', 'l:6,3,6,21|p:M6 4h12l-3 4 3 4H6z'),
    icon('pa-heart', 'Heart', 'p:M12 21s-8-5.2-8-10a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 4.8-8 10-8 10z'),
    icon('pa-umb', 'Umbrella', 'ps:M4 13a8 8 0 0116 0H4z|l:12,13,12,20|ps:M12 20c2 0 3-1 3-1'),
    icon('pa-fire', 'Fire', 'ps:M12 21c4 0 7-3 7-8 0-4-3-7-5-9-1 3-3 4-3 7 0-2-2-4-3-6-3 3-5 6-5 10 0 4 3 6 9 6z'),
  ],
  Commodity: [
    icon('co-shirt', 'Shirt', 'ps:M8 6l4 3 4-3 3 3v12H5V9z'),
    icon('co-pants', 'Pants', 'ps:M7 4h10l-1 6-3 12H11L8 10z'),
    icon('co-shoe', 'Shoe', 'ps:M4 16c6 0 8-4 12-4 3 0 4 2 4 4v2H4z|r:4,16,4,3'),
    icon('co-hat', 'Hat', 'e:12,14,9,3|ps:M7 14c0-6 10-6 10 0'),
    icon('co-glasses', 'Glasses', 'cs:8,13,4|cs:16,13,4|l:12,13,12,13|l:4,13,3,11|l:20,13,21,11'),
    icon('co-watch', 'Watch', 'cs:12,12,6|r:10,2,4,4,1|r:10,18,4,4,1|l:12,12,12,9|l:12,12,15,12'),
    icon('co-bag2', 'Bag', 'ps:M6 8h12l-1 13H7z|ps:M9 8V6a3 3 0 016 0v2'),
    icon('co-bottle', 'Bottle', 'r:9,8,6,13,2|r:10,3,4,5,1'),
    icon('co-cup', 'Cup', 'ps:M6 6h10v9a4 4 0 01-8 0z|ps:M16 8h3a3 3 0 010 6h-3'),
    icon('co-bowl', 'Bowl', 'ps:M4 10h16s-1 9-8 9-8-9-8-9z'),
    icon('co-fork', 'Fork', 'l:8,3,8,8|l:12,3,12,8|l:16,3,16,8|l:8,8,16,8|l:12,8,12,21'),
    icon('co-spoon', 'Spoon', 'e:12,6,3.2,4|l:12,10,12,21'),
    icon('co-scissors', 'Scissors', 'cs:7,8,3|cs:7,16,3|l:9.5,9.5,20,20|l:9.5,14.5,20,4'),
    icon('co-comb', 'Comb', 'r:4,8,16,8,1|l:7,8,7,16|l:10,8,10,16|l:13,8,13,16|l:16,8,16,16'),
    icon('co-brush', 'Brush', 'r:10,3,4,10,1|r:8,13,8,8,2'),
    icon('co-soap', 'Soap', 'e:12,8,6,4|rs:6,10,12,9,3'),
    icon('co-key2', 'Key', 'cs:8,12,4|r:11,11,10,2|r:18,9,2,3'),
    icon('co-umbrella', 'Umbrella', 'ps:M4 13a8 8 0 0116 0H4z|l:12,13,12,20'),
  ],
  'Home Appliance': [
    icon('ha-fridge', 'Fridge', 'rs:6,2,12,20,2|l:6,11,18,11|c:16,7,0.8|c:16,15,0.8'),
    icon('ha-washer', 'Washer', 'rs:5,2,14,20,2|cs:12,13,6|cs:12,13,3|r:8,5,8,2,1'),
    icon('ha-oven', 'Oven', 'rs:4,3,16,18,2|rs:7,8,10,10,1|l:7,6,17,6'),
    icon('ha-micro', 'Microwave', 'rs:3,6,18,12,2|rs:6,9,8,6,1|c:17,12,1.2'),
    icon('ha-fan', 'Fan', 'c:12,12,2.4|e:12,6,3,4|e:12,18,3,4|e:6,12,4,3|e:18,12,4,3'),
    icon('ha-ac', 'AC', 'rs:3,7,18,10,2|l:7,12,7,14|l:12,12,12,14|l:17,12,17,14'),
    icon('ha-tv', 'TV', 'rs:3,5,18,12,2|l:8,17,12,21|l:16,17,12,21'),
    icon('ha-iron', 'Iron', 'ps:M4 16h16l-3-8H8z|l:6,16,6,19h10'),
    icon('ha-vacuum', 'Vacuum', 'c:8,16,5|r:12,8,8,5,2|l:12,11,8,13'),
    icon('ha-toaster', 'Toaster', 'rs:4,8,16,10,3|r:8,5,3,5,1|r:13,5,3,5,1'),
    icon('ha-kettle', 'Kettle', 'e:11,13,6,7|ps:M17 12c3 0 4 4 2 5|l:11,4,11,6'),
    icon('ha-blender', 'Blender', 'rs:8,8,8,10,1|r:9,3,6,5,1|r:7,18,10,3,1'),
  ],
};

const ALL_CLIPART: ClipartItem[] = [
  ...Object.values(SIDEBAR_ICON_MAP).flat(),
  ...Object.values(PILL_ICON_MAP).flat(),
];

const CLIPART_BY_ID = new Map(ALL_CLIPART.map((item) => [item.id, item]));

export function getClipartById(id: string | undefined): ClipartItem | undefined {
  if (!id) return undefined;
  return CLIPART_BY_ID.get(id);
}

export function getClipartSections(sidebar: ClipartSidebar, pill: ClipartPill) {
  return [
    { title: sidebar, icons: SIDEBAR_ICON_MAP[sidebar] },
    { title: pill, icons: PILL_ICON_MAP[pill] },
  ];
}

export function allClipartCount() {
  return ALL_CLIPART.length;
}
