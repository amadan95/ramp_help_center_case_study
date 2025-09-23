import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image
} from 'react-native';
import { useHelpCenterData } from './src/hooks/useHelpCenterData';
import { FilterSection } from './src/components/FilterSection';
import { ArticleCard } from './src/components/ArticleCard';
import { DefinitionTooltip } from './src/components/DefinitionTooltip';
import { deriveVotes } from './src/utils/metadata';
import { FONT_FAMILY, rampPalette } from './src/theme';
import { generateAiAnswer } from './src/utils/ai';
import { GEMINI_API_KEY, debugGeminiKeyPresence } from './src/utils/config';
import Markdown from 'react-native-markdown-display';

const VIEW_TABS = [
  { id: 'human', label: 'Human experience' },
  { id: 'ops', label: 'Operator console' },
  { id: 'ai', label: 'AI retrieval' }
];

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
  'Unhelpful votes': 'Percentage of unhelpful votes across the filtered article set.'
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

export default function App() {
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

  // Local edit + override state for operator console editor
  const [articleOverrides, setArticleOverrides] = useState({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorArticle, setEditorArticle] = useState(null);
  const [editorBody, setEditorBody] = useState('');
  const [editorPersona, setEditorPersona] = useState([]);
  const [editorTier, setEditorTier] = useState([]);
  const [editorFeatures, setEditorFeatures] = useState([]);
  const [editorIntegrations, setEditorIntegrations] = useState([]);

  const scrollRef = useRef(null);
  const groupsTopYRef = useRef(null);
  const CATEGORY_TO_AREA = {
    'getting-started': 'authentication',
    'cards-controls': 'cards',
    'bill-pay': 'billPay',
    'accounting-close': 'accounting',
    'reimbursements': 'reimbursements',
    'integrations': 'integrations'
  };

  const effectiveArticles = useMemo(
    () => articles.map(a => (articleOverrides[a.id] ? { ...a, ...articleOverrides[a.id] } : a)),
    [articles, articleOverrides]
  );

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
          scrollRef.current.scrollTo({ y: Math.max(0, groupsTopYRef.current - 12), animated: true });
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
        scrollRef.current.scrollTo({ y: Math.max(0, groupsTopYRef.current - 12), animated: true });
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
        scrollRef.current.scrollTo({ y: Math.max(0, groupsTopYRef.current - 12), animated: true });
      } catch (e) {}
    }
  };

  const handleBackToLanding = () => {
    setHumanMode('landing');
    setShowAudienceControls(false);
  };

  // Operator console editor handlers
  const handleOpenEditor = article => {
    const source = articleOverrides[article.id] ? { ...article, ...articleOverrides[article.id] } : article;
    setEditorArticle(article);
    setEditorBody(source.raw?.body || source.body || '');
    setEditorPersona(Array.isArray(source.persona) ? source.persona : []);
    setEditorTier(Array.isArray(source.service_tier) ? source.service_tier : []);
    setEditorFeatures(Array.isArray(source.feature_area) ? source.feature_area : []);
    setEditorIntegrations(Array.isArray(source.integrations) ? source.integrations : []);
    setEditorOpen(true);
  };

  const toggleEditorList = (setter, current, value) => {
    const exists = current.includes(value);
    const next = exists ? current.filter(v => v !== value) : [...current, value];
    setter(next);
  };

  const handleSaveEditor = () => {
    if (!editorArticle) return;
    setArticleOverrides(prev => ({
      ...prev,
      [editorArticle.id]: {
        body: editorBody,
        persona: editorPersona,
        service_tier: editorTier,
        feature_area: editorFeatures,
        integrations: editorIntegrations
      }
    }));
    setEditorOpen(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
        <View style={styles.topBar}>
          <Image
            source={require('./assets/Ramp_Business_Corporation_Logo.svg.png')}
            style={styles.logo}
            resizeMode="contain"
            accessible
            accessibilityLabel="Ramp"
          />
          <View style={styles.tabRow}>
            {VIEW_TABS.map(tab => (
              <Pressable
                key={tab.id}
                style={[styles.tabButton, view === tab.id && styles.tabButtonActive]}
                onPress={() => setView(tab.id)}
              >
                <Text style={[styles.tabText, view === tab.id && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {view === 'human' ? (
          <View style={styles.hero}>
            <Text style={styles.humanHeroTitle}>Find answers, accelerate workflows, stay compliant</Text>
            <Text style={styles.humanHeroSubtitle}>
              Search and browse guidance tailored to your roles, tier, and integrations. Use AI Assist for
              complex multi-step workflows.
            </Text>
          </View>
        ) : (
          <View style={styles.hero}>
            <View style={styles.heroBadgeRow}>
              <Text style={styles.heroBadge}>Live Zendesk feed</Text>
              {fetchedAt ? <Text style={styles.heroTimestamp}>Synced {fetchedAt.toLocaleDateString()}</Text> : null}
            </View>
            <Text style={styles.heroTitle}>Ramp Context Hub</Text>
            <Text style={styles.heroSubtitle}>
              Real-time classification of Ramp help center content to drive tailored experiences for employees, admins, and support AI.
            </Text>
            <View style={styles.heroMetaRow}>
              <Text style={styles.heroMeta}>Persona-aware journeys</Text>
              <Text style={styles.heroMeta}>AI-safe knowledge graph</Text>
              <Text style={styles.heroMeta}>Ops quality loop</Text>
            </View>
          </View>
        )}

      {view !== 'human' ? (
        <View style={styles.metricsRow}>
          <Metric label="Articles" value={filteredArticleCount} definition={METRIC_DEFINITIONS.Articles} />
          <Metric label="Sentiment" value={sentimentValue} definition={METRIC_DEFINITIONS.Sentiment} />
          <Metric label="Helpful votes" value={helpfulPercent} definition={METRIC_DEFINITIONS['Helpful votes']} />
          <Metric label="Unhelpful votes" value={unhelpfulPercent} definition={METRIC_DEFINITIONS['Unhelpful votes']} />
        </View>
      ) : null}

        {view === 'human' && showAudienceControls ? (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Filters</Text>
              <Text style={styles.panelSubtitle}>Filters power all three modes—adjust to see how content and signals change.</Text>
            </View>
            <View style={styles.filtersWrapper}>
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
            </View>
          </View>
        ) : null}

        {view === 'ai' ? (
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder={view === 'human' ? 'Search articles…' : 'Search chunks…'}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        ) : null}

        

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={rampPalette.accentSecondary} />
            <Text style={styles.loadingText}>Pulling fresh content from Zendesk…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Failed to load help center data</Text>
            <Text style={styles.errorMessage}>{error.message}</Text>
          </View>
        ) : null}

        {!loading && !error ? (
          <View style={styles.viewWrapper}>
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
            {view === 'ai' ? renderAiView(filteredChunks, chunkSort, handleChunkSort) : null}
            {view === 'ops' ? renderOpsView(opsQueues, handleOpenEditor) : null}
          </View>
        ) : null}
        {editorOpen ? (
          <>
            <Pressable style={styles.drawerBackdrop} onPress={() => setEditorOpen(false)} />
            <View style={styles.drawer}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Edit article</Text>
                <View style={styles.drawerHeaderActions}>
                  <Pressable onPress={() => setEditorOpen(false)} style={styles.drawerActionButton}>
                    <Text style={styles.drawerActionText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleSaveEditor} style={[styles.drawerActionButton, styles.drawerSaveButton]}>
                    <Text style={[styles.drawerActionText, styles.drawerSaveText]}>Save</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.drawerFieldLabel}>Body</Text>
              <TextInput
                multiline
                style={styles.drawerTextInput}
                value={editorBody}
                onChangeText={setEditorBody}
              />
              <View style={styles.drawerFiltersRow}>
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
                  title="Integrations"
                  options={integrationOptions}
                  selected={editorIntegrations}
                  onSelect={value => toggleEditorList(setEditorIntegrations, editorIntegrations, value)}
                  emptyLabel="No integration tags"
                />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function renderHumanView(articles, setSearchValue, searchValue, onSelectCategory, onGroupsLayout, mode, resultsTitle, onBackToLanding, onSubmitSearch, onViewAll) {
  const isSearching = Boolean((searchValue || '').trim());
  const effectiveResultsTitle = isSearching ? `Search: ${searchValue}` : resultsTitle;
  const categories = [
    { id: 'getting-started', title: 'Getting Started', description: 'Account setup, invites, and your first policies.' },
    { id: 'cards-controls', title: 'Cards & Controls', description: 'Issue physical & virtual cards, set spend limits.' },
    { id: 'bill-pay', title: 'Bill Pay & AP', description: 'Onboard vendors, approvals, international payments.' },
    { id: 'accounting-close', title: 'Accounting & Close', description: 'Automations, rules, and ERP sync to close faster.' },
    { id: 'reimbursements', title: 'Reimbursements', description: 'Submit, approve, and sync employee expenses.' },
    { id: 'integrations', title: 'Integrations', description: 'Connect ERPs, HRIS, travel & real-time feeds.' },
    { id: 'security-compliance', title: 'Security & Compliance', description: 'Permissions, audit trails, and policy controls.' },
    { id: 'whats-new', title: "What's New", description: 'Latest feature releases and change log.' }
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
    if (url) Linking.openURL(url);
  };

  return (
    <View>
      <Text style={styles.humanHeroSubtitle}>
        Search and browse guidance tailored to your roles, tier, and integrations. Use AI Assist for
        complex multi-step workflows.
      </Text>
      <View style={styles.humanSearchRow}
      >
        <TextInput
          style={styles.humanSearchInput}
          placeholder="Search by task, feature, or question..."
          value={searchValue}
          onChangeText={setSearchValue}
        />
        <Pressable style={styles.humanSearchButton} onPress={onSubmitSearch}>
          <Text style={styles.humanSearchButtonText}>Search</Text>
        </Pressable>
      </View>
      <View style={styles.humanTryRow}>
        <Text style={styles.humanTryLabel}>Try:</Text>
        {['Virtual cards', 'Bill Pay approvals', 'Receipt matching', 'Accounting sync'].map(example => (
          <Pressable key={example} style={styles.humanTryPill} onPress={() => setSearchValue && setSearchValue(example)}>
            <Text style={styles.humanTryPillText}>{example}</Text>
          </Pressable>
        ))}
      </View>
      {(mode === 'landing' && !isSearching) ? (
        <View style={styles.humanInfoRow} onLayout={e => onGroupsLayout && onGroupsLayout(e.nativeEvent.layout.y)}>
          <View style={styles.humanInfoCard}>
            <Text style={styles.humanInfoTitle}>Popular this week</Text>
            {popular.length ? (
              <View style={styles.humanList}>
                {popular.map(item => (
                  <Pressable key={item.id} onPress={() => openArticle(item.html_url)} style={styles.humanListItem}>
                    <Text numberOfLines={1} style={styles.humanListLink}>{item.title}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.humanInfoText}>No popularity data available yet.</Text>
            )}
          </View>
          <View style={styles.humanInfoCard}>
            <Text style={styles.humanInfoTitle}>Recently updated</Text>
            {recent.length ? (
              <View style={styles.humanList}>
                {recent.map(item => {
                  const updated = item.updated_at || item.last_reviewed || null;
                  const updatedDisplay = updated
                    ? new Date(updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : null;
                  return (
                    <Pressable key={item.id} onPress={() => openArticle(item.html_url)} style={styles.humanListItem}>
                      <Text numberOfLines={1} style={styles.humanListLink}>{item.title}</Text>
                      {updatedDisplay ? <Text style={styles.humanListMeta}>{updatedDisplay}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.humanInfoText}>No recent updates found.</Text>
            )}
          </View>
        </View>
      ) : (
        <View onLayout={e => onGroupsLayout && onGroupsLayout(e.nativeEvent.layout.y)}>
          <View style={styles.humanResultsHeader}>
            <Text style={styles.sectionTitle}>{effectiveResultsTitle}</Text>
            <Pressable onPress={onBackToLanding}><Text style={styles.humanBrowseAll}>Back</Text></Pressable>
          </View>
          <AiAssistPanel query={searchValue} articles={articles} shouldGenerate={Boolean((searchValue||'').trim())} />
          <View style={styles.articleGrid}>
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
          </View>
        </View>
      )}

      <View style={styles.humanBrowseHeader}>
        <Text style={styles.sectionTitle}>Browse by category</Text>
        <Pressable onPress={onViewAll}>
          <Text style={styles.humanBrowseAll}>View all →</Text>
        </Pressable>
      </View>
      <View style={styles.humanCategoryGrid}>
        {limitedCategories.map(cat => (
          <Pressable
            key={cat.id}
            style={styles.humanCategoryCard}
            onPress={() => onSelectCategory && onSelectCategory(cat.id)}
          >
            <Text style={styles.humanCategoryTitle}>{cat.title}</Text>
            <Text style={styles.humanCategoryDesc}>{cat.description}</Text>
            <Text style={styles.humanCategoryCta}>Browse →</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function FeatureGroupSection({ area, items }) {
  const [open, setOpen] = useState(false);
  const title = formatFeature(area);
  return (
    <View style={styles.groupWrapper}>
      <Pressable style={styles.groupCard} onPress={() => setOpen(v => !v)}>
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle}>{title}</Text>
          <Text style={styles.groupChevron}>{open ? '▲' : '▼'}</Text>
        </View>
        <Text style={styles.groupMeta}>{items.length} article{items.length === 1 ? '' : 's'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.groupContent}>
          <View style={styles.articleGrid}>
            {items.map(article => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function renderAiView(chunks, sortState, onSort) {
  const renderSortIndicator = column => {
    if (!sortState || sortState.column !== column) return '';
    return sortState.direction === 'desc' ? ' ↓' : ' ↑';
  };

  const handleSort = column => {
    if (onSort) onSort(column);
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>RAG Retrieval Preview</Text>
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeader]}>
          <DefinitionTooltip
            style={[styles.tableHeaderCell, styles.colChunk]}
            label="Chunk"
            description={COLUMN_DEFINITIONS.chunk}
          >
            <Pressable onPress={() => handleSort('chunk')} style={styles.tableHeaderPressable}>
              <Text style={[styles.tableHeaderText, styles.tableCellCenter]}>
                Chunk{renderSortIndicator('chunk')}
              </Text>
            </Pressable>
          </DefinitionTooltip>
          <DefinitionTooltip
            style={[styles.tableHeaderCell, styles.colPersona]}
            label="Persona & Tier"
            description={COLUMN_DEFINITIONS.personaTier}
          >
            <Pressable onPress={() => handleSort('persona')} style={styles.tableHeaderPressable}>
              <Text style={[styles.tableHeaderText, styles.tableCellCenter]}>
                Persona / Tier{renderSortIndicator('persona')}
              </Text>
            </Pressable>
          </DefinitionTooltip>
          <DefinitionTooltip
            style={[styles.tableHeaderCell, styles.colSummary]}
            label="Summary"
            description={COLUMN_DEFINITIONS.summary}
          >
            <Pressable onPress={() => handleSort('summary')} style={styles.tableHeaderPressable}>
              <Text style={[styles.tableHeaderText, styles.tableCellCenter]}>
                Summary{renderSortIndicator('summary')}
              </Text>
            </Pressable>
          </DefinitionTooltip>
          <DefinitionTooltip
            style={[styles.tableHeaderCell, styles.colUpdated]}
            label="Last updated"
            description={COLUMN_DEFINITIONS.updated}
          >
            <Pressable onPress={() => handleSort('updated')} style={styles.tableHeaderPressable}>
              <Text style={[styles.tableHeaderText, styles.tableCellCenter]}>
                Updated{renderSortIndicator('updated')}
              </Text>
            </Pressable>
          </DefinitionTooltip>
          <DefinitionTooltip
            style={[styles.tableHeaderCell, styles.colConfidence]}
            label="Confidence"
            description={COLUMN_DEFINITIONS.confidence}
          >
            <Pressable onPress={() => handleSort('confidence')} style={styles.tableHeaderPressable}>
              <Text style={[styles.tableHeaderText, styles.tableCellCenter]}>
                Confidence{renderSortIndicator('confidence')}
              </Text>
            </Pressable>
          </DefinitionTooltip>
          <DefinitionTooltip
            style={[styles.tableHeaderCell, styles.colStatus]}
            label="AI ready?"
            description={COLUMN_DEFINITIONS.status}
          >
            <Pressable onPress={() => handleSort('status')} style={styles.tableHeaderPressable}>
              <Text style={[styles.tableHeaderText, styles.tableCellCenter]}>
                AI ready?{renderSortIndicator('status')}
              </Text>
            </Pressable>
          </DefinitionTooltip>
        </View>
        {chunks.length === 0 ? (
          <View style={[styles.tableRow, styles.tableEmpty]}>
            <Text style={styles.emptyState}>No persona-specific chunks for this combination yet.</Text>
          </View>
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
            if (!checks.confidenceOk) needs.push('>=65% confidence');
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
            const updatedRelativeBase = updatedDate ? formatRelative(chunk.last_reviewed) : '';
            const updatedRelative = updatedRelativeBase
              ? updatedRelativeBase === 'today'
                ? 'Today'
                : `${updatedRelativeBase} ago`
              : '';

            return (
              <View key={chunk.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, styles.colChunk, styles.tableCellStrong]} numberOfLines={2}>
                  {chunk.title}
                </Text>
                <Text style={[styles.tableCell, styles.colPersona, styles.tableCellMuted]}>
                  {chunk.persona.join(', ')} {'\n'} {chunk.service_tier.join(', ')}
                </Text>
                <Text style={[styles.tableCell, styles.colSummary, styles.tableCellMuted]} numberOfLines={3}>
                  {chunk.summary}
                </Text>
                <Text style={[styles.tableCell, styles.colUpdated, styles.tableCellCenter]}>
                  {updatedDisplay}
                  {updatedRelative ? `\n${updatedRelative}` : ''}
                </Text>
                <Text style={[styles.tableCell, styles.colConfidence, styles.tableCellCenter]}>
                  {Math.round((chunk.confidence || 0) * 100)}%
                </Text>
                <Text style={[styles.tableCell, styles.colStatus, styles.tableCellCenter]}>
                  <Text style={chunk.allowed_for_ai ? styles.statusGood : styles.statusWarn}>
                    {chunk.allowed_for_ai ? 'Approved' : 'Human review'}
                  </Text>
                  <Text style={styles.tableCellMeta}>{`
${metaLine}`}</Text>
                  {recencyLine ? (
                    <Text style={styles.tableCellMeta}>{`
${recencyLine}`}</Text>
                  ) : null}
                  {needsLine ? (
                    <Text style={[styles.tableCellMeta, styles.tableCellFail]}>{`
${needsLine}`}</Text>
                  ) : null}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function renderOpsView(queues, onEdit) {
  const renderCard = (item, badgeLabel, accentColor) => {
    const persona = (item.article.persona && item.article.persona.length ? item.article.persona : ['—']).join(' • ');
    const tiers = (item.article.service_tier && item.article.service_tier.length ? item.article.service_tier : ['—']).join(' • ');
    const positivity = item.votes.positivity !== null ? Math.round(item.votes.positivity * 100) : null;
    const sentimentLabel = positivity === null ? 'No feedback yet' : `${positivity}% positive`;
    const sentimentStyle = positivity !== null && positivity < 50 ? styles.opsSentimentWarn : styles.opsSentimentOk;
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
      <Pressable
        key={item.article.id}
        style={[styles.opsCard, { borderLeftColor: accentColor }]}
        onPress={() => Linking.openURL(item.article.html_url)}
      >
        <View style={styles.opsCardHeader}>
          <Text style={styles.opsBadge}>{badgeLabel}</Text>
          <View style={styles.opsHeaderRight}>
            <Text style={styles.opsMeta}>{updatedRelative}</Text>
            <Pressable
              style={styles.opsEditButton}
              onPress={(e) => {
                e?.stopPropagation?.();
                if (onEdit) onEdit(item.article);
              }}
            >
              <Text style={styles.opsEditButtonText}>Edit</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.opsCardTitle}>{item.article.title}</Text>
        <View style={styles.opsTagRow}>
          <Text style={styles.opsTag}>{persona}</Text>
          <Text style={styles.opsTag}>{tiers}</Text>
        </View>
        <View style={styles.opsStatsRow}>
          <Text style={[styles.opsSentiment, sentimentStyle]}>{sentimentLabel}</Text>
          <Text style={styles.opsStatsMeta}>Votes {item.votes.total}</Text>
          {updatedAbsolute ? <Text style={styles.opsStatsMeta}>{updatedAbsolute}</Text> : null}
        </View>
        <Text style={styles.opsAiTitle}>AI suggestion</Text>
        <Text style={styles.opsAiText}>{item.aiInsight}</Text>
      </Pressable>
    );
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Operator Console</Text>
      <View style={styles.opsRow}>
        <View style={styles.opsColumn}>
          <Text style={styles.opsTitle}>High impact refresh queue</Text>
          {queues.alerts.length === 0 ? (
            <Text style={styles.emptyState}>No alerts yet</Text>
          ) : (
            queues.alerts.map(item => renderCard(item, 'Refresh alert', rampPalette.accentSecondary))
          )}
        </View>
        <View style={styles.opsColumn}>
          <Text style={styles.opsTitle}>Stale content</Text>
          {queues.stale.length === 0 ? (
            <Text style={styles.emptyState}>All sampled articles are fresh.</Text>
          ) : (
            queues.stale.map(item => renderCard(item, 'Stale watch', rampPalette.warning))
          )}
        </View>
      </View>
    </View>
  );
}

function AiAssistPanel({ query, articles, shouldGenerate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const lastRunRef = useRef({ q: '', count: 0 });
  const [feedback, setFeedback] = useState(null); // 'up' | 'down' | null
  const feedbackKeyRef = useRef('');

  useEffect(() => {
    // On first render, log masked key presence to help debug env wiring in prod
    try { debugGeminiKeyPresence(); } catch (_) {}
    const q = (query || '').trim();
    if (!shouldGenerate || !q) return;
    const visible = Array.isArray(articles) ? articles.slice(0, 60) : [];
    const matched = visible.filter(a => {
      if (!a) return false;
      const hay = `${a.title} ${(a.snippet || '')}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
    const key = `${q}|${matched.length}`;
    if (lastRunRef.current.q === key) return;
    lastRunRef.current = { q: key, count: matched.length };
    setLoading(true);
    setError(null);
    setAnswer('');
    generateAiAnswer({
      apiKey: GEMINI_API_KEY,
      query: q,
      articles: matched.slice(0, 12)
    })
      .then(({ answer: text, sources: src }) => {
        setAnswer(text);
        setSources(src || []);
      })
      .catch(e => setError(e))
      .finally(() => setLoading(false));
  }, [query, articles, shouldGenerate]);

  // Load/save feedback in local storage keyed by query
  useEffect(() => {
    const q = (query || '').trim().toLowerCase();
    const key = q ? `aiFeedback:${q}` : '';
    feedbackKeyRef.current = key;
    if (!key) {
      setFeedback(null);
      return;
    }
    try {
      const saved = globalThis?.localStorage?.getItem(key);
      if (saved === 'up' || saved === 'down') setFeedback(saved);
      else setFeedback(null);
    } catch (e) {
      // ignore persistence errors
    }
  }, [query, answer]);

  const submitFeedback = value => {
    setFeedback(value);
    try {
      if (feedbackKeyRef.current) globalThis?.localStorage?.setItem(feedbackKeyRef.current, value);
    } catch (e) {}
    try {
      console.log('AI_FEEDBACK', { query, value, sources });
    } catch (e) {}
  };

  return (
    <View style={styles.aiPanel}>
      <View style={styles.aiHeaderRow}>
        <Text style={styles.aiTitle}>AI Assist</Text>
        {loading ? <Text style={styles.aiHintText}>Generating…</Text> : null}
      </View>
      {error ? <Text style={styles.aiErrorText}>{String(error.message || error)}</Text> : null}
      {answer ? (
        <View style={styles.aiAnswerBox}>
          <Markdown style={{ body: styles.aiAnswerText }}>
            {answer}
          </Markdown>
          {sources?.length ? (
            <View style={styles.aiSources}>
              <Text style={styles.aiSourcesLabel}>Sources</Text>
              {sources.map(src => (
                <Pressable key={src.index + src.url} onPress={() => src.url && Linking.openURL(src.url)}>
                  <Text numberOfLines={1} style={styles.aiSourceLink}>[{src.index}] {src.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.aiFeedbackRow}>
            <Text style={styles.aiFeedbackLabel}>Was this helpful?</Text>
            <Pressable
              onPress={() => submitFeedback('up')}
              style={[styles.aiFeedbackButton, feedback === 'up' && styles.aiFeedbackButtonSelected, feedback === 'up' && styles.aiFeedbackButtonUp]}
            >
              <Text style={styles.aiFeedbackButtonText}>👍</Text>
            </Pressable>
            <Pressable
              onPress={() => submitFeedback('down')}
              style={[styles.aiFeedbackButton, feedback === 'down' && styles.aiFeedbackButtonSelected, feedback === 'down' && styles.aiFeedbackButtonDown]}
            >
              <Text style={styles.aiFeedbackButtonText}>👎</Text>
            </Pressable>
            {feedback ? (
              <Text style={styles.aiFeedbackThanks}>{feedback === 'up' ? ' Thanks!' : " We'll improve."}</Text>
            ) : null}
          </View>
        </View>
      ) : (
        <Text style={styles.aiHintText}>Type a query and press Search to see an AI summary.</Text>
      )}
    </View>
  );
}

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

function capitalise(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function Metric({ label, value, definition }) {
  const card = (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.metricValue}>{typeof value === 'number' ? value.toLocaleString() : value}</Text>
    </View>
  );

  if (!definition) {
    return card;
  }

  return (
    <DefinitionTooltip label={label} description={definition}>
      {card}
    </DefinitionTooltip>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: rampPalette.background
  },
  container: {
    paddingHorizontal: 32,
    paddingBottom: 72,
    paddingTop: 36,
    maxWidth: 1180,
    alignSelf: 'center'
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  logo: {
    height: 28,
    width: 120
  },
  hero: {
    backgroundColor: rampPalette.surface,
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 40,
    borderWidth: 1,
    borderColor: rampPalette.border,
    shadowColor: 'rgba(19, 22, 43, 0.12)',
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    marginBottom: 28
  },
  humanHeroTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: rampPalette.accentPrimary,
    marginBottom: 12,
    fontFamily: FONT_FAMILY
  },
  humanHeroSubtitle: {
    fontSize: 16,
    color: rampPalette.muted,
    lineHeight: 24,
    maxWidth: 760,
    marginBottom: 16,
    fontFamily: FONT_FAMILY
  },
  humanSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: rampPalette.surface,
    borderWidth: 1,
    borderColor: rampPalette.border,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 4
  },
  humanSearchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontFamily: FONT_FAMILY
  },
  humanSearchButton: {
    backgroundColor: rampPalette.accentSecondary,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  humanSearchButtonText: {
    color: rampPalette.accentPrimary,
    fontWeight: '700',
    fontFamily: FONT_FAMILY
  },
  humanTryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 2,
    marginBottom: 18,
    paddingTop: 8,
    paddingBottom: 8
  },
  humanTryLabel: {
    color: rampPalette.muted,
    marginRight: 10,
    fontFamily: FONT_FAMILY
  },
  humanTryPill: {
    backgroundColor: rampPalette.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 10,
    marginTop: 6
  },
  humanTryPillText: {
    color: rampPalette.accentPrimary,
    fontWeight: '600',
    fontFamily: FONT_FAMILY
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  heroBadge: {
    backgroundColor: rampPalette.accentBadge,
    color: rampPalette.accentPrimary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 12,
    fontFamily: FONT_FAMILY
  },
  heroTimestamp: {
    marginLeft: 14,
    color: rampPalette.muted,
    fontSize: 12,
    fontFamily: FONT_FAMILY
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: rampPalette.accentPrimary,
    marginBottom: 12,
    fontFamily: FONT_FAMILY
  },
  heroSubtitle: {
    fontSize: 16,
    color: rampPalette.muted,
    lineHeight: 24,
    maxWidth: 760,
    fontFamily: FONT_FAMILY
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 20
  },
  heroMeta: {
    backgroundColor: rampPalette.accentSoft,
    color: rampPalette.accentPrimary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 10,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: FONT_FAMILY
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    marginHorizontal: -10
  },
  metricCard: {
    backgroundColor: rampPalette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: rampPalette.border,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 10,
    marginBottom: 20,
    shadowColor: 'rgba(31, 31, 31, 0.06)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
  },
  metricLabel: {
    fontSize: 11,
    letterSpacing: 1,
    color: rampPalette.muted,
    fontWeight: '600',
    fontFamily: FONT_FAMILY
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '700',
    color: rampPalette.accentPrimary,
    marginTop: 6,
    fontFamily: FONT_FAMILY
  },
  panel: {
    backgroundColor: rampPalette.surface,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: rampPalette.border,
    marginBottom: 28,
    shadowColor: 'rgba(19, 22, 43, 0.08)',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 }
  },
  panelHeader: {
    marginBottom: 20
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: rampPalette.accentPrimary,
    fontFamily: FONT_FAMILY
  },
  panelSubtitle: {
    fontSize: 14,
    color: rampPalette.muted,
    marginTop: 6,
    fontFamily: FONT_FAMILY
  },
  filtersWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 24,
    justifyContent: 'flex-end'
  },
  tabButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: rampPalette.border,
    paddingVertical: 11,
    paddingHorizontal: 20,
    marginRight: 12,
    backgroundColor: '#EEF0FA',
    shadowColor: 'rgba(19, 22, 43, 0.08)',
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  tabButtonActive: {
    backgroundColor: rampPalette.accentSecondary,
    borderColor: rampPalette.accentSecondary,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
  },
  tabText: {
    color: rampPalette.accentPrimary,
    fontWeight: '600',
    fontFamily: FONT_FAMILY
  },
  tabTextActive: {
    color: rampPalette.accentPrimary
  },

  searchRow: {
    marginBottom: 16
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: rampPalette.border,
    backgroundColor: rampPalette.surface,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontFamily: FONT_FAMILY
  },
  loading: {
    alignItems: 'center',
    paddingVertical: 40
  },
  loadingText: {
    marginTop: 12,
    color: rampPalette.muted,
    fontFamily: FONT_FAMILY
  },
  errorBox: {
    borderRadius: 20,
    backgroundColor: '#FBF2EE',
    borderWidth: 1,
    borderColor: '#F1DED6',
    padding: 22,
    marginBottom: 28
  },
  errorTitle: {
    fontWeight: '700',
    marginBottom: 8,
    color: rampPalette.danger,
    fontFamily: FONT_FAMILY
  },
  errorMessage: {
    color: rampPalette.accentTertiary,
    fontFamily: FONT_FAMILY
  },
  viewWrapper: {
    borderRadius: 28,
    backgroundColor: rampPalette.surface,
    borderWidth: 1,
    borderColor: rampPalette.border,
    padding: 28,
    shadowColor: 'rgba(19, 22, 43, 0.08)',
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 }
  },
  humanInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -10,
    marginTop: 6,
    marginBottom: 20
  },
  humanInfoCard: {
    backgroundColor: rampPalette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: rampPalette.border,
    paddingVertical: 24,
    paddingHorizontal: 24,
    marginHorizontal: 10,
    marginBottom: 20,
    flex: 1,
    minWidth: 260,
    shadowColor: 'rgba(31, 31, 31, 0.06)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
  },
  humanInfoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: rampPalette.accentPrimary,
    marginBottom: 10,
    fontFamily: FONT_FAMILY
  },
  humanInfoText: {
    color: rampPalette.muted,
    fontFamily: FONT_FAMILY
  },
  humanList: {
    marginTop: 8,
    paddingTop: 2
  },
  humanListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10
  },
  humanListLink: {
    color: rampPalette.accentPrimary,
    fontFamily: FONT_FAMILY,
    flex: 1,
    marginRight: 8
  },
  humanListMeta: {
    color: rampPalette.muted,
    fontSize: 12,
    fontFamily: FONT_FAMILY
  },
  humanBrowseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  humanResultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  humanBrowseAll: {
    color: rampPalette.accentPrimary,
    fontWeight: '600',
    fontFamily: FONT_FAMILY
  },
  humanCategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -10
  },
  humanCategoryCard: {
    backgroundColor: rampPalette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: rampPalette.border,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 10,
    marginBottom: 20,
    shadowColor: 'rgba(31, 31, 31, 0.06)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    width: 260,
    flexGrow: 1
  },
  humanCategoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: rampPalette.accentPrimary,
    marginBottom: 6,
    fontFamily: FONT_FAMILY
  },
  humanCategoryDesc: {
    color: rampPalette.muted,
    marginBottom: 10,
    fontFamily: FONT_FAMILY
  },
  humanCategoryCta: {
    color: rampPalette.accentPrimary,
    fontWeight: '600',
    fontFamily: FONT_FAMILY
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: rampPalette.accentPrimary,
    marginBottom: 20,
    fontFamily: FONT_FAMILY
  },
  articleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  emptyState: {
    color: rampPalette.muted,
    fontStyle: 'italic',
    marginTop: 12,
    fontFamily: FONT_FAMILY
  },
  groupWrapper: {
    marginBottom: 16
  },
  groupCard: {
    backgroundColor: rampPalette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: rampPalette.border,
    padding: 20,
    margin: 10,
    flex: 1,
    minWidth: 280,
    maxWidth: 360,
    borderLeftWidth: 5,
    borderLeftColor: rampPalette.accentSecondary,
    shadowColor: 'rgba(31, 31, 31, 0.12)',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  groupTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: rampPalette.accentPrimary,
    lineHeight: 26,
    fontFamily: FONT_FAMILY
  },
  groupChevron: {
    color: rampPalette.muted,
    fontFamily: FONT_FAMILY,
    minWidth: 24,
    textAlign: 'center',
    alignSelf: 'center'
  },
  groupMeta: {
    marginTop: 8,
    color: rampPalette.muted,
    fontSize: 13,
    fontFamily: FONT_FAMILY
  },
  groupContent: {
    marginTop: 10
  },
  table: {
    borderWidth: 1,
    borderColor: rampPalette.border,
    borderRadius: 18,
    overflow: 'visible',
    marginTop: 12
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: rampPalette.border
  },
  tableRowAlt: {
    backgroundColor: '#F9FAFF'
  },
  tableHeader: {
    backgroundColor: '#EEF0FA'
  },
  tableCell: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    fontSize: 13,
    color: rampPalette.text,
    fontFamily: FONT_FAMILY
  },
  tableHeaderCell: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    justifyContent: 'center',
    cursor: 'help'
  },
  tableHeaderPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  tableHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: rampPalette.accentPrimary,
    fontFamily: FONT_FAMILY
  },
  tableEmpty: {
    justifyContent: 'center'
  },
  colChunk: {
    flex: 1.4
  },
  colPersona: {
    flex: 1
  },
  colSummary: {
    flex: 2.4
  },
  colUpdated: {
    width: 150
  },
  colConfidence: {
    width: 120
  },
  colStatus: {
    width: 150
  },
  tableCellStrong: {
    fontWeight: '600'
  },
  tableCellMuted: {
    color: rampPalette.muted
  },
  tableCellCenter: {
    textAlign: 'center'
  },
  tableCellMeta: {
    fontSize: 12,
    color: rampPalette.muted,
    fontFamily: FONT_FAMILY
  },
  tableCellFail: {
    color: rampPalette.danger,
    fontWeight: '600'
  },
  statusGood: {
    color: rampPalette.success,
    fontWeight: '600'
  },
  statusWarn: {
    color: rampPalette.warning,
    fontWeight: '600'
  },
  opsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12
  },
  opsColumn: {
    flex: 1,
    minWidth: 280,
    marginRight: 24
  },
  opsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: rampPalette.accentPrimary,
    marginBottom: 16,
    fontFamily: FONT_FAMILY
  },
  opsCard: {
    backgroundColor: rampPalette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: rampPalette.border,
    borderLeftWidth: 5,
    borderLeftColor: rampPalette.accentSecondary,
    padding: 20,
    marginBottom: 18,
    shadowColor: 'rgba(31, 31, 31, 0.12)',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4
  },
  opsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  opsHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  opsEditButton: {
    marginLeft: 10,
    backgroundColor: rampPalette.accentSecondary,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  opsEditButtonText: {
    color: rampPalette.accentPrimary,
    fontWeight: '700',
    fontFamily: FONT_FAMILY
  },
  opsBadge: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: rampPalette.accentTertiary,
    fontWeight: '700',
    fontFamily: FONT_FAMILY
  },
  opsCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: rampPalette.accentPrimary,
    marginBottom: 12,
    lineHeight: 24,
    fontFamily: FONT_FAMILY
  },
  opsTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginHorizontal: -4
  },
  opsTag: {
    backgroundColor: rampPalette.accentSoft,
    color: rampPalette.text,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: FONT_FAMILY,
    marginHorizontal: 4,
    marginBottom: 8
  },
  opsStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 16,
    marginBottom: 12
  },
  opsStatsMeta: {
    fontSize: 12,
    color: rampPalette.muted,
    marginRight: 12,
    marginTop: 4,
    fontFamily: FONT_FAMILY
  },
  opsMeta: {
    fontSize: 13,
    color: rampPalette.muted,
    fontFamily: FONT_FAMILY
  },
  opsSentiment: {
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    fontFamily: FONT_FAMILY,
    marginRight: 12,
    marginTop: 4
  },
  opsSentimentOk: {
    backgroundColor: 'rgba(161, 194, 0, 0.18)',
    color: rampPalette.success
  },
  opsSentimentWarn: {
    backgroundColor: 'rgba(212, 122, 60, 0.18)',
    color: rampPalette.warning
  },
  opsAiTitle: {
    marginTop: 18,
    fontSize: 12,
    letterSpacing: 0.08,
    textTransform: 'uppercase',
    color: rampPalette.muted,
    fontWeight: '700',
    fontFamily: FONT_FAMILY
  },
  opsAiText: {
    fontSize: 13,
    lineHeight: 20,
    color: rampPalette.text,
    fontFamily: FONT_FAMILY
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)'
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 420,
    bottom: 0,
    backgroundColor: rampPalette.surface,
    borderLeftWidth: 1,
    borderLeftColor: rampPalette.border,
    paddingHorizontal: 20,
    paddingTop: 18
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  drawerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: rampPalette.accentPrimary,
    fontFamily: FONT_FAMILY
  },
  drawerHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  drawerActionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: rampPalette.border,
    marginLeft: 8
  },
  drawerSaveButton: {
    backgroundColor: rampPalette.accentSecondary,
    borderColor: rampPalette.accentSecondary
  },
  drawerActionText: {
    color: rampPalette.accentPrimary,
    fontWeight: '600',
    fontFamily: FONT_FAMILY
  },
  drawerSaveText: {
    fontWeight: '700'
  },
  drawerFieldLabel: {
    fontSize: 12,
    letterSpacing: 1,
    color: rampPalette.muted,
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: FONT_FAMILY
  },
  drawerTextInput: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: rampPalette.border,
    borderRadius: 10,
    padding: 12,
    textAlignVertical: 'top',
    marginBottom: 16,
    backgroundColor: rampPalette.surface,
    fontFamily: FONT_FAMILY
  },
  drawerFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  aiPanel: {
    borderWidth: 1,
    borderColor: rampPalette.border,
    backgroundColor: '#FAFBFE',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: rampPalette.accentSecondary,
    fontFamily: FONT_FAMILY
  },
  aiAskButton: {
    backgroundColor: rampPalette.accentPrimary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10
  },
  aiAskButtonDisabled: {
    opacity: 0.6
  },
  aiAskButtonText: {
    color: 'white',
    fontWeight: '600',
    fontFamily: FONT_FAMILY
  },
  aiAnswerBox: {
    borderTopWidth: 1,
    borderTopColor: rampPalette.border,
    paddingTop: 10
  },
  aiAnswerText: {
    color: '#000000',
    marginBottom: 10,
    fontFamily: FONT_FAMILY
  },
  aiSources: {
    marginTop: 8
  },
  aiSourcesLabel: {
    fontWeight: '700',
    marginBottom: 4,
    fontFamily: FONT_FAMILY
  },
  aiSourceLink: {
    color: rampPalette.accentPrimary,
    marginBottom: 2,
    fontFamily: FONT_FAMILY
  },
  aiErrorText: {
    color: rampPalette.danger,
    fontFamily: FONT_FAMILY
  },
  aiHintText: {
    color: rampPalette.muted,
    fontFamily: FONT_FAMILY
  },
  aiFeedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10
  },
  aiFeedbackLabel: {
    color: rampPalette.accentTertiary,
    marginRight: 8,
    fontFamily: FONT_FAMILY
  },
  aiFeedbackButton: {
    borderWidth: 1,
    borderColor: rampPalette.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF'
  },
  aiFeedbackButtonSelected: {
    borderColor: rampPalette.accentPrimary,
    backgroundColor: '#F1F6FF'
  },
  aiFeedbackButtonUp: {},
  aiFeedbackButtonDown: {},
  aiFeedbackButtonText: {
    fontSize: 16
  },
  aiFeedbackThanks: {
    marginLeft: 8,
    color: rampPalette.accentTertiary,
    fontFamily: FONT_FAMILY
  }
});
