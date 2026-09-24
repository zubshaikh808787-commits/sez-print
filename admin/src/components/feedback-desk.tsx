'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDesk, useToast } from '@/components/desk';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { SUGGESTION_STATUSES } from '@/lib/constants';
import { ago } from '@/lib/format';
import type { Review, Suggestion, SuggestionStatus, Template } from '@/lib/types';

export function FeedbackDesk() {
  const desk = useDesk();
  const toast = useToast();
  const canEdit = desk.role !== 'viewer';
  const [tab, setTab] = useState<'reviews' | 'suggestions'>('reviews');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rating, setRating] = useState('all');
  const [templateId, setTemplateId] = useState('all');
  const [sort, setSort] = useState('newest');
  const [status, setStatus] = useState('all');
  const [openId, setOpenId] = useState('');
  const [note, setNote] = useState('');
  const [nextStatus, setNextStatus] = useState<SuggestionStatus>('new');

  useEffect(() => {
    Promise.all([
      api<{ reviews: Review[] }>('/api/reviews'),
      api<{ suggestions: Suggestion[] }>('/api/suggestions'),
      api<{ templates: Template[] }>('/api/templates'),
    ]).then(([reviewData, suggestionData, templateData]) => {
      setReviews(reviewData.reviews);
      setSuggestions(suggestionData.suggestions);
      setTemplates(templateData.templates);
    }).catch((reason: Error) => toast(reason.message, 'bad'));
  }, [toast]);

  const templateName = (id: string) => templates.find((item) => item.id === id)?.name ?? 'Unknown template';

  const shownReviews = useMemo(() => {
    const list = reviews.filter((review) => {
      if (rating !== 'all' && review.rating !== Number(rating)) return false;
      if (templateId !== 'all' && review.templateId !== templateId) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === 'highest') return b.rating - a.rating;
      if (sort === 'lowest') return a.rating - b.rating;
      if (sort === 'oldest') return +new Date(a.createdAt) - +new Date(b.createdAt);
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
    return list;
  }, [reviews, rating, templateId, sort]);

  const shownSuggestions = suggestions.filter((item) => status === 'all' || item.status === status);
  const fresh = suggestions.filter((item) => item.status === 'new').length;

  async function saveSuggestion(id: string) {
    try {
      const result = await api<{ suggestion: Suggestion }>(`/api/suggestions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, note }),
      });
      setSuggestions((list) => list.map((item) => (item.id === id ? result.suggestion : item)));
      toast('Suggestion updated');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not update', 'bad');
    }
  }

  return (
    <>
      <PageHeader
        kicker="Reviews and suggestions"
        title="Feedback"
        lede="Ratings stay tied to a template and a device. Suggestions move from new to shipped."
      >
        <a className="btn" href="/api/export?type=reviews">Reviews CSV</a>
        <a className="btn" href="/api/export?type=suggestions">Suggestions CSV</a>
      </PageHeader>
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button type="button" className={tab === 'reviews' ? 'tab active' : 'tab'} onClick={() => setTab('reviews')}>Reviews ({reviews.length})</button>
        <button type="button" className={tab === 'suggestions' ? 'tab active' : 'tab'} onClick={() => setTab('suggestions')}>Suggestions ({fresh} new)</button>
      </div>
      {tab === 'reviews' ? (
        <>
          <div className="toolbar">
            <select className="inline" style={{ width: 'auto' }} value={rating} onChange={(event) => setRating(event.target.value)} aria-label="Rating">
              <option value="all">All ratings</option>
              {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} {value === 1 ? 'star' : 'stars'}</option>)}
            </select>
            <select className="inline" style={{ width: 'auto' }} value={templateId} onChange={(event) => setTemplateId(event.target.value)} aria-label="Template">
              <option value="all">All templates</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            <select className="inline" style={{ width: 'auto' }} value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest">Highest rating</option>
              <option value="lowest">Lowest rating</option>
            </select>
          </div>
          <div className="stack">
            {shownReviews.map((review) => (
              <article className="card-row" key={review.id}>
                <div className="tile-top">
                  <strong className="stars" aria-label={`${review.rating} out of 5`}>{'●'.repeat(review.rating)}{'○'.repeat(5 - review.rating)}</strong>
                  <span className="meta">{ago(review.createdAt)}</span>
                </div>
                <p>{review.text}</p>
                <p className="meta">{templateName(review.templateId)} · {review.deviceId}</p>
              </article>
            ))}
            {shownReviews.length === 0 ? <p className="empty">No reviews match those filters.</p> : null}
          </div>
        </>
      ) : (
        <>
          <div className="chips" style={{ marginBottom: 14 }}>
            <button type="button" className={status === 'all' ? 'chip active' : 'chip'} onClick={() => setStatus('all')}>All</button>
            {SUGGESTION_STATUSES.map((item) => (
              <button key={item.id} type="button" className={status === item.id ? 'chip active' : 'chip'} onClick={() => setStatus(item.id)}>{item.label}</button>
            ))}
          </div>
          <div className="stack">
            {shownSuggestions.map((item) => (
              <article className="card-row" key={item.id}>
                <div className="tile-top">
                  <span className={`badge ${item.status}`}>{item.status}</span>
                  <span className="meta">{ago(item.createdAt)} · {item.deviceId}</span>
                </div>
                <p>{item.text}</p>
                {item.note ? <p className="meta">Note: {item.note}</p> : null}
                {canEdit ? (
                  openId === item.id ? (
                    <div>
                      <label className="field">
                        <span>Status</span>
                        <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as SuggestionStatus)}>
                          {SUGGESTION_STATUSES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="field">
                        <span>Note for the team</span>
                        <textarea value={note} onChange={(event) => setNote(event.target.value)} style={{ minHeight: 80 }} />
                      </label>
                      <div className="form-actions">
                        <button type="button" className="btn primary" onClick={() => saveSuggestion(item.id)}>Save</button>
                        <button type="button" className="btn" onClick={() => setOpenId('')}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => { setOpenId(item.id); setNote(item.note); setNextStatus(item.status); }}
                    >
                      Update status
                    </button>
                  )
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
