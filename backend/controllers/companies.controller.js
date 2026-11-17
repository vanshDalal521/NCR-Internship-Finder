import { z } from 'zod';
import { getStore } from '../services/store/index.js';
import { buildCompanyDirectory, summarizeCompany } from '../services/analytics.service.js';
import { ApiError } from '../utils/http-error.js';
import { parseOrThrow } from '../utils/validation.js';
import { CITIES } from '../config/constants.js';

const uuidSchema = z.string().uuid('A valid company ID is required.');
const companyListQuerySchema = z.object({
  search: z.string().trim().max(160).optional().default(''),
  city: z.enum(CITIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
});

export async function listCompanies(req, res) {
  const query = parseOrThrow(companyListQuerySchema, req.query);
  const store = await getStore();
  const [companies, jobs] = await Promise.all([store.listCompanies(), store.listAllJobs()]);

  let directory = buildCompanyDirectory(companies, jobs);
  if (query.city) directory = directory.filter((company) => company.city === query.city);
  if (query.search) {
    const search = query.search.toLowerCase();
    directory = directory.filter((company) =>
      [
        company.name,
        company.industry,
        company.city,
        company.location,
        ...(company.locations || []),
        ...(company.categories || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  }

  const total = directory.length;
  const start = (query.page - 1) * query.limit;
  const items = directory.slice(start, start + query.limit);

  res.json({
    success: true,
    data: {
      items,
      summary: {
        companies: directory.length,
        withVerifiedOpportunities: directory.filter((company) => company.verifiedActive > 0).length,
      },
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    },
  });
}

export async function getCompany(req, res) {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const store = await getStore();
  const [company, jobs] = await Promise.all([store.getCompanyById(id), store.listJobsByCompany(id)]);
  if (!company) throw ApiError.notFound('That company record was not found.');

  res.json({
    success: true,
    data: {
      company,
      summary: summarizeCompany(company, jobs),
      jobs,
    },
  });
}
