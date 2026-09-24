import { PRINTERS } from './constants';
import type { Database, Telemetry } from './types';

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysBack(days: number) {
  const date = startOfToday();
  date.setDate(date.getDate() - days);
  return date;
}

export function buildTelemetry(db: Database): Telemetry {
  const today = startOfToday();
  const last3 = daysBack(2);
  const last7 = daysBack(6);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const countFrom = (from: Date) => db.prints.filter((print) => new Date(print.at) >= from).length;

  const byTemplate = db.templates
    .map((template) => ({
      id: template.id,
      name: template.name,
      category: template.category,
      count: db.prints.filter((print) => print.templateId === template.id).length,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const byPrinter = PRINTERS.map((printer) => ({
    id: printer.id,
    label: printer.label,
    count: db.prints.filter((print) => print.printer === printer.id).length,
  }));

  const recent = [...db.prints]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 8)
    .map((print) => {
      const template = db.templates.find((item) => item.id === print.templateId);
      const device = db.devices.find((item) => item.id === print.deviceId);
      const printer = PRINTERS.find((item) => item.id === print.printer);
      return {
        id: print.id,
        templateName: template?.name ?? 'Removed template',
        printer: printer?.label ?? print.printer,
        device: device ? `${device.model} · ${device.id}` : print.deviceId,
        at: print.at,
      };
    });

  return {
    devices: {
      total: db.devices.length,
      active7d: db.devices.filter((device) => new Date(device.lastSeen) >= last7).length,
    },
    templates: {
      published: db.templates.filter((template) => template.status === 'published').length,
      drafts: db.templates.filter((template) => template.status === 'draft').length,
    },
    prints: {
      today: countFrom(today),
      last3: countFrom(last3),
      last7: countFrom(last7),
      month: countFrom(month),
      lifetime: db.prints.length,
    },
    byTemplate,
    byPrinter,
    recent,
  };
}
