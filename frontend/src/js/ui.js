import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Bookmark,
  Briefcase,
  BriefcaseBusiness,
  Building,
  Building2,
  Calendar,
  CalendarDays,
  ChartColumn,
  ChartPie,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheckBig,
  CircleDot,
  CircleHelp,
  CircleSlash,
  CircleX,
  ClipboardCheck,
  Clock,
  Cloud,
  CloudOff,
  Coins,
  Copy,
  Database,
  DatabaseZap,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  FileBarChart,
  FileCheck,
  FileCheck2,
  FileDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  Filter,
  Fingerprint,
  Globe,
  GraduationCap,
  History,
  House,
  Inbox,
  Info,
  KeyRound,
  LayoutDashboard,
  Link,
  ListChecks,
  ListFilter,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MapPinned,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  PenLine,
  Percent,
  Phone,
  Plug,
  Plus,
  RefreshCcw,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Server,
  Settings,
  Sheet,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Upload,
  User,
  UserRound,
  Users,
  WandSparkles,
  X,
  Zap,
} from 'lucide';

import { createIcons } from 'lucide';

const ICONS = {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Bookmark,
  Briefcase,
  BriefcaseBusiness,
  Building,
  Building2,
  Calendar,
  CalendarDays,
  ChartColumn,
  ChartPie,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheckBig,
  CircleDot,
  CircleHelp,
  CircleSlash,
  CircleX,
  ClipboardCheck,
  Clock,
  Cloud,
  CloudOff,
  Coins,
  Copy,
  Database,
  DatabaseZap,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  FileBarChart,
  FileCheck,
  FileCheck2,
  FileDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  Filter,
  Fingerprint,
  Globe,
  GraduationCap,
  History,
  House,
  Inbox,
  Info,
  KeyRound,
  LayoutDashboard,
  Link,
  ListChecks,
  ListFilter,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MapPinned,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  PenLine,
  Percent,
  Phone,
  Plug,
  Plus,
  RefreshCcw,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Server,
  Settings,
  Sheet,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Upload,
  User,
  UserRound,
  Users,
  WandSparkles,
  X,
  Zap,
};

const STATUS_META = {
  pending: { label: 'Pending', className: 'badge-pending', tone: 'amber' },
  verified_active: { label: 'Verified active', className: 'badge-verified', tone: 'green' },
  needs_review: { label: 'Needs review', className: 'badge-review', tone: 'amber' },
  expired: { label: 'Expired', className: 'badge-expired', tone: 'red' },
  rejected: { label: 'Rejected', className: 'badge-rejected', tone: 'red' },
};

const SOURCE_LABELS = { jsearch: 'JSearch', adzuna: 'Adzuna', manual: 'Manual' };
const SOURCE_MARKS = { jsearch: 'J', adzuna: 'A', manual: 'M' };

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const numberFormatter = new Intl.NumberFormat('en-IN');

const modalRoot = () => document.getElementById('modal-root') || document.body;
const drawerRoot = () => document.getElementById('drawer-root') || document.body;

let scrollLocks = 0;
function lockScroll() {
  scrollLocks += 1;
  document.body.classList.add('no-scroll');
}
function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.classList.remove('no-scroll');
}

export function refreshIcons() {
  createIcons({ icons: ICONS });
}

export function icon(name, className = '') {
  const pascal = String(name)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  if (!ICONS[pascal]) {
    console.warn(`Icon "${name}" is not registered in the icon bundle.`);
    return '';
  }
  return `<i data-lucide="${name}"${className ? ` class="${className}"` : ''} aria-hidden="true"></i>`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function safeExternalLink(value, label, className = '') {
  const url = safeUrl(value);
  if (!url) return escapeHtml(label || 'Not available');
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"${
    className ? ` class="${escapeHtml(className)}"` : ''
  }>${label}</a>`;
}

export function initials(name, fallback = 'NC') {
  const words = String(name || '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return fallback;
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

export function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? numberFormatter.format(number) : '0';
}

export function formatDate(value, { withTime = false } = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return (withTime ? dateTimeFormatter : dateFormatter).format(date);
}

export function formatDateTime(value) {
  return formatDate(value, { withTime: true });
}

export function relativeTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const future = seconds > 0;
  const absolute = Math.abs(seconds);

  if (absolute < 60) return future ? 'In a moment' : 'Just now';
  if (absolute < 3600) {
    const minutes = Math.round(absolute / 60);
    return future ? `In ${minutes} min` : `${minutes} min ago`;
  }
  if (absolute < 86_400) {
    const hours = Math.round(absolute / 3600);
    return future ? `In ${hours} hr` : `${hours} hr ago`;
  }
  if (absolute < 172_800) return future ? 'Tomorrow' : 'Yesterday';
  if (absolute < 604_800) {
    const days = Math.round(absolute / 86_400);
    return future ? `In ${days} days` : `${days} days ago`;
  }
  return formatDate(value);
}

export function deadlineInfo(value) {
  if (!value) return { text: 'No deadline', className: '', days: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { text: 'No deadline', className: '', days: null };
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `Closed ${formatDate(value)}`, className: 'deadline-urgent', days };
  if (days === 0) return { text: 'Closes today', className: 'deadline-urgent', days };
  if (days === 1) return { text: 'Closes tomorrow', className: 'deadline-urgent', days };
  if (days <= 7) return { text: `${days} days left`, className: 'deadline-urgent', days };
  return { text: formatDate(value), className: '', days };
}

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Unknown', className: 'badge-neutral', tone: 'slate' };
}

export function statusBadge(status, { dot = true } = {}) {
  const meta = statusMeta(status);
  return `<span class="badge ${meta.className}">${dot ? '<span class="badge-dot"></span>' : ''}${escapeHtml(meta.label)}</span>`;
}

const SCREENING_META = {
  passed: { label: 'Link verified', className: 'badge-verified', iconName: 'link' },
  review: { label: 'Link review', className: 'badge-review', iconName: 'triangle-alert' },
  failed: { label: 'Link failed', className: 'badge-expired', iconName: 'link-2-off' },
  pending: { label: 'Link pending', className: 'badge-pending', iconName: 'clock' },
};

export function screeningBadge(status, { withIcon = true } = {}) {
  const meta = SCREENING_META[status] || SCREENING_META.pending;
  return `<span class="badge ${meta.className}" title="Automated application link screening">${
    withIcon ? icon(meta.iconName) : ''
  }${escapeHtml(meta.label)}</span>`;
}

export function sourceBadge(source, labels = SOURCE_LABELS) {
  const key = String(source || 'manual');
  return `<span class="badge badge-source ${escapeHtml(key)}"><span class="source-mark">${
    SOURCE_MARKS[key] || 'S'
  }</span>${escapeHtml(labels[key] || key)}</span>`;
}

export function categoryTag(category, className = 'tag-navy') {
  return `<span class="tag ${className}">${escapeHtml(category || 'Uncategorized')}</span>`;
}

export function stipendText(job = {}) {
  if (job.stipend) return job.stipend;
  if (job.stipend_min && job.stipend_max) {
    return `₹${formatNumber(job.stipend_min)}–${formatNumber(job.stipend_max)}`;
  }
  if (job.stipend_min) return `From ₹${formatNumber(job.stipend_min)}`;
  return 'Not disclosed';
}

export function relevanceMeta(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  if (value >= 75) return { className: 'high', label: `${Math.round(value)}% match` };
  if (value >= 50) return { className: 'medium', label: `${Math.round(value)}% match` };
  return { className: 'low', label: `${Math.round(value)}% match` };
}

export function truncate(value, max = 160) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function toast({ type = 'success', title, message = '', timeout = 5200 } = {}) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;

  const iconNames = {
    success: 'circle-check-big',
    error: 'circle-x',
    warning: 'triangle-alert',
    info: 'info',
  };
  const titles = {
    success: 'Done',
    error: 'Something went wrong',
    warning: 'Heads up',
    info: 'Information',
  };

  const element = document.createElement('div');
  element.className = `toast toast-${type}`;
  element.setAttribute('role', type === 'error' ? 'alert' : 'status');
  element.innerHTML = `
    <span class="toast-icon">${icon(iconNames[type] || 'info')}</span>
    <div class="toast-copy">
      <div class="toast-title">${escapeHtml(title || titles[type] || 'Notice')}</div>
      ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
    </div>
    <button class="toast-close" type="button" aria-label="Dismiss notification">${icon('x')}</button>
  `;

  const remove = () => {
    if (!element.isConnected || element.classList.contains('removing')) return;
    element.classList.add('removing');
    window.setTimeout(() => element.remove(), 180);
  };

  element.querySelector('.toast-close')?.addEventListener('click', remove);
  stack.appendChild(element);
  refreshIcons();
  if (timeout > 0) window.setTimeout(remove, timeout);
  return remove;
}

export function setButtonLoading(button, label = 'Working…') {
  const element = typeof button === 'string' ? document.querySelector(button) : button;
  if (!element) return () => {};
  const original = element.innerHTML;
  element.disabled = true;
  element.setAttribute('aria-busy', 'true');
  element.innerHTML = `<span class="spinner"></span>${escapeHtml(label)}`;
  return () => {
    element.disabled = false;
    element.removeAttribute('aria-busy');
    element.innerHTML = original;
    refreshIcons();
  };
}

export function renderPagination(pagination, { label = 'items' } = {}) {
  const page = Number(pagination?.page || 1);
  const totalPages = Math.max(1, Number(pagination?.totalPages || 1));
  const total = Number(pagination?.total || 0);
  const limit = Number(pagination?.limit || 20);
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);

  const pages = [];
  for (let index = 1; index <= totalPages; index += 1) {
    if (index === 1 || index === totalPages || Math.abs(index - page) <= 1) pages.push(index);
    else if (pages.at(-1) !== '…') pages.push('…');
  }

  return `
    <div class="pagination">
      <div class="pagination-info">Showing <strong>${start}–${end}</strong> of <strong>${formatNumber(
        total,
      )}</strong> ${escapeHtml(label)}</div>
      <div class="pagination-controls">
        <button class="page-btn" type="button" data-page="${page - 1}" ${
          page <= 1 ? 'disabled' : ''
        } aria-label="Previous page">${icon('chevron-left')}</button>
        ${pages
          .map((value) =>
            value === '…'
              ? '<span class="page-btn" aria-hidden="true">…</span>'
              : `<button class="page-btn ${value === page ? 'active' : ''}" type="button" data-page="${value}" ${
                  value === page ? 'aria-current="page"' : ''
                }>${value}</button>`,
          )
          .join('')}
        <button class="page-btn" type="button" data-page="${page + 1}" ${
          page >= totalPages ? 'disabled' : ''
        } aria-label="Next page">${icon('chevron-right')}</button>
      </div>
    </div>
  `;
}

export function emptyState({ iconName = 'inbox', title, text = '', actions = '', compact = false }) {
  return `
    <div class="empty-state ${compact ? 'compact' : ''}">
      <div class="empty-icon">${icon(iconName)}</div>
      <div class="empty-title">${escapeHtml(title)}</div>
      ${text ? `<p class="empty-text">${escapeHtml(text)}</p>` : ''}
      ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
    </div>
  `;
}

export function loadingState(label = 'Loading data…') {
  return `<div class="loading-state"><span class="spinner"></span><span>${escapeHtml(label)}</span></div>`;
}

export function tableSkeleton(rows = 5, columns = 6) {
  return Array.from({ length: rows })
    .map(
      () => `
      <tr class="skeleton-row">
        <td colspan="${columns}">
          <div class="flex gap-10">
            <div class="skeleton skeleton-avatar"></div>
            <div class="skeleton-lines">
              <div class="skeleton skeleton-text skeleton-40"></div>
              <div class="skeleton skeleton-text skeleton-70"></div>
            </div>
          </div>
        </td>
      </tr>`,
    )
    .join('');
}

export function errorCallout(message, { tone = 'danger', title = '' } = {}) {
  return `<div class="callout callout-${tone}">${icon(
    tone === 'warning' ? 'triangle-alert' : tone === 'info' ? 'info' : 'circle-alert',
  )}<div>${title ? `<strong>${escapeHtml(title)}</strong><br>` : ''}${escapeHtml(message)}</div></div>`;
}

export function openModal({
  title,
  description = '',
  body = '',
  footer = '',
  className = '',
  onClose = null,
  onMount = null,
} = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = `modal ${className}`.trim();
  const titleId = `modal-title-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.innerHTML = `
    <div class="modal-shell">
      <div class="modal-header">
        <div>
          <div class="modal-title" id="${titleId}">${escapeHtml(title || '')}</div>
          ${description ? `<div class="modal-description">${escapeHtml(description)}</div>` : ''}
        </div>
        <button class="btn btn-icon btn-ghost" type="button" data-close-modal aria-label="Close dialog">${icon(
          'x',
        )}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  modalRoot().appendChild(dialog);
  lockScroll();

  const close = () => {
    if (!dialog.open) return;
    dialog.close();
  };

  dialog.querySelector('[data-close-modal]')?.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', () => {
    unlockScroll();
    dialog.remove();
    onClose?.();
  });

  dialog.showModal();
  refreshIcons();

  const api = {
    dialog,
    body: dialog.querySelector('.modal-body'),
    footer: dialog.querySelector('.modal-footer'),
    close,
  };
  onMount?.(api);
  return api;
}

export function confirmDialog({
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  confirmClass = 'btn-danger',
} = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal confirm-modal';
    dialog.innerHTML = `
      <form method="dialog" class="confirm-shell">
        <div class="confirm-icon ${tone === 'warning' ? 'warning' : ''}">${icon(
          tone === 'warning' ? 'triangle-alert' : 'circle-alert',
        )}</div>
        <div class="confirm-title">${escapeHtml(title)}</div>
        <p class="confirm-message">${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" value="cancel" type="submit">${escapeHtml(cancelLabel)}</button>
          <button class="btn ${confirmClass}" value="confirm" type="submit">${escapeHtml(confirmLabel)}</button>
        </div>
      </form>
    `;
    modalRoot().appendChild(dialog);
    lockScroll();
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      unlockScroll();
      dialog.remove();
      resolve(confirmed);
    });
    dialog.showModal();
    refreshIcons();
  });
}

let drawerSequence = 0;
let activeDrawerClose = null;

export function closeDrawer() {
  activeDrawerClose?.();
}

export function openDrawer({
  eyebrow = '',
  title = '',
  subtitle = '',
  body = '',
  footer = '',
  onMount = null,
  className = '',
} = {}) {
  closeDrawer();

  const id = ++drawerSequence;
  const root = drawerRoot();
  root.innerHTML = `
    <div class="drawer-backdrop visible" data-close-drawer></div>
    <aside class="drawer open ${escapeHtml(className)}" role="dialog" aria-modal="true" aria-labelledby="drawer-title-${id}" tabindex="-1">
      <div class="drawer-header">
        <div class="drawer-title-group">
          ${eyebrow ? `<div class="drawer-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
          <div class="drawer-title" id="drawer-title-${id}">${escapeHtml(title)}</div>
          <div class="drawer-subtitle" data-drawer-subtitle>${subtitle}</div>
        </div>
        <button class="btn btn-icon btn-ghost drawer-close" type="button" data-close-drawer aria-label="Close panel">${icon(
          'x',
        )}</button>
      </div>
      <div class="drawer-body">${body}</div>
      ${footer ? `<div class="drawer-footer">${footer}</div>` : ''}
    </aside>
  `;

  const drawer = root.querySelector('.drawer');
  const backdrop = root.querySelector('.drawer-backdrop');
  const previousFocus = document.activeElement;
  lockScroll();

  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const close = () => {
    if (activeDrawerClose !== close) return;
    activeDrawerClose = null;
    document.removeEventListener('keydown', onKeydown);
    drawer.classList.remove('open');
    backdrop.classList.remove('visible');
    window.setTimeout(() => {
      if (root.dataset.drawerId === String(id)) {
        root.innerHTML = '';
        delete root.dataset.drawerId;
      }
    }, 280);
    unlockScroll();
    if (previousFocus?.focus && document.contains(previousFocus)) previousFocus.focus();
  };

  root.dataset.drawerId = String(id);
  activeDrawerClose = close;
  root.querySelectorAll('[data-close-drawer]').forEach((element) => {
    element.addEventListener('click', close);
  });
  document.addEventListener('keydown', onKeydown);
  drawer.focus();
  refreshIcons();

  const api = {
    drawer,
    body: root.querySelector('.drawer-body'),
    footer: root.querySelector('.drawer-footer'),
    close,
    setTitle(value) {
      drawer.querySelector('.drawer-title').textContent = value;
    },
    setSubtitle(value) {
      const element = drawer.querySelector('[data-drawer-subtitle]');
      if (element) element.innerHTML = value;
    },
  };

  onMount?.(api);
  return api;
}

export function showConnectionError({ onRetry = null } = {}) {
  const existing = document.getElementById('connection-error');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'connection-error';
  overlay.className = 'connection-error';
  overlay.innerHTML = `
    <div class="connection-card">
      <div class="connection-icon">${icon('server')}</div>
      <h2>Cannot reach the backend</h2>
      <p>The NCR Internship Finder API is not responding. Start the backend with <strong>npm run dev</strong> and try again.</p>
      <div class="connection-actions">
        <button class="btn btn-primary" type="button" data-retry>${icon('refresh-cw')} Try again</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  refreshIcons();
  overlay.querySelector('[data-retry]')?.addEventListener('click', () => {
    overlay.remove();
    if (onRetry) onRetry();
    else window.location.reload();
  });
  return overlay;
}

export async function copyText(value) {
  const text = String(value || '');
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export function debounce(callback, delay = 320) {
  let timer = null;
  const debounced = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
  debounced.cancel = () => window.clearTimeout(timer);
  return debounced;
}
