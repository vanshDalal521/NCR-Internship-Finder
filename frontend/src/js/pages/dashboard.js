import Chart from 'chart.js/auto';
import $ from 'jquery';
import { describeError, http } from '../api.js';
import { shortCategory } from '../config.js';
import { openJobDrawer } from '../job-drawer.js';
import { boot } from '../shell.js';
import {
  categoryTag,
  deadlineInfo,
  escapeHtml,
  formatNumber,
  icon,
  initials,
  relativeTime,
  sourceBadge,
  statusBadge,
  setButtonLoading,
  refreshIcons,
  toast,
} from '../ui.js';

const PALETTE = {
  navy: '#173B67',
  blue: '#2563EB',
  blueSoft: 'rgba(37, 99, 235, 0.14)',
  green: '#16A36A',
  greenSoft: 'rgba(22, 163, 106, 0.16)',
  amber: '#E69B2D',
  slate: '#94A3B8',
  grid: '#E8EDF4',
  text: '#5B6B7C',
};

const state = {
  config: null,
  data: null,
  scope: 'all',
  categoryChart: null,
  locationChart: null,
};

function statCard({ label, value, suffix = '', meta, iconName, tone = '', target = false, progress = null }) {
  return `
    <div class="stat-card ${target ? 'stat-target-card' : ''}">
      <div class="stat-card-head">
        <span class="stat-label">${escapeHtml(label)}</span>
        <span class="stat-icon ${tone}">${icon(iconName)}</span>
      </div>
      <div class="stat-value">${value}${suffix ? `<span class="stat-suffix">${suffix}</span>` : ''}</div>
      <div class="stat-meta">${meta}</div>
      ${
        progress !== null
          ? `<div class="stat-target-bar"><span style="width:${Math.max(0, Math.min(100, progress))}%"></span></div>`
          : ''
      }
    </div>
  `;
}

function renderStats(data) {
  const stats = data.stats || {};
  const queue = Number(stats.pendingVerification || 0) + Number(stats.needsReview || 0);
  const target = Number(stats.targetTotal || data.targetTotal || 20);
  const progress = Number(stats.targetProgress || 0);

  const markup = [
    statCard({
      label: 'Discovered opportunities',
      value: formatNumber(stats.discovered),
      meta: `${icon('database')} <span><strong>${formatNumber(
        Number(stats.expired || 0) + Number(stats.rejected || 0),
      )}</strong> expired or rejected</span>`,
      iconName: 'briefcase-business',
      tone: 'blue',
    }),
    statCard({
      label: 'Verified against target',
      value: formatNumber(stats.verifiedActive),
      suffix: `/ ${target}`,
      meta: `${icon('target')} <span><strong>${progress}%</strong> of the committee target</span>`,
      iconName: 'shield-check',
      target: true,
      progress,
    }),
    statCard({
      label: 'Pending verification',
      value: formatNumber(stats.pendingVerification),
      meta: `${icon('clock')} <span>Awaiting the first committee review</span>`,
      iconName: 'clock',
      tone: 'amber',
    }),
    statCard({
      label: 'Needs another look',
      value: formatNumber(stats.needsReview),
      meta: `${icon('circle-alert')} <span><strong>${queue}</strong> total records in the queue</span>`,
      iconName: 'circle-alert',
      tone: 'red',
    }),
    statCard({
      label: 'Companies in pipeline',
      value: formatNumber(stats.companies),
      meta: `${icon('building-2')} <span>Distinct employers across NCR</span>`,
      iconName: 'building-2',
      tone: 'navy',
    }),
    statCard({
      label: 'Shortlisted',
      value: formatNumber(stats.shortlisted),
      meta: `${icon('bookmark')} <span>Saved for committee follow-up</span>`,
      iconName: 'bookmark',
      tone: 'green',
    }),
  ].join('');

  $('#dashboard-stats').html(markup);
  refreshIcons();
}

function renderAlert(data) {
  const element = document.getElementById('dashboard-alert');
  if (!element) return;
  if (Number(data?.stats?.discovered || 0) > 0) {
    element.innerHTML = '';
    return;
  }

  element.innerHTML = `
    <div class="callout callout-info dashboard-alert">
      ${icon('sparkles')}
      <div>
        <strong>The directory is empty.</strong> Start with a discovery sweep in Gurugram, or add a known
        opportunity manually and take it through the verification gate.
        <div class="callout-actions">
          <a href="/discover.html">Run discovery</a>
          <a href="/verification.html">Open Verification Centre</a>
        </div>
      </div>
    </div>
  `;
  refreshIcons();
}

function renderCategoryChart(data) {
  const progress = data.categoryProgress || [];
  const canvas = document.getElementById('category-chart');
  const empty = document.getElementById('category-chart-empty');
  if (!canvas) return;

  state.categoryChart?.destroy();
  state.categoryChart = null;

  const hasVerified = progress.some((row) => Number(row.verified) > 0);
  if (empty) empty.hidden = hasVerified;
  canvas.hidden = !hasVerified;
  $('#category-chart-badge').text(
    `${formatNumber(data.stats?.verifiedActive || 0)} / ${formatNumber(data.targetTotal || 20)} target`,
  );
  $('#analytics-caption').text(
    hasVerified
      ? 'Verified-active roles against the committee target for each category.'
      : 'Verified-active roles will appear here after the first approvals.',
  );
  if (!hasVerified) return;

  state.categoryChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: progress.map((row) => shortCategory(row.category)),
      datasets: [
        {
          label: 'Verified active',
          data: progress.map((row) => Number(row.verified || 0)),
          backgroundColor: PALETTE.green,
          borderRadius: 4,
          maxBarThickness: 18,
        },
        {
          label: 'Target',
          data: progress.map((row) => Number(row.target || 0)),
          backgroundColor: PALETTE.blueSoft,
          borderColor: 'rgba(37, 99, 235, 0.28)',
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 18,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
            color: PALETTE.text,
            font: { size: 10, family: "'Inter Variable', Inter, system-ui, sans-serif" },
          },
        },
        tooltip: {
          backgroundColor: PALETTE.navy,
          padding: 10,
          titleFont: { size: 11 },
          bodyFont: { size: 11 },
          cornerRadius: 6,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: PALETTE.text,
            font: { size: 9.5, family: "'Inter Variable', Inter, system-ui, sans-serif" },
            maxRotation: 0,
            autoSkip: false,
          },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: PALETTE.grid },
          border: { display: false },
          ticks: {
            precision: 0,
            stepSize: 1,
            color: PALETTE.text,
            font: { size: 9.5, family: "'Inter Variable', Inter, system-ui, sans-serif" },
          },
        },
      },
    },
  });
}

function renderLocationChart(data) {
  const distribution = data.distributions?.[state.scope] || data.distributions?.all || {};
  const locations = distribution.locations || [];
  const canvas = document.getElementById('location-chart');
  const empty = document.getElementById('location-chart-empty');
  if (!canvas) return;

  state.locationChart?.destroy();
  state.locationChart = null;

  const total = locations.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const top = locations.reduce(
    (best, row) => (Number(row.count) > Number(best?.count || 0) ? row : best),
    null,
  );
  if (empty) empty.hidden = total > 0;
  canvas.hidden = total === 0;
  $('#location-chart-badge').text(top ? `${top.city} leads` : 'No records');

  if (!total) return;

  const colors = ['#173B67', '#2563EB', '#16A36A', '#E69B2D', '#94A3B8'];

  state.locationChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: locations.map((row) => row.city),
      datasets: [
        {
          data: locations.map((row) => Number(row.count || 0)),
          backgroundColor: locations.map((_, index) => colors[index % colors.length]),
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '64%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
            color: PALETTE.text,
            font: { size: 10, family: "'Inter Variable', Inter, system-ui, sans-serif" },
          },
        },
        tooltip: {
          backgroundColor: PALETTE.navy,
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (context) => {
              const value = Number(context.raw || 0);
              const percent = total ? Math.round((value / total) * 100) : 0;
              return ` ${context.label}: ${value} (${percent}%)`;
            },
          },
        },
      },
    },
  });
}

function renderRecent(data) {
  const body = document.getElementById('recent-jobs-body');
  if (!body) return;
  const jobs = data.recent || [];

  if (!jobs.length) {
    body.innerHTML = `<tr><td colspan="5"><div class="table-empty">${icon(
      'briefcase-business',
    )}<div class="empty-title" style="margin-top:8px">No opportunities yet</div><p class="empty-text">Run a discovery sweep or add a role manually to begin the pipeline.</p><a class="btn btn-sm btn-primary mt-12" href="/discover.html">Discover jobs</a></div></td></tr>`;
    refreshIcons();
    return;
  }

  body.innerHTML = jobs
    .map((job) => {
      const deadline = deadlineInfo(job.deadline);
      return `
        <tr class="clickable" data-job-id="${escapeHtml(job.id)}" tabindex="0">
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
          <td><span class="location-cell">${icon('map-pin')} ${escapeHtml(job.city || '—')}</span></td>
          <td>${statusBadge(job.verification_status)}</td>
          <td>
            <div class="cell-stack">
              <span class="cell-main">${escapeHtml(relativeTime(job.created_at))}</span>
              ${
                job.deadline
                  ? `<span class="cell-sub ${deadline.className}">${escapeHtml(deadline.text)}</span>`
                  : ''
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  refreshIcons();
}

function renderQueue(data) {
  const element = document.getElementById('dashboard-review-queue');
  const badge = document.getElementById('queue-badge');
  if (!element) return;

  const items = data.reviewQueue || [];
  const count = Number(data.stats?.pendingVerification || 0) + Number(data.stats?.needsReview || 0);
  if (badge) badge.textContent = `${count} waiting`;

  if (!items.length) {
    element.innerHTML = `
      <div class="review-empty" style="min-height: 250px">
        <div class="empty-icon">${icon('shield-check')}</div>
        <div class="empty-title">The queue is clear</div>
        <p class="empty-text">New discoveries and manual entries will appear here for review.</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  element.innerHTML = items
    .map(
      (job) => `
        <a class="queue-item" href="/verification.html?job=${encodeURIComponent(job.id)}">
          <span class="queue-avatar">${escapeHtml(initials(job.company_name))}</span>
          <span class="queue-copy">
            <span class="queue-role">${escapeHtml(job.job_title)}</span>
            <span class="queue-company">${escapeHtml(job.company_name)}</span>
            <span class="queue-meta">
              ${statusBadge(job.verification_status)}
              ${sourceBadge(job.source, state.config?.sourceLabels)}
              ${jobsAge(job.created_at)}
            </span>
          </span>
          <span class="queue-arrow">${icon('chevron-right')}</span>
        </a>
      `,
    )
    .join('');

  function jobsAge(value) {
    return `<span class="badge badge-neutral">${icon('clock')} ${escapeHtml(relativeTime(value))}</span>`;
  }

  refreshIcons();
}

function renderTargets(data) {
  const element = document.getElementById('category-target-strip');
  if (!element) return;
  const progress = data.categoryProgress || [];
  const target = Number(data.targetTotal || 20);
  const verified = Number(data.stats?.verifiedActive || 0);

  $('#category-target-caption').text(
    `${verified} of ${target} verified active · targets fixed by the committee`,
  );

  element.innerHTML = progress
    .map((row) => {
      const count = Number(row.verified || 0);
      const goal = Number(row.target || 0);
      const percent = goal ? Math.min(100, Math.round((count / goal) * 100)) : 0;
      return `
        <div class="category-target">
          <div class="category-target-label">
            <span title="${escapeHtml(row.category)}">${escapeHtml(shortCategory(row.category))}</span>
            <strong>${count}/${goal}</strong>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${count >= goal ? 'success' : ''}" style="width:${percent}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderAll() {
  if (!state.data) return;
  renderStats(state.data);
  renderAlert(state.data);
  renderCategoryChart(state.data);
  renderLocationChart(state.data);
  renderRecent(state.data);
  renderQueue(state.data);
  renderTargets(state.data);
}

async function loadDashboard({ refresh = false } = {}) {
  try {
    const data = await http.get('/dashboard', { scope: state.scope }, { timeout: 25_000 });
    state.data = data;
    renderAll();
    if (refresh) toast({ type: 'success', title: 'Dashboard refreshed', message: 'Committee data is up to date.' });
  } catch (error) {
    toast({ type: 'error', title: 'Could not load dashboard', message: describeError(error), timeout: 7000 });
    $('#dashboard-stats').html(
      `<div class="callout callout-danger dashboard-alert">${icon('circle-alert')}<div>Dashboard data could not be loaded. <button class="link-btn" type="button" data-retry-dashboard>Try again</button></div></div>`,
    );
    refreshIcons();
  }
}

$(async () => {
  try {
    const { config } = await boot({ page: 'dashboard' });
    state.config = config;
  } catch {
    return;
  }

  $('#scope-control').on('click', 'button[data-scope]', function onScope() {
    const scope = $(this).data('scope');
    if (scope === state.scope) return;
    state.scope = scope;
    $('#scope-control button').removeClass('active').attr('aria-pressed', 'false');
    $(this).addClass('active').attr('aria-pressed', 'true');
    if (state.data) {
      state.data.scope = scope;
      renderAll();
    } else {
      loadDashboard();
    }
  });

  $('#dashboard-refresh').on('click', async function onRefresh() {
    const restore = setButtonLoading(this, 'Refreshing…');
    await loadDashboard({ refresh: true });
    restore();
  });

  $(document).on('click', '[data-retry-dashboard]', () => loadDashboard());

  $(document).on('click', '#recent-jobs-body tr[data-job-id]', function openRecent() {
    openJobDrawer($(this).data('job-id'), {
      config: state.config,
      onChanged: () => loadDashboard(),
    });
  });

  $(document).on('keydown', '#recent-jobs-body tr[data-job-id]', function onKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openJobDrawer($(this).data('job-id'), { config: state.config });
  });

  await loadDashboard();
});

// Expose a tiny hook for the shared drawer's post-save refresh without a full reload.
let realtimeRefreshTimer = null;
window.addEventListener('ncr:jobs-changed', () => {
  if (!state.data || realtimeRefreshTimer) return;
  realtimeRefreshTimer = window.setTimeout(() => {
    realtimeRefreshTimer = null;
    loadDashboard();
  }, 1200);
});
