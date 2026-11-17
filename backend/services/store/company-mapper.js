import { normalizeCompanyName, normalizeWhitespace } from '../../utils/text.js';
import { isHttpUrl } from '../../utils/url.js';

export function companyPayloadFromJob(job) {
  const source = job.company || {};
  const name = normalizeWhitespace(source.name || job.company_name || '');
  if (!name) return null;
  const normalized = normalizeCompanyName(name);
  if (!normalized) return null;

  const website = source.website && isHttpUrl(source.website) ? source.website : null;
  const careersUrl = source.careersUrl && isHttpUrl(source.careersUrl) ? source.careersUrl : null;

  return {
    name,
    normalized_name: normalized,
    industry: normalizeWhitespace(source.industry || '') || null,
    website,
    careers_url: careersUrl,
    location: normalizeWhitespace(source.location || job.location || '') || null,
    city: source.city || job.city || null,
    contact_email: source.contactEmail || null,
    contact_phone: source.contactPhone || null,
    description: source.description || null,
  };
}
