import { buildDashboard } from '../services/analytics.service.js';
import { getStore } from '../services/store/index.js';

export async function dashboard(req, res) {
  const store = await getStore();
  const scope = req.query.scope === 'verified' ? 'verified' : 'all';
  const jobs = await store.listAllJobs();
  const data = buildDashboard(jobs, { scope });
  res.json({ success: true, data });
}
