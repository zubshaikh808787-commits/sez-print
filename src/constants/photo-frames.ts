export type PhotoFrameSlot = {
  /** Relative position within the frame design (0–1). */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PhotoFrameDef = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  /** Visual style used by the preview / print canvas. */
  style:
    | 'cartoon'
    | 'double-film'
    | 'post'
    | 'film'
    | 'instant'
    | 'sticker-2up'
    | 'sticker-tall'
    | 'sticker-single';
  slots: PhotoFrameSlot[];
};

/** Photo-frame catalog matching the Use Frames gallery. */
export const PHOTO_FRAMES: PhotoFrameDef[] = [
  {
    id: 'cartoon-frame',
    name: 'Cartoon Frame',
    widthMm: 54,
    heightMm: 140,
    style: 'cartoon',
    slots: [
      { x: 0.12, y: 0.16, w: 0.76, h: 0.2 },
      { x: 0.12, y: 0.4, w: 0.76, h: 0.2 },
      { x: 0.12, y: 0.64, w: 0.76, h: 0.2 },
    ],
  },
  {
    id: 'double-film-frame',
    name: 'Double Film Frame',
    widthMm: 54,
    heightMm: 120,
    style: 'double-film',
    slots: [
      { x: 0.14, y: 0.22, w: 0.72, h: 0.28 },
      { x: 0.14, y: 0.54, w: 0.72, h: 0.28 },
    ],
  },
  {
    id: 'post-frame',
    name: 'Post Frame',
    widthMm: 54,
    heightMm: 67,
    style: 'post',
    slots: [{ x: 0.06, y: 0.14, w: 0.88, h: 0.52 }],
  },
  {
    id: 'film-frame',
    name: 'Film Frame',
    widthMm: 54,
    heightMm: 67,
    style: 'film',
    slots: [{ x: 0.14, y: 0.22, w: 0.72, h: 0.48 }],
  },
  {
    id: 'instant-film-frame',
    name: 'Instant Film Frame',
    widthMm: 54,
    heightMm: 67,
    style: 'instant',
    slots: [{ x: 0.08, y: 0.08, w: 0.84, h: 0.62 }],
  },
  {
    id: 'color-sticker-50x90',
    name: 'Color Printing Sticker',
    widthMm: 50,
    heightMm: 90,
    style: 'sticker-2up',
    slots: [
      { x: 0.1, y: 0.08, w: 0.8, h: 0.38 },
      { x: 0.1, y: 0.54, w: 0.8, h: 0.38 },
    ],
  },
  {
    id: 'color-sticker-50x80',
    name: 'Color Printing Sticker',
    widthMm: 50,
    heightMm: 80,
    style: 'sticker-tall',
    slots: [{ x: 0.12, y: 0.1, w: 0.76, h: 0.8 }],
  },
  {
    id: 'color-sticker-50x60',
    name: 'Color Printing Sticker',
    widthMm: 50,
    heightMm: 60,
    style: 'sticker-single',
    slots: [{ x: 0.1, y: 0.12, w: 0.8, h: 0.76 }],
  },
];

export function getPhotoFrame(id: string | undefined): PhotoFrameDef | undefined {
  return PHOTO_FRAMES.find((f) => f.id === id);
}
