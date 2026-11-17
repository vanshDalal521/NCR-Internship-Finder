import $ from 'jquery';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { describeError, http } from '../api.js';
import { openJobDrawer } from '../job-drawer.js';
import { getReviewerName, orderedCategories, orderedLocations } from '../preferences.js';
import { boot } from '../shell.js';
import {
  categoryTag,
  emptyState,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatNumber,
  icon,
  loadingState,
  refreshIcons,
  setButtonLoading,
  stipendText,
  toast,
} from '../ui.js';

const TYPE_LABELS = {
  verified_opportunities: 'Verified opportunities',
  full_directory: 'Full directory',
};

const state = {
  config: null,
  summary: null,
  directoryJobs: null,
  history: [],
  reportType: 'verified_opportunities',
  format: 'xlsx',
  categories: new Set(),
  includeLinks: true,
  includeSource: true,
  includeEligibility: false,
  directoryLoading: false,
};

function initCategoryOptions() {
  const selected = new Set(state.categories);
  $('#report-category-options').html(
    orderedCategories(state.config)
      .map(
        (category) => `
        <label class="check check-sm">
          <input type="checkbox" name="reportCategory" value="${escapeHtml(category)}" ${
            selected.has(category) ? 'checked' : ''
          } />
          <span class="check-copy">${escapeHtml(category)}</span>
        </label>
      `,
      )
      .join(''),
  );
  updateCategoryCaption();
}

function updateCategoryCaption() {
  const total = state.config.categories.length;
  const selected = state.categories.size;
  $('#category-focus-caption')?.text(`${selected} of ${total} categories selected`);
}

function filteredCategories() {
  return state.config.categories.filter((category) => state.categories.has(category));
}

async function ensureDirectory() {
  if (state.directoryJobs) return state.directoryJobs;
  if (state.directoryLoading) {
    while (state.directoryLoading) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    return state.directoryJobs || [];
  }

  state.directoryLoading = true;
  try {
    const jobs = [];
    let page = 1;
    let totalPages = 1;
    do {
      const data = await http.get('/jobs', { page, limit: 100, sort: 'created_at', order: 'desc' }, { timeout: 30_000 });
      jobs.push(...(data.items || []));
      totalPages = Math.max(1, Number(data.pagination?.totalPages || 1));
      page += 1;
    } while (page <= totalPages && page <= 50);
    state.directoryJobs = jobs;
    return jobs;
  } finally {
    state.directoryLoading = false;
  }
}

function rowFromSummary(job) {
  return {
    id: job.id,
    company: job.company || '—',
    role: job.role || '—',
    category: job.category || 'Uncategorized',
    city: job.city || '—',
    location: job.location || '',
    workMode: job.workMode || '—',
    stipend: job.stipend || 'Not disclosed',
    duration: job.duration || '',
    skills: Array.isArray(job.skills) ? job.skills : [],
    eligibility: job.eligibility || '',
    deadline: job.deadline || null,
    applicationUrl: job.applicationUrl || '',
    source: job.source || '—',
    postedAt: job.postedAt || null,
    verifiedAt: job.verifiedAt || null,
    verifiedBy: job.verifiedBy || '',
    status: 'Verified active',
  };
}

function rowFromDirectory(job) {
  return {
    id: job.id,
    company: job.company_name || '—',
    role: job.job_title || '—',
    category: job.category || 'Uncategorized',
    city: job.city || '—',
    location: job.location || '',
    workMode: job.work_mode || '—',
    stipend: stipendText(job),
    duration: job.duration || '',
    skills: Array.isArray(job.required_skills) ? job.required_skills : [],
    eligibility: job.eligibility || '',
    deadline: job.deadline || null,
    applicationUrl: job.application_url || '',
    source: state.config.sourceLabels?.[job.source] || job.source || '—',
    postedAt: job.posted_at || null,
    verifiedAt: job.last_verified_at || null,
    verifiedBy: job.verified_by || '',
    status: state.config.verificationLabels?.[job.verification_status] || job.verification_status || '—',
  };
}

function selectedRows() {
  const categories = new Set(filteredCategories());
  if (state.reportType === 'verified_opportunities') {
    const jobs = state.summary?.jobs || [];
    return jobs.map(rowFromSummary).filter((row) => categories.has(row.category));
  }
  const jobs = state.directoryJobs || [];
  return jobs.map(rowFromDirectory).filter((row) => categories.has(row.category));
}

function breakdownFor(rows) {
  const categoryCounts = new Map();
  const locationCounts = new Map();
  for (const row of rows) {
    categoryCounts.set(row.category, (categoryCounts.get(row.category) || 0) + 1);
    locationCounts.set(row.city, (locationCounts.get(row.city) || 0) + 1);
  }

  const categoryTargets = state.config.categoryTargets || {};
  const categories = state.config.categories.map((category) => ({
    label: category,
    count: categoryCounts.get(category) || 0,
    target: state.reportType === 'verified_opportunities' ? categoryTargets[category] || 0 : null,
  }));
  if (categoryCounts.has('Uncategorized')) {
    categories.push({ label: 'Uncategorized', count: categoryCounts.get('Uncategorized'), target: null });
  }

  const locations = orderedLocations(state.config)
    .map((location) => ({ label: location.city, count: locationCounts.get(location.city) || 0 }))
    .filter((row) => row.count > 0);

  return { categories, locations };
}

function breakdownRow(label, count, max, target = null, tone = '') {
  const percent = max ? Math.max(2, Math.round((count / max) * 100)) : 0;
  return `
    <div class="breakdown-row">
      <span class="breakdown-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
      <span class="breakdown-bar ${tone}"><span style="width:${percent}%"></span></span>
      <span class="breakdown-count">${formatNumber(count)}${
        target !== null ? `<span class="text-tertiary">/${target}</span>` : ''
      }</span>
    </div>
  `;
}

function renderPreview() {
  const rows = selectedRows();
  const typeLabel = TYPE_LABELS[state.reportType];
  const allCategories = state.categories.size === state.config.categories.length;
  const companies = new Set(rows.map((row) => row.company)).size;
  const categories = new Set(rows.map((row) => row.category)).size;
  const breakdown = breakdownFor(rows);

  $('#preview-title').text(`${typeLabel} report`);
  $('#preview-subtitle').text(
    `${allCategories ? 'All categories' : `${state.categories.size} selected categories`} · ${
      state.format === 'xlsx' ? 'Excel workbook' : 'PDF summary'
    } · generated from committee data`,
  );
  $('#preview-record-count').text(formatNumber(rows.length));
  $('#preview-company-count').text(formatNumber(companies));
  $('#preview-category-count').text(formatNumber(categories));

  const maxCategory = Math.max(1, ...breakdown.categories.map((row) => Math.max(row.count, row.target || 0)));
  $('#preview-category-breakdown').html(
    breakdown.categories.length
      ? breakdown.categories
          .map((row) => breakdownRow(row.label, row.count, maxCategory, row.target, 'green'))
          .join('')
      : `<div class="preview-empty"><strong>No categories selected</strong><p>Select at least one category to include records in the report.</p></div>`,
  );

  const maxLocation = Math.max(1, ...breakdown.locations.map((row) => row.count));
  $('#preview-location-breakdown').html(
    breakdown.locations.length
      ? breakdown.locations
          .map((row, index) =>
            breakdownRow(row.label, row.count, maxLocation, null, index === 0 ? 'navy' : ''),
          )
          .join('')
      : `<div class="preview-empty"><strong>No location data</strong><p>Location counts appear once records are included.</p></div>`,
  );

  if (!rows.length) {
    $('#preview-jobs-body').html(
      `<tr><td colspan="5">${emptyState({
        iconName: 'file-bar-chart',
        title: 'No records to include',
        text:
          state.reportType === 'verified_opportunities'
            ? 'Verify at least one opportunity, or select additional categories, before generating a report.'
            : 'The directory does not contain records for the selected categories.',
        compact: true,
      })}</td></tr>`,
    );
    $('#preview-caption').text('Nothing to export');
  } else {
    const preview = rows.slice(0, 8);
    $('#preview-jobs-body').html(
      preview
        .map(
          (row) => `
            <tr class="clickable" data-report-job="${escapeHtml(row.id)}">
              <td>
                <div class="table-role">
                  <div class="table-role-copy">
                    <span class="table-role-title">${escapeHtml(row.role)}</span>
                    <span class="table-role-company">${escapeHtml(row.company)}</span>
                  </div>
                </div>
              </td>
              <td>${categoryTag(row.category, 'tag')}</td>
              <td>${escapeHtml(row.city)}</td>
              <td>${escapeHtml(row.stipend)}</td>
              <td>${escapeHtml(row.verifiedAt ? formatDate(row.verifiedAt) : '—')}</td>
            </tr>
          `,
        )
        .join(''),
    );
    $('#preview-caption').text(
      rows.length > preview.length
        ? `Showing the first ${preview.length} of ${formatNumber(rows.length)}`
        : `${formatNumber(rows.length)} record${rows.length === 1 ? '' : 's'} included`,
    );
  }

  refreshIcons();
}

function renderReadiness() {
  const stats = state.summary?.stats || {};
  const verified = Number(stats.verified || 0);
  const target = Number(stats.targetTotal || 20);
  const percent = Math.min(100, Math.round((verified / target) * 100));
  $('#report-ready-count').text(formatNumber(verified));
  $('#report-ready-progress').text(`${percent}% · ${verified} / ${target}`);
}

function renderHistory() {
  const body = document.getElementById('report-history-body');
  if (!body) return;
  $('#report-history-count').text(`${state.history.length} recent`);

  if (!state.history.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="table-empty">${icon(
      'history',
    )}<div class="empty-title" style="margin-top:8px">No reports generated yet</div><p class="empty-text">Generated workbooks and PDFs will be recorded here.</p></div></td></tr>`;
    refreshIcons();
    return;
  }

  body.innerHTML = state.history
    .map(
      (report) => `
        <tr>
          <td>
            <div class="cell-stack">
              <span class="cell-main">${escapeHtml(formatDateTime(report.created_at))}</span>
              <span class="cell-sub">${escapeHtml(relativeDate(report.created_at))}</span>
            </div>
          </td>
          <td>${escapeHtml(TYPE_LABELS[report.report_type] || report.report_type || 'Report')}</td>
          <td>
            <span class="report-format ${escapeHtml(report.format || '')}">
              ${icon(report.format === 'pdf' ? 'file-text' : 'file-spreadsheet')}
              ${escapeHtml(String(report.format || '').toUpperCase())}
            </span>
          </td>
          <td><span class="text-sm">${escapeHtml(report.scope || '—')}</span></td>
          <td class="num">${formatNumber(report.record_count || 0)}</td>
          <td>${escapeHtml(report.generated_by || '—')}</td>
        </tr>
      `,
    )
    .join('');
  refreshIcons();
}

function relativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} hr ago`;
  return `${Math.round(diff / 86_400_000)} days ago`;
}

async function loadSummary() {
  try {
    state.summary = await http.get('/reports/summary', null, { timeout: 25_000 });
    renderReadiness();
    renderPreview();
  } catch (error) {
    $('#reports-alert').html(
      `<div class="callout callout-danger">${icon('circle-alert')}<div>Could not load report data: ${escapeHtml(
        describeError(error),
      )} <button class="link-btn" type="button" data-retry-reports>Try again</button></div></div>`,
    );
    refreshIcons();
    toast({ type: 'error', title: 'Report data unavailable', message: describeError(error) });
  }
}

async function loadHistory() {
  try {
    const data = await http.get('/reports/history', { limit: 12 }, { timeout: 20_000 });
    state.history = data.items || [];
    renderHistory();
  } catch (error) {
    $('#report-history-body').html(
      `<tr><td colspan="6"><div class="callout callout-danger" style="margin:14px">${icon(
        'circle-alert',
      )}<div>${escapeHtml(describeError(error))}</div></div></td></tr>`,
    );
    refreshIcons();
  }
}

function exportColumns() {
  const columns = [
    { header: 'Company', key: 'company' },
    { header: 'Role', key: 'role' },
    { header: 'Category', key: 'category' },
    { header: 'City', key: 'city' },
    { header: 'Work mode', key: 'workMode' },
    { header: 'Stipend', key: 'stipend' },
    { header: 'Deadline', key: 'deadline', format: (row) => (row.deadline ? formatDate(row.deadline) : '—') },
  ];
  if (state.includeSource) {
    columns.push(
      { header: 'Status', key: 'status' },
      { header: 'Source', key: 'source' },
      { header: 'Verified on', key: 'verifiedAt', format: (row) => (row.verifiedAt ? formatDate(row.verifiedAt) : '—') },
      { header: 'Verified by', key: 'verifiedBy' },
    );
  }
  if (state.includeEligibility) {
    columns.push(
      { header: 'Eligibility', key: 'eligibility' },
      { header: 'Skills', key: 'skills', format: (row) => (row.skills || []).join(', ') },
    );
  }
  if (state.includeLinks) {
    columns.push({ header: 'Application URL', key: 'applicationUrl' });
  }
  return columns;
}

function scopeLabel() {
  const all = state.categories.size === state.config.categories.length;
  return `${TYPE_LABELS[state.reportType]} · ${
    all ? 'All categories' : `${state.categories.size} selected categories`
  }${state.includeSource ? ' · source included' : ''}`;
}

function fileBase() {
  const date = new Date().toISOString().slice(0, 10);
  const type = state.reportType === 'verified_opportunities' ? 'verified' : 'directory';
  return `ncr-internships-${type}-${date}`;
}

function exportXlsx(rows, columns) {
  const workbook = XLSX.utils.book_new();
  const header = columns.map((column) => column.header);
  const body = rows.map((row) =>
    columns.map((column) => (column.format ? column.format(row) : row[column.key] ?? '')),
  );

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  sheet['!cols'] = columns.map((column) => ({
    wch: Math.min(
      48,
      Math.max(
        column.header.length + 2,
        ...body.slice(0, 60).map((line) => String(line[columns.indexOf(column)] ?? '').length + 2),
      ),
    ),
  }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Opportunities');

  const breakdown = breakdownFor(rows);
  const summaryRows = [
    ['NCR Tech Internship Finder'],
    [TYPE_LABELS[state.reportType]],
    [],
    ['Generated', formatDateTime(new Date().toISOString())],
    ['Prepared by', getReviewerName(state.config)],
    ['Scope', scopeLabel()],
    ['Records', rows.length],
    ['Verified target', `${state.summary?.stats?.verified || 0} of ${state.summary?.stats?.targetTotal || 20}`],
    [],
    ['Category', 'Records', 'Target'],
    ...breakdown.categories.map((row) => [row.label, row.count, row.target ?? '—']),
    [],
    ['City', 'Records'],
    ...breakdown.locations.map((row) => [row.label, row.count]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  XLSX.writeFile(workbook, `${fileBase()}.xlsx`, { compression: true });
}

function exportPdf(rows, columns) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = formatDateTime(new Date().toISOString());
  const reviewer = getReviewerName(state.config);

  doc.setFillColor(23, 59, 103);
  doc.rect(0, 0, pageWidth, 88, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('NCR TECH INTERNSHIP FINDER · PLACEMENT COMMITTEE', 40, 27);
  doc.setFontSize(18);
  doc.text(`${TYPE_LABELS[state.reportType]} report`, 40, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(210, 222, 236);
  doc.text(
    `${rows.length} records · ${scopeLabel()} · Prepared by ${reviewer} · ${generatedAt}`,
    40,
    71,
  );

  const stats = state.summary?.stats || {};
  doc.setTextColor(60, 76, 94);
  doc.setFontSize(9);
  doc.text(
    `Verified active: ${stats.verified || 0} of ${stats.targetTotal || 20} target   ·   Companies in directory: ${
      stats.companies || 0
    }   ·   Total discovered: ${stats.discovered || 0}`,
    40,
    112,
  );

  const breakdown = breakdownFor(rows);
  const categoryLine = breakdown.categories
    .filter((row) => row.count > 0)
    .map((row) => `${row.label}: ${row.count}${row.target ? `/${row.target}` : ''}`)
    .join('   ·   ');
  if (categoryLine) {
    doc.setFontSize(8);
    doc.setTextColor(96, 110, 126);
    doc.text(doc.splitTextToSize(`Category coverage — ${categoryLine}`, pageWidth - 80), 40, 128);
  }

  const tableColumns = columns
    .filter((column) => column.key !== 'applicationUrl')
    .map((column) => ({ header: column.header, dataKey: column.key }));
  if (state.includeLinks) {
    tableColumns.push({ header: 'Apply', dataKey: 'applyLink' });
  }

  const body = rows.map((row) => {
    const item = {
      ...row,
      applyLink: row.applicationUrl ? 'Open link' : '—',
      skills: (row.skills || []).join(', '),
      deadline: row.deadline ? formatDate(row.deadline) : '—',
      verifiedAt: row.verifiedAt ? formatDate(row.verifiedAt) : '—',
    };
    for (const column of tableColumns) {
      item[column.dataKey] = column.format
        ? column.format(row)
        : item[column.dataKey] ?? row[column.key] ?? '';
    }
    item._url = row.applicationUrl;
    return item;
  });

  autoTable(doc, {
    startY: categoryLine ? 146 : 132,
    head: [tableColumns.map((column) => column.header)],
    body: body.map((row) => tableColumns.map((column) => row[column.dataKey] ?? '')),
    margin: { left: 40, right: 40, bottom: 34 },
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 4,
      overflow: 'linebreak',
      lineColor: [226, 233, 240],
      lineWidth: 0.4,
      textColor: [49, 65, 82],
    },
    headStyles: {
      fillColor: [23, 59, 103],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      const column = tableColumns[data.column.index];
      if (!state.includeLinks || column?.dataKey !== 'applyLink') return;
      const row = body[data.row.index];
      if (row?._url) {
        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: row._url });
      }
    },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      const page = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(7);
      doc.setTextColor(140, 152, 166);
      doc.text('NCR Tech Internship Finder · committee-verified data', 40, pageHeight - 18);
      doc.text(`Page ${page}`, pageWidth - 40, pageHeight - 18, { align: 'right' });
    },
  });

  doc.save(`${fileBase()}.pdf`);
}

async function recordReport(rows) {
  try {
    await http.post(
      '/reports',
      {
        reportType: state.reportType,
        format: state.format,
        scope: scopeLabel().slice(0, 200),
        recordCount: rows.length,
        generatedBy: getReviewerName(state.config),
        filters: {
          categories: filteredCategories(),
          includeLinks: state.includeLinks,
          includeSource: state.includeSource,
          includeEligibility: state.includeEligibility,
        },
      },
      { timeout: 20_000 },
    );
    await loadHistory();
  } catch (error) {
    toast({
      type: 'warning',
      title: 'Report downloaded, history not recorded',
      message: describeError(error),
      timeout: 7000,
    });
  }
}

async function generateReport(event) {
  event.preventDefault();
  if (!state.categories.size) {
    toast({ type: 'warning', title: 'Select a category', message: 'Choose at least one category to include.' });
    return;
  }
  if (!getReviewerName(state.config)) {
    toast({ type: 'warning', title: 'Reviewer name required', message: 'Set your committee name in Settings first.' });
    return;
  }

  const submit = document.getElementById('generate-report');
  const restore = setButtonLoading(submit, 'Preparing report…');
  try {
    if (state.reportType === 'full_directory') {
      await ensureDirectory();
      renderPreview();
    }
    const rows = selectedRows();
    if (!rows.length) {
      toast({
        type: 'warning',
        title: 'No records to export',
        message:
          state.reportType === 'verified_opportunities'
            ? 'Verify at least one opportunity in the selected categories first.'
            : 'No directory records match the selected categories.',
      });
      return;
    }

    const columns = exportColumns();
    if (state.format === 'pdf') exportPdf(rows, columns);
    else exportXlsx(rows, columns);

    toast({
      type: 'success',
      title: 'Report downloaded',
      message: `${rows.length} record${rows.length === 1 ? '' : 's'} exported as ${
        state.format === 'pdf' ? 'PDF' : 'Excel'
      }.`,
    });
    await recordReport(rows);
  } catch (error) {
    toast({ type: 'error', title: 'Report generation failed', message: describeError(error), timeout: 7000 });
  } finally {
    restore();
  }
}

$(async () => {
  try {
    const { config } = await boot({ page: 'reports' });
    state.config = config;
  } catch {
    return;
  }

  state.categories = new Set(state.config.categories);
  initCategoryOptions();

  $('#report-category-options').on('change', 'input[name="reportCategory"]', function onCategory() {
    if (this.checked) state.categories.add(this.value);
    else state.categories.delete(this.value);
    updateCategoryCaption();
    renderPreview();
  });

  $('#report-format-options').on('change', 'input[name="format"]', function onFormat() {
    state.format = this.value;
    $('#report-format-options .format-option').removeClass('selected');
    $(this).closest('.format-option').addClass('selected');
    renderPreview();
  });

  $('#report-type').on('change', async function onType() {
    state.reportType = this.value;
    $('#report-type-help').text(
      state.reportType === 'verified_opportunities'
        ? 'Includes only opportunities the committee has verified as active.'
        : 'Includes every record in the directory, with verification status shown.',
    );
    if (state.reportType === 'full_directory' && !state.directoryJobs) {
      $('#preview-jobs-body').html(`<tr><td colspan="5">${loadingState('Loading the full directory…')}</td></tr>`);
      try {
        await ensureDirectory();
      } catch (error) {
        toast({ type: 'error', title: 'Directory unavailable', message: describeError(error) });
      }
    }
    renderPreview();
  });

  $('#report-include-links').on('change', function toggleLinks() {
    state.includeLinks = this.checked;
    renderPreview();
  });
  $('#report-include-source').on('change', function toggleSource() {
    state.includeSource = this.checked;
    renderPreview();
  });
  $('#report-include-eligibility').on('change', function toggleEligibility() {
    state.includeEligibility = this.checked;
    renderPreview();
  });

  $('#report-form').on('submit', generateReport);

  $('#refresh-report-preview').on('click', async function refreshReports() {
    const restore = setButtonLoading(this, 'Refreshing…');
    state.directoryJobs = null;
    await Promise.all([loadSummary(), loadHistory()]);
    if (state.reportType === 'full_directory') {
      try {
        await ensureDirectory();
      } catch {
        // The preview already surfaces the failure.
      }
    }
    renderPreview();
    restore();
    toast({ type: 'success', title: 'Report data refreshed', message: 'The preview now reflects the latest committee records.' });
  });

  $(document).on('click', '[data-retry-reports]', () => {
    $('#reports-alert').html('');
    loadSummary();
  });

  $(document).on('click', '[data-report-job]', function openReportJob() {
    const id = $(this).data('report-job');
    if (id) {
      openJobDrawer(id, { config: state.config, onChanged: () => loadSummary() });
    }
  });

  await Promise.all([loadSummary(), loadHistory()]);
});
