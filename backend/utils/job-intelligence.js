import { CATEGORY_RULES, LOCATIONS, SKILL_DICTIONARY, WORK_MODES } from '../config/constants.js';
import { normalizeWhitespace, stripHtml, uniqueStrings } from './text.js';

const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const CITY_LOOKUP = LOCATIONS.flatMap((location) =>
  location.aliases.map((alias) => ({ city: location.city, alias: alias.toLowerCase() })),
).sort((a, b) => b.alias.length - a.alias.length);

function containsTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundaryStart = /^[a-z0-9]/i.test(term) ? '(?<![a-z0-9])' : '';
  const boundaryEnd = /[a-z0-9]$/i.test(term) ? '(?![a-z0-9])' : '';
  try {
    return new RegExp(`${boundaryStart}${escaped}${boundaryEnd}`, 'i').test(text);
  } catch {
    return text.toLowerCase().includes(term.toLowerCase());
  }
}

export function detectCity(...values) {
  const haystack = values.filter(Boolean).join(' | ').toLowerCase();
  if (!haystack) return null;
  for (const { city, alias } of CITY_LOOKUP) {
    if (containsTerm(haystack, alias)) return city;
  }
  return null;
}

export function inferCategory(title = '', description = '') {
  const titleText = String(title);
  const bodyText = String(description).slice(0, 12000);
  let best = null;
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const term of rule.terms) {
      if (containsTerm(titleText, term)) score += 4;
      else if (containsTerm(bodyText, term)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule.category;
    }
  }

  return bestScore > 0 ? best : null;
}

export function isInternshipLike({ title = '', employmentType = '', description = '' }) {
  if (/\bintern(ship)?s?\b/i.test(title)) return true;
  if (/\bintern(ship)?s?\b/i.test(employmentType)) return true;
  return /\bintern(ship)?s?\b/i.test(String(description).slice(0, 1200));
}

export function inferWorkMode({ isRemote, description = '', fallback = null } = {}) {
  if (isRemote === true) return 'Remote';
  const text = String(description).slice(0, 3000);
  if (/\bhybrid\b/i.test(text)) return 'Hybrid';
  if (/\b(work from home|fully remote|remote internship|remote role)\b/i.test(text)) return 'Remote';
  if (WORK_MODES.includes(fallback)) return fallback;
  return 'On-site';
}

function parseAmount(value) {
  if (value === null || value === undefined) return null;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function periodLabel(period) {
  switch (period) {
    case 'MONTH':
    case 'month':
      return 'month';
    case 'YEAR':
    case 'year':
      return 'year';
    case 'HOUR':
    case 'hour':
      return 'hour';
    case 'DAY':
    case 'day':
      return 'day';
    default:
      return 'month';
  }
}

function monthlyEquivalent(amount, period) {
  if (!amount) return null;
  if (period === 'YEAR' || period === 'year') return Math.round(amount / 12);
  if (period === 'MONTH' || period === 'month') return Math.round(amount);
  if (period === 'DAY' || period === 'day') return Math.round(amount * 22);
  return null;
}

function buildStipend({ min, max, period, estimated = false, note = '' }) {
  const normalizedPeriod = periodLabel(period);
  const roundedMin = min ? Math.round(min) : null;
  const roundedMax = max ? Math.round(max) : null;

  let display;
  if (roundedMin && roundedMax && roundedMax !== roundedMin) {
    display = `${estimated ? '~' : ''}${INR_FORMATTER.format(roundedMin)} – ${INR_FORMATTER.format(roundedMax)} / ${normalizedPeriod}`;
  } else {
    const amount = roundedMax || roundedMin;
    if (!amount) return null;
    display = `${estimated ? '~' : ''}${INR_FORMATTER.format(amount)} / ${normalizedPeriod}`;
  }

  return {
    display,
    min: roundedMin,
    max: roundedMax,
    currency: 'INR',
    period: normalizedPeriod,
    monthlyMin: monthlyEquivalent(roundedMin, normalizedPeriod),
    monthlyMax: monthlyEquivalent(roundedMax, normalizedPeriod),
    estimated,
    note,
  };
}

export function stipendFromSalaryFields({ min, max, period, predicted = false }) {
  const numericMin = parseAmount(min);
  const numericMax = parseAmount(max);
  if (!numericMin && !numericMax) return null;
  const normalizedPeriod = String(period || 'month').toUpperCase();
  return buildStipend({
    min: numericMin,
    max: numericMax,
    period: normalizedPeriod,
    estimated: Boolean(predicted),
    note: predicted ? 'Estimated by job source' : '',
  });
}

export function parseStipendFromText(text = '') {
  if (!text) return null;
  const source = String(text).replace(/\u00a0/g, ' ').slice(0, 12000);
  const amount = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
  const separator = '\\s*(?:-|–|—|to)\\s*';

  const explicit = [
    {
      regex: new RegExp(
        `(?:₹|rs\\.?|inr)\\s*${amount}${separator}(?:₹|rs\\.?|inr)?\\s*${amount}\\s*(?:\\/|per\\s*)?\\s*(month|monthly|mo|year|annum|annually|yr|hour|hr|day)\\b`,
        'i',
      ),
      periodIndex: 3,
    },
    {
      regex: new RegExp(
        `(?:₹|rs\\.?|inr)\\s*${amount}\\s*(?:\\/|per\\s*)?\\s*(month|monthly|mo|year|annum|annually|yr|hour|hr|day)\\b`,
        'i',
      ),
      periodIndex: 2,
    },
    {
      regex: new RegExp(`(?:₹|rs\\.?|inr)\\s*${amount}${separator}(?:₹|rs\\.?|inr)?\\s*${amount}`, 'i'),
      periodIndex: null,
      defaultPeriod: 'month',
    },
    {
      regex: new RegExp(`(?:₹|rs\\.?|inr)\\s*${amount}`, 'i'),
      periodIndex: null,
      defaultPeriod: 'month',
    },
  ];

  for (const candidate of explicit) {
    const match = source.match(candidate.regex);
    if (!match) continue;
    const min = parseAmount(match[1]);
    const max = candidate.periodIndex ? parseAmount(match[2]) : parseAmount(match[1]);
    const rawPeriod = candidate.periodIndex ? match[candidate.periodIndex] : candidate.defaultPeriod;
    if (!min) continue;

    let period = 'month';
    if (/year|annum|annually|yr/i.test(rawPeriod || '')) period = 'year';
    else if (/hour|hr/i.test(rawPeriod || '')) period = 'hour';
    else if (/day/i.test(rawPeriod || '')) period = 'day';

    // A bare amount above ₹2,00,000 is far more likely an annual figure.
    if (!candidate.periodIndex && min >= 200000) period = 'year';

    return buildStipend({ min, max, period });
  }

  const lpa = source.match(
    /([0-9]+(?:\.[0-9]+)?)\s*(?:-|–|to)?\s*([0-9]+(?:\.[0-9]+)?)?\s*(lpa|lakhs? per annum|lakh per annum|lakhs?)\b/i,
  );
  if (lpa) {
    const min = Number(lpa[1]) * 100000;
    const max = lpa[2] ? Number(lpa[2]) * 100000 : min;
    return buildStipend({ min, max, period: 'year' });
  }

  const monthlyShorthand = source.match(
    /([0-9]+(?:\.[0-9]+)?)\s*(?:k|thousand)\s*(?:\/|per\s*)?\s*(month|monthly)\b/i,
  );
  if (monthlyShorthand) {
    return buildStipend({ min: Number(monthlyShorthand[1]) * 1000, period: 'month' });
  }

  const stipendContext = source.match(
    /\bstipend\b[^.\n]{0,40}?(?:₹|rs\.?|inr)?\s*([0-9][0-9,]{2,})\s*(?:\/|per\s*)?\s*(month|monthly)?/i,
  );
  if (stipendContext) {
    const value = parseAmount(stipendContext[1]);
    if (value) {
      const period = value >= 200000 ? 'year' : 'month';
      return buildStipend({ min: value, period });
    }
  }

  return null;
}

const SKILL_ALIASES = {
  JavaScript: ['javascript', 'java script', 'js'],
  TypeScript: ['typescript', 'type script'],
  React: ['react', 'react.js', 'reactjs'],
  'Next.js': ['next.js', 'nextjs', 'next js'],
  Vue: ['vue', 'vue.js', 'vuejs'],
  Angular: ['angular', 'angular.js', 'angularjs'],
  'Node.js': ['node.js', 'nodejs', 'node js'],
  Express: ['express.js', 'expressjs', 'express'],
  HTML: ['html', 'html5'],
  CSS: ['css', 'css3'],
  Tailwind: ['tailwind', 'tailwind css', 'tailwindcss'],
  Bootstrap: ['bootstrap'],
  jQuery: ['jquery'],
  Python: ['python'],
  Java: ['java'],
  'C++': ['c++', 'cpp'],
  C: ['c programming', 'c language'],
  Go: ['golang', 'go language'],
  Rust: ['rust'],
  PHP: ['php'],
  Django: ['django'],
  Flask: ['flask'],
  FastAPI: ['fastapi', 'fast api'],
  'Spring Boot': ['spring boot', 'springboot'],
  SQL: ['sql'],
  MySQL: ['mysql'],
  PostgreSQL: ['postgresql', 'postgres'],
  MongoDB: ['mongodb', 'mongo db'],
  Redis: ['redis'],
  SQLite: ['sqlite'],
  Pandas: ['pandas'],
  NumPy: ['numpy'],
  'Scikit-learn': ['scikit-learn', 'scikit learn', 'sklearn'],
  TensorFlow: ['tensorflow', 'tensor flow'],
  PyTorch: ['pytorch', 'py torch'],
  Keras: ['keras'],
  OpenCV: ['opencv', 'open cv'],
  NLP: ['nlp', 'natural language processing'],
  LLM: ['llm', 'llms', 'large language model'],
  LangChain: ['langchain', 'lang chain'],
  RAG: ['rag', 'retrieval augmented generation'],
  'Prompt Engineering': ['prompt engineering'],
  'Power BI': ['power bi', 'powerbi'],
  Tableau: ['tableau'],
  Excel: ['excel', 'ms excel', 'microsoft excel', 'advanced excel'],
  'Data Visualization': ['data visualization', 'data visualisation'],
  Statistics: ['statistics', 'statistical analysis'],
  AWS: ['aws', 'amazon web services'],
  Azure: ['azure', 'microsoft azure'],
  GCP: ['gcp', 'google cloud platform', 'google cloud'],
  Docker: ['docker'],
  Kubernetes: ['kubernetes', 'k8s'],
  Terraform: ['terraform'],
  'CI/CD': ['ci/cd', 'cicd', 'continuous integration'],
  Linux: ['linux', 'unix'],
  Git: ['git'],
  'GitHub Actions': ['github actions'],
  Jenkins: ['jenkins'],
  Kafka: ['kafka', 'apache kafka'],
  Spark: ['apache spark', 'pyspark'],
  Hadoop: ['hadoop'],
  Airflow: ['airflow', 'apache airflow'],
  Cybersecurity: ['cybersecurity', 'cyber security', 'information security'],
  SIEM: ['siem', 'splunk', 'ibm qradar', 'qradar'],
  Wireshark: ['wireshark'],
  'Burp Suite': ['burp suite', 'burpsuite'],
  Nmap: ['nmap'],
  Metasploit: ['metasploit'],
  OWASP: ['owasp'],
  Firewall: ['firewall'],
  'REST API': ['rest api', 'restful api', 'rest apis'],
  GraphQL: ['graphql'],
  Microservices: ['microservices', 'micro services'],
  Firebase: ['firebase'],
  Supabase: ['supabase'],
  Figma: ['figma'],
  Jira: ['jira'],
  Postman: ['postman'],
  Selenium: ['selenium'],
  Jest: ['jest'],
  Cypress: ['cypress'],
  'Manual Testing': ['manual testing'],
};

const SKILL_MATCHERS = Object.entries(SKILL_ALIASES).map(([canonical, aliases]) => ({
  canonical,
  aliases,
}));

export function extractSkills(text = '', providedSkills = []) {
  const haystack = String(text || '');
  const found = [];
  for (const { canonical, aliases } of SKILL_MATCHERS) {
    if (aliases.some((alias) => containsTerm(haystack, alias))) found.push(canonical);
  }

  const provided = (Array.isArray(providedSkills) ? providedSkills : [])
    .map((skill) => {
      const clean = String(skill).trim();
      if (!clean) return null;
      const match = SKILL_MATCHERS.find(({ aliases }) =>
        aliases.some((alias) => alias.toLowerCase() === clean.toLowerCase()),
      );
      return match?.canonical ?? clean;
    })
    .filter(Boolean);

  const ordered = uniqueStrings([...provided, ...found]);
  const preferredOrder = new Map(SKILL_DICTIONARY.map((skill, index) => [skill, index]));
  return ordered
    .sort((a, b) => (preferredOrder.get(a) ?? 999) - (preferredOrder.get(b) ?? 999))
    .slice(0, 15);
}

export function extractDuration(text = '') {
  if (!text) return null;
  const source = String(text).slice(0, 12000);
  const patterns = [
    /(?:internship\s+)?(?:duration|tenure|period)\s*[:\-–]?\s*([0-9]{1,2}\s*(?:-|–|to)?\s*[0-9]{0,2}\s*(?:weeks?|months?|years?))/i,
    /([0-9]{1,2}\s*(?:-|–|to)\s*[0-9]{1,2}\s*months?)\s*(?:internship|intern|training)/i,
    /([0-9]{1,2}\s*months?)\s*(?:internship|internship program|internship programme|training program)/i,
    /(?:internship|intern)\s*(?:of|for)\s*([0-9]{1,2}\s*(?:weeks?|months?|years?))/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return normalizeWhitespace(match[1]).replace(/\s*-\s*/g, '–');
  }
  return null;
}

const ELIGIBILITY_CUES = [
  'eligibility',
  'who can apply',
  'qualification',
  'currently pursuing',
  'pursuing a',
  'pursuing b',
  'final year',
  'pre-final year',
  'graduating',
  'batch of',
  'b.tech',
  'b.e.',
  'bca',
  'mca',
  'students',
];

function splitSentences(text) {
  return String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => normalizeWhitespace(line.replace(/^[•*-]\s*/, '')))
    .filter(Boolean);
}

export function extractEligibility(text = '', providedQualifications = '') {
  const provided = normalizeWhitespace(providedQualifications);
  if (provided) return provided.slice(0, 900);

  const sentences = splitSentences(text);
  const matches = sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    return ELIGIBILITY_CUES.some((cue) => lower.includes(cue));
  });
  if (!matches.length) return null;
  return matches.slice(0, 3).join(' ').slice(0, 900);
}

export function extractExperience(text = '', providedExperience = '') {
  const provided = normalizeWhitespace(providedExperience);
  if (provided) return provided.slice(0, 300);

  const sentences = splitSentences(text);
  const match = sentences.find((sentence) =>
    /(?:experience|fresher|freshers|entry level|0\s*-\s*1\s*years?)/i.test(sentence),
  );
  return match ? match.slice(0, 300) : null;
}

export function cleanDescription(value = '') {
  return stripHtml(value).slice(0, 20000);
}

export function formatSalaryPeriod(period) {
  return periodLabel(String(period || '').toUpperCase());
}
