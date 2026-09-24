import { hashPassword } from './passwords';
import { writeTextFile } from './files';
import type { Asset, Database, Device, PrintEvent, Review, Suggestion, Template } from './types';

function at(daysBack: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  date.setHours(hour, 12, 0, 0);
  return date.toISOString();
}

function esc(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
}

function labelSvg(title: string, line: string, accent: string, price: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
  <rect width="320" height="200" fill="#f6f1e6"/>
  <rect x="18" y="18" width="284" height="164" rx="10" fill="#fffdf8" stroke="#214668" stroke-width="2"/>
  <rect x="18" y="18" width="284" height="16" rx="10" fill="${accent}"/>
  <rect x="18" y="28" width="284" height="8" fill="${accent}"/>
  <text x="34" y="78" font-family="Georgia, serif" font-size="26" fill="#214668">${esc(title)}</text>
  <text x="34" y="104" font-family="Georgia, serif" font-size="14" fill="#5c6b78">${esc(line)}</text>
  <text x="34" y="154" font-family="Georgia, serif" font-size="22" fill="#0f7380">${esc(price)}</text>
  <g fill="#214668">
    <rect x="196" y="136" width="2" height="30"/><rect x="200" y="136" width="1" height="30"/>
    <rect x="204" y="136" width="3" height="30"/><rect x="210" y="136" width="1" height="30"/>
    <rect x="214" y="136" width="2" height="30"/><rect x="219" y="136" width="4" height="30"/>
    <rect x="226" y="136" width="1" height="30"/><rect x="230" y="136" width="2" height="30"/>
    <rect x="235" y="136" width="3" height="30"/><rect x="241" y="136" width="1" height="30"/>
    <rect x="245" y="136" width="2" height="30"/><rect x="250" y="136" width="1" height="30"/>
    <rect x="254" y="136" width="3" height="30"/>
  </g>
</svg>`;
}

function artSvg(body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${body}</svg>`;
}

function documentFor(id: string, name: string, category: string, width: number, height: number, color: string) {
  return {
    id,
    name,
    category,
    designWidth: width,
    designHeight: height,
    background: { type: 'color', color },
    layers: [
      {
        id: `${id}_title`,
        type: 'text',
        text: name,
        left: 2,
        top: 2,
        width: Math.max(8, width - 4),
        height: 8,
        zIndex: 1,
      },
    ],
  };
}

export async function sampleParts() {
  const now = new Date().toISOString();
  const specs = [
    ['tpl_jewelry', 'Gold hoop tag', 'Jewelry', 50, 25, '#C4A15A', '22K · 3.2 g', '₹4,850', 'published', true],
    ['tpl_ship', 'Shipping 4×6', 'Shipping', 100, 150, '#214668', 'Prepaid · Bengaluru', '4 × 6 in', 'published', true],
    ['tpl_cable', 'Cable flag', 'Cable', 30, 15, '#17A6B8', 'LAN-04', 'Cat6', 'published', false],
    ['tpl_retail', 'Shelf price', 'Retail', 40, 30, '#E07A5F', 'Aisle 3', '₹199', 'published', true],
    ['tpl_food', 'Jar label', 'Food', 60, 40, '#7D9A6A', 'Small batch', '180 g', 'published', false],
    ['tpl_office', 'File tab', 'Office', 50, 12, '#7D6B5D', 'FY 2026', 'Accounts', 'published', false],
    ['tpl_photo', 'Frame caption', 'Photo', 80, 20, '#8E6C88', 'Draft caption', '—', 'draft', false],
    ['tpl_tail', 'Rat-tail die cut', 'Cable', 70, 20, '#214668', 'Draft die-cut', '—', 'draft', false],
  ] as const;

  const files: string[] = [];
  const templates: Template[] = [];
  for (const spec of specs) {
    const [id, name, category, width, height, accent, line, price, status, featured] = spec;
    const file = `seed-${id}.svg`;
    files.push(file);
    const previewUrl = await writeTextFile(file, labelSvg(name, line, accent, price));
    templates.push({
      id,
      name,
      category,
      widthMm: width,
      heightMm: height,
      previewUrl,
      document: documentFor(id, name, category, width, height, '#FFFFFF'),
      status,
      featured,
      createdAt: at(20, 11),
      updatedAt: now,
    });
  }

  const clipartBodies = [
    ['clp_tag', 'Price tag', '<rect x="28" y="36" width="72" height="52" rx="8" fill="#214668"/><circle cx="46" cy="62" r="6" fill="#f6f1e6"/>'],
    ['clp_star', 'Star', '<polygon points="64,18 76,50 110,52 84,74 92,108 64,90 36,108 44,74 18,52 52,50" fill="#C4A15A"/>'],
    ['clp_leaf', 'Leaf', '<ellipse cx="64" cy="64" rx="22" ry="40" transform="rotate(-30 64 64)" fill="#7D9A6A"/>'],
    ['clp_seal', 'Round seal', '<circle cx="64" cy="64" r="40" fill="none" stroke="#214668" stroke-width="6"/><circle cx="64" cy="64" r="8" fill="#17A6B8"/>'],
    ['clp_frame', 'Corner marks', '<path d="M24 48 V24 H48 M80 24 H104 V48 M104 80 V104 H80 M48 104 H24 V80" fill="none" stroke="#214668" stroke-width="6"/>'],
    ['clp_gem', 'Gem', '<polygon points="64,16 108,64 64,112 20,64" fill="#17A6B8"/>'],
  ];
  const clipart: Asset[] = [];
  for (const [id, name, body] of clipartBodies) {
    const file = `seed-${id}.svg`;
    files.push(file);
    clipart.push({
      id,
      kind: 'clipart',
      name,
      fileUrl: await writeTextFile(file, artSvg(body)),
      mime: 'image/svg+xml',
      createdAt: at(12, 10),
    });
  }

  const stickers = [
    ['stk_sale', 'Sale burst', '#E07A5F', 'SALE'],
    ['stk_new', 'New', '#17A6B8', 'NEW'],
    ['stk_hand', 'Handmade', '#C4A15A', '22K'],
    ['stk_care', 'Handle with care', '#214668', 'CARE'],
    ['stk_qr', 'Scan me', '#7D6B5D', 'QR'],
    ['stk_sez', 'SEZ seal', '#0f7380', 'SEZ'],
  ];
  const stickerAssets: Asset[] = [];
  for (const [id, name, fill, word] of stickers) {
    const file = `seed-${id}.svg`;
    files.push(file);
    const svg = artSvg(
      `<circle cx="64" cy="64" r="52" fill="${fill}"/><circle cx="64" cy="64" r="40" fill="none" stroke="#fffdf8" stroke-width="3"/><text x="64" y="72" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#fffdf8">${esc(word)}</text>`,
    );
    stickerAssets.push({
      id,
      kind: 'sticker',
      name,
      fileUrl: await writeTextFile(file, svg),
      mime: 'image/svg+xml',
      createdAt: at(8, 15),
    });
  }

  const devices: Device[] = (
    [
      ['dvc_4f91', 'Pixel 8', 'android', 40, 0],
      ['dvc_a12c', 'iPhone 15', 'ios', 36, 0],
      ['dvc_91ab', 'Galaxy A55', 'android', 28, 1],
      ['dvc_33e0', 'OnePlus 12', 'android', 21, 0],
      ['dvc_c44d', 'iPhone SE', 'ios', 18, 2],
      ['dvc_77b2', 'Redmi Note 13', 'android', 14, 0],
      ['dvc_e908', 'Vivo V30', 'android', 12, 3],
      ['dvc_15aa', 'iPhone 14', 'ios', 9, 1],
      ['dvc_old1', 'Redmi Note 12', 'android', 70, 20],
      ['dvc_old2', 'Galaxy M14', 'android', 64, 16],
      ['dvc_old3', 'iPhone 12', 'ios', 55, 24],
      ['dvc_old4', 'Realme 11', 'android', 48, 11],
    ] as const
  ).map(([id, model, platform, first, last]) => ({
    id,
    model,
    platform,
    firstSeen: at(first, 9),
    lastSeen: at(last, 18),
  }));

  const bag = ['tpl_jewelry', 'tpl_jewelry', 'tpl_ship', 'tpl_ship', 'tpl_cable', 'tpl_retail', 'tpl_food', 'tpl_office', 'tpl_photo', 'tpl_tail'];
  const printers = ['dev', 'labelx', 'tez', 'td404', 'josh'] as const;
  const activeDevices = devices.slice(0, 8).map((device) => device.id);
  const prints: PrintEvent[] = [];
  let n = 0;
  const add = (days: number, count: number) => {
    for (let i = 0; i < count; i += 1) {
      prints.push({
        id: `prt_${n}`,
        deviceId: activeDevices[(n + i) % activeDevices.length],
        templateId: bag[n % bag.length],
        printer: printers[n % printers.length],
        at: at(days, 8 + (i % 10)),
      });
      n += 1;
    }
  };
  add(0, 7);
  add(1, 5);
  add(2, 4);
  add(4, 6);
  add(6, 3);
  add(10, 5);
  add(18, 4);
  add(26, 3);
  add(45, 4);

  const reviews: Review[] = [
    ['rev_1', 5, 'The gold hoop tag lined up on the first try.', 'tpl_jewelry', 'dvc_4f91', 1],
    ['rev_2', 4, 'Shipping label is clear. The address block could sit a little higher.', 'tpl_ship', 'dvc_a12c', 2],
    ['rev_3', 5, 'Cable flag is the one we actually use on site.', 'tpl_cable', 'dvc_33e0', 3],
    ['rev_4', 3, 'Shelf price looks good, barcode is tight on a 40 mm label.', 'tpl_retail', 'dvc_91ab', 4],
    ['rev_5', 2, 'Jar label text clipped on the right when I added a second line.', 'tpl_food', 'dvc_77b2', 6],
    ['rev_6', 5, 'File tab is simple and that is what we wanted.', 'tpl_office', 'dvc_15aa', 8],
    ['rev_7', 4, 'Printed fine on the TD-404. Preview matched the sticker.', 'tpl_jewelry', 'dvc_c44d', 9],
    ['rev_8', 1, 'Rat-tail draft does not show the tail in the preview.', 'tpl_tail', 'dvc_e908', 12],
  ].map(([id, rating, text, templateId, deviceId, days]) => ({
    id: id as string,
    rating: rating as number,
    text: text as string,
    templateId: templateId as string,
    deviceId: deviceId as string,
    createdAt: at(days as number, 16),
  }));

  const suggestions: Suggestion[] = [
    ['sug_1', 'Kannada price text feels tight on the jewelry tag.', 'dvc_4f91', 'new', '', 0],
    ['sug_2', 'A dark canvas would help when we design transparent stock.', 'dvc_a12c', 'reviewing', 'Looking at the editor background first.', 2],
    ['sug_3', 'Let us duplicate a template into another size without redrawing.', 'dvc_33e0', 'planned', 'After the library can store sizes.', 5],
    ['sug_4', 'Add a “fragile” sticker in the shipping set.', 'dvc_91ab', 'new', '', 1],
    ['sug_5', 'Bulk print from a spreadsheet on the phone.', 'dvc_77b2', 'rejected', 'That stays a later desktop job.', 14],
    ['sug_6', 'Cable-flag templates in the starter pack.', 'dvc_c44d', 'shipped', 'The cable flag template is in the library.', 20],
    ['sug_7', 'Remember the last printer so we do not pick TD-404 every time.', 'dvc_15aa', 'planned', '', 7],
  ].map(([id, text, deviceId, status, note, days]) => ({
    id: id as string,
    text: text as string,
    deviceId: deviceId as string,
    status: status as Suggestion['status'],
    note: note as string,
    createdAt: at(days as number, 13),
  }));

  return { files, devices, prints, templates, clipart, stickers: stickerAssets, reviews, suggestions };
}

export async function createInitial(): Promise<Database> {
  const parts = await sampleParts();
  const createdAt = new Date().toISOString();
  return {
    version: 1,
    admins: [
      {
        id: 'adm_owner',
        name: 'SEZ Owner',
        email: 'seznikadmin',
        role: 'owner',
        active: true,
        createdAt,
        passwordHash: hashPassword('Seznik01!'),
      },
      {
        id: 'adm_editor',
        name: 'Library editor',
        email: 'editor@sez.local',
        role: 'editor',
        active: true,
        createdAt,
        passwordHash: hashPassword('sez-editor'),
      },
    ],
    devices: parts.devices,
    prints: parts.prints,
    templates: parts.templates,
    clipart: parts.clipart,
    stickers: parts.stickers,
    reviews: parts.reviews,
    suggestions: parts.suggestions,
  };
}
