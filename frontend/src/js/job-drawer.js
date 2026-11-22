import { describeError, http } from './api.js';
import { getConfig } from './config.js';
import { getReviewerName } from './preferences.js';
import {
  categoryTag,
  copyText,
  deadlineInfo,
  errorCallout,
  escapeHtml,
  formatDate,
  icon,
  loadingState,
  openDrawer,
  refreshIcons,
  relativeTime,
  safeExternalLink,
  safeUrl,
  screeningBadge,
  setButtonLoading,
  sourceBadge,
  statusBadge,
  stipendText,
  toast,
} from './ui.js';

function fact(label, iconName, value, className = '') {
  return `
    <div class="job-fact">
      <div class="job-fact-label">${icon(iconName)} ${escapeHtml(label)}</div>
      <div class="job-fact-value ${className}">${value}</div>
    </div>
  `;
}

function aiPanel(job, config) {
  const analysis = job.analysis;
  if (!analysis) {
    return `
      <div class="ai-empty">
        ${icon('sparkles')}
        <div class="ai-empty-copy">
          <strong>No AI analysis yet</strong>
          ${
            config.configured?.gemini
              ? 'Run the analysis to extract skills, eligibility notes, a relevance score, and possible red flags from the posting text.'
              : 'Add GEMINI_API_KEY to the backend environment and restart the server to enable AI-assisted review.'
          }
        </div>
      </div>
    `;
  }

  const score = Number(analysis.relevance_score);
  const skills = Array.isArray(analysis.skills) ? analysis.skills : [];
  const redFlags = Array.isArray(analysis.red_flags) ? analysis.red_flags : [];

  return `
    <div class="ai-panel">
      <div class="ai-panel-head">
        <div>
          <div class="ai-label">${icon('sparkles')} AI analysis</div>
          <div class="ai-model">${escapeHtml(analysis.ai_model || 'Gemini')} · ${escapeHtml(
            analysis.analysis_source || 'gemini',
          )}</div>
        </div>
        ${
          Number.isFinite(score)
            ? `<div class="relevance-score" style="--score:${Math.max(
                0,
                Math.min(100, score),
              )}"><span>${Math.round(score)}</span></div>`
            : ''
        }
      </div>
      ${analysis.summary ? `<p class="ai-summary">${escapeHtml(analysis.summary)}</p>` : ''}
      ${
        skills.length
          ? `<div class="tag-stack" style="margin-top: 9px">${skills
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

function bodyMarkup(job, config) {
  const description = String(job.job_description || '');
  const skills = Array.isArray(job.required_skills) ? job.required_skills : [];
  const analysisSkills = Array.isArray(job.analysis?.skills) ? job.analysis.skills : [];
  const combinedSkills = [...new Set([...skills, ...analysisSkills])];
  const applicationUrl = safeUrl(job.application_url);
  const sourceUrl = safeUrl(job.source_url);
  const deadline = deadlineInfo(job.deadline);
  const savedBy = Array.isArray(job.saved_by) ? job.saved_by.filter(Boolean) : [];

  return `
    <div class="detail-section">
      <div class="job-fact-grid">
        ${fact('Location', 'map-pin', escapeHtml(job.location || job.city || 'Not specified'))}
        ${fact('Work mode', 'briefcase', escapeHtml(job.work_mode || 'Not specified'))}
        ${fact('Stipend', 'coins', escapeHtml(stipendText(job)))}
        ${fact('Duration', 'clock', escapeHtml(job.duration || 'Not specified'))}
        ${fact('Deadline', 'calendar', escapeHtml(deadline.text), deadline.className)}
        ${fact('Category', 'target', escapeHtml(job.category || 'Uncategorized'))}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">${icon('sparkles')} Intelligence <span class="count">${
        job.analysis ? 'AI-assisted' : 'Not analysed'
      }</span></div>
      ${aiPanel(job, config)}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">${icon('file-text')} Role description</div>
      ${
        description
          ? `<p class="description-text ${description.length > 900 ? 'clamped' : ''}" data-description>${
              escapeHtml(description)
            }</p>
             ${
               description.length > 900
                 ? `<div><button class="link-btn description-toggle" type="button" data-toggle-description>Show full description</button></div>`
                 : ''
             }`
          : '<div class="review-callout empty">The source posting did not include a description.</div>'
      }
    </div>

    ${
      job.eligibility
        ? `<div class="detail-section">
            <div class="detail-section-title">${icon('graduation-cap')} Eligibility</div>
            <div class="eligibility-box">${escapeHtml(job.eligibility)}</div>
          </div>`
        : ''
    }

    ${
      job.experience_required
        ? `<div class="detail-section">
            <div class="detail-section-title">${icon('badge-check')} Experience</div>
            <div class="review-callout">${escapeHtml(job.experience_required)}</div>
          </div>`
        : ''
    }

    ${
      combinedSkills.length
        ? `<div class="detail-section">
            <div class="detail-section-title">${icon('list-checks')} Skills mentioned <span class="count">${
              combinedSkills.length
            }</span></div>
            <div class="tag-stack">${combinedSkills
              .map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`)
              .join('')}</div>
          </div>`
        : ''
    }

    <div class="detail-section">
      <div class="detail-section-title">${icon('link')} Apply</div>
      ${
        applicationUrl
          ? `<div class="application-box">
              <div class="application-label">${icon('external-link')} Application page</div>
              <div class="application-url">
                <a href="${escapeHtml(applicationUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                  applicationUrl,
                )}</a>
                <button class="application-copy" type="button" data-copy-application aria-label="Copy application link">${icon(
                  'copy',
                )}</button>
              </div>
            </div>`
          : '<div class="review-callout empty">No valid application URL is attached to this record.</div>'
      }
    </div>

    <div class="detail-section">
      <div class="detail-section-title">${icon('database')} Source & audit</div>
      <div class="flex flex-wrap gap-6">
        ${sourceBadge(job.source, config.sourceLabels)}
        <span class="tag">${icon('clock')} Added ${escapeHtml(relativeTime(job.created_at))}</span>
        ${job.posted_at ? `<span class="tag">Posted ${escapeHtml(formatDate(job.posted_at))}</span>` : ''}
      </div>
      <div class="drawer-meta">
        ${
          job.last_verified_at
            ? `${icon('shield-check')} Last verified ${escapeHtml(
                formatDate(job.last_verified_at),
              )}${job.verified_by ? ` by ${escapeHtml(job.verified_by)}` : ''}`
            : `${icon('shield')} Not yet verified by the committee`
        }
      </div>
      ${
        sourceUrl && sourceUrl !== applicationUrl
          ? `<div class="drawer-meta">${icon('external-link')} ${safeExternalLink(
              sourceUrl,
              'View source listing',
            )}</div>`
          : ''
      }
      <div class="saved-note" data-saved-note style="margin-top: 10px" ${job.saved ? '' : 'hidden'}>
        ${icon('bookmark')} Shortlisted${savedBy.length ? ` by ${escapeHtml(savedBy.join(', '))}` : ''}
      </div>
    </div>
  `;
}

function footerMarkup(job, config) {
  const reviewable = ['pending', 'needs_review'].includes(job.verification_status);
  return `
    <button class="btn ${job.saved ? 'btn-warning-outline' : 'btn-secondary'}" type="button" data-action="save-job">
      ${icon('bookmark')} ${job.saved ? 'Saved' : 'Save for follow-up'}
    </button>
    ${
      config.configured?.gemini
        ? `<button class="btn btn-secondary" type="button" data-action="analyze-job">${icon(
            'sparkles',
          )} Analyze</button>`
        : ''
    }
    <div class="spacer"></div>
    ${
      reviewable
        ? `<a class="btn btn-primary" href="/verification.html?job=${encodeURIComponent(
            job.id,
          )}">${icon('shield-check')} Review & verify</a>`
        : ''
    }
    ${
      safeUrl(job.application_url)
        ? `<a class="btn ${reviewable ? 'btn-secondary' : 'btn-primary'}" href="${escapeHtml(
            safeUrl(job.application_url),
          )}" target="_blank" rel="noopener noreferrer">${icon('external-link')} Open application</a>`
        : ''
    }
  `;
}

export function openJobDrawer(jobId, { config = getConfig(), onChanged = null } = {}) {
  const drawer = openDrawer({
    eyebrow: 'Opportunity details',
    title: 'Loading opportunity…',
    subtitle: 'Fetching the latest committee record',
    body: loadingState('Loading opportunity details…'),
    footer: '<button class="btn btn-secondary" type="button" disabled>Loading…</button>',
  });

  let job = null;

  const bindBody = () => {
    drawer.body.querySelector('[data-toggle-description]')?.addEventListener('click', (event) => {
      const description = drawer.body.querySelector('[data-description]');
      const button = event.currentTarget;
      if (!description) return;
      const expanded = description.classList.toggle('clamped');
      button.textContent = expanded ? 'Show full description' : 'Show less';
    });

    drawer.body.querySelector('[data-copy-application]')?.addEventListener('click', async () => {
      const copied = await copyText(job?.application_url);
      toast(
        copied
          ? { type: 'success', title: 'Link copied', message: 'The application URL is on your clipboard.' }
          : { type: 'error', title: 'Could not copy', message: 'Open the link and copy it from the address bar.' },
      );
    });
  };

  const bindFooter = () => {
    drawer.footer?.querySelector('[data-action="save-job"]')?.addEventListener('click', async (event) => {
      if (!job) return;
      const button = event.currentTarget;
      const restore = setButtonLoading(button, job.saved ? 'Updating…' : 'Saving…');
      try {
        if (job.saved) {
          await http.delete(`/jobs/${job.id}/save`);
          job.saved = false;
          job.saved_by = [];
          toast({ type: 'info', title: 'Removed from shortlist', message: 'This opportunity is no longer saved.' });
        } else {
          await http.post(`/jobs/${job.id}/save`, { savedBy: getReviewerName(config) });
          job.saved = true;
          job.saved_by = [getReviewerName(config)];
          toast({ type: 'success', title: 'Saved for follow-up', message: 'The opportunity is now on the committee shortlist.' });
        }
        restore();
        drawer.footer.innerHTML = footerMarkup(job, config);
        refreshIcons();
        bindFooter();
        const note = drawer.body.querySelector('[data-saved-note]');
        if (note) {
          note.hidden = !job.saved;
          note.innerHTML = `${icon('bookmark')} Shortlisted${
            job.saved_by?.length ? ` by ${escapeHtml(job.saved_by.join(', '))}` : ''
          }`;
          refreshIcons();
        }
        onChanged?.(job);
      } catch (error) {
        restore();
        toast({ type: 'error', title: 'Could not update shortlist', message: describeError(error) });
      }
    });

    drawer.footer?.querySelector('[data-action="analyze-job"]')?.addEventListener('click', async (event) => {
      if (!job) return;
      const restore = setButtonLoading(event.currentTarget, 'Analyzing…');
      try {
        const data = await http.post(`/jobs/${job.id}/analyze`, null, { timeout: 70_000 });
        job = data.job || { ...job, analysis: data.analysis };
        render();
        toast({ type: 'success', title: 'Analysis complete', message: 'Gemini extracted skills, eligibility, and relevance signals.' });
        onChanged?.(job);
      } catch (error) {
        restore();
        toast({ type: 'error', title: 'Analysis failed', message: describeError(error), timeout: 7000 });
      }
    });
  };

  const render = () => {
    drawer.setTitle(job.job_title);
    drawer.setSubtitle(`
      <span class="flex flex-center gap-6">${icon('building-2')} ${escapeHtml(job.company_name)}</span>
      ${statusBadge(job.verification_status)}
      ${screeningBadge(job.screening_status)}
      ${categoryTag(job.category, 'tag')}
    `);
    drawer.body.innerHTML = bodyMarkup(job, config);
    if (drawer.footer) {
      drawer.footer.innerHTML = footerMarkup(job, config);
    }
    refreshIcons();
    bindBody();
    bindFooter();
  };

  http
    .get(`/jobs/${jobId}`, null, { timeout: 20_000 })
    .then((data) => {
      job = data;
      render();
    })
    .catch((error) => {
      drawer.setTitle('Opportunity unavailable');
      drawer.setSubtitle('');
      drawer.body.innerHTML = errorCallout(describeError(error), {
        title: 'Could not load this opportunity',
      });
      if (drawer.footer) {
        drawer.footer.innerHTML = '<div class="spacer"></div><button class="btn btn-secondary" type="button" data-close-drawer>Close</button>';
        drawer.footer.querySelector('[data-close-drawer]')?.addEventListener('click', drawer.close);
      }
      refreshIcons();
    });

  return drawer;
}
