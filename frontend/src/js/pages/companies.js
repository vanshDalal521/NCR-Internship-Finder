import $ from 'jquery';
import { describeError, http } from '../api.js';
import { orderedLocations } from '../preferences.js';
import { openJobDrawer } from '../job-drawer.js';
import { boot } from '../shell.js';
import {
  categoryTag,
  debounce,
  emptyState,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatNumber,
  icon,
  initials,
  loadingState,
  openDrawer,
  refreshIcons,
  relativeTime,
  renderPagination,
  safeUrl,
  setButtonLoading,
  statusBadge,
  stipendText,
  toast,
  truncate,
} from '../ui.js';

const state = {
  config: null,
  page: 1,
  limit: 12,
  search: '',
  city: '',
  pagination: null,
  items: [],
  summary: {},
  loading: false,
  requestId: 0,
};

function initCityFilter() {
  const locations = orderedLocations(state.config);
  $('#company-city').html(
    `<option value="">All priority cities</option>${locations
      .map(
        (location) =>
          `<option value="${escapeHtml(location.city)}">${escapeHtml(location.city)} · priority ${
            location.priority
          }</option>`,
      )
      .join('')}`,
  );
}

function currentFilters() {
  return Object.fromEntries(
    Object.entries({
      search: state.search,
      city: state.city,
      page: state.page,
      limit: state.limit,
    }).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  );
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.search) params.set('search', state.search);
  if (state.city) params.set('city', state.city);
  if (state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

function activeFilterCount() {
  return Number(Boolean(state.search)) + Number(Boolean(state.city));
}

function updateSummary() {
  const pagination = state.pagination || {};
  const total = Number(pagination.total || 0);
  const page = Number(pagination.page || state.page);
  const limit = Number(pagination.limit || state.limit);
  const start = total ? (page - 1) * limit + 1 : 0;
  const end = Math.min(total, page * limit);

  $('[data-company-stat="companies"]').text(formatNumber(state.summary.companies ?? total));
  $('[data-company-stat="verified"]').text(
    formatNumber(state.summary.withVerifiedOpportunities ?? 0),
  );
  $('[data-company-stat="filters"]').text(String(activeFilterCount()));
  $('[data-company-stat="showing"]').text(
    total ? `${formatNumber(start)}–${formatNumber(end)}` : '0',
  );
  $('#companies-result-meta').text(total ? `Page ${page} of ${pagination.totalPages || 1}` : '');
  $('#companies-caption').html(
    `${icon('building-2')} Company directory <span class="text-tertiary text-xs">${
      total ? `${formatNumber(total)} companies` : ''
    }</span>`,
  );
  refreshIcons();
}

function cityCoverage(company) {
  const locations = Array.isArray(company.locations) && company.locations.length
    ? company.locations
    : company.city
      ? [company.city]
      : [];
  if (!locations.length) return '<span class="text-tertiary">—</span>';
  return `<div class="tag-stack">${locations
    .slice(0, 3)
    .map((city) => `<span class="tag">${icon('map-pin')} ${escapeHtml(city)}</span>`)
    .join('')}${
    locations.length > 3 ? `<span class="tag">+${locations.length - 3}</span>` : ''
  }</div>`;
}

function rowMarkup(company) {
  const contact = [];
  if (company.contactEmail) {
    contact.push(
      `<a href="mailto:${escapeHtml(company.contactEmail)}" data-row-action>${icon('mail')} ${escapeHtml(
        company.contactEmail,
      )}</a>`,
    );
  }
  if (company.contactPhone) {
    contact.push(
      `<a href="tel:${escapeHtml(company.contactPhone)}" data-row-action>${icon('phone')} ${escapeHtml(
        company.contactPhone,
      )}</a>`,
    );
  }
  if (!contact.length) {
    contact.push(
      `<span class="not-listed">${
        company.website ? escapeHtml(new URL(safeUrl(company.website) || 'https://example.com').hostname) : 'No contact listed'
      }</span>`,
    );
  }

  return `
    <tr class="clickable" data-company-id="${escapeHtml(company.id || '')}" data-company-name="${escapeHtml(
      company.name,
    )}">
      <td>
        <div class="company-cell">
          <span class="company-logo">${escapeHtml(initials(company.name))}</span>
          <span>
            <span class="company-name">${escapeHtml(company.name)}</span>
            <span class="company-industry">${escapeHtml(company.industry || 'Industry not recorded')}</span>
          </span>
        </div>
      </td>
      <td><span class="text-sm">${escapeHtml(company.industry || '—')}</span></td>
      <td>${cityCoverage(company)}</td>
      <td>
        <div class="company-opp-count">
          <strong>${formatNumber(company.verifiedActive || 0)}</strong>
          <span>verified · ${formatNumber(company.totalJobs || 0)} total</span>
        </div>
      </td>
      <td><div class="company-contact">${contact.join('')}</div></td>
      <td>
        <span class="text-sm">${escapeHtml(
          company.lastActivity ? relativeTime(company.lastActivity) : 'No activity',
        )}</span>
      </td>
      <td>
        <button class="table-row-action" type="button" data-open-company aria-label="Open ${escapeHtml(
          company.name,
        )} details" title="Open company details">${icon('chevron-right')}</button>
      </td>
    </tr>
  `;
}

function renderTable() {
  if (!state.items.length) {
    $('#companies-body').html(
      `<tr><td colspan="7">${emptyState({
        iconName: 'building-2',
        title: state.search || state.city ? 'No companies match these filters' : 'No companies indexed yet',
        text:
          state.search || state.city
            ? 'Try a different search term or clear the city filter.'
            : 'Companies are created automatically when opportunities are discovered or added manually.',
        actions: `<button class="btn btn-sm btn-secondary" type="button" data-reset-company-filters>${icon(
          'rotate-ccw',
        )} Reset filters</button><a class="btn btn-sm btn-primary" href="/discover.html">${icon(
          'search',
        )} Discover jobs</a>`,
      })}</td></tr>`,
    );
    $('#companies-pagination').html('');
    updateSummary();
    refreshIcons();
    return;
  }

  $('#companies-body').html(state.items.map(rowMarkup).join(''));
  $('#companies-pagination').html(
    renderPagination(
      {
        page: state.pagination?.page || state.page,
        totalPages: state.pagination?.totalPages || 1,
        total: state.pagination?.total || state.items.length,
        limit: state.pagination?.limit || state.limit,
      },
      { label: 'companies' },
    ),
  );
  updateSummary();
  refreshIcons();
}

function renderError(error) {
  $('#companies-body').html(
    `<tr><td colspan="7">${emptyState({
      iconName: 'circle-alert',
      title: 'The company directory could not be loaded',
      text: describeError(error),
      actions: `<button class="btn btn-sm btn-secondary" type="button" data-retry-companies>${icon(
        'refresh-cw',
      )} Try again</button>`,
    })}</td></tr>`,
  );
  $('#companies-pagination').html('');
  refreshIcons();
}

async function loadCompanies({ scroll = false, silent = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const requestId = ++state.requestId;

  if (!silent) {
    $('#companies-body').html(
      `<tr><td colspan="7">${loadingState('Loading companies…')}</td></tr>`,
    );
    $('#companies-pagination').html('');
  }

  try {
    const data = await http.get('/companies', currentFilters(), { timeout: 25_000 });
    if (requestId !== state.requestId) return;
    state.items = Array.isArray(data.items) ? data.items : [];
    state.pagination = data.pagination || null;
    state.summary = data.summary || {};
    renderTable();
    if (scroll) {
      document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    if (requestId !== state.requestId) return;
    renderError(error);
    toast({ type: 'error', title: 'Could not load companies', message: describeError(error) });
  } finally {
    if (requestId === state.requestId) state.loading = false;
  }
}

function contactItem(label, value, type = 'text') {
  if (!value) {
    return `<div class="company-contact-item"><span>${escapeHtml(label)}</span><strong class="not-listed">Not listed</strong></div>`;
  }
  let content = escapeHtml(value);
  if (type === 'email') content = `<a href="mailto:${escapeHtml(value)}">${escapeHtml(value)}</a>`;
  if (type === 'phone') content = `<a href="tel:${escapeHtml(value)}">${escapeHtml(value)}</a>`;
  if (type === 'url') {
    const url = safeUrl(value);
    content = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          new URL(url).hostname,
        )}</a>`
      : `<strong>Not available</strong>`;
  }
  return `<div class="company-contact-item"><span>${escapeHtml(label)}</span>${content}</div>`;
}

function companyDetailMarkup(company, summary, jobs) {
  const verified = Number(summary.verifiedActive || 0);
  const total = Number(summary.totalJobs || 0);
  const percent = total ? Math.round((verified / total) * 100) : 0;

  return `
    <div class="company-detail-header">
      <div class="company-detail-logo">${escapeHtml(initials(company.name))}</div>
      <div style="min-width:0">
        <div class="company-detail-name">${escapeHtml(company.name)}</div>
        <div class="company-detail-meta">
          ${company.industry ? `<span class="tag">${escapeHtml(company.industry)}</span>` : ''}
          ${company.city ? `<span class="tag">${icon('map-pin')} ${escapeHtml(company.city)}</span>` : ''}
          ${verified ? `<span class="badge badge-verified">${verified} verified active</span>` : ''}
          ${summary.shortlisted ? `<span class="badge badge-neutral">${summary.shortlisted} shortlisted</span>` : ''}
        </div>
      </div>
    </div>

    <div class="company-summary-grid">
      <div class="company-summary-cell"><strong>${formatNumber(total)}</strong><span>Total opportunities</span></div>
      <div class="company-summary-cell"><strong>${formatNumber(verified)}</strong><span>Verified active</span></div>
      <div class="company-summary-cell"><strong>${formatNumber(summary.pending)}</strong><span>Pending review</span></div>
      <div class="company-summary-cell"><strong>${percent}%</strong><span>Verification rate</span></div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">${icon('building-2')} Company profile</div>
      <div class="company-contact-grid">
        ${contactItem('Website', company.website, 'url')}
        ${contactItem('Careers page', company.careersUrl, 'url')}
        ${contactItem('Contact email', company.contactEmail, 'email')}
        ${contactItem('Contact phone', company.contactPhone, 'phone')}
        ${contactItem('Primary location', company.location || company.city)}
        ${contactItem('Last activity', summary.lastActivity ? formatDateTime(summary.lastActivity) : null)}
      </div>
      ${
        company.description
          ? `<div class="review-callout mt-12">${escapeHtml(truncate(company.description, 500))}</div>`
          : ''
      }
      ${
        summary.categories?.length
          ? `<div class="tag-stack mt-12">${summary.categories
              .map((category) => categoryTag(category, 'tag'))
              .join('')}</div>`
          : ''
      }
    </div>

    <div class="detail-section">
      <div class="detail-section-title">${icon('briefcase-business')} Opportunities <span class="count">${
        jobs.length
      }</span></div>
      ${
        jobs.length
          ? `<div class="company-jobs-list">${jobs
              .map(
                (job) => `
                  <button class="company-job-row" type="button" data-company-job="${escapeHtml(job.id)}">
                    <span class="company-logo">${escapeHtml(initials(job.company_name || company.name))}</span>
                    <span class="company-job-copy">
                      <span class="company-job-title">${escapeHtml(job.job_title)}</span>
                      <span class="company-job-meta">
                        ${statusBadge(job.verification_status)}
                        ${job.city ? `<span>${icon('map-pin')} ${escapeHtml(job.city)}</span>` : ''}
                        <span>${escapeHtml(stipendText(job))}</span>
                        ${job.deadline ? `<span>${icon('calendar')} ${escapeHtml(formatDate(job.deadline))}</span>` : ''}
                      </span>
                    </span>
                    <span class="table-row-action">${icon('chevron-right')}</span>
                  </button>
                `,
              )
              .join('')}</div>`
          : '<div class="review-callout empty">No opportunities are linked to this company yet.</div>'
      }
    </div>
  `;
}

async function openCompany(id, fallback = {}) {
  const drawer = openDrawer({
    eyebrow: 'Company profile',
    title: fallback.name || 'Company',
    subtitle: fallback.industry ? escapeHtml(fallback.industry) : 'Employer detail',
    body: loadingState('Loading company details…'),
  });

  if (!id) {
    drawer.body.innerHTML = `
      ${companyDetailMarkup(
        {
          name: fallback.name,
          industry: fallback.industry,
          city: fallback.city,
          location: fallback.location,
          website: fallback.website,
        },
        fallback,
        [],
      )}
      <div class="callout callout-info mt-12">${icon('info')}<div>This company is not yet indexed as a separate record. Use <strong>Rebuild index</strong> to create a full profile.</div></div>
    `;
    refreshIcons();
    return;
  }

  try {
    const data = await http.get(`/companies/${id}`, null, { timeout: 25_000 });
    const company = data.company || {};
    const summary = data.summary || {};
    drawer.setTitle(company.name || fallback.name || 'Company');
    drawer.setSubtitle(
      [
        company.industry ? escapeHtml(company.industry) : '',
        company.city ? `${icon('map-pin')} ${escapeHtml(company.city)}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    );
    drawer.body.innerHTML = companyDetailMarkup(company, summary, data.jobs || []);
    refreshIcons();

    drawer.body.querySelectorAll('[data-company-job]').forEach((button) => {
      button.addEventListener('click', () => {
        openJobDrawer(button.dataset.companyJob, { config: state.config });
      });
    });
  } catch (error) {
    drawer.body.innerHTML = emptyState({
      iconName: 'circle-alert',
      title: 'Company details unavailable',
      text: describeError(error),
    });
    refreshIcons();
  }
}

function resetFilters() {
  state.search = '';
  state.city = '';
  state.page = 1;
  $('#company-search').val('');
  $('#company-city').val('');
  syncUrl();
  loadCompanies();
}

async function reindexCompanies() {
  const button = document.getElementById('reindex-companies');
  const restore = setButtonLoading(button, 'Rebuilding index…');
  try {
    const data = await http.post('/system/reindex-companies', null, { timeout: 60_000 });
    toast({
      type: 'success',
      title: 'Company index rebuilt',
      message: data.message || `${data.companies || 0} companies linked.`,
    });
    await loadCompanies();
  } catch (error) {
    toast({ type: 'error', title: 'Index rebuild failed', message: describeError(error), timeout: 7000 });
  } finally {
    restore();
  }
}

$(async () => {
  try {
    const { config } = await boot({ page: 'companies' });
    state.config = config;
  } catch {
    return;
  }

  initCityFilter();

  const params = new URLSearchParams(window.location.search);
  state.search = params.get('search') || '';
  state.city = params.get('city') || '';
  state.page = Math.max(1, Number(params.get('page')) || 1);
  $('#company-search').val(state.search);
  if (state.city) $('#company-city').val(state.city);

  const debouncedSearch = debounce(() => {
    state.search = String($('#company-search').val() || '').trim();
    state.page = 1;
    syncUrl();
    loadCompanies();
  }, 360);

  $('#company-search').on('input', debouncedSearch);
  $('#company-city').on('change', () => {
    state.city = String($('#company-city').val() || '');
    state.page = 1;
    syncUrl();
    loadCompanies();
  });

  $('#clear-company-filters').on('click', resetFilters);
  $(document).on('click', '[data-reset-company-filters]', resetFilters);
  $(document).on('click', '[data-retry-companies]', () => loadCompanies());
  $('#reindex-companies').on('click', reindexCompanies);

  $('#refresh-companies').on('click', async function refreshCompanies() {
    const restore = setButtonLoading(this, 'Refreshing…');
    await loadCompanies();
    restore();
    toast({ type: 'success', title: 'Directory refreshed', message: 'The latest company records are shown.' });
  });

  $('#companies-pagination').on('click', '.page-btn[data-page]', function goToPage() {
    const page = Number($(this).data('page'));
    if (!Number.isInteger(page) || page < 1 || page === state.page) return;
    state.page = page;
    syncUrl();
    loadCompanies({ scroll: true });
  });

  $('#companies-body').on('click', 'tr[data-company-id]', function openRow(event) {
    if ($(event.target).closest('a, [data-row-action], [data-open-company]').length && !$(event.target).closest('[data-open-company]').length) {
      return;
    }
    const name = $(this).data('company-name');
    const item = state.items.find((company) => company.name === name);
    openCompany($(this).data('company-id'), item || { name });
  });

  $('#companies-body').on('click', '[data-open-company]', function openButton(event) {
    event.stopPropagation();
    const row = $(this).closest('tr');
    const item = state.items.find((company) => company.name === row.data('company-name'));
    openCompany(row.data('company-id'), item || { name: row.data('company-name') });
  });

  await loadCompanies();

  const requestedCompany = params.get('company');
  if (requestedCompany) {
    const item = state.items.find((company) => company.id === requestedCompany);
    openCompany(requestedCompany, item || {});
  }
});

const refreshForRealtime = debounce(() => {
  if (state.config) loadCompanies({ silent: true });
}, 1500);

window.addEventListener('ncr:jobs-changed', refreshForRealtime);
