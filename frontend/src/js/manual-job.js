import { describeError, http } from './api.js';
import { getConfig } from './config.js';
import { orderedLocations } from './preferences.js';
import {
  escapeHtml,
  icon,
  openModal,
  refreshIcons,
  setButtonLoading,
  toast,
} from './ui.js';

function option(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function dateToIso(value) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59+05:30`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function openManualJobModal({ config = getConfig(), onCreated = null } = {}) {
  const locations = orderedLocations(config);
  const defaultCity = locations[0]?.city || config.cities[0] || '';
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;

  const body = `
    <form class="manual-form" id="manual-job-form" novalidate>
      <div class="manual-form-section">
        <div class="manual-form-heading">${icon('briefcase')} Role basics</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="manual-company">Company name <span class="text-danger">*</span></label>
            <input class="input" id="manual-company" name="companyName" type="text" maxlength="160" required placeholder="e.g., Aurika Systems" />
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-title">Job title <span class="text-danger">*</span></label>
            <input class="input" id="manual-title" name="jobTitle" type="text" maxlength="180" required placeholder="e.g., Frontend Developer Intern" />
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-category">Category <span class="optional">Optional</span></label>
            <select class="select" id="manual-category" name="category">
              <option value="">Auto-detect from the posting</option>
              ${config.categories.map((category) => option(category, category)).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-city">Priority city <span class="text-danger">*</span></label>
            <select class="select" id="manual-city" name="city" required>
              ${locations
                .map((location) =>
                  option(location.city, `${location.city} · default priority ${location.priority}`),
                )
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-work-mode">Work mode</label>
            <select class="select" id="manual-work-mode" name="workMode">
              ${config.workModes.map((mode) => option(mode, mode)).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-employment">Employment type</label>
            <input class="input" id="manual-employment" name="employmentType" type="text" maxlength="60" value="Internship" />
          </div>
          <div class="form-group full">
            <label class="form-label" for="manual-location">Specific location <span class="optional">Optional</span></label>
            <input class="input" id="manual-location" name="location" type="text" maxlength="200" placeholder="e.g., Udyog Vihar Phase 4, Gurugram" />
          </div>
        </div>
      </div>

      <div class="manual-form-section">
        <div class="manual-form-heading">${icon('coins')} Pay, duration and deadline</div>
        <div class="form-grid form-grid-3">
          <div class="form-group">
            <label class="form-label" for="manual-stipend">Stipend text <span class="optional">Optional</span></label>
            <input class="input" id="manual-stipend" name="stipend" type="text" maxlength="120" placeholder="e.g., ₹25,000 / month" />
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-stipend-min">Monthly minimum (₹)</label>
            <input class="input" id="manual-stipend-min" name="stipendMin" type="number" min="0" max="10000000" step="500" placeholder="25000" />
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-stipend-max">Monthly maximum (₹)</label>
            <input class="input" id="manual-stipend-max" name="stipendMax" type="number" min="0" max="10000000" step="500" placeholder="30000" />
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-duration">Duration</label>
            <input class="input" id="manual-duration" name="duration" type="text" maxlength="120" placeholder="e.g., 6 months" />
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-deadline">Application deadline</label>
            <input class="input" id="manual-deadline" name="deadline" type="date" min="${minDate}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-experience">Experience requirement</label>
            <input class="input" id="manual-experience" name="experienceRequired" type="text" maxlength="300" placeholder="e.g., No prior experience required" />
          </div>
        </div>
      </div>

      <div class="manual-form-section">
        <div class="manual-form-heading">${icon('link')} Application and posting details</div>
        <div class="form-grid">
          <div class="form-group full">
            <label class="form-label" for="manual-url">Application URL <span class="text-danger">*</span></label>
            <input class="input" id="manual-url" name="applicationUrl" type="url" maxlength="2000" required placeholder="https://careers.company.com/role/123" />
            <div class="form-help">Use the employer's application page wherever possible. The link checker validates reachability later.</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-website">Company website <span class="optional">Optional</span></label>
            <input class="input" id="manual-website" name="companyWebsite" type="url" maxlength="1000" placeholder="https://company.com" />
          </div>
          <div class="form-group">
            <label class="form-label" for="manual-industry">Industry <span class="optional">Optional</span></label>
            <input class="input" id="manual-industry" name="companyIndustry" type="text" maxlength="120" placeholder="e.g., SaaS" />
          </div>
          <div class="form-group full">
            <label class="form-label" for="manual-skills">Required skills <span class="optional">Comma-separated</span></label>
            <input class="input" id="manual-skills" name="requiredSkills" type="text" placeholder="React, JavaScript, REST API" />
          </div>
          <div class="form-group full">
            <label class="form-label" for="manual-description">Job description</label>
            <textarea class="textarea" id="manual-description" name="jobDescription" maxlength="20000" placeholder="Paste the posting text. Keep eligibility, responsibilities, and pay exactly as written."></textarea>
          </div>
          <div class="form-group full">
            <label class="form-label" for="manual-eligibility">Eligibility notes <span class="optional">Optional</span></label>
            <textarea class="textarea" id="manual-eligibility" name="eligibility" maxlength="2000" style="min-height: 70px" placeholder="e.g., B.Tech CSE, pre-final or final year, CGPA 6.5+"></textarea>
          </div>
        </div>
      </div>

      <details class="manual-advanced">
        <summary>Advanced source details</summary>
        <div class="manual-advanced-content">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label" for="manual-source-url">Source listing URL</label>
              <input class="input" id="manual-source-url" name="sourceUrl" type="url" maxlength="2000" placeholder="Where the role was first seen" />
            </div>
            <div class="form-group">
              <label class="form-label" for="manual-notes">Internal notes</label>
              <input class="input" id="manual-notes" name="notes" type="text" maxlength="1000" placeholder="Visible to the committee" />
            </div>
          </div>
        </div>
      </details>

      <div id="manual-job-error" hidden></div>
    </form>
  `;

  return openModal({
    title: 'Add an opportunity manually',
    description: 'Manual records enter the queue as pending. A committee member must still review the original posting.',
    className: 'manual-job-modal',
    body,
    footer: `
      <button class="btn btn-secondary" type="button" data-cancel-manual>Cancel</button>
      <button class="btn btn-primary" type="submit" form="manual-job-form" data-submit-manual>${icon(
        'plus',
      )} Add to verification queue</button>
    `,
    onMount: ({ dialog, close }) => {
      const form = dialog.querySelector('#manual-job-form');
      const errorBox = dialog.querySelector('#manual-job-error');
      const submit = dialog.querySelector('[data-submit-manual]');
      dialog.querySelector('[data-cancel-manual]')?.addEventListener('click', close);

      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorBox.hidden = true;

        if (!form.reportValidity()) return;

        const data = new FormData(form);
        const requiredSkills = String(data.get('requiredSkills') || '')
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean);

        const city = String(data.get('city') || '');
        const payload = {
          companyName: String(data.get('companyName') || '').trim(),
          jobTitle: String(data.get('jobTitle') || '').trim(),
          category: String(data.get('category') || '') || null,
          city,
          location: String(data.get('location') || '').trim() || null,
          workMode: String(data.get('workMode') || 'On-site'),
          employmentType: String(data.get('employmentType') || 'Internship').trim() || 'Internship',
          applicationUrl: String(data.get('applicationUrl') || '').trim(),
          jobDescription: String(data.get('jobDescription') || '').trim() || null,
          requiredSkills,
          stipend: String(data.get('stipend') || '').trim() || null,
          stipendMin: data.get('stipendMin') ? Number(data.get('stipendMin')) : null,
          stipendMax: data.get('stipendMax') ? Number(data.get('stipendMax')) : null,
          duration: String(data.get('duration') || '').trim() || null,
          eligibility: String(data.get('eligibility') || '').trim() || null,
          experienceRequired: String(data.get('experienceRequired') || '').trim() || null,
          deadline: dateToIso(String(data.get('deadline') || '')),
          companyWebsite: String(data.get('companyWebsite') || '').trim() || null,
          companyIndustry: String(data.get('companyIndustry') || '').trim() || null,
          sourceUrl: String(data.get('sourceUrl') || '').trim() || null,
          notes: String(data.get('notes') || '').trim() || null,
        };

        if (payload.stipendMin !== null && payload.stipendMax !== null && payload.stipendMin > payload.stipendMax) {
          errorBox.innerHTML = `<div class="callout callout-danger">${icon(
            'circle-alert',
          )}<div>The minimum stipend cannot be greater than the maximum stipend.</div></div>`;
          errorBox.hidden = false;
          refreshIcons();
          return;
        }

        const restore = setButtonLoading(submit, 'Adding opportunity…');
        try {
          const result = await http.post('/jobs', payload, { timeout: 25_000 });
          toast({
            type: 'success',
            title: 'Opportunity added',
            message: 'It is now pending verification in the review queue.',
          });
          close();
          onCreated?.(result.job);
        } catch (error) {
          restore();
          const existingId = error?.details?.jobId;
          errorBox.innerHTML = `<div class="callout callout-danger">${icon('circle-alert')}<div>${escapeHtml(
            describeError(error),
          )}${
            existingId
              ? `<div class="callout-actions"><a href="/opportunities.html?job=${encodeURIComponent(
                  existingId,
                )}">Open the existing record</a></div>`
              : ''
          }</div></div>`;
          errorBox.hidden = false;
          refreshIcons();
          errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    },
  });
}
