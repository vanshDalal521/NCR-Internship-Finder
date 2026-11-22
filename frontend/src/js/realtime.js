import { getToken, http } from './api.js';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
const POLL_INTERVAL_MS = 60_000;
const FRESHNESS_REFRESH_MS = 60_000;
const RETRY_BASE_MS = 3_000;
const RETRY_MAX_MS = 30_000;

let source = null;
let pollTimer = null;
let freshnessTimer = null;
let retryTimer = null;
let retryCount = 0;
let signature = null;
let started = false;
let status = 'idle';
let lastEventAt = null;

function eventsUrl() {
  const base = /^https?:/i.test(API_BASE)
    ? `${API_BASE}/events`
    : `${window.location.origin}${API_BASE}/events`;
  const url = new URL(base);
  const token = getToken();
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

function indicatorLabel(next) {
  switch (next) {
    case 'live':
      return 'Live';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return 'Reconnecting';
    case 'polling':
      return 'Polling';
    case 'offline':
      return 'Offline';
    default:
      return 'Live';
  }
}

function renderIndicators(next) {
  const label = indicatorLabel(next);
  for (const element of document.querySelectorAll('[data-live-indicator]')) {
    element.dataset.state = next;
    element.setAttribute(
      'title',
      next === 'live'
        ? 'Real-time updates connected.'
        : next === 'polling'
          ? 'Live stream unavailable. Refreshing every 60 seconds.'
          : 'Live updates are reconnecting.',
    );
    const copy = element.querySelector('[data-live-label]');
    if (copy) copy.textContent = label;
  }
}

function setStatus(next, detail = {}) {
  status = next;
  document.documentElement.dataset.liveStatus = next;
  renderIndicators(next);
  window.dispatchEvent(
    new CustomEvent('ncr:live-status', { detail: { status: next, ...detail } }),
  );
}

function emit(reason, payload = {}) {
  lastEventAt = new Date().toISOString();
  window.dispatchEvent(
    new CustomEvent('ncr:jobs-changed', { detail: { reason, ...payload, at: lastEventAt } }),
  );
  window.dispatchEvent(
    new CustomEvent('ncr:realtime', { detail: { reason, ...payload, at: lastEventAt } }),
  );
}

function summarySignature(summary = {}) {
  return JSON.stringify([
    summary.jobs,
    summary.verifiedActive,
    summary.pendingVerification,
    summary.analyses,
    summary.lastDiscoveryAt,
    summary.lastVerificationAt,
  ]);
}

async function pollOnce() {
  try {
    const data = await http.get('/system/status', null, { timeout: 15_000 });
    const next = summarySignature(data?.summary);
    if (signature === null) {
      signature = next;
    } else if (next !== signature) {
      signature = next;
      emit('poll');
    }
    if (!source || source.readyState === 2) setStatus('polling');
  } catch {
    if (!source || source.readyState === 2) setStatus('offline');
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') pollOnce();
  }, POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

function startFreshnessRefresh() {
  if (freshnessTimer) return;
  freshnessTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (status === 'live') emit('freshness-tick');
  }, FRESHNESS_REFRESH_MS);
}

function stopFreshnessRefresh() {
  if (freshnessTimer) clearInterval(freshnessTimer);
  freshnessTimer = null;
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  if (!source || source.readyState === 2) pollOnce();
}

function scheduleReconnect() {
  if (retryTimer) return;
  retryCount += 1;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * retryCount);
  setStatus('reconnecting');
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (source) {
    source.close();
    source = null;
  }
  setStatus(retryCount ? 'reconnecting' : 'connecting');

  try {
    source = new EventSource(eventsUrl());
  } catch {
    startPolling();
    pollOnce();
    return;
  }

  source.addEventListener('ready', () => {
    retryCount = 0;
    setStatus('live');
    stopPolling();
  });

  source.addEventListener('jobs', (event) => {
    setStatus('live');
    stopPolling();
    let payload = {};
    try {
      payload = JSON.parse(event.data || '{}');
    } catch {
      payload = {};
    }
    emit(payload.reason || 'jobs', payload);
  });

  source.addEventListener('scheduler', (event) => {
    let payload = {};
    try {
      payload = JSON.parse(event.data || '{}');
    } catch {
      payload = {};
    }
    window.dispatchEvent(new CustomEvent('ncr:scheduler-changed', { detail: payload }));
  });

  source.onerror = () => {
    setStatus('reconnecting');
    startPolling();
    if (source && source.readyState === 2) {
      source.close();
      source = null;
      scheduleReconnect();
    }
  };
}

export function startRealtime() {
  if (started) return;
  started = true;

  if (!('EventSource' in window)) {
    startPolling();
    pollOnce();
    return;
  }

  connect();
  startPolling();
  startFreshnessRefresh();
  pollOnce();
}

export function stopRealtime() {
  started = false;
  if (source) source.close();
  source = null;
  stopPolling();
  stopFreshnessRefresh();
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryCount = 0;
  setStatus('idle');
}

export function realtimeState() {
  return {
    status,
    lastEventAt,
    started,
    clients: null,
    pollIntervalMs: POLL_INTERVAL_MS,
  };
}
