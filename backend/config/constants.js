export const CATEGORIES = [
  'Web Development',
  'Data Analytics',
  'AI / ML / GenAI',
  'Cybersecurity',
  'Software Engineering',
  'Cloud / DevOps',
  'Technical Operations',
  'Business Operations',
];

export const CATEGORY_TARGETS = {
  'Web Development': 5,
  'Data Analytics': 4,
  'AI / ML / GenAI': 4,
  Cybersecurity: 2,
  'Software Engineering': 2,
  'Cloud / DevOps': 1,
  'Technical Operations': 1,
  'Business Operations': 1,
};

export const LOCATIONS = [
  {
    city: 'Gurugram',
    priority: 1,
    aliases: ['gurugram', 'gurgaon', 'cyber city', 'udyog vihar', 'golf course road', 'sohna road', 'sector 44', 'sector 48'],
    hubs: ['Cyber City', 'Udyog Vihar', 'Golf Course Road', 'Sohna Road', 'Sector 44', 'Sector 48'],
  },
  {
    city: 'Noida',
    priority: 2,
    aliases: ['noida', 'greater noida', 'sector 62', 'sector 63', 'sector 125', 'sector 132'],
    hubs: ['Sector 62', 'Sector 63', 'Sector 125', 'Sector 132'],
  },
  {
    city: 'Delhi',
    priority: 3,
    aliases: ['delhi', 'new delhi', 'okhla', 'nehru place', 'connaught place'],
    hubs: ['Okhla', 'Nehru Place', 'Connaught Place'],
  },
  {
    city: 'Faridabad',
    priority: 4,
    aliases: ['faridabad', 'ballabgarh'],
    hubs: ['Ballabgarh'],
  },
];

export const CITIES = LOCATIONS.map((location) => location.city);

export const SEARCH_KEYWORDS = [
  'software developer intern',
  'frontend developer intern',
  'backend developer intern',
  'full stack developer intern',
  'react developer intern',
  'data analyst intern',
  'business analyst intern',
  'machine learning intern',
  'AI engineer intern',
  'generative AI intern',
  'cybersecurity intern',
  'SOC analyst intern',
  'cloud engineer intern',
  'DevOps intern',
  'technical operations intern',
  'business operations intern',
];

export const WORK_MODES = ['On-site', 'Hybrid', 'Remote'];

export const VERIFICATION_STATUSES = [
  'pending',
  'verified_active',
  'needs_review',
  'expired',
  'rejected',
];

export const VERIFICATION_LABELS = {
  pending: 'Pending',
  verified_active: 'Verified Active',
  needs_review: 'Needs Review',
  expired: 'Expired',
  rejected: 'Rejected',
};

export const SOURCES = ['jsearch', 'adzuna', 'manual'];

export const SOURCE_LABELS = {
  jsearch: 'JSearch',
  adzuna: 'Adzuna',
  manual: 'Manual',
};

export const CATEGORY_RULES = [
  {
    category: 'AI / ML / GenAI',
    terms: ['machine learning', 'artificial intelligence', 'deep learning', 'generative ai', 'genai', 'llm', 'nlp', 'computer vision', 'data scientist', 'ml engineer', 'ai engineer'],
  },
  {
    category: 'Data Analytics',
    terms: ['data analyst', 'data analytics', 'business intelligence', 'power bi', 'tableau', 'sql analyst', 'analytics intern', 'data science intern', 'dashboard'],
  },
  {
    category: 'Cybersecurity',
    terms: ['cybersecurity', 'cyber security', 'soc analyst', 'security analyst', 'penetration testing', 'ethical hacking', 'information security', 'siem', 'vulnerability'],
  },
  {
    category: 'Cloud / DevOps',
    terms: ['devops', 'cloud engineer', 'aws intern', 'azure intern', 'gcp intern', 'kubernetes', 'docker', 'site reliability', 'platform engineer'],
  },
  {
    category: 'Web Development',
    terms: ['frontend', 'front-end', 'backend', 'back-end', 'full stack', 'fullstack', 'web developer', 'react developer', 'node developer', 'angular', 'vue', 'ui developer', 'wordpress'],
  },
  {
    category: 'Technical Operations',
    terms: ['technical operations', 'technical support', 'it support', 'systems engineer', 'network engineer', 'qa engineer', 'quality assurance', 'test engineer', 'implementation engineer', 'technical associate'],
  },
  {
    category: 'Business Operations',
    terms: ['business operations', 'business analyst', 'operations intern', 'product operations', 'sales operations', 'business development', 'program management', 'project coordinator'],
  },
  {
    category: 'Software Engineering',
    terms: ['software engineer', 'software developer', 'sde intern', 'sde', 'programmer', 'application developer', 'android developer', 'ios developer', 'embedded'],
  },
];

export const SKILL_DICTIONARY = [
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Vue', 'Angular', 'Node.js', 'Express',
  'HTML', 'CSS', 'Tailwind', 'Bootstrap', 'jQuery', 'Python', 'Java', 'C++', 'C', 'Go',
  'Rust', 'PHP', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'SQL', 'MySQL', 'PostgreSQL',
  'MongoDB', 'Redis', 'SQLite', 'Pandas', 'NumPy', 'Scikit-learn', 'TensorFlow', 'PyTorch',
  'Keras', 'OpenCV', 'NLP', 'LLM', 'LangChain', 'RAG', 'Prompt Engineering', 'Power BI',
  'Tableau', 'Excel', 'Data Visualization', 'Statistics', 'AWS', 'Azure', 'GCP', 'Docker',
  'Kubernetes', 'Terraform', 'CI/CD', 'Linux', 'Git', 'GitHub Actions', 'Jenkins', 'Kafka',
  'Spark', 'Hadoop', 'Airflow', 'Cybersecurity', 'SIEM', 'Wireshark', 'Burp Suite', 'Nmap',
  'Metasploit', 'OWASP', 'Firewall', 'REST API', 'GraphQL', 'Microservices', 'Firebase',
  'Supabase', 'Figma', 'Jira', 'Postman', 'Selenium', 'Jest', 'Cypress', 'Manual Testing',
];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_REVIEWER = 'Placement Committee';

export const USER_ROLES = ['Placement Officer', 'Faculty Coordinator', 'Student Coordinator', 'Committee Member'];
