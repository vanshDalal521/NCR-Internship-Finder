import $ from 'jquery';
import { describeError, http } from '../api.js';
import { orderedCategories, orderedLocations, getReviewerName } from '../preferences.js';
import { openJobDrawer } from '../job-drawer.js';
import { openManualJobModal } from '../manual-job.js';
import { boot } from '../shell.js';
import {
  categoryTag,
  deadlineInfo,
  debounce,
  emptyState,
  escapeHtml,
  formatNumber,
  icon,
  initials,
  loadingState,
  refreshIcons,
  renderPagination,
  screeningBadge,
  setButtonLoading,
  sourceBadge,
  statusBadge,
  stipendText,
  toast,
} from '../ui.js';

const state = {
  config: null,
  page: 1,
  limit: 20,
  filters: {},
  pagination: null,
  items: [],
  loading: false,
  requestId: 0,
};

const SORT_LABELS = {
  created_at: 'Recently added',
  posted_at: 'Newest posting',
  deadline: 'Deadline soonest',
  company_name: 'Company A–Z',
  job_title: 'Role A–Z',
  relevance_score: 'Relevance score',
  stipend_min: 'Highest stipend',
};

function option(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function initFilters() {
  const locations = orderedLocations(state.config);
  const statuses = state.config.verificationStatuses || [];
  const sources = state.config.sources || [];

  $('#filter-city').html(
    `<option value="">All priority cities</option>${locations
      .map((location) => option(location.city, `${location.city} · priority ${location.priority}`))
      .join('')}`,
  );
  $('#filter-category').html(
    `<option value="">All categories</option>${orderedCategories(state.config)
      .map((category) => option(category, category))
      .join('')}`,
  );
  $('#filter-status').html(
    `<option value="">Any status</option>${statuses
      .map((status) => option(status, state.config.verificationLabels?.[status] || status))
      .join('')}`,
  );
  $('#filter-source').html(
    `<option value="">Any source</option>${sources
      .map((source) => option(source, state.config.sourceLabels?.[source] || source))
      .join('')}`,
  );
  $('#filter-work-mode').html(
    `<option value="">Any work mode</option>${(state.config.workModes || [])
      .map((mode) => option(mode, mode))
      .join('')}`,
  );
}

function readFilters() {
  const form = document.getElementById('jobs-filter-form');
  const data = new FormData(form);
  const filters = {};

  for (const key of ['search', 'city', 'category', 'status', 'source', 'workMode', 'minStipend', 'sort', 'order']) {
    const value = String(data.get(key) || '').trim();
    if (value) filters[key] = value;
  }
  filters.savedOnly = Boolean(document.getElementById('filter-saved')?.checked);
  filters.screenedOnly = Boolean(document.getElementById('filter-screened')?.checked);
  if (!filters.sort) filters.sort = 'created_at';
  if (!filters.order) filters.order = 'desc';
  return filters;
}

function queryParams() {
  const params = { ...state.filters, page: state.page, limit: state.limit };
  if (!params.savedOnly) delete params.savedOnly;
  if (!params.screenedOnly) delete params.screenedOnly;
  return params;
}

function populateForm(filters) {
  const form = document.getElementById('jobs-filter-form');
  if (!form) return;
  for (const [key, value] of Object.entries(filters)) {
    const field = form.elements[key];
    if (field && key !== 'savedOnly') field.value = value;
  }
  const saved = document.getElementById('filter-saved');
  if (saved) saved.checked = Boolean(filters.savedOnly);
  const screened = document.getElementById('filter-screened');
  if (screened) screened.checked = Boolean(filters.screenedOnly);
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const filters = {};
  for (const key of ['search', 'city', 'category', 'status', 'source', 'workMode', 'minStipend', 'sort', 'order']) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  if (params.get('saved') === 'true') filters.savedOnly = true;
  if (params.get('screened') === 'true') filters.screenedOnly = true;
  const page = Number(params.get('page'));
  if (Number.isInteger(page) && page > 0) state.page = page;
  state.filters = filters;
  populateForm(filters);
}

function syncUrl() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state.filters)) {
    if (key === 'savedOnly') {
      if (value) params.set('saved', 'true');
    } else if (key === 'screenedOnly') {
      if (value) params.set('screened', 'true');
    } else if (value && !((key === 'sort' && value === 'created_at') || (key === 'order' && value === 'desc'))) {
      params.set(key, value);
    }
  }
  if (state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

function filterChips() {
  const chips = [];
  const add = (key, label, value) =>
    chips.push({ key, label, value: value || label });

  if (state.filters.search) add('search', 'Search', `“${state.filters.search}”`);
  if (state.filters.city) add('city', 'City', state.filters.city);
  if (state.filters.category) add('category', 'Category', state.filters.category);
  if (state.filters.status)
    add('status', 'Status', state.config.verificationLabels?.[state.filters.status] || state.filters.status);
  if (state.filters.source)
    add('source', 'Source', state.config.sourceLabels?.[state.filters.source] || state.filters.source);
  if (state.filters.workMode) add('workMode', 'Work mode', state.filters.workMode);
  if (state.filters.minStipend) add('minStipend', 'Min stipend', `₹${formatNumber(state.filters.minStipend)}`);
  if (state.filters.savedOnly) add('savedOnly', 'Shortlist', 'Saved only');
  if (state.filters.screenedOnly) add('screenedOnly', 'Screening', 'Link verified only');
  if (state.filters.sort && state.filters.sort !== 'created_at')
    add('sort', 'Sort', SORT_LABELS[state.filters.sort] || state.filters.sort);
  if (state.filters.order === 'asc') add('order', 'Order', 'Ascending');
  return chips;
}

function renderFilterChips() {
  const element = document.getElementById('active-filters');
  if (!element) return;
  const chips = filterChips();
  if (!chips.length) {
    element.innerHTML = '';
    return;
  }
  element.innerHTML = chips
    .map(
      (chip) => `
      <span class="active-filter-chip">
        ${escapeHtml(chip.label)}: <strong>${escapeHtml(chip.value)}</strong>
        <button type="button" data-clear-filter="${chip.key}" aria-label="Remove ${escapeHtml(chip.label)} filter">${icon(
          'x',
        )}</button>
      </span>
    `,
    )
    .join('');
  refreshIcons();
}

function renderSummary() {
  const total = Number(state.pagination?.total || 0);
  const page = Number(state.pagination?.page || 1);
  const totalPages = Number(state.pagination?.totalPages || 1);
  const chips = filterChips();

  $('#filter-summary').html(
    total
      ? `<strong>${formatNumber(total)}</strong> opportunit${total === 1 ? 'y' : 'ies'} match ${
          chips.length ? 'the current filters' : 'the directory'
        }`
      : 'No opportunities match the current filters',
  );
  $('#result-meta').text(total ? `Page ${page} of ${totalPages}` : '');
  $('#sort-caption').text(
    `${SORT_LABELS[state.filters.sort] || 'Recently added'} · ${
      state.filters.order === 'asc' ? 'ascending' : 'descending'
    }`,
  );
  $('#jobs-loading-copy').html(
    `${icon('briefcase-business')} Opportunity directory <span class="text-tertiary text-xs">${
      total ? `${formatNumber(total)} records` : ''
    }</span>`,
  );
  refreshIcons();
}

function renderEmpty() {
  $('#jobs-body').html(
    `<tr><td colspan="8">${emptyState({
      iconName: 'search',
      title: 'No opportunities match these filters',
      text: 'Try a broader keyword, clear a filter, or run a new discovery sweep.',
      actions: `<button class="btn btn-sm btn-secondary" type="button" data-reset-empty>${icon(
        'rotate-ccw',
      )} Reset filters</button><a class="btn btn-sm btn-primary" href="/discover.html">${icon(
        'search',
      )} Discover jobs</a>`,
    })}</td></tr>`,
  );
  refreshIcons();
}

function rowMarkup(job) {
  const deadline = deadlineInfo(job.deadline);
  const stipend = stipendText(job);
  const hasStipend = Boolean(job.stipend || job.stipend_min || job.stipend_max);
  const saved = Boolean(job.saved);

  return `
    <tr class="clickable" data-job-id="${escapeHtml(job.id)}">
      <td>
        <div class="table-role">
          <span class="row-avatar">${escapeHtml(initials(job.company_name))}</span>
          <div class="table-role-copy">
            <span class="table-role-title">${escapeHtml(job.job_title)}</span>
            <span class="table-role-company">${icon('building-2')} ${escapeHtml(job.company_name)}</span>
          </div>
        </div>
      </td>
      <td>${categoryTag(job.category)}</td>
      <td>
        <span class="location-cell">${icon('map-pin')} ${escapeHtml(job.city || job.location || '—')}</span>
        <span class="cell-sub">${escapeHtml(job.work_mode || 'Not specified')}</span>
      </td>
      <td>
        <span class="stipend-cell ${hasStipend ? '' : 'none'}">${escapeHtml(stipend)}</span>
      </td>
      <td>${sourceBadge(job.source, state.config.sourceLabels)}</td>
      <td>
        ${statusBadge(job.verification_status)}
        <div class="cell-sub" style="margin-top: 4px">${screeningBadge(job.screening_status)}</div>
      </td>
      <td>
        <span class="stipend-cell ${deadline.className ? 'deadline-urgent' : ''}">${escapeHtml(
          deadline.text,
        )}</span>
      </td>
      <td>
        <div class="flex gap-4" style="justify-content: flex-end">
          <button class="saved-btn ${saved ? 'is-saved' : ''}" type="button" data-save-job="${escapeHtml(
            job.id,
          )}" data-saved="${saved}" aria-label="${saved ? 'Remove from shortlist' : 'Save to shortlist'}" title="${
            saved ? 'Remove from shortlist' : 'Save to shortlist'
          }">${icon('bookmark')}</button>
          <button class="table-row-action" type="button" data-open-job="${escapeHtml(
            job.id,
          )}" aria-label="Open opportunity details" title="Open details">${icon('eye')}</button>
        </div>
      </td>
    </tr>
  `;
}

function renderTable() {
  if (!state.items.length) {
    renderEmpty();
    $('#jobs-pagination').html('');
    renderSummary();
    return;
  }

  $('#jobs-body').html(state.items.map(rowMarkup).join(''));
  $('#jobs-pagination').html(
    renderPagination(
      {
        page: state.pagination?.page || state.page,
        totalPages: state.pagination?.totalPages || 1,
        total: state.pagination?.total || state.items.length,
        limit: state.pagination?.limit || state.limit,
      },
      { label: 'opportunities' },
    ),
  );
  refreshIcons();
  renderSummary();
}

function renderError(error) {
  $('#jobs-body').html(
    `<tr><td colspan="8">${emptyState({
      iconName: 'circle-alert',
      title: 'The directory could not be loaded',
      text: describeError(error),
      actions: `<button class="btn btn-sm btn-secondary" type="button" data-retry-jobs>${icon(
        'refresh-cw',
      )} Try again</button>`,
    })}</td></tr>`,
  );
  $('#jobs-pagination').html('');
  refreshIcons();
}

async function loadJobs({ scroll = false, silent = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const requestId = ++state.requestId;

  if (!silent) {
    $('#jobs-body').html(
      `<tr><td colspan="8">${loadingState('Loading opportunities…')}</td></tr>`,
    );
    $('#jobs-pagination').html('');
  }

  try {
    const data = await http.get('/jobs', queryParams(), { timeout: 25_000 });
    if (requestId !== state.requestId) return;
    state.items = Array.isArray(data.items) ? data.items : [];
    state.pagination = data.pagination || null;
    renderTable();
    if (scroll) {
      document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    if (requestId !== state.requestId) return;
    renderError(error);
    toast({ type: 'error', title: 'Could not load opportunities', message: describeError(error) });
  } finally {
    if (requestId === state.requestId) state.loading = false;
  }
}

function applyFilters({ resetPage = true } = {}) {
  state.filters = readFilters();
  if (resetPage) state.page = 1;
  syncUrl();
  renderFilterChips();
  loadJobs();
}

function clearFilter(key) {
  const form = document.getElementById('jobs-filter-form');
  if (key === 'savedOnly') {
    const saved = document.getElementById('filter-saved');
    if (saved) saved.checked = false;
  } else if (key === 'screenedOnly') {
    const screened = document.getElementById('filter-screened');
    if (screened) screened.checked = false;
  } else {
    const field = form.elements[key];
    if (field) field.value = key === 'sort' ? 'created_at' : key === 'order' ? 'desc' : '';
  }
  applyFilters();
}

function resetFilters() {
  const form = document.getElementById('jobs-filter-form');
  form.reset();
  $('#job-search').val('');
  $('#filter-saved').prop('checked', false);
  $('#filter-screened').prop('checked', true);
  state.filters = readFilters();
  state.page = 1;
  syncUrl();
  renderFilterChips();
  loadJobs();
}

async function toggleSave(jobId, button) {
  const item = state.items.find((job) => job.id === jobId);
  if (!item) return;
  const restore = setButtonLoading(button, '');
  try {
    if (item.saved) {
      await http.delete(`/jobs/${jobId}/save`);
      item.saved = false;
      item.saved_by = [];
      toast({ type: 'info', title: 'Removed from shortlist', message: 'The opportunity is no longer saved.' });
    } else {
      await http.post(`/jobs/${jobId}/save`, { savedBy: getReviewerName(state.config) });
      item.saved = true;
      item.saved_by = [getReviewerName(state.config)];
      toast({ type: 'success', title: 'Saved for follow-up', message: 'The opportunity is on the committee shortlist.' });
    }
    if (state.filters.savedOnly && !item.saved) {
      state.items = state.items.filter((job) => job.id !== jobId);
    }
    renderTable();
    if (!state.items.length && state.filters.savedOnly) loadJobs();
  } catch (error) {
    toast({ type: 'error', title: 'Could not update shortlist', message: describeError(error) });
    restore();
  }
}

function openDetails(jobId) {
  openJobDrawer(jobId, {
    config: state.config,
    onChanged: () => loadJobs(),
  });
}

$(async () => {
  try {
    const { config } = await boot({ page: 'opportunities' });
    state.config = config;
    state.limit = Number(config.defaultPageSize || 20);
  } catch {
    return;
  }

  initFilters();
  readUrlState();
  state.filters = readFilters();
  if (state.filters.search) $('#job-search').val(state.filters.search);
  renderFilterChips();
  syncUrl();

  const debouncedSearch = debounce(() => applyFilters(), 380);
  $('#job-search').on('input', debouncedSearch);
  $('#jobs-filter-form').on('change', 'select, input[type="number"]', () => applyFilters());
  $('#filter-saved').on('change', () => applyFilters());
  $('#filter-screened').on('change', () => applyFilters());

  $('#clear-filters').on('click', resetFilters);
  $(document).on('click', '[data-reset-empty]', resetFilters);
  $(document).on('click', '[data-retry-jobs]', () => loadJobs());

  $('#active-filters').on('click', '[data-clear-filter]', function clearChip() {
    clearFilter($(this).data('clear-filter'));
  });

  $('#refresh-jobs').on('click', async function refresh() {
    const restore = setButtonLoading(this, 'Refreshing…');
    await loadJobs();
    restore();
    toast({ type: 'success', title: 'Directory refreshed', message: 'The latest committee records are shown.' });
  });

  $('#manual-add-button').on('click', () => {
    openManualJobModal({
      config: state.config,
      onCreated: () => loadJobs(),
    });
  });

  $('#jobs-pagination').on('click', '.page-btn[data-page]', function goToPage() {
    const page = Number($(this).data('page'));
    if (!Number.isInteger(page) || page < 1 || page === state.page) return;
    state.page = page;
    syncUrl();
    loadJobs({ scroll: true });
  });

  $('#jobs-body').on('click', '[data-open-job]', function open(event) {
    event.stopPropagation();
    openDetails($(this).data('open-job'));
  });

  $('#jobs-body').on('click', '[data-save-job]', function save(event) {
    event.stopPropagation();
    toggleSave($(this).data('save-job'), this);
  });

  $('#jobs-body').on('click', 'tr[data-job-id]', function openRow() {
    openDetails($(this).data('job-id'));
  });

  $('#jobs-body').on('keydown', 'tr[data-job-id]', function onKey(event) {
    if (event.target !== this) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openDetails($(this).data('job-id'));
  });

  await loadJobs();

  const requestedJob = new URLSearchParams(window.location.search).get('job');
  if (requestedJob) openDetails(requestedJob);
});

const refreshForRealtime = debounce(() => {
  if (state.config) loadJobs({ silent: true });
}, 1500);

window.addEventListener('ncr:jobs-changed', refreshForRealtime);
