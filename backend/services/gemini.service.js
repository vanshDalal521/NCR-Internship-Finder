import axios from 'axios';
import { z } from 'zod';
import { env } from '../config/env.js';
import { CATEGORIES } from '../config/constants.js';
import { ApiError } from '../utils/http-error.js';
import { logger } from '../utils/logger.js';
import { stripHtml, truncate, uniqueStrings } from '../utils/text.js';

const responseSchema = z.object({
  category: z.string().nullable().optional().default(null),
  skills: z.array(z.string()).optional().default([]),
  eligibility: z.string().optional().default(''),
  relevanceScore: z.coerce.number().min(0).max(100).optional().default(0),
  summary: z.string().optional().default(''),
  redFlags: z.array(z.string()).optional().default([]),
  isInternship: z.boolean().optional().default(true),
});

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING', enum: CATEGORIES, nullable: true },
    skills: { type: 'ARRAY', items: { type: 'STRING' } },
    eligibility: { type: 'STRING' },
    relevanceScore: { type: 'INTEGER' },
    summary: { type: 'STRING' },
    redFlags: { type: 'ARRAY', items: { type: 'STRING' } },
    isInternship: { type: 'BOOLEAN' },
  },
  required: ['category', 'skills', 'eligibility', 'relevanceScore', 'summary', 'redFlags', 'isInternship'],
};

function buildPrompt(job) {
  const description = stripHtml(job.job_description || '').slice(0, 9000);
  return [
    'Analyse this internship listing for a college placement committee in Delhi NCR.',
    'Use only facts stated in the posting. Do not invent details, skills, eligibility or benefits.',
    '',
    `Company: ${job.company_name}`,
    `Role: ${job.job_title}`,
    `Location: ${job.location || job.city || 'Not provided'}`,
    `Work mode: ${job.work_mode || 'Not specified'}`,
    `Stipend as listed: ${job.stipend || 'Not provided'}`,
    `Duration: ${job.duration || 'Not provided'}`,
    `Eligibility as listed: ${job.eligibility || 'Not provided'}`,
    `Source: ${job.source}`,
    '',
    'POSTING TEXT:',
    description || '(No description was provided by the job source.)',
    '',
    'Return JSON with these fields:',
    `- category: exactly one of ${CATEGORIES.join(', ')}, or null if none fit.`,
    '- skills: up to 12 technical or role-specific skills explicitly present in the posting.',
    '- eligibility: a concise eligibility summary only if the posting states it; otherwise "".',
    '- relevanceScore: 0–100 for a third-year B.Tech CSE student from Delhi NCR interested in a relevant internship. Score location accessibility, technical fit and posting clarity, not prestige.',
    '- summary: two short factual sentences about the role.',
    '- redFlags: concrete concerns visible in the posting (for example unpaid, commission-only, vague scope, unrealistic experience). Do not speculate.',
    '- isInternship: true only if the posting describes an internship or traineeship.',
  ].join('\n');
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => part?.text || '').join('').trim();
}

function parseJson(text) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function mapGeminiError(error) {
  if (error instanceof ApiError) return error;
  const status = error.response?.status;
  if (status === 400) {
    return ApiError.upstream('Gemini rejected the analysis request. Verify GEMINI_MODEL and API access.');
  }
  if (status === 401 || status === 403) {
    return ApiError.unavailable('Gemini rejected the API key. Check GEMINI_API_KEY in the backend environment.');
  }
  if (status === 429) {
    return ApiError.tooManyRequests('The Gemini API quota has been reached. Try again later.');
  }
  if (status) return ApiError.upstream(`Gemini returned HTTP ${status}.`);
  if (error.code === 'ECONNABORTED') return ApiError.upstream('Gemini did not respond in time.');
  return ApiError.upstream('Gemini could not be reached.');
}

export function isGeminiConfigured() {
  return Boolean(env.GEMINI_API_KEY);
}

export async function analyzeJobWithGemini(job) {
  if (!isGeminiConfigured()) {
    throw ApiError.unavailable('Gemini is not configured. Add GEMINI_API_KEY to the backend environment.');
  }

  const model = env.GEMINI_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let payload;
  try {
    const response = await axios.post(
      endpoint,
      {
        systemInstruction: {
          parts: [
            {
              text:
                'You are a precise internship analyst. You extract information from job postings and never fabricate missing facts. Missing information must stay empty or null.',
            },
          ],
        },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(job) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1600,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_SCHEMA,
        },
      },
      {
        timeout: 45_000,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
      },
    );
    payload = response.data;
  } catch (error) {
    throw mapGeminiError(error);
  }

  const rawText = extractText(payload);
  if (!rawText) {
    throw ApiError.upstream('Gemini returned an empty analysis. The posting may have been blocked by safety filters.');
  }

  const parsedJson = parseJson(rawText);
  if (!parsedJson) throw ApiError.upstream('Gemini returned an analysis that was not valid JSON.');

  const validated = responseSchema.safeParse(parsedJson);
  if (!validated.success) {
    logger.warn('Gemini analysis failed validation', {
      issues: validated.error.issues.map((issue) => issue.message),
    });
    throw ApiError.upstream('Gemini returned an analysis in an unexpected format.');
  }

  const output = validated.data;
  const category = CATEGORIES.includes(output.category) ? output.category : null;
  const skills = uniqueStrings(
    output.skills
      .map((skill) => stripHtml(skill).replace(/[.;]+$/, '').trim())
      .filter((skill) => skill.length > 0 && skill.length <= 60),
  ).slice(0, 12);

  const usage = payload.usageMetadata || {};

  return {
    category,
    skills,
    eligibility_notes: output.eligibility ? truncate(stripHtml(output.eligibility), 900) : null,
    relevance_score: Math.round(output.relevanceScore),
    summary: output.summary ? truncate(stripHtml(output.summary), 700) : null,
    red_flags: output.redFlags.map((flag) => truncate(stripHtml(flag), 220)).filter(Boolean).slice(0, 8),
    ai_model: model,
    analysis_source: 'gemini',
    raw_response: {
      parsed: output,
      usage: {
        promptTokens: usage.promptTokenCount ?? null,
        candidateTokens: usage.candidatesTokenCount ?? null,
      },
    },
  };
}
