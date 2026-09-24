'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useDesk, useToast } from '@/components/desk';
import { Drawer, Field, PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { CATEGORIES } from '@/lib/constants';
import { blankDocument, sizeFromDocument } from '@/lib/template-doc';
import type { Asset, AssetKind, Template } from '@/lib/types';

type Tab = 'templates' | 'clipart' | 'stickers';

const ACCEPT: Record<AssetKind | 'preview', string> = {
  preview: 'image/png,image/jpeg,image/webp',
  clipart: 'image/svg+xml,image/png,.svg,.png',
  sticker: 'image/png,image/webp,.png,.webp',
};

export function ContentDesk() {
  const desk = useDesk();
  const toast = useToast();
  const canEdit = desk.role !== 'viewer';
  const [tab, setTab] = useState<Tab>('templates');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('all');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clipart, setClipart] = useState<Asset[]>([]);
  const [stickers, setStickers] = useState<Asset[]>([]);
  const [editor, setEditor] = useState<'template' | AssetKind | null>(null);
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [currentAsset, setCurrentAsset] = useState<Asset | null>(null);
  const [ready, setReady] = useState(false);
  const [confirmId, setConfirmId] = useState('');

  function load() {
    Promise.all([
      api<{ templates: Template[] }>('/api/templates'),
      api<{ clipart: Asset[]; stickers: Asset[] }>('/api/assets'),
    ]).then(([library, assets]) => {
      setTemplates(library.templates);
      setClipart(assets.clipart);
      setStickers(assets.stickers);
      setReady(true);
    }).catch((reason: Error) => toast(reason.message, 'bad'));
  }

  useEffect(load, [toast]);

  const needle = query.trim().toLowerCase();
  const shownTemplates = templates.filter((item) => {
    if (category !== 'All' && item.category !== category) return false;
    if (status !== 'all' && item.status !== status) return false;
    return !needle || item.name.toLowerCase().includes(needle);
  });
  const assets = tab === 'clipart' ? clipart : stickers;
  const shownAssets = assets.filter((item) => !needle || item.name.toLowerCase().includes(needle));

  function openCreate() {
    setCurrentTemplate(null);
    setCurrentAsset(null);
    setEditor(tab === 'templates' ? 'template' : tab === 'clipart' ? 'clipart' : 'sticker');
  }

  async function toggleFeatured(template: Template) {
    try {
      const result = await api<{ template: Template }>(`/api/templates/${template.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ featured: !template.featured }),
      });
      setTemplates((list) => list.map((item) => (item.id === result.template.id ? result.template : item)));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not update', 'bad');
    }
  }

  async function remove(kind: Tab, id: string) {
    const path = kind === 'templates' ? `/api/templates/${id}` : `/api/assets/${id}`;
    try {
      await api(path, { method: 'DELETE' });
      setConfirmId('');
      toast('Removed from the library');
      load();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not remove', 'bad');
    }
  }

  return (
    <>
      <PageHeader
        kicker="Content"
        title="Library"
        lede="Upload a template with its preview and the JSON the editor loads. Clipart prefers SVG. Stickers need a transparent PNG or WebP."
      >
        {canEdit ? (
          <button type="button" className="btn primary" onClick={openCreate}>
            {tab === 'templates' ? 'Add template' : tab === 'clipart' ? 'Add clipart' : 'Add sticker'}
          </button>
        ) : null}
      </PageHeader>
      {!canEdit ? <p className="note">You can look through the library. An editor publishes changes.</p> : null}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {([['templates', `Templates (${templates.length})`], ['clipart', `Clipart (${clipart.length})`], ['stickers', `Stickers (${stickers.length})`]] as const).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search by name" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search the library" />
        {tab === 'templates' ? (
          <>
            <select className="inline" style={{ width: 'auto' }} value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category">
              <option>All</option>
              {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
            <div className="seg">
              {([['all', 'All'], ['published', 'Live'], ['draft', 'Drafts']] as const).map(([item, label]) => (
                <button key={item} type="button" className={status === item ? 'on' : ''} onClick={() => setStatus(item)}>{label}</button>
              ))}
            </div>
          </>
        ) : null}
      </div>
      {tab === 'templates' ? (
        <div className="catalog">
          {shownTemplates.map((template) => (
            <article className="tile" key={template.id}>
              <div className="preview-frame"><img src={template.previewUrl} alt="" /></div>
              <div className="tile-body">
                <div className="tile-top">
                  <h3>{template.name}</h3>
                  <span className={template.status === 'draft' ? 'badge draft' : 'badge'}>{template.status === 'draft' ? 'Draft' : 'Live'}</span>
                </div>
                <p className="meta">{template.category} · {template.widthMm} × {template.heightMm} mm</p>
                {template.featured ? <span className="badge gold">Featured</span> : null}
                {canEdit ? (
                  <div className="tile-actions">
                    <button type="button" className="btn small" onClick={() => { setCurrentTemplate(template); setEditor('template'); }}>Edit</button>
                    <button type="button" className="btn small" onClick={() => toggleFeatured(template)}>{template.featured ? 'Unfeature' : 'Feature'}</button>
                    {confirmId === template.id ? (
                      <button type="button" className="btn small danger" onClick={() => remove('templates', template.id)}>Confirm delete</button>
                    ) : (
                      <button type="button" className="btn small" onClick={() => setConfirmId(template.id)}>Delete</button>
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="catalog">
          {shownAssets.map((asset) => (
            <article className="tile" key={asset.id}>
              <div className="preview-frame"><img src={asset.fileUrl} alt="" /></div>
              <div className="tile-body">
                <h3>{asset.name}</h3>
                {canEdit ? (
                  <div className="tile-actions">
                    <button type="button" className="btn small" onClick={() => { setCurrentAsset(asset); setEditor(asset.kind); }}>Edit</button>
                    {confirmId === asset.id ? (
                      <button type="button" className="btn small danger" onClick={() => remove(tab, asset.id)}>Confirm delete</button>
                    ) : (
                      <button type="button" className="btn small" onClick={() => setConfirmId(asset.id)}>Delete</button>
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
      {(tab === 'templates' ? shownTemplates.length : shownAssets.length) === 0 && ready ? <p className="empty">Nothing in the library matches that.</p> : null}
      {!ready ? <p className="loading">Opening the library…</p> : null}
      {editor === 'template' ? (
        <TemplateForm
          template={currentTemplate}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(); toast('Template saved'); }}
        />
      ) : null}
      {editor === 'clipart' || editor === 'sticker' ? (
        <AssetForm
          kind={editor}
          asset={currentAsset}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(); toast('Saved'); }}
        />
      ) : null}
    </>
  );
}

function TemplateForm({ template, onClose, onSaved }: { template: Template | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(template?.name ?? '');
  const [category, setCategory] = useState(template?.category ?? 'Retail');
  const [widthMm, setWidthMm] = useState(String(template?.widthMm ?? 50));
  const [heightMm, setHeightMm] = useState(String(template?.heightMm ?? 30));
  const [status, setStatus] = useState(template?.status ?? 'published');
  const [featured, setFeatured] = useState(template?.featured ?? false);
  const [documentText, setDocumentText] = useState(template ? JSON.stringify(template.document, null, 2) : JSON.stringify(blankDocument('', 'Retail', 50, 30), null, 2));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(template?.previewUrl ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function fillBlank() {
    const width = Number(widthMm) || 50;
    const height = Number(heightMm) || 30;
    setDocumentText(JSON.stringify(blankDocument(name, category, width, height), null, 2));
  }

  function readSizes(text: string) {
    try {
      const sizes = sizeFromDocument(JSON.parse(text) as Record<string, unknown>);
      if (sizes.widthMm) setWidthMm(String(sizes.widthMm));
      if (sizes.heightMm) setHeightMm(String(sizes.heightMm));
    } catch {
      setError('That template file is not valid JSON.');
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!template && !file) {
      setError('Add a preview image. PNG, JPG, or WebP.');
      return;
    }
    const body = new FormData();
    body.set('name', name);
    body.set('category', category);
    body.set('widthMm', widthMm);
    body.set('heightMm', heightMm);
    body.set('status', status);
    body.set('featured', String(featured));
    body.set('document', documentText);
    if (file) body.set('preview', file);
    setPending(true);
    try {
      if (template) {
        await api(`/api/templates/${template.id}`, { method: 'PATCH', body });
      } else {
        await api('/api/templates', { method: 'POST', body });
      }
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save');
      toast('Could not save the template', 'bad');
    } finally {
      setPending(false);
    }
  }

  return (
    <Drawer title={template ? 'Edit template' : 'Add a template'} lede="The picture is only the thumbnail. The JSON is what the phone editor opens." onClose={onClose}>
      <form onSubmit={onSubmit}>
        <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="Category">
          <input value={category} onChange={(event) => setCategory(event.target.value)} list="categories" required />
          <datalist id="categories">{CATEGORIES.map((item) => <option key={item} value={item} />)}</datalist>
        </Field>
        <div className="sizes">
          <Field label="Width (mm)"><input value={widthMm} onChange={(event) => setWidthMm(event.target.value)} inputMode="decimal" required /></Field>
          <Field label="Height (mm)"><input value={heightMm} onChange={(event) => setHeightMm(event.target.value)} inputMode="decimal" required /></Field>
        </div>
        <Field label="Preview" hint="PNG, JPG, or WebP. Drag a file in or click to choose.">
          <div
            className="drop"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const next = event.dataTransfer.files?.[0]; if (next) setFile(next); }}
          >
            {preview ? <img src={preview} alt="" /> : null}
            <strong>{file ? file.name : 'Drop a preview here'}</strong>
            <input type="file" accept={ACCEPT.preview} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </div>
        </Field>
        <Field label="Template data" hint="Needs designWidth, designHeight, and a layers array.">
          <textarea value={documentText} onChange={(event) => setDocumentText(event.target.value)} onBlur={(event) => readSizes(event.target.value)} spellCheck={false} />
        </Field>
        <button type="button" className="btn small" onClick={fillBlank}>Use a blank template</button>
        <div className="seg" style={{ marginTop: 14 }}>
          <button type="button" className={status === 'published' ? 'on' : ''} onClick={() => setStatus('published')}>Published</button>
          <button type="button" className={status === 'draft' ? 'on' : ''} onClick={() => setStatus('draft')}>Draft</button>
        </div>
        <button type="button" className={featured ? 'switch on btn' : 'switch btn'} aria-pressed={featured} onClick={() => setFeatured((value) => !value)}>
          {featured ? 'Featured on' : 'Featured off'}
        </button>
        {error ? <p className="err">{error}</p> : null}
        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save template'}</button>
        </div>
      </form>
    </Drawer>
  );
}

function AssetForm({ kind, asset, onClose, onSaved }: { kind: AssetKind; asset: Asset | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(asset?.name ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(asset?.fileUrl ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const label = kind === 'clipart' ? 'SVG or PNG' : 'PNG or WebP';

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!asset && !file) {
      setError(`Add a ${label} file.`);
      return;
    }
    const body = new FormData();
    body.set('name', name);
    body.set('kind', kind);
    if (file) body.set('file', file);
    setPending(true);
    setError('');
    try {
      if (asset) await api(`/api/assets/${asset.id}`, { method: 'PATCH', body });
      else await api('/api/assets', { method: 'POST', body });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save');
    } finally {
      setPending(false);
    }
  }

  return (
    <Drawer title={asset ? `Edit ${kind}` : `Add ${kind}`} lede={kind === 'clipart' ? 'Vector SVG stays sharp at any label size.' : 'PNG or WebP so the edges can be transparent.'} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="File" hint={label}>
          <div
            className="drop"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const next = event.dataTransfer.files?.[0]; if (next) setFile(next); }}
          >
            {preview ? <img src={preview} alt="" /> : null}
            <strong>{file ? file.name : 'Drop a file here'}</strong>
            <input type="file" accept={ACCEPT[kind]} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </div>
        </Field>
        {error ? <p className="err">{error}</p> : null}
        <div className="form-actions">
          <button className="btn primary" disabled={pending} type="submit">{pending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Drawer>
  );
}
