import $ from 'jquery';
import '@fontsource-variable/inter';
import { clearToken, describeError, getToken, http, setToken } from './api.js';
import { loadConfig } from './config.js';
import { getPrefs, getProfile, savePrefs } from './preferences.js';
import { escapeHtml, icon, initials, refreshIcons, setButtonLoading, showConnectionError } from './ui.js';

const NAV_PRIMARY = [
  { key: 'dashboard', label: 'Dashboard', href: '/', icon: 'layout-dashboard' },
  { key: 'discover', label: 'Discover Jobs', href: '/discover.html', icon: 'search' },
  { key: 'opportunities', label: 'All Opportunities', href: '/opportunities.html', icon: 'briefcase-business' },
  {
    key: 'verification',
    label: 'Verification Centre',
    href: '/verification.html',
    icon: 'shield-check',
    count: true,
  },
  { key: 'companies', label: 'Companies', href: '/companies.html', icon: 'building-2' },
  { key: 'reports', label: 'Reports', href: '/reports.html', icon: 'file-bar-chart' },
];

const NAV_SYSTEM = [{ key: 'settings', label: 'Settings', href: '/settings.html', icon: 'settings' }];

const state = {
  page: 'dashboard',
  me: null,
  config: null,
  profile: { name: 'Placement Committee', role: 'Placement Committee' },
  authRequired: false,
};

let loginPromise = null;

function pageTitleFor(page) {
  return [...NAV_PRIMARY, ...NAV_SYSTEM].find((item) => item.key === page)?.label || 'Workspace';
}

function renderSidebar(page) {
  const sidebar = document.getElementById('app-sidebar');
  if (!sidebar) return;

  const link = (item) => `
    <a class="nav-link ${item.key === page ? 'active' : ''}" href="${item.href}" ${
      item.key === page ? 'aria-current="page"' : ''
    }>
      ${icon(item.icon)}
      <span class="nav-label">${escapeHtml(item.label)}</span>
      ${item.count ? '<span class="nav-count" data-nav-count="verification" hidden></span>' : ''}
    </a>
  `;

  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-mark">${icon('briefcase-business')}</div>
      <div class="brand-copy">
        <div class="brand-name">NCR Internship Finder</div>
        <div class="brand-tagline">Placement Committee</div>
      </div>
    </div>
    <nav class="sidebar-nav" aria-label="Primary navigation">
      <div class="nav-section">
        <div class="nav-label">Workspace</div>
        ${NAV_PRIMARY.map(link).join('')}
      </div>
      <div class="nav-section">
        <div class="nav-label">System</div>
        ${NAV_SYSTEM.map(link).join('')}
      </div>
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-insight">
        <div class="sidebar-insight-title">${icon('target')} Verification target</div>
        <p class="sidebar-insight-text" data-sidebar-progress>Loading target progress…</p>
        <div class="progress-track" style="margin-top: 9px; background: rgba(255, 255, 255, 0.12)">
          <div class="progress-fill success" data-sidebar-progress-bar style="width: 0%"></div>
        </div>
      </div>
      <div class="sidebar-version">v1.0 · <span data-sidebar-mode>Local store</span></div>
    </div>
  `;
}

function renderTopbar(page) {
  const topbar = document.getElementById('app-topbar');
  if (!topbar) return;

  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  topbar.innerHTML = `
    <div class="topbar-inner">
      <button class="btn btn-icon btn-ghost mobile-menu-btn" type="button" data-sidebar-toggle aria-label="Open navigation" aria-expanded="false">
        ${icon('menu')}
      </button>
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="/">Workspace</a>
        ${icon('chevron-right')}
        <span class="breadcrumb-current">${escapeHtml(pageTitleFor(page))}</span>
      </nav>
      <div class="topbar-spacer"></div>
      <div class="topbar-date">${icon('calendar-days')} ${escapeHtml(today)}</div>
      <div class="topbar-divider"></div>
      <div class="profile-wrap">
        <button class="profile-trigger" type="button" data-profile-trigger aria-haspopup="menu" aria-expanded="false">
          <span class="avatar" data-profile-avatar>${escapeHtml(initials(state.profile.name))}</span>
          <span class="profile-copy">
            <span class="profile-name" data-profile-name>${escapeHtml(state.profile.name)}</span>
            <span class="profile-role" data-profile-role>${escapeHtml(state.profile.role)}</span>
          </span>
          ${icon('chevron-down')}
        </button>
        <div class="profile-menu" data-profile-menu role="menu">
          <div class="profile-menu-header">
            <div class="profile-menu-name" data-profile-menu-name>${escapeHtml(state.profile.name)}</div>
            <div class="profile-menu-meta" data-profile-menu-meta>${escapeHtml(
              state.authRequired ? 'Committee session' : 'Development session',
            )}</div>
          </div>
          <a class="profile-menu-item" href="/settings.html" role="menuitem">${icon('settings')} Committee settings</a>
          <a class="profile-menu-item" href="/verification.html" role="menuitem">${icon('shield-check')} Verification centre</a>
          ${
            state.authRequired
              ? `<button class="profile-menu-item danger" type="button" data-signout role="menuitem">${icon(
                  'log-out',
                )} Sign out</button>`
              : ''
          }
        </div>
      </div>
    </div>
  `;
}

function openSidebar() {
  document.getElementById('app-sidebar')?.classList.add('open');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.classList.add('visible');
  }
  document.body.classList.add('no-scroll');
  $('[data-sidebar-toggle]').attr('aria-expanded', 'true');
}

function closeSidebar() {
  document.getElementById('app-sidebar')?.classList.remove('open');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) {
    backdrop.classList.remove('visible');
    backdrop.hidden = true;
  }
  document.body.classList.remove('no-scroll');
  $('[data-sidebar-toggle]').attr('aria-expanded', 'false');
}

function bindShell() {
  $(document).on('click', '[data-sidebar-toggle]', () => {
    const isOpen = document.getElementById('app-sidebar')?.classList.contains('open');
    if (isOpen) closeSidebar();
    else openSidebar();
  });

  $('#sidebar-backdrop').on('click', closeSidebar);
  $(document).on('click', '.sidebar-nav a', () => {
    if (window.matchMedia('(max-width: 1024px)').matches) closeSidebar();
  });

  $(document).on('click', '[data-profile-trigger]', (event) => {
    event.stopPropagation();
    const menu = document.querySelector('[data-profile-menu]');
    const trigger = document.querySelector('[data-profile-trigger]');
    const isOpen = menu?.classList.toggle('open');
    trigger?.setAttribute('aria-expanded', String(Boolean(isOpen)));
  });

  $(document).on('click', (event) => {
    if ($(event.target).closest('.profile-wrap').length) return;
    $('[data-profile-menu]').removeClass('open');
    $('[data-profile-trigger]').attr('aria-expanded', 'false');
  });

  $(document).on('click', '[data-signout]', async () => {
    try {
      await http.post('/auth/logout');
    } catch {
      // Clearing the browser token is sufficient for a stateless session.
    }
    clearToken();
    window.location.reload();
  });

  $(document).on('keydown', (event) => {
    if (event.key !== 'Escape') return;
    $('[data-profile-menu]').removeClass('open');
    $('[data-profile-trigger]').attr('aria-expanded', 'false');
    if (document.getElementById('app-sidebar')?.classList.contains('open')) closeSidebar();
  });

  window.addEventListener('ncr:unauthorized', () => {
    clearToken();
    showLoginOverlay({ reloadOnSuccess: true });
  });
}

export function setNavCount(key, count) {
  const element = document.querySelector(`[data-nav-count="${key}"]`);
  if (!element) return;
  const value = Math.max(0, Number(count) || 0);
  element.textContent = value > 99 ? '99+' : String(value);
  element.hidden = value === 0;
}

export function updateShellProfile(profile = {}) {
  const next = getProfile(state.config || undefined);
  state.profile = { ...state.profile, ...next, ...profile };
  $('[data-profile-name]').text(state.profile.name);
  $('[data-profile-role]').text(state.profile.role);
  $('[data-profile-avatar]').text(initials(state.profile.name));
  $('[data-profile-menu-name]').text(state.profile.name);
  $('[data-profile-menu-meta]').text(
    state.authRequired ? 'Committee session' : 'Development session',
  );
}

async function syncSidebarSummary() {
  try {
    const data = await http.get('/dashboard', { scope: 'all' }, { timeout: 20_000 });
    const queue = Number(data?.stats?.pendingVerification || 0) + Number(data?.stats?.needsReview || 0);
    setNavCount('verification', queue);

    const verified = Number(data?.stats?.verifiedActive || 0);
    const target = Number(data?.stats?.targetTotal || 20);
    const percent = Math.max(0, Math.min(100, Math.round((verified / target) * 100)));
    $('[data-sidebar-progress]').text(`${verified} of ${target} verified active opportunities`);
    $('[data-sidebar-progress-bar]').css('width', `${percent}%`);
    const footerCount = document.getElementById('footer-verified-count');
    if (footerCount) footerCount.textContent = String(verified);
  } catch {
    $('[data-sidebar-progress]').text('Target progress unavailable');
  }
}

function loginMarkup(prefillName = '') {
  return `
    <div class="auth-overlay">
      <section class="auth-brand-panel">
        <div class="auth-brand">
          <div class="brand-mark">${icon('briefcase-business')}</div>
          <div>
            <div class="auth-brand-name">NCR Tech Internship Finder</div>
            <div class="auth-brand-sub">Placement Committee Workspace</div>
          </div>
        </div>
        <div class="auth-hero">
          <span class="auth-kicker">${icon('shield-check')} Verified-first sourcing</span>
          <h1>Find, verify, and report<br><span>NCR internships</span> with confidence.</h1>
          <p>One operating system for the placement committee: priority-city discovery, a human verification gate, and reports that are ready for the department.</p>
          <div class="auth-points">
            <div class="auth-point">
              <span class="auth-point-icon">${icon('map-pin')}</span>
              <div><strong>Gurugram-first coverage.</strong> Search Gurugram, Noida, Delhi, and Faridabad separately with the committee's 16 target keywords.</div>
            </div>
            <div class="auth-point">
              <span class="auth-point-icon">${icon('shield-check')}</span>
              <div><strong>No auto-verification.</strong> Live API results enter the queue as pending. Only committee-verified active roles count toward the target.</div>
            </div>
            <div class="auth-point">
              <span class="auth-point-icon">${icon('file-bar-chart')}</span>
              <div><strong>Committee-ready reports.</strong> Generate verified opportunity workbooks and PDF summaries without exposing API keys to the browser.</div>
            </div>
          </div>
        </div>
        <div class="auth-brand-footer">${icon('lock')} Data, secrets, and review trails stay on the server.</div>
      </section>
      <section class="auth-form-panel">
        <div class="auth-card">
          <div class="auth-mobile-brand">
            <div class="brand-mark">${icon('briefcase-business')}</div>
            <div>
              <div class="auth-mobile-brand-name">NCR Internship Finder</div>
              <div class="auth-mobile-brand-sub">Placement Committee</div>
            </div>
          </div>
          <h1 class="auth-title">Sign in to the workspace</h1>
          <p class="auth-subtitle">Use the committee password configured on the API server. Verification decisions are recorded against your name.</p>
          <form class="auth-form" id="login-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="login-name">Your name <span class="optional">For review records</span></label>
              <input class="input" id="login-name" name="name" type="text" maxlength="120" autocomplete="name" placeholder="e.g., Dr. Meera Sharma" value="${escapeHtml(prefillName)}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="login-password">Committee password</label>
              <input class="input" id="login-password" name="password" type="password" maxlength="500" autocomplete="current-password" placeholder="Enter the shared password" required />
            </div>
            <div class="auth-error" id="login-error" role="alert" hidden></div>
            <button class="btn btn-primary btn-block" type="submit" data-login-submit>
              Sign in ${icon('arrow-right')}
            </button>
          </form>
          <div class="auth-note">${icon('key-round')} API keys are read only by the backend. The browser receives committee data, never provider secrets.</div>
          <div class="auth-footer">NCR Tech Internship Finder · Placement Committee</div>
        </div>
      </section>
    </div>
  `;
}

export function showLoginOverlay({ reloadOnSuccess = false } = {}) {
  if (loginPromise) return loginPromise;

  const root = document.getElementById('auth-root');
  if (!root) return Promise.resolve(null);

  const config = state.config || { cities: [], categories: [] };
  const prefs = getPrefs(config);
  root.innerHTML = loginMarkup(prefs.profileName || '');

  loginPromise = new Promise((resolve) => {
    const form = document.getElementById('login-form');
    const errorBox = document.getElementById('login-error');
    const submit = form?.querySelector('[data-login-submit]');
    const passwordField = document.getElementById('login-password');

    window.setTimeout(() => passwordField?.focus(), 60);

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      const name = String(form.elements.name?.value || '').trim();
      const password = String(form.elements.password?.value || '');
      if (!password) {
        errorBox.innerHTML = `${icon('circle-alert')} Enter the committee password to continue.`;
        errorBox.hidden = false;
        refreshIcons();
        passwordField?.focus();
        return;
      }

      const restore = setButtonLoading(submit, 'Signing in…');
      try {
        const data = await http.post('/auth/login', { name, password }, { timeout: 15_000 });
        setToken(data.token || '');
        if (name && !prefs.profileName) savePrefs({ profileName: name });
        state.me = { ...state.me, authenticated: true, name: name || data.name || 'Committee Member' };
        state.profile = {
          ...state.profile,
          name: state.profile.name === 'Placement Committee' && name ? name : state.profile.name,
        };
        root.innerHTML = '';
        loginPromise = null;
        resolve(data);
        if (reloadOnSuccess) window.location.reload();
      } catch (error) {
        errorBox.innerHTML = `${icon('circle-alert')} ${escapeHtml(describeError(error))}`;
        errorBox.hidden = false;
        refreshIcons();
        restore();
        passwordField?.focus();
        passwordField?.select();
      }
    });

    refreshIcons();
  });

  return loginPromise;
}

export async function boot({ page = 'dashboard' } = {}) {
  state.page = page;
  document.body.dataset.page = page;

  let me;
  try {
    me = await http.get('/auth/me', null, { timeout: 12_000 });
  } catch (error) {
    if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT' || !error.status) {
      showConnectionError({ onRetry: () => window.location.reload() });
    }
    throw error;
  }

  state.me = me;
  state.authRequired = Boolean(me?.authRequired);

  if (state.authRequired && !me?.authenticated) {
    await showLoginOverlay();
  }

  const config = await loadConfig();
  state.config = config;
  state.profile = getProfile(config);
  if (!getToken() && state.authRequired) {
    await showLoginOverlay();
  }

  renderSidebar(page);
  renderTopbar(page);
  bindShell();

  const mode = config.configured?.supabase ? 'Supabase' : 'Local store';
  const modeElement = document.querySelector('[data-sidebar-mode]');
  if (modeElement) modeElement.textContent = mode;

  refreshIcons();
  syncSidebarSummary();
  return { me: state.me, config, profile: state.profile };
}

export function getShellState() {
  return state;
}
