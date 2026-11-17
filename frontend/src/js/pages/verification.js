import $ from 'jquery';
import { describeError, http } from '../api.js';
import { getReviewerName } from '../preferences.js';
import { openJobDrawer } from '../job-drawer.js';
import { openManualJobModal } from '../manual-job.js';
import { boot, setNavCount } from '../shell.js';
import {
  categoryTag,
  confirmDialog,
  copyText,
  deadlineInfo,
  escapeHtml,
  formatDate,
  formatDateTime,
  icon,
  initials,
  refreshIcons,
  relativeTime,
  safeUrl,
  setButtonLoading,
  sourceBadge,
  statusBadge,
  statusMeta,
  stipendText,
  toast,
  truncate,
} from '../ui.js';

const DECISIONS = {
  verified_active: { label: 'Verify active', className: 'btn-success', iconName: 'shield-check' },
  needs_review: { label: 'Needs review', className: 'btn-secondary', iconName: 'circle-alert' },
  expired: { label: 'Mark expired', className: 'btn-warning-outline', iconName: 'clock' },
  rejected: { label: 'Reject', className: 'btn-danger-outline', iconName: 'ban' },
};

const state = {
  config: null,
  view: 'all',
  items: [],
  summary: {},
  totalJobs: 0,
  selectedId: null,
  selected: null,
  linkChecks: new Map(),
  loading: false,
  requestedId: null,
};

function updateStats() {
  const summary = state.summary || {};
  $('[data-stat="pending"]').text(Number(summary.pending || 0));
  $('[data-stat="needsReview"]').text(Number(summary.needsReview || 0));
  $('[data-stat="verifiedActive"]').text(Number(summary.verifiedActive || 0));
  $('[data-stat="inactive"]').text(
    Number(summary.expired || 0) + Number(summary.rejected || 0),
  );
  $('[data-queue-count="all"]').text(Number(summary.pending || 0) + Number(summary.needsReview || 0));
  $('[data-queue-count="pending"]').text(Number(summary.pending || 0));
  $('[data-queue-count="needs_review"]').text(Number(summary.needsReview || 0));
  $('#queue-total').text(`${state.items.length} in queue`);
  setNavCount('verification', Number(summary.pending || 0) + Number(summary.needsReview || 0));
}

function queueItem(job) {
  const active = job.id === state.selectedId;
  return `
    <button class="queue-job ${active ? 'selected' : ''}" type="button" data-select-job="${escapeHtml(
      job.id,
    )}" aria-pressed="${active}">
      <span class="queue-job-logo">${escapeHtml(initials(job.company_name))}</span>
      <span class="queue-job-copy">
        <span class="queue-job-title">${escapeHtml(job.job_title)}</span>
        <span class="queue-job-company">${escapeHtml(job.company_name)}</span>
        <span class="queue-job-meta">
          ${statusBadge(job.verification_status)}
          ${categoryTag(job.category, 'tag')}
          <span>${icon('clock')} ${escapeHtml(relativeTime(job.created_at))}</span>
        </span>
      </span>
      <span class="queue-job-arrow">${icon('chevron-right')}</span>
    </button>
  `;
}

function renderQueue() {
  const element = document.getElementById('verification-queue');
  if (!element) return;
  updateStats();

  if (!state.items.length) {
    element.innerHTML = `
      <div class="review-empty" style="min-height: 300px">
        <div class="empty-icon">${icon('shield-check')}</div>
        <div class="empty-title">Nothing waiting for review</div>
        <p class="empty-text">${
          state.view === 'all'
            ? 'New discovery results and manual entries will appear here.'
            : 'No records currently match this queue filter.'
        }</p>
        <a class="btn btn-sm btn-secondary mt-12" href="/discover.html">${icon('search')} Discover more roles</a>
      </div>
    `;
    refreshIcons();
    return;
  }

  element.innerHTML = state.items.map(queueItem).join('');
  refreshIcons();
}

function renderEmptyReview(message = 'Select an opportunity from the queue to begin a review.') {
  const panel = document.getElementById('review-panel');
  panel.innerHTML = `
    <div class="review-empty">
      <div class="empty-icon">${icon('shield-check')}</div>
      <div class="empty-title">Select an opportunity to review</div>
      <p class="empty-text">${escapeHtml(message)}</p>
      ${
        state.items.length
          ? `<button class="btn btn-sm btn-primary mt-12" type="button" data-select-first>${icon(
              'arrow-right',
            )} Open the first record</button>`
          : `<a class="btn btn-sm btn-secondary mt-12" href="/discover.html">${icon('search')} Find opportunities</a>`
      }
    </div>
  `;
  state.selected = null;
  refreshIcons();
}

function aiSection(job) {
  const analysis = job.analysis;
  if (!analysis) {
    return `
      <div class="review-callout empty">No AI analysis is attached to this record.${
        state.config.configured?.gemini
          ? ' You can run Gemini analysis to extract skills, eligibility signals, and red flags.'
          : ' Add GEMINI_API_KEY on the backend to enable analysis.'
      }</div>
      ${
        state.config.configured?.gemini
          ? `<button class="btn btn-sm btn-secondary mt-8" type="button" data-analyze-selected>${icon(
              'sparkles',
            )} Run AI analysis</button>`
          : ''
      }
    `;
  }

  const skills = Array.isArray(analysis.skills) ? analysis.skills : [];
  const redFlags = Array.isArray(analysis.red_flags) ? analysis.red_flags : [];
  return `
    <div class="ai-panel">
      <div class="ai-panel-head">
        <div>
          <div class="ai-label">${icon('sparkles')} Gemini analysis</div>
          <div class="ai-model">${escapeHtml(analysis.ai_model || 'Gemini')} · ${escapeHtml(
            analysis.analysis_source || 'gemini',
          )}</div>
        </div>
        ${
          Number.isFinite(Number(analysis.relevance_score))
            ? `<div class="relevance-score" style="--score:${Math.max(
                0,
                Math.min(100, Number(analysis.relevance_score)),
              )}"><span>${Math.round(Number(analysis.relevance_score))}</span></div>`
            : ''
        }
      </div>
      ${analysis.summary ? `<p class="ai-summary">${escapeHtml(analysis.summary)}</p>` : ''}
      ${
        skills.length
          ? `<div class="tag-stack" style="margin-top:8px">${skills
              .map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`)
              .join('')}</div>`
          : ''
      }
      ${
        redFlags.length
          ? `<div class="red-flags">${redFlags
              .map(
                (flag) =>
                  `<div class="red-flag">${icon('triangle-alert')}<span>${escapeHtml(flag)}</span></div>`,
              )
              .join('')}</div>`
          : ''
      }
    </div>
  `;
}

function linkCheckMarkup(job) {
  const result = state.linkChecks.get(job.id);
  if (!result) {
    return `<div class="link-check-result" data-link-result>${icon(
      'info',
    )} No link check has run for this review yet.</div>`;
  }
  const tone = result.outcome === 'pass' ? 'success' : result.outcome === 'review' ? 'warning' : 'error';
  const iconName =
    result.outcome === 'pass' ? 'circle-check-big' : result.outcome === 'review' ? 'triangle-alert' : 'circle-x';
  const details = [
    result.httpStatus ? `HTTP ${result.httpStatus}` : '',
    result.finalUrl && result.finalUrl !== job.application_url ? `Redirects to ${result.finalUrl}` : '',
    formatDateTime(result.checkedAt),
  ]
    .filter(Boolean)
    .join(' · ');
  return `
    <div class="link-check-result ${tone}" data-link-result>
      <div class="link-check-head">${icon(iconName)} ${escapeHtml(result.message || 'Link checked')}</div>
      <div class="link-check-meta">${escapeHtml(details)}</div>
    </div>
  `;
}

function reviewMarkup(job) {
  const deadline = deadlineInfo(job.deadline);
  const skills = Array.isArray(job.required_skills) ? job.required_skills : [];
  const analysisSkills = Array.isArray(job.analysis?.skills) ? job.analysis.skills : [];
  const combinedSkills = [...new Set([...skills, ...analysisSkills])];
  const applicationUrl = safeUrl(job.application_url);
  const description = String(job.job_description || '');
  const reviewer = getReviewerName(state.config);
  const linkCheck = state.linkChecks.get(job.id);

  return `
    <div class="review-head">
      <div class="review-head-main">
        <div class="review-logo">${escapeHtml(initials(job.company_name))}</div>
        <div style="min-width:0">
          <div class="review-title">${escapeHtml(job.job_title)}</div>
          <div class="review-company">
            ${icon('building-2')} ${escapeHtml(job.company_name)}
            ${statusBadge(job.verification_status)}
            ${categoryTag(job.category, 'tag')}
            ${sourceBadge(job.source, state.config.sourceLabels)}
          </div>
        </div>
      </div>
      <div class="review-actions">
        <button class="btn btn-sm btn-ghost" type="button" data-open-drawer="${escapeHtml(
          job.id,
        )}" title="Open the full opportunity record">${icon('eye')} Full record</button>
        ${
          applicationUrl
            ? `<a class="btn btn-sm btn-primary" href="${escapeHtml(
                applicationUrl,
              )}" target="_blank" rel="noopener noreferrer">${icon('external-link')} Open posting</a>`
            : ''
        }
      </div>
    </div>

    <div class="review-facts">
      <div class="review-fact">
        <div class="review-fact-label">Priority city</div>
        <div class="review-fact-value">${escapeHtml(job.city || job.location || '—')}</div>
      </div>
      <div class="review-fact">
        <div class="review-fact-label">Work mode</div>
        <div class="review-fact-value">${escapeHtml(job.work_mode || '—')}</div>
      </div>
      <div class="review-fact">
        <div class="review-fact-label">Stipend</div>
        <div class="review-fact-value">${escapeHtml(stipendText(job))}</div>
      </div>
      <div class="review-fact">
        <div class="review-fact-label">Deadline</div>
        <div class="review-fact-value ${deadline.className}">${escapeHtml(deadline.text)}</div>
      </div>
    </div>

    <div class="review-body">
      <div class="review-main">
        <div class="review-section">
          <div class="review-section-title">${icon('file-text')} Posting summary</div>
          ${
            description
              ? `<div class="review-callout">${escapeHtml(truncate(description, 620))}</div>
                 ${
                   description.length > 620
                     ? `<button class="link-btn mt-8" type="button" data-show-description>Read the full description</button>
                        <div class="review-callout mt-8" data-full-description hidden>${escapeHtml(
                          description,
                        )}</div>`
                     : ''
                 }`
              : '<div class="review-callout empty">The provider did not include a description. Open the original posting before deciding.</div>'
          }
        </div>

        <div class="review-section">
          <div class="review-section-title">${icon('graduation-cap')} Eligibility &amp; requirements</div>
          ${
            job.eligibility
              ? `<div class="review-callout">${escapeHtml(job.eligibility)}</div>`
              : '<div class="review-callout empty">No eligibility details were supplied by the source.</div>'
          }
          ${
            job.experience_required
              ? `<div class="review-callout mt-8">${icon('badge-check')} ${escapeHtml(
                  job.experience_required,
                )}</div>`
              : ''
          }
          ${
            combinedSkills.length
              ? `<div class="tag-stack mt-8">${combinedSkills
                  .map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`)
                  .join('')}</div>`
              : ''
          }
        </div>

        <div class="review-section">
          <div class="review-section-title">${icon('sparkles')} Intelligence <span class="count">${
            job.analysis ? 'AI-assisted' : 'Not analysed'
          }</span></div>
          ${aiSection(job)}
        </div>

        <div class="review-section">
          <div class="review-section-title">${icon('link')} Original posting &amp; link check</div>
          ${
            applicationUrl
              ? `<div class="review-link-box">
                  ${icon('external-link')}
                  <a href="${escapeHtml(applicationUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                    applicationUrl,
                  )}</a>
                  <button class="btn btn-icon btn-ghost btn-sm" type="button" data-copy-link aria-label="Copy application link">${icon(
                    'copy',
                  )}</button>
                </div>`
              : '<div class="review-callout empty">No valid application URL is attached. Verify from the source listing before approving.</div>'
          }
          <div class="flex flex-wrap gap-8 mt-8">
            <button class="btn btn-sm btn-secondary" type="button" data-check-link ${
              applicationUrl ? '' : 'disabled'
            }>${icon('link')} ${linkCheck ? 'Re-check link' : 'Check application link'}</button>
            ${
              safeUrl(job.source_url)
                ? `<a class="btn btn-sm btn-ghost" href="${escapeHtml(
                    safeUrl(job.source_url),
                  )}" target="_blank" rel="noopener noreferrer">${icon('external-link')} Source listing</a>`
                : ''
            }
          </div>
          ${linkCheckMarkup(job)}
          <div class="drawer-meta mt-8">${icon('clock')} Added ${escapeHtml(
            relativeTime(job.created_at),
          )}${job.posted_at ? ` · Posted ${escapeHtml(formatDate(job.posted_at))}` : ''}</div>
        </div>
      </div>

      <aside class="review-side">
        <div class="review-section" style="margin-top:0">
          <div class="review-section-title">${icon('clipboard-check')} Review checklist</div>
          <label class="review-checklist check check-sm">
            <input type="checkbox" id="reviewed-original" />
            <span class="check-copy"><strong>I opened the original employer posting.</strong><br />Required before marking verified active.</span>
          </label>
          <label class="review-checklist check check-sm">
            <input type="checkbox" id="review-is-internship" checked />
            <span class="check-copy">The posting is an internship or trainee role.</span>
          </label>
          <label class="review-checklist check check-sm">
            <input type="checkbox" id="review-is-ncr" checked />
            <span class="check-copy">The role is based in Gurugram, Noida, Delhi, or Faridabad.</span>
          </label>
          <label class="review-checklist check check-sm">
            <input type="checkbox" id="review-link-ok" ${linkCheck?.reachable ? 'checked' : ''} />
            <span class="check-copy">The application link is reachable and points to this role.</span>
          </label>
        </div>

        <div class="review-section">
          <div class="review-section-title">${icon('pen-line')} Decision record</div>
          <div class="verify-form">
            <div class="form-group">
              <label class="form-label" for="reviewer-name">Reviewer name</label>
              <input class="input input-sm" id="reviewer-name" type="text" maxlength="120" value="${escapeHtml(
                reviewer,
              )}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="review-notes">Review notes <span class="optional">Optional</span></label>
              <textarea class="textarea" id="review-notes" maxlength="2000" style="min-height:64px" placeholder="e.g., Verified on employer careers page; stipend matches listing."></textarea>
            </div>
          </div>
          <div class="decision-grid">
            ${Object.entries(DECISIONS)
              .map(
                ([status, meta]) =>
                  `<button class="btn ${meta.className}" type="button" data-decision="${status}">${icon(
                    meta.iconName,
                  )} ${meta.label}</button>`,
              )
              .join('')}
          </div>
          <div class="decision-note">
            ${icon('lock')} Every decision is written to the audit trail with your reviewer name and timestamp.
            “Needs review” keeps the record in the queue for another committee member.
          </div>
        </div>
      </aside>
    </div>
  `;
}

function renderReview(job) {
  const panel = document.getElementById('review-panel');
  state.selected = job;
  panel.innerHTML = reviewMarkup(job);
  refreshIcons();
  bindReview();
}

function bindReview() {
  const panel = document.getElementById('review-panel');
  const job = state.selected;
  if (!job) return;

  panel.querySelector('[data-show-description]')?.addEventListener('click', (event) => {
    const full = panel.querySelector('[data-full-description]');
    if (!full) return;
    full.hidden = false;
    event.currentTarget.remove();
    refreshIcons();
  });

  panel.querySelector('[data-open-drawer]')?.addEventListener('click', () => {
    openJobDrawer(job.id, { config: state.config });
  });

  panel.querySelector('[data-copy-link]')?.addEventListener('click', async () => {
    const copied = await copyText(job.application_url);
    toast(
      copied
        ? { type: 'success', title: 'Link copied', message: 'The application URL is on your clipboard.' }
        : { type: 'error', title: 'Could not copy', message: 'Open the posting and copy it from the address bar.' },
    );
  });

  panel.querySelector('[data-check-link]')?.addEventListener('click', async (event) => {
    const restore = setButtonLoading(event.currentTarget, 'Checking…');
    try {
      const data = await http.post(`/verification/${job.id}/check-link`, null, { timeout: 25_000 });
      state.linkChecks.set(job.id, data.check);
      const target = panel.querySelector('[data-link-result]');
      if (target) {
        const replacement = document.createElement('div');
        replacement.innerHTML = linkCheckMarkup(job);
        target.replaceWith(replacement.firstElementChild);
        refreshIcons();
      }
      const linkOk = panel.querySelector('#review-link-ok');
      if (linkOk && data.check?.reachable) linkOk.checked = true;
      toast({
        type: data.check?.outcome === 'pass' ? 'success' : data.check?.outcome === 'review' ? 'warning' : 'error',
        title: data.check?.outcome === 'pass' ? 'Link reachable' : 'Link needs attention',
        message: data.check?.message || 'The link check completed.',
      });
    } catch (error) {
      toast({ type: 'error', title: 'Link check failed', message: describeError(error) });
    } finally {
      restore();
    }
  });

  panel.querySelector('[data-analyze-selected]')?.addEventListener('click', async (event) => {
    const restore = setButtonLoading(event.currentTarget, 'Analyzing…');
    try {
      const data = await http.post(`/jobs/${job.id}/analyze`, null, { timeout: 70_000 });
      const updated = data.job || { ...job, analysis: data.analysis };
      state.selected = updated;
      const index = state.items.findIndex((item) => item.id === updated.id);
      if (index >= 0) state.items[index] = { ...state.items[index], ...updated };
      renderReview(updated);
      toast({ type: 'success', title: 'Analysis complete', message: 'Gemini signals are now available for this review.' });
    } catch (error) {
      toast({ type: 'error', title: 'Analysis failed', message: describeError(error), timeout: 7000 });
      restore();
    }
  });

  panel.querySelectorAll('[data-decision]').forEach((button) => {
    button.addEventListener('click', () => decide(button.dataset.decision, button));
  });
}

async function decide(status, button) {
  const job = state.selected;
  if (!job) return;

  const reviewer = String(document.getElementById('reviewer-name')?.value || '').trim();
  if (reviewer.length < 2) {
    toast({ type: 'warning', title: 'Reviewer required', message: 'Enter the name of the committee member making this decision.' });
    document.getElementById('reviewer-name')?.focus();
    return;
  }

  const reviewedOriginal = Boolean(document.getElementById('reviewed-original')?.checked);
  if (status === 'verified_active' && !reviewedOriginal) {
    toast({
      type: 'warning',
      title: 'Confirm the original posting',
      message: 'Open the employer posting and tick “I opened the original employer posting” before verifying.',
    });
    document.getElementById('reviewed-original')?.focus();
    return;
  }

  if (status === 'rejected') {
    const confirmed = await confirmDialog({
      title: 'Reject this opportunity?',
      message: 'The record will be marked rejected and removed from the active review queue. The audit trail keeps the decision.',
      confirmLabel: 'Reject opportunity',
      tone: 'danger',
    });
    if (!confirmed) return;
  }

  const linkCheck = state.linkChecks.get(job.id);
  const buttons = [...document.querySelectorAll('#review-panel [data-decision]')];
  buttons.forEach((element) => {
    element.disabled = true;
  });
  const restore = setButtonLoading(button, 'Saving decision…');

  try {
    await http.post(
      `/verification/${job.id}/verify`,
      {
        status,
        reviewer,
        notes: String(document.getElementById('review-notes')?.value || '').trim(),
        checkedUrl: job.application_url || null,
        linkHttpStatus: linkCheck?.httpStatus || null,
        reviewedOriginalPage: reviewedOriginal,
      },
      { timeout: 20_000 },
    );

    toast({
      type: status === 'verified_active' ? 'success' : 'info',
      title: `Marked ${statusMeta(status).label.toLowerCase()}`,
      message:
        status === 'verified_active'
          ? 'The opportunity now counts toward the committee target.'
          : 'The decision is recorded in the verification audit trail.',
    });

    state.selectedId = null;
    state.selected = null;
    await Promise.all([loadQueue({ autoSelect: false }), loadAudit()]);
    selectNextAfter(job.id);
  } catch (error) {
    restore();
    buttons.forEach((element) => {
      element.disabled = false;
    });
    toast({ type: 'error', title: 'Decision could not be saved', message: describeError(error), timeout: 7000 });
  }
}

function selectNextAfter(previousId) {
  if (!state.items.length) {
    renderEmptyReview('The queue is clear. New discoveries will appear here for review.');
    return;
  }
  const requested = state.requestedId && state.items.find((job) => job.id === state.requestedId);
  state.requestedId = null;
  const target = requested || state.items.find((job) => job.id !== previousId) || state.items[0];
  selectJob(target.id);
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.view !== 'all') params.set('view', state.view);
  if (state.selectedId) params.set('job', state.selectedId);
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

function selectJob(id, { scroll = true } = {}) {
  const job = state.items.find((item) => item.id === id);
  if (!job) {
    renderEmptyReview('That opportunity is no longer in the pending review queue. It may already have been decided.');
    return;
  }
  state.selectedId = id;
  syncUrl();
  renderQueue();
  renderReview(job);
  if (scroll) {
    document.getElementById('review-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function loadQueue({ autoSelect = true } = {}) {
  if (state.loading) return;
  state.loading = true;
  try {
    const data = await http.get('/verification/queue', { view: state.view }, { timeout: 25_000 });
    state.items = Array.isArray(data.items) ? data.items : [];
    state.summary = data.summary || {};
    state.totalJobs = Number(data.totalJobs || 0);
    renderQueue();

    const requestedId = state.requestedId || new URLSearchParams(window.location.search).get('job');
    const requested = requestedId ? state.items.find((job) => job.id === requestedId) : null;
    const selected = state.selectedId ? state.items.find((job) => job.id === state.selectedId) : null;
    const fallback = autoSelect ? state.items[0] : null;
    const target = requested || selected || fallback;

    state.requestedId = null;

    if (target) {
      if (state.selectedId === target.id) {
        state.selected = target;
        renderReview(target);
      } else {
        selectJob(target.id, { scroll: false });
      }
    } else {
      state.selectedId = null;
      state.selected = null;
      if (requestedId) {
        renderEmptyReview('That record is not in the pending queue. Open the full directory to inspect it.');
      } else if (!state.items.length) {
        renderEmptyReview('The queue is clear. New discoveries will appear here for review.');
      } else {
        renderEmptyReview();
      }
    }
  } catch (error) {
    $('#verification-queue').html(
      `<div class="callout callout-danger" style="margin:14px">${icon('circle-alert')}<div>${escapeHtml(
        describeError(error),
      )}</div></div>`,
    );
    refreshIcons();
    toast({ type: 'error', title: 'Could not load the queue', message: describeError(error) });
  } finally {
    state.loading = false;
  }
}

function auditRow(log) {
  const previous = log.previous_status ? statusBadge(log.previous_status) : '<span class="text-tertiary">—</span>';
  const next = statusBadge(log.new_status);
  const job = log.job;
  return `
    <tr>
      <td>
        <div class="cell-stack">
          <span class="cell-main">${escapeHtml(formatDateTime(log.created_at))}</span>
          <span class="cell-sub">${escapeHtml(relativeTime(log.created_at))}</span>
        </div>
      </td>
      <td>
        ${
          job
            ? `<button class="link-btn" type="button" data-audit-job="${escapeHtml(job.id)}">${escapeHtml(
                job.job_title,
              )}</button><div class="cell-sub">${escapeHtml(job.company_name || '')}</div>`
            : '<span class="text-tertiary">Deleted opportunity</span>'
        }
      </td>
      <td>${previous}</td>
      <td>${next}</td>
      <td>${escapeHtml(log.reviewer || '—')}</td>
      <td>${
        log.link_http_status
          ? `<span class="badge badge-neutral">HTTP ${escapeHtml(String(log.link_http_status))}</span>`
          : '<span class="text-tertiary">—</span>'
      }</td>
      <td><span class="text-sm">${escapeHtml(truncate(log.notes || '—', 90))}</span></td>
    </tr>
  `;
}

async function loadAudit() {
  try {
    const data = await http.get('/verification/logs', { limit: 25 }, { timeout: 20_000 });
    const items = data.items || [];
    $('#audit-count').text(`${items.length} recent`);
    if (!items.length) {
      $('#audit-body').html(
        `<tr><td colspan="7"><div class="table-empty">${icon(
          'history',
        )}<div class="empty-title" style="margin-top:8px">No verification decisions yet</div><p class="empty-text">Recorded decisions will appear here with reviewer and link-check details.</p></div></td></tr>`,
      );
      refreshIcons();
      return;
    }
    $('#audit-body').html(items.map(auditRow).join(''));
    refreshIcons();
  } catch (error) {
    $('#audit-body').html(
      `<tr><td colspan="7"><div class="callout callout-danger" style="margin:14px">${icon(
        'circle-alert',
      )}<div>${escapeHtml(describeError(error))}</div></div></td></tr>`,
    );
    refreshIcons();
  }
}

$(async () => {
  try {
    const { config } = await boot({ page: 'verification' });
    state.config = config;
  } catch {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (['pending', 'needs_review'].includes(view)) state.view = view;
  state.requestedId = params.get('job');
  $('.queue-tab').removeClass('active').attr('aria-selected', 'false');
  $(`.queue-tab[data-view="${state.view}"]`).addClass('active').attr('aria-selected', 'true');

  $('#queue-tabs').on('click', '.queue-tab', function switchView() {
    const next = String($(this).data('view'));
    if (next === state.view) return;
    state.view = next;
    state.selectedId = null;
    state.selected = null;
    state.requestedId = null;
    $('.queue-tab').removeClass('active').attr('aria-selected', 'false');
    $(this).addClass('active').attr('aria-selected', 'true');
    syncUrl();
    renderEmptyReview();
    loadQueue();
  });

  $('#verification-queue').on('click', '[data-select-job]', function select() {
    selectJob($(this).data('select-job'));
  });

  $(document).on('click', '[data-select-first]', () => {
    if (state.items[0]) selectJob(state.items[0].id);
  });

  $('#refresh-verification').on('click', async function refreshQueue() {
    const restore = setButtonLoading(this, 'Refreshing…');
    state.requestedId = null;
    await Promise.all([loadQueue({ autoSelect: false }), loadAudit()]);
    if (!state.selected && state.items[0]) selectJob(state.items[0].id);
    restore();
    toast({ type: 'success', title: 'Queue refreshed', message: 'The latest pending records are shown.' });
  });

  $('#refresh-audit').on('click', async function refreshAudit() {
    const restore = setButtonLoading(this, 'Refreshing…');
    await loadAudit();
    restore();
  });

  $('#verification-manual-button').on('click', () => {
    openManualJobModal({
      config: state.config,
      onCreated: () => loadQueue(),
    });
  });

  $('#audit-body').on('click', '[data-audit-job]', function openAuditJob() {
    openJobDrawer($(this).data('audit-job'), { config: state.config });
  });

  await Promise.all([loadQueue({ autoSelect: false }), loadAudit()]);
  if (!state.selected && state.items.length) selectJob(state.items[0].id);
});
