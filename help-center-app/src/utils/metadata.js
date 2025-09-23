const PERSONA_KEYWORDS = {
  employee: ['employee', 'cardholder', 'end user', 'tap to pay', 'spend limit', 'receipt'],
  admin: ['admin', 'administrator', 'finance', 'control', 'policy', 'approval', 'reimburse', 'manager'],
  bookkeeper: ['accounting', 'close', 'quickbooks', 'netsuite', 'intacct', 'xero', 'erp', 'journal'],
  vendor: ['vendor', 'supplier', 'bill pay vendor', 'payee'],
  it: ['sso', 'single sign-on', 'mfa', 'security', 'login', 'okta', 'entra', 'jumpcloud']
};

const FEATURE_KEYWORDS = {
  notifications: ['notification', 'email', 'sms'],
  authentication: ['login', 'sso', 'mfa', 'security'],
  travel: ['travel', 'flight', 'hotel'],
  reimbursements: ['reimbursement', 'out-of-pocket'],
  expenses: ['receipt', 'expense', 'card', 'transaction'],
  billPay: ['bill pay', 'vendor', 'invoice'],
  accounting: ['accounting', 'quickbooks', 'netsuite', 'intacct', 'xero', 'close'],
  integrations: ['integration', 'connect', 'sync', 'webhook'],
  cards: ['card', 'issuing', 'limits'],
  ai: ['ai', 'automation']
};

const INTEGRATION_KEYWORDS = {
  'quickbooks-online': ['quickbooks', 'qbo'],
  netsuite: ['netsuite'],
  'sage-intacct': ['intacct', 'sage'],
  xero: ['xero'],
  travelperk: ['travelperk'],
  slack: ['slack'],
  okta: ['okta'],
  'microsoft-entra': ['entra', 'azure ad'],
  google: ['workspace', 'g suite', 'google'],
  'bill-com': ['bill.com'],
  rippling: ['rippling']
};

const JOURNEY_KEYWORDS = [
  { stage: 'discover', keywords: ['overview', 'learn', 'introduc', 'what is', 'about'] },
  { stage: 'implement', keywords: ['setup', 'configure', 'connect', 'enable', 'turn on'] },
  { stage: 'operate', keywords: ['manage', 'using', 'how to', 'submit', 'process', 'create'] },
  { stage: 'resolve', keywords: ['troubleshoot', 'error', 'fix', 'issue', 'failure', 'problem'] }
];

function normaliseText(...parts) {
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .toLowerCase();
}

function inferPersona(article, section, category) {
  const haystack = normaliseText(
    article.title,
    article.body?.slice(0, 800),
    (article.label_names || []).join(' '),
    section?.name,
    category?.name
  );

  const personas = new Set();
  Object.entries(PERSONA_KEYWORDS).forEach(([persona, keywords]) => {
    if (keywords.some(keyword => haystack.includes(keyword))) {
      personas.add(persona);
    }
  });

  if (!personas.size) {
    if (section?.name?.toLowerCase().includes('employee')) {
      personas.add('employee');
    }
  }

  if (!personas.size) {
    personas.add('admin');
  }

  return Array.from(personas);
}

function inferServiceTier(article) {
  const haystack = normaliseText(article.title, article.body);
  const tiers = new Set(['base']);
  if (haystack.includes('ramp plus') || haystack.includes('plus-only') || haystack.includes('(plus')) {
    tiers.add('plus');
  }
  if (haystack.includes('international')) {
    tiers.add('plus');
  }
  return Array.from(tiers);
}

function inferFeatureAreas(article, section) {
  const haystack = normaliseText(article.title, article.body, section?.name);
  const areas = new Set();
  Object.entries(FEATURE_KEYWORDS).forEach(([area, keywords]) => {
    if (keywords.some(keyword => haystack.includes(keyword))) {
      areas.add(area);
    }
  });
  if (!areas.size && section?.name) {
    areas.add(section.name.toLowerCase().replace(/\s+/g, '-'));
  }
  return Array.from(areas);
}

function inferTopicCluster(section, category) {
  if (section?.name) return section.name;
  if (category?.name) return category.name;
  return 'General';
}

function inferIntegrations(article) {
  const haystack = normaliseText(article.title, article.body, (article.label_names || []).join(' '));
  const integrations = new Set();
  Object.entries(INTEGRATION_KEYWORDS).forEach(([integration, keywords]) => {
    if (keywords.some(keyword => haystack.includes(keyword))) {
      integrations.add(integration);
    }
  });
  return Array.from(integrations);
}

function inferJourneyStage(article) {
  const haystack = normaliseText(article.title, article.body);
  for (const { stage, keywords } of JOURNEY_KEYWORDS) {
    if (keywords.some(keyword => haystack.includes(keyword))) {
      return stage;
    }
  }
  return 'operate';
}

export function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveVotes(article) {
  const total = article.vote_count || 0;
  const sum = article.vote_sum || 0;
  const upvotes = Math.max(0, Math.round((total + sum) / 2));
  const downvotes = Math.max(0, total - upvotes);
  const positivity = total ? upvotes / total : null;
  return { total, upvotes, downvotes, positivity };
}

function computeConfidenceDetails(article) {
  const votes = deriveVotes(article);
  const updatedAt = article.updated_at || article.last_reviewed;
  let recencyDays = 365;
  let hasTimestamp = false;
  if (updatedAt) {
    const timestamp = new Date(updatedAt).getTime();
    if (!Number.isNaN(timestamp)) {
      recencyDays = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24));
      hasTimestamp = true;
    }
  }

  const voteScoreRaw = votes.total ? Math.min(1, (votes.upvotes + 1) / (votes.total + 2)) : 0.6;
  const recencyWeight = hasTimestamp ? Math.max(0, 1 - recencyDays / 180) : 0;
  const freshnessBonus = !hasTimestamp
    ? 0
    : recencyDays <= 7
      ? 0.1
      : recencyDays <= 30
        ? 0.05
        : 0;
  const stalePenalty = hasTimestamp && recencyDays > 180 ? Math.min(0.25, (recencyDays - 180) / 540) : 0;

  let score = (0.55 * voteScoreRaw) + (0.35 * recencyWeight) + freshnessBonus - stalePenalty;
  score = Math.max(0, Math.min(1, score));

  return {
    score: Number(score.toFixed(2)),
    voteScore: Number(voteScoreRaw.toFixed(2)),
    recencyDays: hasTimestamp ? Math.round(recencyDays) : null,
    recencyWeight: Number(recencyWeight.toFixed(2)),
    freshnessBonus: Number(freshnessBonus.toFixed(2)),
    stalePenalty: Number(stalePenalty.toFixed(2)),
    hasTimestamp
  };
}

function computeConfidence(article) {
  return computeConfidenceDetails(article).score;
}

export function mapArticle(article, section, category) {
  const snippetBase = stripHtml(article.body);
  const snippet = snippetBase ? snippetBase.slice(0, 280) + (snippetBase.length > 280 ? '…' : '') : '';
  const service_tier = inferServiceTier(article);
  const mapped = {
    ...article,
    id: article.id,
    title: article.title,
    source_url: article.html_url,
    persona: inferPersona(article, section, category),
    service_tier,
    feature_area: inferFeatureAreas(article, section),
    topic_cluster: inferTopicCluster(section, category),
    content_type: article.title.toLowerCase().includes('overview') ? 'overview' : 'guide',
    journey_stage: inferJourneyStage(article),
    integrations: inferIntegrations(article),
    regions: section?.name?.toLowerCase().includes('international') ? ['global'] : ['us'],
    product_variants: service_tier.includes('plus') ? ['plus'] : ['base'],
    is_plus_only: service_tier.length === 1 && service_tier[0] === 'plus',
    last_reviewed: article.updated_at,
    owner_team: category?.name || 'Ramp Ops',
    feedback_channels: article.vote_count ? ['article_vote'] : [],
    snippet,
    signals: {
      vote_total: article.vote_count || 0,
      vote_sum: article.vote_sum || 0
    },
    section_name: section?.name,
    category_name: category?.name,
    raw: article
  };

  return mapped;
}

export function buildChunk(article) {
  if (article.isPlaceholder) return null;
  const persona = article.persona || ['admin'];
  const tiers = article.service_tier || ['base'];
  const cleanedBody = stripHtml(article.body);
  if (!cleanedBody) return null;
  const chunkText = cleanedBody.slice(0, 420);
  const source = article.raw || article;
  const votes = deriveVotes(source);
  const confidenceDetails = computeConfidenceDetails(source);
  const confidenceScore = confidenceDetails.score;
  const hasFeedback = votes.total >= 5;
  const positivityOk = votes.positivity !== null && votes.positivity >= 0.6;
  const confidenceOk = confidenceScore >= 0.65;
  const lastReviewed = article.updated_at || article.last_reviewed || null;
  const isRecentEnough = Boolean(lastReviewed);
  const isPlusEligible = !article.is_plus_only;
  const approved = isPlusEligible && hasFeedback && positivityOk && confidenceOk && isRecentEnough;
  return {
    id: `${article.id}-summary`,
    article_id: article.id,
    title: article.title,
    persona,
    service_tier: tiers,
    feature_area: article.feature_area || [],
    regions: article.regions || [],
    summary: chunkText,
    last_reviewed: lastReviewed,
    allowed_for_ai: approved,
    confidence: confidenceScore,
    confidence_breakdown: confidenceDetails,
    vote_total: votes.total,
    positivity: votes.positivity,
    approval_checks: {
      hasFeedback,
      positivityOk,
      confidenceOk,
      isRecentEnough,
      isPlusEligible
    },
    citations: [
      {
        url: article.html_url,
        label: article.title
      }
    ]
  };
}
