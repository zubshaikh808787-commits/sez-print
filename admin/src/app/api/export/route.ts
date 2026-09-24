import { PRINTERS } from '@/lib/constants';
import { toCsv } from '@/lib/format';
import { requireRole } from '@/lib/guard';
import { fail, HttpError } from '@/lib/http';
import { read } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireRole('viewer');
    const type = new URL(request.url).searchParams.get('type');
    const file = await read((db) => {
      const templateName = (id: string) => db.templates.find((item) => item.id === id)?.name ?? '';
      const deviceModel = (id: string) => db.devices.find((item) => item.id === id)?.model ?? '';
      if (type === 'devices') {
        return ['devices', toCsv(['id', 'model', 'platform', 'firstSeen', 'lastSeen'], db.devices.map((item) => [item.id, item.model, item.platform, item.firstSeen, item.lastSeen]))];
      }
      if (type === 'prints') {
        return ['prints', toCsv(['id', 'at', 'deviceId', 'deviceModel', 'templateId', 'templateName', 'printer'], db.prints.map((item) => [item.id, item.at, item.deviceId, deviceModel(item.deviceId), item.templateId, templateName(item.templateId), item.printer]))];
      }
      if (type === 'template-usage') {
        return ['template-usage', toCsv(['id', 'name', 'category', 'prints'], db.templates.map((item) => [item.id, item.name, item.category, db.prints.filter((print) => print.templateId === item.id).length]))];
      }
      if (type === 'templates') {
        return ['templates', toCsv(['id', 'name', 'category', 'widthMm', 'heightMm', 'status', 'featured', 'createdAt'], db.templates.map((item) => [item.id, item.name, item.category, item.widthMm, item.heightMm, item.status, item.featured ? 'yes' : 'no', item.createdAt]))];
      }
      if (type === 'reviews') {
        return ['reviews', toCsv(['id', 'rating', 'text', 'template', 'deviceId', 'createdAt'], db.reviews.map((item) => [item.id, item.rating, item.text, templateName(item.templateId), item.deviceId, item.createdAt]))];
      }
      if (type === 'suggestions') {
        return ['suggestions', toCsv(['id', 'text', 'status', 'note', 'deviceId', 'createdAt'], db.suggestions.map((item) => [item.id, item.text, item.status, item.note, item.deviceId, item.createdAt]))];
      }
      if (type === 'printers') {
        return ['printers', toCsv(['printer', 'prints'], PRINTERS.map((printer) => [printer.label, db.prints.filter((item) => item.printer === printer.id).length]))];
      }
      throw new HttpError(400, 'Choose a table to download.');
    });
    return new Response(file[1] as string, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sez-${file[0]}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
