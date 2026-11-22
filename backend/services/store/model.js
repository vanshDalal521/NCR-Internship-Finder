export const JOB_FIELDS = [
  'id',
  'company_id',
  'company_name',
  'job_title',
  'category',
  'location',
  'city',
  'work_mode',
  'employment_type',
  'job_description',
  'required_skills',
  'stipend',
  'stipend_min',
  'stipend_max',
  'stipend_monthly_min',
  'stipend_monthly_max',
  'stipend_currency',
  'stipend_period',
  'stipend_note',
  'duration',
  'eligibility',
  'experience_required',
  'application_url',
  'source',
  'source_job_id',
  'source_url',
  'fingerprint',
  'posted_at',
  'deadline',
  'last_seen_at',
  'verification_status',
  'last_verified_at',
  'verified_by',
  'screening_status',
  'screening_outcome',
  'screening_message',
  'link_checked_at',
  'link_http_status',
  'is_active',
  'relevance_score',
  'raw_payload',
  'created_at',
  'updated_at',
];

export const COMPANY_FIELDS = [
  'id',
  'name',
  'normalized_name',
  'industry',
  'website',
  'careers_url',
  'location',
  'city',
  'contact_email',
  'contact_phone',
  'description',
  'created_at',
  'updated_at',
];

export const ANALYSIS_FIELDS = [
  'id',
  'job_id',
  'category',
  'skills',
  'eligibility_notes',
  'relevance_score',
  'summary',
  'red_flags',
  'ai_model',
  'analysis_source',
  'raw_response',
  'created_at',
  'updated_at',
];

export const VERIFICATION_LOG_FIELDS = [
  'id',
  'job_id',
  'previous_status',
  'new_status',
  'reviewer',
  'notes',
  'checked_url',
  'link_http_status',
  'created_at',
];

export const REPORT_FIELDS = [
  'id',
  'report_type',
  'format',
  'scope',
  'record_count',
  'generated_by',
  'filters',
  'created_at',
];

export function pickFields(record, fields, { includeUndefined = false } = {}) {
  const output = {};
  for (const field of fields) {
    if (record[field] !== undefined || includeUndefined) output[field] = record[field];
  }
  return output;
}

export function withoutInternalJobFields(job) {
  if (!job) return null;
  const { raw_payload: _rawPayload, ...rest } = job;
  return rest;
}

export function withoutInternalCompanyFields(company) {
  if (!company) return null;
  const { normalized_name: _normalized, ...rest } = company;
  return rest;
}
