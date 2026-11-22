import $ from 'jquery';
import { describeError, http } from '../api.js';
import { orderedCategories, orderedLocations, getReviewerName } from '../preferences.js';
import { openJobDrawer } from '../job-drawer.js';
import { openManualJobModal } from '../manual-job.js';
import { boot } from '../shell.js';
import {
  categoryTag,
  escapeHtml,
  formatNumber,
  icon,
  initials,
  refreshIcons,
  setButtonLoading,
  sourceBadge,
  statusBadge,
  toast,
} from '../ui.js';

const state = {
  config: null,
  quota: null,
  sweepTimer: null,
  running: false,
};

function option(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function initSelects() {
  const locations = orderedLocations(state.config);
  $('#discovery-city').html(
    locations
      .map((location, index) =>
        option(location.city, `${location.city} · priority ${index + 1}`, index === 0),
      )
      .join(''),
  );

  $('#discovery-category').html(
    `<option value="">Any target category</option>${orderedCategories(state.config)
      .map((category) => option(category, category))
      .join('')}`,
  );
}

function initKeywordChips() {
  $('#keyword-chips').html(
    state.config.searchKeywords
      .map(
        (keyword) =>
          `<button class="keyword-chip" type="button" data-keyword="${escapeHtml(keyword)}">${escapeHtml(
            keyword,
          )}</button>`,
      )
      .join(''),
  );
}

function sourceCard(source) {
  const configured = Boolean(state.config.configured?.[source]);
  const name = state.config.sourceLabels?.[source] || source;
  const description =
    source === 'jsearch'
      ? 'Live Google-for-Jobs coverage with NCR location matching.'
      : 'Optional secondary source for broader listing coverage.';
  return `
    <label class="source-card ${configured ? 'selected' : 'unavailable'}" data-source-card="${source}">
      <input type="checkbox" name="sources" value="${source}" ${configured ? 'checked' : 'disabled'} />
      <span class="source-logo ${source}">${source === 'jsearch' ? 'J' : 'A'}</span>
      <span class="source-card-copy">
        <span class="source-name-row">
          <span class="source-name">${escapeHtml(name)}</span>
          <span class="source-badge">${configured ? 'Ready' : 'Not configured'}</span>
        </span>
        <span class="source-desc">${escapeHtml(description)}</span>
        <span class="source-state ${configured ? '' : 'off'}">
          <span class="source-state-dot"></span>
          ${configured ? 'Available for live queries' : 'Add its API key on the server to enable'}
        </span>
      </span>
      <span class="source-check">${icon('check')}</span>
    </label>
  `;
}

function initSources() {
  $('#source-selector').html([sourceCard('jsearch'), sourceCard('adzuna')].join(''));
  refreshIcons();
}

function selectedSources() {
  return $('#source-selector input[name="sources"]:checked')
    .map((_, element) => element.value)
    .get();
}

function updateSourceSelection() {
  $('#source-selector .source-card').each(function update() {
    const input = $(this).find('input[name="sources"]')[0];
    $(this).toggleClass('selected', Boolean(input?.checked) && !input.disabled);
  });
}

function renderConfigBanner() {
  const element = document.getElementById('discover-config-banner');
  if (!element) return;
  const configured = ['jsearch', 'adzuna'].filter((source) => state.config.configured?.[source]);

  if (configured.length) {
    element.innerHTML = '';
    return;
  }

  element.innerHTML = `
    <div class="callout callout-warning config-banner">
      ${icon('triangle-alert')}
      <div>
        <strong>No live job API is configured.</strong>
        Add <code>JSEARCH_API_KEY</code> (or Adzuna credentials) to <code>backend/.env</code> and restart the
        API to enable discovery. Manual entries still follow the full verification workflow.
        <div class="callout-actions">
          <button class="btn btn-sm btn-secondary" type="button" data-manual-config>Add a role manually</button>
          <a href="/settings.html">Open settings</a>
        </div>
      </div>
    </div>
  `;
  refreshIcons();
}

function renderQuota(quota) {
  if (!quota) return;
  state.quota = quota;
  const used = Number(quota.used || 0);
  const limit = Number(quota.limit || 1);
  const remaining = Number(quota.remaining ?? Math.max(0, limit - used));
  const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  $('#quota-used').text(formatNumber(used));
  $('#quota-limit').text(formatNumber(limit));
  $('#quota-remaining').text(
    remaining > 0 ? `${formatNumber(remaining)} searches remaining` : 'Daily limit reached',
  );
  $('#quota-progress')
    .css('width', `${percent}%`)
    .toggleClass('warning', percent >= 75 && percent < 100)
    .toggleClass('danger', percent >= 100);
  $('#quota-badge')
    .text(`${percent}% used`)
    .toggleClass('badge-pending', percent >= 75)
    .toggleClass('badge-expired', percent >= 100);

  const configured = state.quotaConfigured || state.config.configured || {};
  $('#integration-pills').html(
    ['jsearch', 'adzuna', 'gemini']
      .map((key) => {
        const label = key === 'gemini' ? 'Gemini' : state.config.sourceLabels?.[key] || key;
        const ready = Boolean(configured[key]);
        return `<span class="config-badge ${ready ? 'ready' : 'missing'}">${escapeHtml(label)} ${
          ready ? 'ready' : 'off'
        }</span>`;
      })
      .join(''),
  );
}

function renderHistory(items = []) {
  const element = document.getElementById('search-history');
  if (!element) return;

  if (!items.length) {
    element.innerHTML = `
      <div class="review-empty" style="min-height: 170px">
        <div class="empty-icon">${icon('history')}</div>
        <div class="empty-title">No searches yet</div>
        <p class="empty-text">Your discovery attempts will be listed here with result counts.</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  element.innerHTML = items
    .map((entry) => {
      const status = entry.status === 'completed' ? '' : entry.status === 'failed' ? 'failed' : 'partial';
      const iconName =
        entry.status === 'completed' ? 'circle-check-big' : entry.status === 'failed' ? 'circle-x' : 'triangle-alert';
      const sources = Array.isArray(entry.sources)
        ? entry.sources.map((source) => state.config.sourceLabels?.[source] || source).join(' + ')
        : '—';
      return `
        <button class="history-item" type="button" data-replay-query="${escapeHtml(
          entry.query,
        )}" data-replay-city="${escapeHtml(entry.location || '')}" title="Load this search again">
          <span class="history-icon ${status}">${icon(iconName)}</span>
          <span class="history-copy">
            <span class="history-query">${escapeHtml(entry.query)}</span>
            <span class="history-meta">
              <span>${icon('map-pin')} ${escapeHtml(entry.location || '—')}</span>
              <span>${icon('plug')} ${escapeHtml(sources)}</span>
              <span>${icon('clock')} ${escapeHtml(relativeDate(entry.created_at))}</span>
            </span>
          </span>
          <span class="history-result">
            <strong>${formatNumber(entry.inserted_count || 0)}</strong>
            <span>new</span>
          </span>
        </button>
      `;
    })
    .join('');
  refreshIcons();
}

function relativeDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} hr ago`;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
}

async function loadQuota() {
  try {
    const data = await http.get('/discover/usage', null, { timeout: 15_000 });
    state.quotaConfigured = data.configured;
    renderQuota(data.quota);
  } catch (error) {
    $('#quota-remaining').text('Quota unavailable');
    toast({ type: 'warning', title: 'Quota check failed', message: describeError(error) });
  }
}

async function loadHistory() {
  try {
    const data = await http.get('/discover/history', { limit: 8 }, { timeout: 15_000 });
    if (data.quota) renderQuota(data.quota);
    renderHistory(data.items || []);
  } catch (error) {
    $('#search-history').html(
      `<div class="callout callout-danger" style="margin: 12px">${icon('circle-alert')}<div>${escapeHtml(
        describeError(error),
      )}</div></div>`,
    );
    refreshIcons();
  }
}

function sweepMarkup(sources) {
  const sourceNames = sources.map((source) => state.config.sourceLabels?.[source] || source).join(' + ');
  const steps = [
    `Querying ${sourceNames}`,
    'Normalizing listings and matching priority cities',
    'Deduplicating against the opportunity directory',
    'Saving new records as pending verification',
  ];
  return `
    <div class="card sweep-panel">
      <div class="card-body">
        <div class="sweep-header">
          <span class="sweep-icon">${icon('zap')}</span>
          <div class="sweep-copy">
            <div class="sweep-title">Discovery sweep in progress</div>
            <div class="sweep-text">Live queries are running against the selected providers. This can take a little while.</div>
          </div>
        </div>
        <div class="sweep-steps">
          ${steps
            .map(
              (step, index) => `
              <div class="sweep-step ${index === 0 ? 'active' : ''}" data-sweep-step="${index}">
                <span class="sweep-step-status">${index + 1}</span>
                <span class="sweep-step-name">${escapeHtml(step)}</span>
                <span class="sweep-step-result" data-step-result>${index === 0 ? 'Running' : 'Queued'}</span>
              </div>
            `,
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
}

function startSweep(sources) {
  const results = document.getElementById('discovery-results');
  results.hidden = false;
  results.innerHTML = sweepMarkup(sources);
  refreshIcons();
  window.clearInterval(state.sweepTimer);
  let step = 1;
  state.sweepTimer = window.setInterval(() => {
    if (step >= 4) return;
    $(`[data-sweep-step="${step - 1}"]`).removeClass('active').addClass('done');
    $(`[data-sweep-step="${step - 1}"] [data-step-result]`).text('Done');
    $(`[data-sweep-step="${step}"]`).addClass('active');
    $(`[data-sweep-step="${step}"] [data-step-result]`).text('Running');
    step += 1;
  }, 1100);
}

function stopSweep() {
  window.clearInterval(state.sweepTimer);
  state.sweepTimer = null;
}

function stat(label, value, tone = '') {
  return `
    <div class="result-stat">
      <div class="result-stat-label">${escapeHtml(label)}</div>
      <div class="result-stat-value ${tone}">${formatNumber(value)}</div>
    </div>
  `;
}

function renderResults(data, { sources }) {
  const results = document.getElementById('discovery-results');
  if (!results) return;
  const summary = data.summary || {};
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  const newJobs = summary.newJobs || [];
  const duplicates = summary.duplicateMatches || [];
  const errors = summary.errors || [];
  const rejectionLabels = summary.rejectionLabels || {};
  const rejectionEntries = Object.entries(rejectionLabels).filter(([, count]) => Number(count) > 0);

  const warningMarkup = warnings.length
    ? `<div class="result-warnings">${warnings
        .map(
          (warning) =>
            `<div class="result-warning">${icon('triangle-alert')}<span><strong>${escapeHtml(
              warning.source || 'Provider',
            )}:</strong> ${escapeHtml(warning.message)}</span></div>`,
        )
        .join('')}</div>`
    : '';

  const jobRows = newJobs.length
    ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>New opportunity</th>
              <th>Category</th>
              <th>City</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${newJobs
              .map(
                (job) => `
                <tr class="clickable" data-job-id="${escapeHtml(job.id)}">
                  <td>
                    <div class="table-role">
                      <span class="row-avatar">${escapeHtml(initials(job.company_name))}</span>
                      <div class="table-role-copy">
                        <span class="table-role-title">${escapeHtml(job.job_title)}</span>
                        <span class="table-role-company">${escapeHtml(job.company_name)}</span>
                      </div>
                    </div>
                  </td>
                  <td>${categoryTag(job.category)}</td>
                  <td>${escapeHtml(job.city || '—')}</td>
                  <td>${sourceBadge(job.source, state.config.sourceLabels)}</td>
                  <td>${statusBadge(job.verification_status || 'pending')}</td>
                </tr>
              `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
    : `<div class="review-empty" style="min-height: 170px">
        <div class="empty-icon">${icon('inbox')}</div>
        <div class="empty-title">No new records were added</div>
        <p class="empty-text">${
          Number(summary.duplicates || 0) > 0
            ? 'Everything eligible was already in the directory. Try a different keyword or city.'
            : 'No eligible NCR internships survived the filters for this query. Try a broader keyword.'
        }</p>
      </div>`;

  const duplicateMarkup = duplicates.length
    ? `<div class="review-section" style="padding: 12px 16px; border-top: 1px solid var(--border)">
        <div class="review-section-title">${icon('copy')} Already in the directory</div>
        <div class="flex flex-wrap gap-6">
          ${duplicates
            .map(
              (match) =>
                `<button class="tag tag-navy" type="button" data-job-id="${escapeHtml(match.id)}">${escapeHtml(
                  match.company_name,
                )}: ${escapeHtml(match.job_title)}</button>`,
            )
            .join('')}
        </div>
      </div>`
    : '';

  const rejectionMarkup = rejectionEntries.length
    ? `<div class="review-section" style="padding: 12px 16px; border-top: 1px solid var(--border)">
        <div class="review-section-title">${icon('filter')} Why listings were filtered out</div>
        <div class="tag-stack">${rejectionEntries
          .map(
            ([label, count]) =>
              `<span class="tag">${escapeHtml(label)} · ${formatNumber(count)}</span>`,
          )
          .join('')}</div>
      </div>`
    : '';

  const errorMarkup = errors.length
    ? `<div class="result-warnings" style="background: var(--red-50)">${errors
        .map(
          (error) =>
            `<div class="result-warning" style="color:#8a3030">${icon('circle-alert')}<span><strong>${escapeHtml(
              error.title || 'Listing',
            )}:</strong> ${escapeHtml(error.message || 'Could not be saved.')}</span></div>`,
        )
        .join('')}</div>`
    : '';

  const analysisMarkup = data.analyses
    ? `<div class="callout callout-info" style="margin: 12px 16px">${icon('sparkles')}<div><strong>Gemini analysis:</strong> ${
        data.analyses.analyzed
      } of ${data.analyses.requested} new roles analysed${
        data.analyses.failed ? ` · ${data.analyses.failed} failed` : ''
      }.</div></div>`
    : '';

  results.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${icon('circle-check-big')} Sweep complete</div>
          <div class="card-description">
            ${escapeHtml(data.query)} · ${escapeHtml(data.location)}${
              data.category ? ` · ${escapeHtml(data.category)}` : ''
            } · ${sources.map((source) => state.config.sourceLabels?.[source] || source).join(' + ')}
          </div>
        </div>
        <div class="header-actions">
          <span class="badge badge-verified">Saved as pending</span>
          <a class="btn btn-sm btn-primary" href="/verification.html">${icon('shield-check')} Review queue</a>
        </div>
      </div>
      <div class="result-summary-grid">
        ${stat('Received', summary.received)}
        ${stat('Eligible', summary.eligible)}
        ${stat('New records', summary.added, 'green')}
        ${stat('Duplicates', summary.duplicates, 'amber')}
        ${stat('Rejected', summary.rejected, 'red')}
      </div>
      ${warningMarkup}
      ${errorMarkup}
      ${analysisMarkup}
      <div class="table-toolbar">
        <div class="table-toolbar-copy">${icon('briefcase-business')} Newly discovered roles</div>
        <span class="text-xs text-tertiary">${
          summary.refreshed ? `${formatNumber(summary.refreshed)} existing records refreshed · ` : ''
        }Everything new is pending verification</span>
      </div>
      ${jobRows}
      ${duplicateMarkup}
      ${rejectionMarkup}
    </div>
  `;
  refreshIcons();
}

function renderResultError(error, { sources }) {
  stopSweep();
  const results = document.getElementById('discovery-results');
  results.hidden = false;
  const warnings = error?.details?.sources || [];
  results.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${icon('circle-x')} Sweep could not complete</div>
          <div class="card-description">The selected providers did not return a usable response.</div>
        </div>
        <span class="badge badge-expired">No records added</span>
      </div>
      <div class="card-body">
        <div class="callout callout-danger">${icon('circle-alert')}<div>${escapeHtml(
          describeError(error),
        )}</div></div>
        ${
          warnings.length
            ? `<div class="tag-stack mt-12">${warnings
                .map(
                  (warning) =>
                    `<span class="tag">${escapeHtml(warning.source || 'Provider')} · ${escapeHtml(
                      warning.message || 'Unavailable',
                    )}</span>`,
                )
                .join('')}</div>`
            : ''
        }
        <div class="flex flex-wrap gap-8 mt-16">
          ${sources
            .map(
              (source) =>
                `<button class="btn btn-sm btn-secondary" type="button" data-retry-sweep>${icon(
                  'refresh-cw',
                )} Retry ${escapeHtml(state.config.sourceLabels?.[source] || source)}</button>`,
            )
            .join('')}
          <a class="btn btn-sm btn-ghost" href="/settings.html">Check integration settings</a>
        </div>
      </div>
    </div>
  `;
  refreshIcons();
}

async function runDiscovery(event) {
  event?.preventDefault();
  if (state.running) return;

  const form = document.getElementById('discovery-form');
  const query = String(form.elements.query?.value || '').trim();
  const city = String(form.elements.city?.value || '');
  const category = String(form.elements.category?.value || '');
  const pages = Number(form.elements.pages?.value || 1);
  const analyzeNew = Boolean(form.elements.analyzeNew?.checked);
  const sources = selectedSources();

  if (query.length < 2) {
    toast({ type: 'warning', title: 'Enter a keyword', message: 'Use at least two characters, e.g., “frontend intern”.' });
    form.elements.query?.focus();
    return;
  }
  if (!sources.length) {
    toast({ type: 'warning', title: 'Select a job source', message: 'Enable at least one configured provider.' });
    return;
  }

  state.running = true;
  const submit = document.getElementById('run-discovery');
  const restore = setButtonLoading(submit, 'Searching live APIs…');
  startSweep(sources);

  try {
    const data = await http.post(
      '/discover/search',
      {
        query,
        location: city,
        ...(category ? { category } : {}),
        sources,
        pages,
        analyzeNew,
        searchedBy: getReviewerName(state.config),
      },
      { timeout: 75_000 },
    );
    stopSweep();
    renderResults(data, { sources });
    if (data.quota) renderQuota(data.quota);
    toast({
      type: 'success',
      title: data.summary?.added ? 'Discovery complete' : 'Sweep complete',
      message: data.summary?.added
        ? `${data.summary.added} new opportunities added to the verification queue.`
        : 'No new roles were added. Existing records were refreshed where possible.',
    });
    if (data.summary?.added) {
      window.dispatchEvent(new CustomEvent('ncr:jobs-changed'));
    }
    loadHistory();
  } catch (error) {
    renderResultError(error, { sources });
    toast({ type: 'error', title: 'Discovery failed', message: describeError(error), timeout: 7500 });
  } finally {
    state.running = false;
    restore();
  }
}

function fillFromHistory(button) {
  const query = $(button).data('replay-query');
  const city = $(button).data('replay-city');
  $('#discovery-query').val(query || '');
  if (city) $('#discovery-city').val(city);
  $('#discovery-query').trigger('focus');
  $('html, body').animate({ scrollTop: 0 }, 200);
  toast({ type: 'info', title: 'Search loaded', message: 'Review the keyword and city, then run the sweep again.' });
}

$(async () => {
  try {
    const { config } = await boot({ page: 'discover' });
    state.config = config;
  } catch {
    return;
  }

  initSelects();
  initKeywordChips();
  initSources();
  renderConfigBanner();

  if (!state.config.configured?.gemini) {
    const analyze = document.getElementById('discovery-analyze');
    if (analyze) {
      analyze.disabled = true;
      const label = analyze.closest('.switch');
      if (label) {
        label.title = 'Add GEMINI_API_KEY to the backend environment to enable AI analysis.';
        label.style.opacity = '0.7';
      }
    }
  }

  if (state.config.discoveryDailyLimit) {
    renderQuota({
      used: 0,
      limit: state.config.discoveryDailyLimit,
      remaining: state.config.discoveryDailyLimit,
    });
  }

  $('#discovery-form').on('submit', runDiscovery);

  $('#discovery-form').on('click', '.keyword-chip', function useKeyword() {
    $('#discovery-query').val($(this).data('keyword')).trigger('focus');
    $('.keyword-chip').removeClass('active');
    $(this).addClass('active');
  });

  $('#source-selector').on('change', 'input[name="sources"]', updateSourceSelection);

  $('#reset-discovery').on('click', () => {
    window.setTimeout(() => {
      $('#discovery-query').val('').trigger('focus');
      const locations = orderedLocations(state.config);
      $('#discovery-city').val(locations[0]?.city || '');
      $('#discovery-category').val('');
      $('#discovery-pages').val('1');
      $('.keyword-chip').removeClass('active');
      initSources();
    }, 0);
  });

  $('#manual-job-button, #manual-job-link').on('click', () => {
    openManualJobModal({
      config: state.config,
      onCreated: () => {
        toast({
          type: 'info',
          title: 'Verification required',
          message: 'The new record is waiting in the Verification Centre.',
        });
      },
    });
  });

  $(document).on('click', '[data-manual-config]', () => {
    openManualJobModal({ config: state.config });
  });

  $(document).on('click', '#discovery-results [data-job-id]', function openResult() {
    openJobDrawer($(this).data('job-id'), { config: state.config });
  });

  $(document).on('click', '[data-retry-sweep]', () => $('#discovery-form').trigger('submit'));

  $(document).on('click', '[data-replay-query]', function replay() {
    fillFromHistory(this);
  });

  await Promise.all([loadQuota(), loadHistory()]);
  refreshIcons();
});

let realtimeTimer = null;
window.addEventListener('ncr:jobs-changed', () => {
  if (!state.config || state.running || realtimeTimer) return;
  realtimeTimer = window.setTimeout(() => {
    realtimeTimer = null;
    loadQuota();
    loadHistory();
  }, 1500);
});
