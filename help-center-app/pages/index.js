import { useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useHelpCenterData } from '../src/hooks/useHelpCenterData';
import { FilterSection } from '../src/components/FilterSection';
import { ArticleCard } from '../src/components/ArticleCard.next';
import { DefinitionTooltip } from '../src/components/DefinitionTooltip';
import { deriveVotes } from '../src/utils/metadata';
import { FONT_FAMILY, rampPalette } from '../src/theme.next';
import styles from '../styles/Home.module.css';

const VIEW_TABS = [
  { id: 'human', label: 'Human experience' },
  { id: 'ops', label: 'Operator console' },
  { id: 'ai', label: 'AI retrieval' }
];

// Config: default AI confidence threshold percentage for approval
const DEFAULT_AI_CONFIDENCE_THRESHOLD = 60;

const KEYWORD_HINTS = [
  {
    keywords: ['login', 'password', 'sso', 'mfa'],
    message: 'Clarify SSO vs password flows and add a quick recovery checklist with screenshots of the current UI.'
  },
  {
    keywords: ['reimburse', 'reimbursement', 'expense report'],
    message: 'Spell out reimbursement approval timelines, include bank-linking steps, and note how employees track payout status.'
  },
  {
    keywords: ['receipt', 'memo', 'compliance'],
    message: 'Add an at-a-glance list of acceptable receipts, examples, and how auto-matching works to reduce back-and-forth.'
  },
  {
    keywords: ['bill', 'vendor', 'payment'],
    message: 'Call out ACH vs check timelines, fee scenarios, and vendor portal notifications to set expectations.'
  },
  {
    keywords: ['travel', 'flight', 'hotel'],
    message: 'Summarise travel policy thresholds, approval SLA, and link to in-app booking flow for faster execution.'
  },
  {
    keywords: ['integration', 'sync', 'quickbooks', 'netsuite', 'xero', 'intacct'],
    message: 'Provide a troubleshooting table for common sync failures and specify version prerequisites or permissions.'
  }
];

const PERSONA_DEFINITIONS = {
  admin: 'Finance or operations admin responsible for policies, spend controls, and day-to-day approvals.',
  employee: 'Everyday Ramp cardholders looking for quick answers while they spend or submit expenses.',
  bookkeeper: 'Accounting and close teams reconciling Ramp activity against their general ledger.',
  vendor: 'External vendors interacting with Ramp bill pay or vendor onboarding experiences.',
  it: 'IT and security owners handling SSO, device management, and authentication tooling.'
};

const TIER_DEFINITIONS = {
  base: 'Standard Ramp features available to every customer without add-ons.',
  plus: 'Ramp Plus capabilities that unlock with the premium operations and automation suite.'
};

const INTEGRATION_DEFINITIONS = {
  'quickbooks-online': 'QuickBooks Online syncing for expenses, bills, and card transactions.',
  netsuite: 'NetSuite ERP connection covering journal entries, reimbursements, and bills.',
  'sage-intacct': 'Sage Intacct export path to keep Ramp data aligned with finance ledgers.',
  xero: 'Xero bookkeeping sync for small business accounting teams.',
  travelperk: 'TravelPerk travel inventory connection for centralized booking.',
  slack: 'Slack notifications and approvals integrated into team channels.',
  okta: 'Okta single sign-on and provisioning support for employee access.',
  'microsoft-entra': 'Microsoft Entra ID (Azure AD) identity and SSO configuration.',
  google: 'Google Workspace SSO and directory sync for user management.',
  'bill-com': 'Bill.com export workflow for vendor payments and invoice routing.',
  rippling: 'Rippling HRIS sync used for provisioning finance and employee data.'
};

const METRIC_DEFINITIONS = {
  Articles: 'Count of help center entries that match the current persona, tier, and integration filters.',
  Sentiment: 'Share of matching articles with majority-positive votes, indicating current experience quality.',
  'Helpful votes': 'Percentage of helpful votes across the filtered article set.',
  'Unhelpful votes': 'Percentage of unhelpful votes across the filtered article set.',
  'Usable AI chunks': 'Count of filtered chunks where allowed_for_ai is true.',
  'Needs human review': 'Count of filtered chunks not AI-approved (allowed_for_ai is false).'
};

const COLUMN_DEFINITIONS = {
  chunk: 'Top-ranked content snippet that would be returned to a retrieval-augmented generation (RAG) query.',
  personaTier: 'Audience persona and service tier tags inferred from article metadata.',
  summary: 'Auto-trimmed article summary used as a preview for the RAG pipeline.',
  updated: 'Last date the underlying article was touched—recency drives confidence and AI safety.',
  confidence: 'Heuristic score combining freshness and vote quality to weight retrieval candidates.',
  status: 'Shows if the chunk meets vote, positivity, confidence, and eligibility thresholds for AI use.'
};

const CHUNK_SORT_VALUE_GETTERS = {
  chunk: item => (item.title || ''),
  persona: item => (item.persona || []).join(', '),
  summary: item => item.summary || '',
  updated: item => (item.last_reviewed ? new Date(item.last_reviewed).getTime() : 0),
  confidence: item => Number.isFinite(item.confidence) ? item.confidence : 0,
  status: item => (item.allowed_for_ai ? 1 : 0)
};

export default function Home() {
  const { loading, error, articles, chunks, fetchedAt } = useHelpCenterData({ articlePages: 6 });
  const [view, setView] = useState('human');
  const [personaFilter, setPersonaFilter] = useState([]);
  const [tierFilter, setTierFilter] = useState([]);
  const [integrationFilter, setIntegrationFilter] = useState([]);
  const [featureFilter, setFeatureFilter] = useState([]);
  const [regionFilter, setRegionFilter] = useState([]);
  const [chunkSort, setChunkSort] = useState({ column: 'confidence', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [humanMode, setHumanMode] = useState('landing');
  const [humanResultsTitle, setHumanResultsTitle] = useState('Results');
  const [showAudienceControls, setShowAudienceControls] = useState(false);
  const [aiConfidenceThreshold, setAiConfidenceThreshold] = useState(DEFAULT_AI_CONFIDENCE_THRESHOLD);
  const [createdArticles, setCreatedArticles] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

  // Local edit + override state for operator console editor
  const [articleOverrides, setArticleOverrides] = useState({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorArticle, setEditorArticle] = useState(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorBody, setEditorBody] = useState('');
  const [editorPersona, setEditorPersona] = useState([]);
  const [editorTier, setEditorTier] = useState([]);
  const [editorFeatures, setEditorFeatures] = useState([]);
  const [editorIntegrations, setEditorIntegrations] = useState([]);
  const [editorRegions, setEditorRegions] = useState([]);

  const scrollRef = useRef(null);
  const groupsTopYRef = useRef(null);
  const aiTopYRef = useRef(null);
  const CATEGORY_TO_AREA = {
    'getting-started': 'authentication',
    'cards-controls': 'cards',
    'bill-pay': 'billPay',
    'accounting-close': 'accounting',
    'reimbursements': 'reimbursements',
    'integrations': 'integrations'
  };

  const effectiveArticles = useMemo(() => {
    const merged = articles.map(a => (articleOverrides[a.id] ? { ...a, ...articleOverrides[a.id] } : a));
    return [...createdArticles, ...merged];
  }, [articles, articleOverrides, createdArticles]);

  const personaOptions = useMemo(() => {
    const seen = new Set();
    effectiveArticles.forEach(article => {
      (article.persona || []).forEach(p => seen.add(p));
    });
    return Array.from(seen)
      .sort()
      .map(value => ({
        value,
        label: capitalise(value),
        definition: PERSONA_DEFINITIONS[value] || `Audience segment tagged as ${capitalise(value)}.`
      }));
  }, [effectiveArticles]);

  const tierOptions = useMemo(() => {
    const seen = new Set();
    effectiveArticles.forEach(article => {
      (article.service_tier || []).forEach(t => seen.add(t));
    });
    return Array.from(seen)
      .sort()
      .map(value => ({
        value,
        label: capitalise(value),
        definition: TIER_DEFINITIONS[value] || `Service tier marker: ${capitalise(value)}.`
      }));
  }, [effectiveArticles]);

  const featureOptions = useMemo(() => {
    const seen = new Set();
    effectiveArticles.forEach(article => {
      (article.feature_area || []).forEach(area => seen.add(area));
    });
    return Array.from(seen)
      .sort()
      .map(value => {
        const label = value
          .split(/[-_]/)
          .filter(Boolean)
          .map(part => capitalise(part))
          .join(' ');
        return {
          value,
          label,
          definition: `Feature area: ${label}`
        };
      });
  }, [effectiveArticles]);

  const integrationOptions = useMemo(() => {
    const seen = new Set();
    effectiveArticles.forEach(article => {
      (article.integrations || []).forEach(i => seen.add(i));
    });
    return Array.from(seen)
      .sort()
      .map(value => ({
        value,
        label: formatIntegration(value),
        definition: INTEGRATION_DEFINITIONS[value] || `Integration tag: ${formatIntegration(value)}.`
      }));
  }, [effectiveArticles]);

  const regionOptions = useMemo(() => {
    let hasDomestic = false;
    let hasInternational = false;
    effectiveArticles.forEach(article => {
      const regions = article.regions || [];
      if (regions.includes('us')) hasDomestic = true;
      if (regions.some(r => r !== 'us')) hasInternational = true;
    });
    const opts = [];
    if (hasDomestic) opts.push({ value: 'domestic', label: 'Domestic (US)', definition: 'Articles applicable to US region.' });
    if (hasInternational) opts.push({ value: 'international', label: 'International', definition: 'Articles that reference non‑US behavior or global scope.' });
    return opts;
  }, [effectiveArticles]);

  const togglePersona = value => {
    setPersonaFilter(current => (current.includes(value) ? current.filter(item => item !== value) : [...current, value]));
  };

  const toggleTier = value => {
    setTierFilter(current => (current.includes(value) ? current.filter(item => item !== value) : [...current, value]));
  };

  const toggleFeature = value => {
    setFeatureFilter(current => (current.includes(value) ? current.filter(item => item !== value) : [...current, value]));
  };

  const toggleIntegration = value => {
    setIntegrationFilter(current => {
      if (current.includes(value)) {
        return current.filter(item => item !== value);
      }
      return [...current, value];
    });
  };

  const toggleRegion = value => {
    setRegionFilter(current => (current.includes(value) ? current.filter(item => item !== value) : [...current, value]));
  };

  const handleChunkSort = column => {
    setChunkSort(prev => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { column, direction: 'desc' };
    });
  };

  const filteredArticles = useMemo(() => {
    if (!effectiveArticles.length) return [];

    return effectiveArticles
      .filter(article => {
        const personaMatch =
          !personaFilter.length || (article.persona || []).some(persona => personaFilter.includes(persona));
        const tierMatch =
          !tierFilter.length || (article.service_tier || []).some(tier => tierFilter.includes(tier));
        const integrationMatch =
          !integrationFilter.length || (article.integrations || []).some(integration => integrationFilter.includes(integration));
        const featureMatch =
          !featureFilter.length || (article.feature_area || []).some(area => featureFilter.includes(area));
        const regionMatch =
          !regionFilter.length || regionFilter.some(tag =>
            tag === 'domestic'
              ? (article.regions || []).includes('us')
              : (article.regions || []).some(r => r !== 'us')
          );
        const q = searchQuery.trim().toLowerCase();
        const textMatch = !q || `${article.title} ${(article.snippet||'')}`.toLowerCase().includes(q);
        return personaMatch && tierMatch && integrationMatch && featureMatch && regionMatch && textMatch;
      })
      .sort((a, b) => scoreArticle(b) - scoreArticle(a));
  }, [effectiveArticles, personaFilter, tierFilter, integrationFilter, featureFilter, regionFilter, searchQuery]);

  const filteredChunks = useMemo(() => {
    if (!chunks.length) return [];
    const filtered = chunks.filter(chunk => {
      const personaMatch =
        !personaFilter.length || (chunk.persona || []).some(p => personaFilter.includes(p));
      const tierMatch = !tierFilter.length || (chunk.service_tier || []).some(t => tierFilter.includes(t));
      const integrationMatch =
        !integrationFilter.length ||
        (chunk.integrations || []).some(integration => integrationFilter.includes(integration));
      const featureMatch =
        !featureFilter.length || (chunk.feature_area || []).some(area => featureFilter.includes(area));
      const regionMatch =
        !regionFilter.length || regionFilter.some(tag =>
          tag === 'domestic'
            ? (chunk.regions || []).includes('us')
            : (chunk.regions || []).some(r => r !== 'us')
        );
      const q = searchQuery.trim().toLowerCase();
      const textMatch = !q || `${chunk.title} ${(chunk.summary||'')}`.toLowerCase().includes(q);
      return personaMatch && tierMatch && integrationMatch && featureMatch && regionMatch && textMatch;
    });

    const column = chunkSort.column;
    const directionMultiplier = chunkSort.direction === 'asc' ? 1 : -1;
    const selector = CHUNK_SORT_VALUE_GETTERS[column] || CHUNK_SORT_VALUE_GETTERS.confidence;

    return filtered.sort((a, b) => {
      let aValue = selector(a);
      let bValue = selector(b);

      const aIsNumber = typeof aValue === 'number';
      const bIsNumber = typeof bValue === 'number';

      if (!aIsNumber) aValue = (aValue || '').toString().toLowerCase();
      if (!bIsNumber) bValue = (bValue || '').toString().toLowerCase();

      if (aIsNumber && bIsNumber) {
        if (aValue === bValue) {
          return (CHUNK_SORT_VALUE_GETTERS.chunk(a) || '').localeCompare(CHUNK_SORT_VALUE_GETTERS.chunk(b) || '') * directionMultiplier;
        }
        return (aValue - bValue) * directionMultiplier;
      }

      return aValue.localeCompare(bValue) * directionMultiplier;
    });
  }, [chunks, personaFilter, tierFilter, integrationFilter, featureFilter, regionFilter, searchQuery, chunkSort]);

  const thresholdDecimal = Math.max(0, Math.min(100, Number(aiConfidenceThreshold || 0))) / 100;
  const aiUsableChunkCount = useMemo(() => filteredChunks.filter(c => (c.confidence || 0) >= thresholdDecimal).length, [filteredChunks, thresholdDecimal]);
  const aiNeedsReviewCount = useMemo(() => filteredChunks.filter(c => (c.confidence || 0) < thresholdDecimal).length, [filteredChunks, thresholdDecimal]);

  const opsQueues = useMemo(() => buildOpsQueues(filteredArticles), [filteredArticles]);

  const filteredStats = useMemo(() => aggregateArticleStats(filteredArticles), [filteredArticles]);
  const filteredArticleCount = filteredArticles.length;
  const sentimentValue = filteredArticleCount
    ? `${Math.round((filteredStats.positiveArticles / filteredArticleCount) * 100)}% positive`
    : '—';
  const helpfulTotal = filteredStats.helpfulVotes + filteredStats.unhelpfulVotes;
  const helpfulPercent = helpfulTotal
    ? `${Math.round((filteredStats.helpfulVotes / helpfulTotal) * 100)}% helpful`
    : '—';
  const unhelpfulPercent = helpfulTotal
    ? `${Math.round((filteredStats.unhelpfulVotes / helpfulTotal) * 100)}% unhelpful`
    : '—';

  const handleSelectCategory = id => {
    const area = CATEGORY_TO_AREA[id];
    if (area) {
      setFeatureFilter([area]);
      setHumanResultsTitle(`Browse: ${formatFeature(area)}`);
      setHumanMode('results');
      setShowAudienceControls(false);
      if (scrollRef.current && groupsTopYRef.current !== null && groupsTopYRef.current !== undefined) {
        try {
          scrollRef.current.scrollTo({ y: Math.max(0, groupsTopYRef.current - 12), smooth: true });
        } catch (e) {}
      }
    }
  };

  const handleGroupsLayout = y => {
    groupsTopYRef.current = y;
  };

  const handleSearch = () => {
    setFeatureFilter(current => current);
    setHumanResultsTitle(searchQuery ? `Search: ${searchQuery}` : 'Search results');
    setHumanMode('results');
    setShowAudienceControls(false);
    if (scrollRef.current && groupsTopYRef.current !== null && groupsTopYRef.current !== undefined) {
      try {
        scrollRef.current.scrollTo({ y: Math.max(0, groupsTopYRef.current - 12), smooth: true });
      } catch (e) {}
    }
  };

  const handleViewAll = () => {
    setPersonaFilter([]);
    setTierFilter([]);
    setIntegrationFilter([]);
    setFeatureFilter([]);
    setRegionFilter([]);
    setSearchQuery('');
    setHumanResultsTitle('All articles');
    setHumanMode('results');
    setShowAudienceControls(true);
    if (scrollRef.current && groupsTopYRef.current !== null && groupsTopYRef.current !== undefined) {
      try {
        scrollRef.current.scrollTo({ y: Math.max(0, groupsTopYRef.current - 12), smooth: true });
      } catch (e) {}
    }
  };

  const handleBackToLanding = () => {
    setHumanMode('landing');
    setShowAudienceControls(false);
  };

  const handleAiTableLayout = y => {
    aiTopYRef.current = y;
  };

  const handleAiSearch = () => {
    setChunkSort({ column: 'confidence', direction: 'desc' });
    if (scrollRef.current && aiTopYRef.current !== null && aiTopYRef.current !== undefined) {
      try {
        scrollRef.current.scrollTo({ y: Math.max(0, aiTopYRef.current - 12), smooth: true });
      } catch (e) {}
    }
  };

  // Operator console editor handlers
  const handleOpenEditor = article => {
    const source = articleOverrides[article.id] ? { ...article, ...articleOverrides[article.id] } : article;
    setEditorArticle(article);
    setIsCreating(false);
    setEditorTitle(source.title || '');
    setEditorBody(source.raw?.body || source.body || '');
    setEditorPersona(Array.isArray(source.persona) ? source.persona : []);
    setEditorTier(Array.isArray(source.service_tier) ? source.service_tier : []);
    setEditorFeatures(Array.isArray(source.feature_area) ? source.feature_area : []);
    setEditorIntegrations(Array.isArray(source.integrations) ? source.integrations : []);
    const toTags = (regionsArr=[]) => {
      const tags = [];
      if (regionsArr.includes('us')) tags.push('domestic');
      if (regionsArr.some(r => r !== 'us')) tags.push('international');
      return tags;
    };
    setEditorRegions(toTags(source.regions));
    setEditorOpen(true);
  };

  const handleOpenComposer = () => {
    const newId = `local-${Date.now()}`;
    setEditorArticle({ id: newId });
    setIsCreating(true);
    setEditorTitle('');
    setEditorBody('');
    setEditorPersona([]);
    setEditorTier(['base']);
    setEditorFeatures([]);
    setEditorIntegrations([]);
    setEditorRegions(['domestic']);
    setEditorOpen(true);
  };

  const toggleEditorList = (setter, current, value) => {
    const exists = current.includes(value);
    const next = exists ? current.filter(v => v !== value) : [...current, value];
    setter(next);
  };

  const handleSaveEditor = () => {
    if (!editorArticle) return;
    const fromTags = (tags=[]) => {
      const regions = [];
      if (tags.includes('domestic')) regions.push('us');
      if (tags.includes('international')) regions.push('global');
      return regions.length ? regions : ['us'];
    };

    if (isCreating) {
      const now = new Date().toISOString();
      const text = (editorBody || '').replace(/<[^>]+>/g, ' ');
      const snippet = text ? (text.slice(0, 280) + (text.length > 280 ? '…' : '')) : '';
      const newArticle = {
        id: editorArticle.id,
        title: editorTitle || 'Untitled',
        body: editorBody,
        snippet,
        persona: editorPersona,
        service_tier: editorTier,
        feature_area: editorFeatures,
        integrations: editorIntegrations,
        regions: fromTags(editorRegions),
        updated_at: now,
        topic_cluster: 'General',
        content_type: 'guide',
        journey_stage: 'operate',
        is_plus_only: editorTier.length === 1 && editorTier[0] === 'plus',
        owner_team: 'Help Center',
        vote_count: 0,
        vote_sum: 0,
        signals: { vote_total: 0, vote_sum: 0 },
        html_url: '#'
      };
      setCreatedArticles(prev => [newArticle, ...prev]);
      setIsCreating(false);
      setEditorOpen(false);
      return;
    }

    // Update override for existing article
    setArticleOverrides(prev => ({
      ...prev,
      [editorArticle.id]: {
        title: editorTitle,
        body: editorBody,
        persona: editorPersona,
        service_tier: editorTier,
        feature_area: editorFeatures,
        integrations: editorIntegrations,
        regions: fromTags(editorRegions)
      }
    }));
    setEditorOpen(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.logo}>
          <Image
            src="/Ramp_Business_Corporation_Logo.svg.png"
            alt="Ramp"
            width={120}
            height={28}
            layout="responsive"
          />
        </div>
        <div className={styles.tabRow}>
          {VIEW_TABS.map(tab => (
            <button
              key={tab.id}
              className={`${styles.tabButton} ${view === tab.id ? styles.tabButtonActive : ''}`}
              onClick={() => setView(tab.id)}
            >
              <span className={`${styles.tabText} ${view === tab.id ? styles.tabTextActive : ''}`}>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      {view === 'ops' ? (
        <div className={styles.metricsRow}>
          <Metric label="Articles" value={filteredArticleCount} />
          <Metric label="Sentiment" value={sentimentValue} />
          <Metric label="Helpful votes" value={helpfulPercent} />
          <Metric label="Unhelpful votes" value={unhelpfulPercent} />
        </div>
      ) : null}
      {view === 'ai' ? (
        <div className={styles.metricsRow}>
          <Metric label="Articles" value={filteredArticleCount} />
          <Metric label="Usable AI chunks" value={aiUsableChunkCount} />
          <Metric label="Needs human review" value={aiNeedsReviewCount} />
        </div>
      ) : null}

      {view === 'human' && showAudienceControls ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>Filters</div>
            <div className={styles.panelSubtitle}>Filters power all three modes—adjust to see how content and signals change.</div>
          </div>
          <div className={styles.filtersWrapper}>
            <FilterSection
              title="Persona"
              options={personaOptions}
              selected={personaFilter}
              onSelect={togglePersona}
              emptyLabel="No persona metadata yet"
            />
            <FilterSection
              title="Service tier"
              options={tierOptions}
              selected={tierFilter}
              onSelect={toggleTier}
              emptyLabel="No tier metadata"
            />
            <FilterSection
              title="Product area"
              options={featureOptions}
              selected={featureFilter}
              onSelect={toggleFeature}
              emptyLabel="No product areas yet"
            />
            <FilterSection
              title="Region"
              options={regionOptions}
              selected={regionFilter}
              onSelect={toggleRegion}
              emptyLabel="No regions found"
            />
            <FilterSection
              title="Integrations"
              options={integrationOptions}
              selected={integrationFilter}
              onSelect={toggleIntegration}
              emptyLabel="No integration tags found"
            />
          </div>
        </div>
      ) : null}

      {view === 'ai' ? (
        <div className={styles.humanSearchRow}>
          <input
            className={styles.humanSearchInput}
            placeholder={'Search chunks…'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button className={styles.humanSearchButton} onClick={handleAiSearch}>
            <span className={styles.humanSearchButtonText}>Search</span>
          </button>
          <div className={styles.thresholdWrapper}>
            <span className={styles.thresholdLabel}>Threshold</span>
            <input
              className={styles.thresholdInput}
              value={String(aiConfidenceThreshold)}
              onChange={e => setAiConfidenceThreshold(e.target.value.replace(/[^0-9]/g, ''))}
            />
            <span className={styles.thresholdSuffix}>%</span>
          </div>
        </div>
      ) : null}

      <div className={styles.hero}>
        {view === 'human' ? (
          <>
            <h1 className={styles.humanHeroTitle}>Find answers, accelerate workflows, stay compliant</h1>
            <p className={styles.humanHeroSubtitle}>
              Search and browse guidance tailored to your roles, tier, and integrations. Use AI Assist for
              complex multi-step workflows.
            </p>
          </>
        ) : (
          <>
            <div className={styles.heroBadgeRow}>
              <span className={styles.heroBadge}>Live Zendesk feed</span>
              {fetchedAt && <span className={styles.heroTimestamp}>Synced {fetchedAt.toLocaleDateString()}</span>}
            </div>
            <h1 className={styles.heroTitle}>Ramp Context Hub</h1>
            <p className={styles.heroSubtitle}>
              Real-time classification of Ramp help center content to drive tailored experiences for employees, admins, and support AI.
            </p>
            <div className={styles.heroMetaRow}>
              <span className={styles.heroMeta}>Persona-aware journeys</span>
              <span className={styles.heroMeta}>AI-safe knowledge graph</span>
              <span className={styles.heroMeta}>Ops quality loop</span>
            </div>
          </>
        )}
      </div>
      
      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Pulling fresh content from Zendesk…</p>
        </div>
      ) : error ? (
        <div className={styles.errorBox}>
          <h3 className={styles.errorTitle}>Failed to load help center data</h3>
          <p className={styles.errorMessage}>{error.message}</p>
        </div>
      ) : (
        <div className={styles.viewWrapper}>
          {view === 'human' ? renderHumanView(
            filteredArticles,
            setSearchQuery,
            searchQuery,
            handleSelectCategory,
            handleGroupsLayout,
            humanMode,
            humanResultsTitle,
            handleBackToLanding,
            handleSearch,
            handleViewAll
          ) : null}
          {view === 'ai' ? renderAiView(
            filteredChunks,
            chunkSort,
            handleChunkSort,
            handleAiTableLayout,
            thresholdDecimal,
            aiConfidenceThreshold
          ) : null}
          {view === 'ops' ? renderOpsView(
            opsQueues,
            handleOpenEditor,
            handleOpenComposer
          ) : null}
        </div>
      )}

      {editorOpen ? (
        <>
          <div className={styles.drawerBackdrop} onClick={() => setEditorOpen(false)} />
          <div className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitle}>{isCreating ? 'Write article' : 'Edit article'}</div>
              <div className={styles.drawerHeaderActions}>
                <button onClick={() => setEditorOpen(false)} className={styles.drawerActionButton}>
                  <span className={styles.drawerActionText}>Cancel</span>
                </button>
                <button onClick={handleSaveEditor} className={`${styles.drawerActionButton} ${styles.drawerSaveButton}`}>
                  <span className={`${styles.drawerActionText} ${styles.drawerSaveText}`}>{isCreating ? 'Publish' : 'Save'}</span>
                </button>
              </div>
            </div>
            <div className={styles.drawerFieldLabel}>Headline</div>
            <input
              className={styles.drawerTitleInput}
              value={editorTitle}
              onChange={e => setEditorTitle(e.target.value)}
              placeholder="Add headline"
            />
            <div className={styles.drawerFieldLabel}>Body</div>
            <textarea
              className={styles.drawerTextInput}
              value={editorBody}
              onChange={e => setEditorBody(e.target.value)}
            />
            <div className={styles.drawerFiltersRow}>
              <FilterSection
                title="Persona"
                options={personaOptions}
                selected={editorPersona}
                onSelect={value => toggleEditorList(setEditorPersona, editorPersona, value)}
                emptyLabel="No persona metadata"
              />
              <FilterSection
                title="Service tier"
                options={tierOptions}
                selected={editorTier}
                onSelect={value => toggleEditorList(setEditorTier, editorTier, value)}
                emptyLabel="No tier metadata"
              />
              <FilterSection
                title="Product area"
                options={featureOptions}
                selected={editorFeatures}
                onSelect={value => toggleEditorList(setEditorFeatures, editorFeatures, value)}
                emptyLabel="No product areas"
              />
              <FilterSection
                title="Region"
                options={regionOptions}
                selected={editorRegions}
                onSelect={value => toggleEditorList(setEditorRegions, editorRegions, value)}
                emptyLabel="No regions"
              />
              <FilterSection
                title="Integrations"
                options={integrationOptions}
                selected={editorIntegrations}
                onSelect={value => toggleEditorList(setEditorIntegrations, editorIntegrations, value)}
                emptyLabel="No integration tags"
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function renderHumanView(articles, setSearchValue, searchValue, onSelectCategory, onGroupsLayout, mode, resultsTitle, onBackToLanding, onSubmitSearch, onViewAll) {
  const categories = [
    { id: 'getting-started', title: 'Getting Started', description: 'Account setup, invites, and your first policies.' },
    { id: 'cards-controls', title: 'Cards & Controls', description: 'Issue physical & virtual cards, set spend limits.' },
    { id: 'bill-pay', title: 'Bill Pay & AP', description: 'Onboard vendors, approvals, international payments.' },
    { id: 'accounting-close', title: 'Accounting & Close', description: 'Automations, rules, and ERP sync to close faster.' },
    { id: 'reimbursements', title: 'Reimbursements', description: 'Submit, approve, and sync employee expenses.' },
    { id: 'integrations', title: 'Integrations', description: 'Connect ERPs, HRIS, travel & real-time feeds.' }
  ];
  const limitedCategories = categories.slice(0, 6);

  const withViews = articles.filter(a => a?.signals?.views_30d && Number.isFinite(a.signals.views_30d));
  const popular = (withViews.length ? withViews : articles)
    .slice()
    .sort((a, b) => {
      const aViews = a?.signals?.views_30d || 0;
      const bViews = b?.signals?.views_30d || 0;
      if (aViews !== bViews) return bViews - aViews;
      const aVotes = deriveVotes(a.raw || a);
      const bVotes = deriveVotes(b.raw || b);
      return (bVotes.total || 0) - (aVotes.total || 0);
    })
    .slice(0, 5);

  const recent = articles
    .filter(a => a.updated_at || a.last_reviewed)
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.updated_at || a.last_reviewed || 0).getTime();
      const bTime = new Date(b.updated_at || b.last_reviewed || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 5);

  const openArticle = url => {
    if (url) window.open(url, '_blank');
  };

  return (
    <div>
      <p className={styles.humanHeroSubtitle}>
        Search and browse guidance tailored to your roles, tier, and integrations. Use AI Assist for
        complex multi-step workflows.
      </p>
      <div className={styles.humanSearchRow}>
        <input
          className={styles.humanSearchInput}
          placeholder="Search by task, feature, or question..."
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
        />
        <button className={styles.humanSearchButton} onClick={onSubmitSearch}>
          <span className={styles.humanSearchButtonText}>Search</span>
        </button>
      </div>
      <div className={styles.humanTryRow}>
        <span className={styles.humanTryLabel}>Try:</span>
        {['Virtual cards', 'Bill Pay approvals', 'Receipt matching', 'Accounting sync'].map(example => (
          <button key={example} className={styles.humanTryPill} onClick={() => setSearchValue && setSearchValue(example)}>
            <span className={styles.humanTryPillText}>{example}</span>
          </button>
        ))}
      </div>
      {mode === 'landing' ? (
        <div className={styles.humanInfoRow} onLoadCapture={e => onGroupsLayout && onGroupsLayout(e.currentTarget.getBoundingClientRect().top + window.scrollY)}>
          <div className={styles.humanInfoCard}>
            <div className={styles.humanInfoTitle}>Popular this week</div>
            {popular.length ? (
              <div className={styles.humanList}>
                {popular.map(item => (
                  <button key={item.id} onClick={() => openArticle(item.html_url)} className={styles.humanListItem}>
                    <span className={styles.humanListLink}>{item.title}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.humanInfoText}>No popularity data available yet.</div>
            )}
          </div>
          <div className={styles.humanInfoCard}>
            <div className={styles.humanInfoTitle}>Recently updated</div>
            {recent.length ? (
              <div className={styles.humanList}>
                {recent.map(item => {
                  const updated = item.updated_at || item.last_reviewed || null;
                  const updatedDisplay = updated
                    ? new Date(updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : null;
                  return (
                    <button key={item.id} onClick={() => openArticle(item.html_url)} className={styles.humanListItem}>
                      <span className={styles.humanListLink}>{item.title}</span>
                      {updatedDisplay ? <span className={styles.humanListMeta}>{updatedDisplay}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.humanInfoText}>No recent updates found.</div>
            )}
          </div>
        </div>
      ) : (
        <div onLoadCapture={e => onGroupsLayout && onGroupsLayout(e.currentTarget.getBoundingClientRect().top + window.scrollY)}>
          <div className={styles.humanResultsHeader}>
            <div className={styles.sectionTitle}>{resultsTitle}</div>
            <button onClick={onBackToLanding} className={styles.humanBrowseAll}>Back</button>
          </div>
          <div className={styles.articleGrid}>
            {articles
              .filter(article => {
                const q = (searchValue || '').trim().toLowerCase();
                if (!q) return true;
                const text = `${article.title} ${article.snippet || ''}`.toLowerCase();
                return text.includes(q);
              })
              .slice(0, 24)
              .map(article => (
                <ArticleCard key={article.id} article={article} />
              ))}
          </div>
        </div>
      )}

      <div className={styles.humanBrowseHeader}>
        <div className={styles.sectionTitle}>Browse by category</div>
        <button onClick={onViewAll} className={styles.humanBrowseAll}>View all →</button>
      </div>
      <div className={styles.humanCategoryGrid}>
        {limitedCategories.map(cat => (
          <button
            key={cat.id}
            className={styles.humanCategoryCard}
            onClick={() => onSelectCategory && onSelectCategory(cat.id)}
          >
            <div className={styles.humanCategoryTitle}>{cat.title}</div>
            <div className={styles.humanCategoryDesc}>{cat.description}</div>
            <div className={styles.humanCategoryCta}>Browse →</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function renderAiView(chunks, sortState, onSort, onTableLayout, thresholdDecimal, thresholdPercent) {
  const renderSortIndicator = column => {
    if (!sortState || sortState.column !== column) return '';
    return sortState.direction === 'desc' ? ' ↓' : ' ↑';
  };

  const handleSort = column => {
    if (onSort) onSort(column);
  };

  return (
    <div>
      <div className={styles.sectionTitle}>RAG Retrieval Preview</div>
      <div onLoadCapture={e => onTableLayout && onTableLayout(e.currentTarget.getBoundingClientRect().top + window.scrollY)}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.tableHeader}>
              <th className={`${styles.tableHeaderCell} ${styles.colChunk}`}>
                <DefinitionTooltip label="Chunk" description={COLUMN_DEFINITIONS.chunk}>
                  <button className={styles.tableHeaderPressable} onClick={() => handleSort('chunk')}>
                    <span className={`${styles.tableHeaderText} ${styles.tableCellCenter}`}>Chunk{renderSortIndicator('chunk')}</span>
                  </button>
                </DefinitionTooltip>
              </th>
              <th className={`${styles.tableHeaderCell} ${styles.colPersona}`}>
                <DefinitionTooltip label="Persona & Tier" description={COLUMN_DEFINITIONS.personaTier}>
                  <button className={styles.tableHeaderPressable} onClick={() => handleSort('persona')}>
                    <span className={`${styles.tableHeaderText} ${styles.tableCellCenter}`}>Persona / Tier{renderSortIndicator('persona')}</span>
                  </button>
                </DefinitionTooltip>
              </th>
              <th className={`${styles.tableHeaderCell} ${styles.colSummary}`}>
                <DefinitionTooltip label="Summary" description={COLUMN_DEFINITIONS.summary}>
                  <button className={styles.tableHeaderPressable} onClick={() => handleSort('summary')}>
                    <span className={`${styles.tableHeaderText} ${styles.tableCellCenter}`}>Summary{renderSortIndicator('summary')}</span>
                  </button>
                </DefinitionTooltip>
              </th>
              <th className={`${styles.tableHeaderCell} ${styles.colUpdated}`}>
                <DefinitionTooltip label="Last updated" description={COLUMN_DEFINITIONS.updated}>
                  <button className={styles.tableHeaderPressable} onClick={() => handleSort('updated')}>
                    <span className={`${styles.tableHeaderText} ${styles.tableCellCenter}`}>Updated{renderSortIndicator('updated')}</span>
                  </button>
                </DefinitionTooltip>
              </th>
              <th className={`${styles.tableHeaderCell} ${styles.colConfidence}`}>
                <DefinitionTooltip label={`Confidence (≥${thresholdPercent}% = Approved)`} description={`${COLUMN_DEFINITIONS.confidence} Threshold set to ${thresholdPercent}%.`}>
                  <button className={styles.tableHeaderPressable} onClick={() => handleSort('confidence')}>
                    <span className={`${styles.tableHeaderText} ${styles.tableCellCenter}`}>Confidence{renderSortIndicator('confidence')}</span>
                  </button>
                </DefinitionTooltip>
              </th>
              <th className={`${styles.tableHeaderCell} ${styles.colStatus}`}>
                <DefinitionTooltip label="AI ready?" description={COLUMN_DEFINITIONS.status}>
                  <button className={styles.tableHeaderPressable} onClick={() => handleSort('status')}>
                    <span className={`${styles.tableHeaderText} ${styles.tableCellCenter}`}>AI ready?{renderSortIndicator('status')}</span>
                  </button>
                </DefinitionTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {chunks.length === 0 ? (
              <tr className={styles.tableEmpty}><td className={styles.emptyState} colSpan={6}>No persona-specific chunks for this combination yet.</td></tr>
            ) : (
              chunks.map((chunk, index) => {
                const voteTotal = typeof chunk.vote_total === 'number' ? chunk.vote_total : null;
                const positivePercent = typeof chunk.positivity === 'number' && chunk.positivity !== null
                  ? Math.round(chunk.positivity * 100)
                  : null;
                const checks = chunk.approval_checks || {};
                const needs = [];
                if (!checks.hasFeedback) needs.push('>=5 votes');
                if (!checks.positivityOk) needs.push('60%+ positivity');
                if (!checks.confidenceOk) needs.push('>=60% confidence');
                if (!checks.isRecentEnough) needs.push('recent review date');
                if (!checks.isPlusEligible) needs.push('non-Plus content');

                const metaLine = `Votes: ${voteTotal !== null ? voteTotal : '—'} • Positive: ${
                  positivePercent !== null ? `${positivePercent}%` : '—'
                }`;
                const needsLine = !chunk.allowed_for_ai && needs.length ? `Needs: ${needs.join(', ')}` : null;
                const recencyDays = chunk.confidence_breakdown?.recencyDays;
                const recencyLine = recencyDays !== null ? `Age: ${recencyDays}d` : null;
                const updatedDate = chunk.last_reviewed ? new Date(chunk.last_reviewed) : null;
                const updatedDisplay = updatedDate
                  ? updatedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—';

                return (
                  <tr key={chunk.id} className={index % 2 === 1 ? styles.tableRowAlt : ''}>
                    <td className={`${styles.tableCell} ${styles.colChunk} ${styles.tableCellStrong}`}>{chunk.title}</td>
                    <td className={`${styles.tableCell} ${styles.colPersona} ${styles.tableCellMuted}`}>
                      {(chunk.persona || []).join(', ')}<br/> {(chunk.service_tier || []).join(', ')}
                    </td>
                    <td className={`${styles.tableCell} ${styles.colSummary} ${styles.tableCellMuted}`}>{chunk.summary}</td>
                    <td className={`${styles.tableCell} ${styles.colUpdated} ${styles.tableCellCenter}`}>
                      {updatedDisplay}
                    </td>
                    <td className={`${styles.tableCell} ${styles.colConfidence} ${styles.tableCellCenter}`}>
                      {Math.round((chunk.confidence || 0) * 100)}%
                    </td>
                    <td className={`${styles.tableCell} ${styles.colStatus} ${styles.tableCellCenter}`}>
                      <span className={(chunk.confidence || 0) >= thresholdDecimal ? styles.statusGood : styles.statusWarn}>
                        {(chunk.confidence || 0) >= thresholdDecimal ? 'Approved' : 'Human review'}
                      </span>
                      <div className={styles.tableCellMeta}>{metaLine}</div>
                      {recencyLine ? (
                        <div className={styles.tableCellMeta}>{recencyLine}</div>
                      ) : null}
                      {needsLine ? (
                        <div className={`${styles.tableCellMeta} ${styles.tableCellFail}`}>{needsLine}</div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderOpsView(queues, onEdit, onCompose) {
  const renderCard = (item, badgeLabel, accentColor) => {
    const persona = (item.article.persona && item.article.persona.length ? item.article.persona : ['—']).join(' • ');
    const tiers = (item.article.service_tier && item.article.service_tier.length ? item.article.service_tier : ['—']).join(' • ');
    const positivity = item.votes.positivity !== null ? Math.round(item.votes.positivity * 100) : null;
    const sentimentLabel = positivity === null ? 'No feedback yet' : `${positivity}% positive`;
    const sentimentWarn = positivity !== null && positivity < 50;
    const updatedRelativeBase = item.article.updated_at ? formatRelative(item.article.updated_at) : null;
    const updatedRelative = updatedRelativeBase
      ? updatedRelativeBase === 'today'
        ? 'Today'
        : `${updatedRelativeBase} ago`
      : 'Recently';
    const updatedAbsolute = item.article.updated_at
      ? new Date(item.article.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

    return (
      <button
        key={item.article.id}
        className={styles.opsCard}
        style={{ borderLeftColor: accentColor }}
        onClick={() => item.article.html_url && window.open(item.article.html_url, '_blank')}
      >
        <div className={styles.opsCardHeader}>
          <span className={styles.opsBadge}>{badgeLabel}</span>
          <div className={styles.opsHeaderRight}>
            <span className={styles.opsMeta}>{updatedRelative}</span>
            <button
              className={styles.opsEditButton}
              onClick={(e) => {
                e.stopPropagation();
                if (onEdit) onEdit(item.article);
              }}
            >
              <span className={styles.opsEditButtonText}>Edit</span>
            </button>
          </div>
        </div>
        <div className={styles.opsCardTitle}>{item.article.title}</div>
        <div className={styles.opsTagRow}>
          <span className={styles.opsTag}>{persona}</span>
          <span className={styles.opsTag}>{tiers}</span>
        </div>
        <div className={styles.opsStatsRow}>
          <span className={`${styles.opsSentiment} ${sentimentWarn ? styles.opsSentimentWarn : styles.opsSentimentOk}`}>{sentimentLabel}</span>
          <span className={styles.opsStatsMeta}>Votes {item.votes.total}</span>
          {updatedAbsolute ? <span className={styles.opsStatsMeta}>{updatedAbsolute}</span> : null}
        </div>
        <div className={styles.opsAiTitle}>AI suggestion</div>
        <div className={styles.opsAiText}>{item.aiInsight}</div>
      </button>
    );
  };

  return (
    <div>
      <div className={styles.sectionTitle}>Operator Console</div>
      <div className={styles.opsToolbar}>
        <button className={styles.composeButton} onClick={onCompose}>
          <span className={styles.composeButtonText}>Write new article</span>
        </button>
      </div>
      <div className={styles.opsRow}>
        <div className={styles.opsColumn}>
          <div className={styles.opsTitle}>High impact refresh queue</div>
          {queues.alerts.length === 0 ? (
            <div className={styles.emptyState}>No alerts yet</div>
          ) : (
            queues.alerts.map(item => renderCard(item, 'Refresh alert', '#E4F222'))
          )}
        </div>
        <div className={styles.opsColumn}>
          <div className={styles.opsTitle}>Stale content</div>
          {queues.stale.length === 0 ? (
            <div className={styles.emptyState}>All sampled articles are fresh.</div>
          ) : (
            queues.stale.map(item => renderCard(item, 'Stale watch', '#D47A3C'))
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricLabel}>{String(label).toUpperCase()}</div>
      <div className={styles.metricValue}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

// Helper functions
function scoreArticle(article) {
  const votes = deriveVotes(article.raw || article);
  const voteScore = votes.total ? (votes.positivity || 0) * Math.log10(votes.total + 1) : 0.1;
  const updatedAt = article.updated_at || article.last_reviewed;
  let recencyDays = 180;
  if (updatedAt) {
    const timestamp = new Date(updatedAt).getTime();
    if (!Number.isNaN(timestamp)) {
      recencyDays = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24));
    }
  }
  const recencyScore = 1 / (1 + recencyDays / 60);
  const viewsBoost = article.signals?.views_30d ? Math.min(1, Math.log10(article.signals.views_30d + 1) / 3) : 0;
  return voteScore + recencyScore + viewsBoost - (article.isPlaceholder ? 0.2 : 0);
}

function aggregateArticleStats(items) {
  return items.reduce(
    (acc, article) => {
      const votes = deriveVotes(article.raw || article);
      acc.totalVotes += votes.total;
      acc.helpfulVotes += votes.upvotes;
      acc.unhelpfulVotes += votes.downvotes;
      if (votes.positivity !== null && votes.positivity >= 0.5) {
        acc.positiveArticles += 1;
      }
      return acc;
    },
    { totalVotes: 0, helpfulVotes: 0, unhelpfulVotes: 0, positiveArticles: 0 }
  );
}

function buildOpsQueues(articles) {
  const enriched = articles
    .filter(article => !article.isPlaceholder)
    .map(article => {
      const votes = deriveVotes(article.raw || article);
      const recencyDays = Math.max(0, (Date.now() - new Date(article.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      const urgency = (votes.total / 10) + (votes.positivity !== null ? (1 - votes.positivity) * 5 : 0) + recencyDays / 45;
      const aiInsight = generateAiInsight(article, votes, recencyDays);
      return { article, votes, urgency, recencyDays, aiInsight };
    });

  const alerts = enriched
    .filter(item => item.votes.total > 5 || item.votes.positivity === null || item.votes.positivity < 0.6)
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, 6);

  const stale = enriched
    .filter(item => item.recencyDays > 90)
    .sort((a, b) => b.recencyDays - a.recencyDays)
    .slice(0, 6);

  return { alerts, stale };
}

function generateAiInsight(article, votes, recencyDays) {
  const insights = [];
  const totalVotes = votes.total;
  if (totalVotes > 0 && votes.positivity !== null && votes.positivity < 0.5) {
    insights.push(`Only ${Math.round(votes.positivity * 100)}% of ${totalVotes} votes are positive; investigate the main failure reasons customers cite.`);
  } else if (totalVotes === 0) {
    insights.push('No recent feedback yet—prompt internal teams or release notes to collect sentiment.');
  }

  if (recencyDays > 120) {
    insights.push(`Content is ${recencyDays} days old; confirm policies and UI labels still reflect current product.`);
  }

  const snippet = (article.snippet || '').toLowerCase();
  const keywordMatch = KEYWORD_HINTS.find(entry => entry.keywords.some(keyword => snippet.includes(keyword)));
  if (keywordMatch) {
    insights.push(keywordMatch.message);
  }

  if (!keywordMatch && insights.length < 2) {
    insights.push('Add a short "What changed" callout and link to the most common next step to reduce navigation time.');
  }

  return insights.join(' ');
}

function capitalise(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatIntegration(value) {
  return value
    .split('-')
    .map(part => (part.length > 3 ? capitalise(part) : part.toUpperCase()))
    .join(' ');
}

function formatFeature(value) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => capitalise(part))
    .join(' ');
}

function formatRelative(date) {
  if (!date) return 'recently';
  const diffMs = Date.now() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return '1 day';
  if (diffDays < 30) return `${diffDays} days`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month';
  if (diffMonths < 12) return `${diffMonths} months`;
  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? '1 year' : `${diffYears} years`;
}
