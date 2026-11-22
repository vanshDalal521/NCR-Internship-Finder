import { describe, expect, it } from 'vitest';
import { isDisplayableJob, isFreshJob, isPortalVisibleJob } from '../utils/freshness.js';

const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

function job(overrides = {}) {
  return {
    verification_status: 'pending',
    screening_status: 'passed',
    is_active: true,
    posted_at: hoursAgo(2),
    created_at: hoursAgo(2),
    ...overrides,
  };
}

describe('freshness policy', () => {
  it('accepts postings inside the 24-hour window and rejects older ones', () => {
    expect(isFreshJob(job({ posted_at: hoursAgo(23) }))).toBe(true);
    expect(isFreshJob(job({ posted_at: hoursAgo(25) }))).toBe(false);
    expect(isFreshJob(job({ posted_at: null, created_at: hoursAgo(1) }))).toBe(true);
  });

  it('keeps verified-active records visible outside the freshness window', () => {
    const oldVerified = job({
      verification_status: 'verified_active',
      is_active: true,
      posted_at: hoursAgo(72),
    });
    expect(isFreshJob(oldVerified)).toBe(false);
    expect(isDisplayableJob(oldVerified)).toBe(true);
    expect(isPortalVisibleJob(oldVerified)).toBe(true);
  });

  it('only exposes links that passed screening and are still active', () => {
    expect(isPortalVisibleJob(job())).toBe(true);
    expect(isPortalVisibleJob(job({ screening_status: 'pending' }))).toBe(false);
    expect(isPortalVisibleJob(job({ screening_status: 'failed' }))).toBe(false);
    expect(
      isPortalVisibleJob(job({ verification_status: 'expired', is_active: false })),
    ).toBe(false);
    expect(isPortalVisibleJob(job({ posted_at: hoursAgo(30) }))).toBe(false);
  });
});
