import $ from 'jquery';
import { describeError, http } from '../api.js';
import { loadConfig, FALLBACK_CONFIG } from '../config.js';
import { getPrefs, savePrefs } from '../preferences.js';
import { boot, updateShellProfile } from '../shell.js';
import {
  escapeHtml,
  formatDateTime,
  formatNumber,
  icon,
  refreshIcons,
  relativeTime,
  setButtonLoading,
  toast,
} from '../ui.js';

const state = {
  config: null,
  status: null,
  prefs: null,
  locationOrder: [],
  focusCategories: new Set(),
  statusLoadedAt: null,
};

function setAlert(html = '') {
  $('#settings-alert').html(html);
  refreshIcons();
}

function initProfileForm() {
  const prefs = state.prefs;
  const roles = [...(state.config.userRoles || FALLBACK_CONFIG.userRoles)];
  if (prefs.role && !roles.includes(prefs.role)) roles.unshift(prefs.role);

  $('#settings-role').html(
    roles
      .map(
        (role) =>
          `<option value="${escapeHtml(role)}" ${role === prefs.role ? 'selected' : ''}>${escapeHtml(
            role,
          )}</option>`,
      )
      .join(''),
  );
  $('#settings-profile-name').val(prefs.profileName || '');
  $('#settings-reviewer').val(prefs.reviewerName || prefs.profileName || '');
}

function initPriorityList() {
  const element = document.getElementById('priority-list');
  if (!element) return;
  const locations = new Map((state.config.locations || []).map((location) => [location.city, location]));
  state.locationOrder = [...state.prefs.locationOrder];

  element.innerHTML = state.locationOrder
    .map((city, index) => {
      const location = locations.get(city) || { city, hubs: [] };
      const hubs = (location.hubs || []).slice(0, 3).join(' · ');
      return `
        <div class="priority-item" data-priority-city="${escapeHtml(city)}">
          <span class="priority-position">${index + 1}</span>
          <span class="priority-name">${escapeHtml(city)}${
            hubs ? `<span>${escapeHtml(hubs)}</span>` : ''
          }</span>
          <span class="priority-actions">
            <button class="priority-action" type="button" data-move-up="${escapeHtml(city)}" ${
              index === 0 ? 'disabled' : ''
            } aria-label="Move ${escapeHtml(city)} up">${icon('arrow-up')}</button>
            <button class="priority-action" type="button" data-move-down="${escapeHtml(city)}" ${
              index === state.locationOrder.length - 1 ? 'disabled' : ''
            } aria-label="Move ${escapeHtml(city)} down">${icon('arrow-down')}</button>
          </span>
        </div>
      `;
    })
    .join('');
  refreshIcons();
}

function moveCity(city, direction) {
  const index = state.locationOrder.indexOf(city);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.locationOrder.length) return;
  [state.locationOrder[index], state.locationOrder[target]] = [
    state.locationOrder[target],
    state.locationOrder[index],
  ];
  savePrefs({ locationOrder: state.locationOrder });
  state.prefs = { ...state.prefs, locationOrder: state.locationOrder };
  initPriorityList();
}

function initCategoryGrid() {
  const element = document.getElementById('category-focus-grid');
  if (!element) return;
  state.focusCategories = new Set(state.prefs.focusCategories);

  element.innerHTML = state.config.categories
    .map(
      (category) => `
        <label class="category-option ${state.focusCategories.has(category) ? 'selected' : ''}">
          <input type="checkbox" name="focusCategory" value="${escapeHtml(category)}" ${
            state.focusCategories.has(category) ? 'checked' : ''
          } />
          <span>${escapeHtml(category)}</span>
        </label>
      `,
    )
    .join('');

  updateCategoryCaption();
}

function updateCategoryCaption() {
  const total = state.config.categories.length;
  const selected = state.focusCategories.size;
  $('#category-focus-caption').text(
    selected === total ? 'All target categories highlighted' : `${selected} of ${total} categories highlighted`,
  );
}

function integrationRow({ iconName, tone, name, configured, meta, env }) {
  return `
    <div class="integration-item">
      <span class="integration-icon ${tone}">${icon(iconName)}</span>
      <span class="integration-copy">
        <span class="integration-name">
          ${escapeHtml(name)}
          <span class="config-badge ${configured ? 'ready' : 'missing'}">${
            configured ? 'Configured' : 'Not configured'
          }</span>
        </span>
        <span class="integration-meta">${escapeHtml(meta)}${env ? ` · <code>${escapeHtml(env)}</code>` : ''}</span>
      </span>
    </div>
  `;
}

function renderIntegrations() {
  const element = document.getElementById('integrations-list');
  if (!element) return;
  const api = state.status?.api || {};
  const configured = state.config.configured || {};
  const jsearch = api.jsearch || { configured: configured.jsearch, host: 'jsearch.p.rapidapi.com' };
  const adzuna = api.adzuna || { configured: configured.adzuna, country: 'in' };
  const gemini = api.gemini || { configured: configured.gemini, model: 'gemini-2.5-flash' };
  const supabase = api.supabase || { configured: configured.supabase };

  element.innerHTML = [
    integrationRow({
      iconName: 'search',
      tone: 'blue',
      name: 'JSearch',
      configured: Boolean(jsearch.configured),
      meta: jsearch.configured ? `Live source · host ${jsearch.host || 'jsearch'}` : 'Primary live discovery source',
      env: 'JSEARCH_API_KEY',
    }),
    integrationRow({
      iconName: 'globe',
      tone: 'navy',
      name: 'Adzuna',
      configured: Boolean(adzuna.configured),
      meta: adzuna.configured ? `Secondary source · country ${adzuna.country || 'in'}` : 'Optional secondary job source',
      env: 'ADZUNA_APP_ID + ADZUNA_APP_KEY',
    }),
    integrationRow({
      iconName: 'sparkles',
      tone: 'green',
      name: 'Gemini analysis',
      configured: Boolean(gemini.configured),
      meta: gemini.configured ? `Model ${gemini.model || 'gemini'}` : 'AI assistance for skills and red flags',
      env: 'GEMINI_API_KEY',
    }),
    integrationRow({
      iconName: 'database',
      tone: 'amber',
      name: 'Supabase PostgreSQL',
      configured: Boolean(supabase.configured),
      meta: supabase.configured ? 'Persistent managed database' : 'Currently using the local JSON development store',
      env: 'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    }),
  ].join('');
  refreshIcons();
}

function statusItem(label, value, className = '') {
  return `<div class="status-item"><span>${escapeHtml(label)}</span><strong class="${className}">${value}</strong></div>`;
}

function renderSystemStatus() {
  const status = state.status;
  if (!status) return;

  $('#system-status-caption').text(
    `Checked ${relativeTime(status.serverTime || new Date().toISOString())} · environment ${
      status.environment || 'development'
    }`,
  );
  $('#system-status-grid').html(
    [
      statusItem('Server environment', escapeHtml(status.environment || 'development')),
      statusItem('Database mode', escapeHtml(status.databaseLabel || status.databaseMode || '—')),
      statusItem('Authentication', status.authRequired ? 'Password gate enabled' : 'Development session'),
      statusItem('Server time', escapeHtml(formatDateTime(status.serverTime))),
      statusItem(
        'Discovery quota',
        `${formatNumber(status.limits?.searchesUsed || 0)} / ${formatNumber(
          status.limits?.discoveryDaily || 0,
        )} used`,
      ),
      statusItem('Directory records', formatNumber(status.summary?.jobs || 0)),
      statusItem('Companies indexed', formatNumber(status.summary?.companies || 0)),
      statusItem(
        'Last discovery',
        escapeHtml(status.summary?.lastDiscoveryAt ? relativeTime(status.summary.lastDiscoveryAt) : 'No searches yet'),
      ),
    ].join(''),
  );

  $('#data-summary').html(
    [
      statusItem('Directory records', formatNumber(status.summary?.jobs || 0)),
      statusItem('Analyses stored', formatNumber(status.summary?.analyses || 0)),
      statusItem(
        'Searches (24h)',
        `${formatNumber(status.limits?.searchesUsed || 0)} / ${formatNumber(
          status.limits?.discoveryDaily || 0,
        )}`,
      ),
      statusItem(
        'Last discovery',
        escapeHtml(status.summary?.lastDiscoveryAt ? relativeTime(status.summary.lastDiscoveryAt) : 'None'),
      ),
    ].join(''),
  );

  $('#security-auth-mode').text(
    status.authRequired ? 'Committee password required' : 'Development mode (APP_PASSWORD not set)',
  );

  if (status.persistenceWarning) {
    $('#maintenance-note').html(`${icon('triangle-alert')} ${escapeHtml(status.persistenceWarning)}`);
  } else {
    $('#maintenance-note').html(
      `${icon('circle-check-big')} ${escapeHtml(
        status.databaseMode === 'supabase'
          ? 'Records are stored in Supabase PostgreSQL.'
          : 'Local persistence is active for development.',
      )}`,
    );
  }
  refreshIcons();
}

async function loadStatus({ silent = false } = {}) {
  try {
    state.status = await http.get('/system/status', null, { timeout: 20_000 });
    state.statusLoadedAt = new Date();
    renderIntegrations();
    renderSystemStatus();
  } catch (error) {
    if (!silent) {
      setAlert(
        `<div class="callout callout-danger">${icon('circle-alert')}<div>System status is unavailable: ${escapeHtml(
          describeError(error),
        )}</div></div>`,
      );
    }
  }
}

async function refreshIntegrations() {
  const button = document.getElementById('refresh-integrations');
  const restore = setButtonLoading(button, '');
  try {
    state.config = await loadConfig({ force: true });
    await loadStatus();
    toast({ type: 'success', title: 'Integrations refreshed', message: 'Runtime configuration was re-read from the API.' });
  } catch (error) {
    toast({ type: 'error', title: 'Could not refresh integrations', message: describeError(error) });
  } finally {
    restore();
  }
}

async function reindexCompanies(button) {
  const restore = setButtonLoading(button, 'Rebuilding…');
  try {
    const data = await http.post('/system/reindex-companies', null, { timeout: 60_000 });
    toast({
      type: 'success',
      title: 'Company index rebuilt',
      message: data.message || `${data.companies || 0} companies linked.`,
    });
    await loadStatus({ silent: true });
  } catch (error) {
    toast({ type: 'error', title: 'Index rebuild failed', message: describeError(error), timeout: 7000 });
  } finally {
    restore();
  }
}

async function analyzePending(button) {
  if (!state.config.configured?.gemini) {
    toast({
      type: 'warning',
      title: 'Gemini is not configured',
      message: 'Add GEMINI_API_KEY to the backend environment and restart the API.',
    });
    return;
  }
  const restore = setButtonLoading(button, 'Analyzing…');
  try {
    const data = await http.post('/jobs/analyze-pending', { limit: 3 }, { timeout: 120_000 });
    toast({
      type: data.analyzed ? 'success' : 'info',
      title: 'Analysis batch complete',
      message: `${data.analyzed || 0} of ${data.processed || 0} processed records were analysed.`,
    });
    await loadStatus({ silent: true });
  } catch (error) {
    toast({ type: 'error', title: 'Analysis batch failed', message: describeError(error), timeout: 7000 });
  } finally {
    restore();
  }
}

$(async () => {
  try {
    const { config } = await boot({ page: 'settings' });
    state.config = config;
    state.prefs = getPrefs(config);
  } catch {
    return;
  }

  initProfileForm();
  initPriorityList();
  initCategoryGrid();
  renderIntegrations();

  $('#profile-form').on('submit', (event) => {
    event.preventDefault();
    const profileName = String($('#settings-profile-name').val() || '').trim();
    const role = String($('#settings-role').val() || '').trim();
    const reviewerName = String($('#settings-reviewer').val() || '').trim() || profileName;

    if (profileName.length < 2) {
      toast({ type: 'warning', title: 'Display name required', message: 'Use at least two characters so review records are attributable.' });
      $('#settings-profile-name').trigger('focus');
      return;
    }

    savePrefs({ profileName, role, reviewerName: reviewerName || 'Placement Committee' });
    state.prefs = getPrefs(state.config);
    updateShellProfile({ name: profileName, role });
    toast({ type: 'success', title: 'Profile saved', message: 'Review attribution and report credits now use this profile.' });
  });

  $('#priority-list').on('click', '[data-move-up]', function moveUp() {
    moveCity($(this).data('move-up'), -1);
  });
  $('#priority-list').on('click', '[data-move-down]', function moveDown() {
    moveCity($(this).data('move-down'), 1);
  });

  $('#reset-priority').on('click', () => {
    state.locationOrder = [...state.config.cities];
    savePrefs({ locationOrder: state.locationOrder });
    state.prefs = { ...state.prefs, locationOrder: state.locationOrder };
    initPriorityList();
    toast({ type: 'info', title: 'Priority order restored', message: 'Discovery now follows Gurugram → Noida → Delhi → Faridabad.' });
  });

  $('#category-focus-grid').on('change', 'input[name="focusCategory"]', function onFocus() {
    if (this.checked) state.focusCategories.add(this.value);
    else state.focusCategories.delete(this.value);
    $(this).closest('.category-option').toggleClass('selected', this.checked);
    savePrefs({ focusCategories: [...state.focusCategories] });
    state.prefs = { ...state.prefs, focusCategories: [...state.focusCategories] };
    updateCategoryCaption();
  });

  $('#reset-categories').on('click', () => {
    state.focusCategories = new Set(state.config.categories);
    savePrefs({ focusCategories: [...state.focusCategories] });
    state.prefs = { ...state.prefs, focusCategories: [...state.focusCategories] };
    initCategoryGrid();
    toast({ type: 'info', title: 'All categories selected', message: 'Every target category is highlighted again.' });
  });

  $('#refresh-integrations').on('click', refreshIntegrations);

  $('#refresh-system-status').on('click', async function refreshStatus() {
    const restore = setButtonLoading(this, '');
    await loadStatus();
    restore();
  });

  $('#refresh-settings').on('click', async function refreshAll() {
    const restore = setButtonLoading(this, 'Refreshing…');
    state.config = await loadConfig({ force: true });
    await loadStatus();
    restore();
    toast({ type: 'success', title: 'Settings refreshed', message: 'Integration and runtime status are up to date.' });
  });

  $('#reindex-companies-settings').on('click', function reindex() {
    reindexCompanies(this);
  });

  $('#analyze-pending').on('click', function analyze() {
    analyzePending(this);
  });

  await loadStatus({ silent: true });
});
