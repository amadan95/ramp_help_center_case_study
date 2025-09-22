import { useEffect, useMemo, useState } from 'react';
import usageRecords from '../../data/usage.json';
import { buildChunk, deriveVotes, mapArticle } from '../utils/metadata';

function normaliseTitle(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function createPlaceholderArticle(record) {
  const totalVotes = record.upvotes + record.downvotes;
  const voteSum = record.upvotes - record.downvotes;
  const searchUrl = `https://support.ramp.com/hc/en-us/search?query=${encodeURIComponent(record.title)}`;

  return {
    id: `usage-${record.rank}`,
    title: record.title,
    persona: ['admin'],
    service_tier: ['base'],
    feature_area: ['usage-insights'],
    topic_cluster: 'Usage insights',
    content_type: 'reference',
    journey_stage: 'discover',
    integrations: [],
    regions: ['us'],
    product_variants: ['base'],
    is_plus_only: false,
    last_reviewed: null,
    owner_team: 'Help Center',
    feedback_channels: [],
    snippet: 'Usage data available; article content not yet ingested in this prototype. Follow the link to view the full article.',
    html_url: searchUrl,
    source_url: searchUrl,
    vote_count: totalVotes,
    vote_sum: voteSum,
    signals: {
      vote_total: totalVotes,
      vote_sum: voteSum,
      views_30d: record.views,
      usage_upvotes: record.upvotes,
      usage_downvotes: record.downvotes
    },
    isPlaceholder: true
  };
}

const BASE_URL = 'https://support.ramp.com/api/v2/help_center/en-us';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Request failed: ${response.status} ${response.statusText} - ${message}`);
  }
  return response.json();
}

async function fetchPaginated(path, key, { perPage = 100, maxPages = 5 } = {}) {
  let page = 1;
  let nextUrl = `${BASE_URL}/${path}.json?per_page=${perPage}&page=${page}`;
  const results = [];

  while (nextUrl && page <= maxPages) {
    const data = await fetchJson(nextUrl);
    const pageItems = data[key] || [];
    results.push(...pageItems);
    nextUrl = data.next_page;
    page += 1;
  }

  return results;
}

export function useHelpCenterData({ articlePages = 2 } = {}) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    articles: [],
    chunks: [],
    stats: { totalVotes: 0, positiveArticles: 0, helpfulVotes: 0, unhelpfulVotes: 0 },
    fetchedAt: null
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState(prev => ({ ...prev, loading: true, error: null }));
      try {
        const [categories, sections, articles] = await Promise.all([
          fetchPaginated('categories', 'categories', { perPage: 100, maxPages: 1 }),
          fetchPaginated('sections', 'sections', { perPage: 100, maxPages: 5 }),
          fetchPaginated('articles', 'articles', { perPage: 100, maxPages: articlePages })
        ]);

        if (cancelled) return;

        const sectionMap = new Map(sections.map(section => [section.id, section]));
        const categoryMap = new Map(categories.map(category => [category.id, category]));

        const usageMap = new Map(usageRecords.map(record => [normaliseTitle(record.title), { record, matched: false }]));

        const mappedArticles = articles.map(article => {
          const section = sectionMap.get(article.section_id) || null;
          const category = section ? categoryMap.get(section.category_id) : null;
          const mapped = mapArticle(article, section, category);
          const key = normaliseTitle(mapped.title);
          const usageEntry = usageMap.get(key);
          if (usageEntry) {
            usageEntry.matched = true;
            const { record } = usageEntry;
            const totalVotes = record.upvotes + record.downvotes;
            const voteSum = record.upvotes - record.downvotes;
            mapped.vote_count = totalVotes;
            mapped.vote_sum = voteSum;
            mapped.signals = {
              ...(mapped.signals || {}),
              vote_total: totalVotes,
              vote_sum: voteSum,
              views_30d: record.views,
              usage_upvotes: record.upvotes,
              usage_downvotes: record.downvotes
            };
            mapped.usage = record;
          }
          return mapped;
        });

        const placeholderArticles = [];
        usageMap.forEach(({ record, matched }) => {
          if (!matched) {
            placeholderArticles.push(createPlaceholderArticle(record));
          }
        });

        const allArticles = [...mappedArticles, ...placeholderArticles];

        const chunks = allArticles.map(buildChunk).filter(Boolean);

        const stats = allArticles.reduce(
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
          { totalVotes: 0, positiveArticles: 0, helpfulVotes: 0, unhelpfulVotes: 0 }
        );

        setState({
          loading: false,
          error: null,
          articles: allArticles,
          chunks,
          stats,
          fetchedAt: new Date()
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load help center data', error);
        setState(prev => ({ ...prev, loading: false, error }));
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [articlePages]);

  const value = useMemo(() => state, [state]);
  return value;
}
