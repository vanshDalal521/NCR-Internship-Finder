import { buildReportSummary } from '../services/analytics.service.js';
import { getStore } from '../services/store/index.js';
import { parseOrThrow, reportRecordSchema } from '../utils/validation.js';

export async function reportSummary(req, res) {
  const store = await getStore();
  const jobs = await store.listAllJobs();
  res.json({ success: true, data: buildReportSummary(jobs) });
}

export async function recordReport(req, res) {
  const input = parseOrThrow(reportRecordSchema, req.body || {});
  const store = await getStore();
  const report = await store.addReport({
    report_type: input.reportType,
    format: input.format,
    scope: input.scope,
    record_count: input.recordCount,
    generated_by: input.generatedBy,
    filters: input.filters,
  });
  res.status(201).json({ success: true, data: report });
}

export async function reportHistory(req, res) {
  const store = await getStore();
  const items = await store.listReports(Math.max(1, Math.min(Number(req.query.limit) || 12, 50)));
  res.json({ success: true, data: { items } });
}
