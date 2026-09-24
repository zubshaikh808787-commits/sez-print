'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { PRINTERS } from '@/lib/constants';
import { ago } from '@/lib/format';
import type { Telemetry } from '@/lib/types';

const WINDOWS = [
  ['today', 'Today'],
  ['last3', 'Last 3 days'],
  ['last7', 'Last 7 days'],
  ['month', 'This month'],
  ['lifetime', 'Lifetime'],
] as const;

export function OverviewDesk() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    api<Telemetry>('/api/telemetry').then(setData).catch((reason: Error) => setError(reason.message));
  }

  useEffect(load, []);

  const max = Math.max(1, ...(data?.byTemplate.map((row) => row.count) ?? [1]));

  return (
    <>
      <PageHeader
        kicker="Telemetry"
        title="How the app is being used"
        lede="Which phones have opened the app, what is published, and what actually printed."
      >
        <a className="btn" href="/api/export?type=devices">Devices CSV</a>
        <a className="btn" href="/api/export?type=prints">Prints CSV</a>
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}
      {!data ? <p className="loading">Pulling the latest counts…</p> : (
        <>
          <section className="stats">
            <article className="stat">
              <span className="num">{data.devices.total}</span>
              <b>Devices</b>
              <span>{data.devices.active7d} opened the app in the last 7 days. These are installs, not signed-in people.</span>
            </article>
            <article className="stat">
              <span className="num">{data.templates.published}</span>
              <b>Published templates</b>
              <span>{data.templates.drafts} still in draft.</span>
            </article>
            <article className="stat">
              <span className="num">{data.prints.lifetime}</span>
              <b>Prints, lifetime</b>
              <span>{data.prints.month} this month.</span>
            </article>
          </section>
          <section className="windows" aria-label="Print counts">
            {WINDOWS.map(([key, label]) => (
              <article className="window" key={key}>
                <b>{label}</b>
                <strong>{data.prints[key]}</strong>
                <em>{key === 'last3' || key === 'last7' ? 'Includes today' : 'Print events'}</em>
              </article>
            ))}
          </section>
          <div className="split">
            <section className="panel">
              <h2>Prints by template</h2>
              {data.byTemplate.map((row) => (
                <div className="bar-row" key={row.id}>
                  <span>{row.name}</span>
                  <div className="bar" aria-hidden><i style={{ width: `${(row.count / max) * 100}%` }} /></div>
                  <b>{row.count}</b>
                </div>
              ))}
              <p><a href="/api/export?type=template-usage">Download this table</a></p>
            </section>
            <div className="stack">
              <section className="panel">
                <h2>Printers</h2>
                <div className="mix" aria-hidden>
                  {data.byPrinter.filter((row) => row.count > 0).map((row) => (
                    <span key={row.id} style={{ flex: row.count, background: PRINTERS.find((item) => item.id === row.id)?.color }} />
                  ))}
                </div>
                <div className="legend">
                  {data.byPrinter.map((row) => (
                    <span key={row.id}>
                      <i style={{ background: PRINTERS.find((item) => item.id === row.id)?.color }} />
                      {row.label} · {row.count}
                    </span>
                  ))}
                </div>
              </section>
              <section className="panel">
                <h2>Latest prints</h2>
                <ul className="feed">
                  {data.recent.map((row) => (
                    <li key={row.id}>
                      <strong>{row.templateName}</strong>
                      <span>{ago(row.at)}</span>
                      <small>{row.printer}</small>
                      <small>{row.device}</small>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
