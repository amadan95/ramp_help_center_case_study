import { useEffect, useState } from 'react';

export function useHelpCenterData({ articlePages = 6 } = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [articles, setArticles] = useState([]);
  const [chunks, setChunks] = useState([]);
  const [fetchedAt, setFetchedAt] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        // In a real app, this would fetch from an API
        // For this demo, we'll use static JSON files
        const articlesRes = await fetch('/data/articles.json');
        const chunksRes = await fetch('/data/chunks.json');
        const usageRes = await fetch('/data/usage.json');
        
        if (!articlesRes.ok || !chunksRes.ok || !usageRes.ok) {
          throw new Error('Failed to load data');
        }
        
        const articlesData = await articlesRes.json();
        const chunksData = await chunksRes.json();
        const usageData = await usageRes.json();
        
        // Load all available articles (remove demo pagination cap) and merge usage-only items as placeholders
        const baseArticles = Array.isArray(articlesData) ? articlesData.slice() : [];
        const titleToArticle = new Map(
          baseArticles
            .filter(a => a && typeof a.title === 'string')
            .map(a => [a.title.trim().toLowerCase(), a])
        );

        const placeholders = Array.isArray(usageData)
          ? usageData
              .filter(u => u && typeof u.title === 'string' && !titleToArticle.has(u.title.trim().toLowerCase()))
              .map(u => {
                const title = u.title.trim();
                const id = title
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/(^-|-$)/g, '')
                  .slice(0, 80);
                const voteTotal = (Number(u.upvotes || 0) + Number(u.downvotes || 0)) | 0;
                const voteSum = (Number(u.upvotes || 0) - Number(u.downvotes || 0)) | 0;
                return {
                  id: `usage-${id || Date.now()}`,
                  title,
                  source_url: null,
                  persona: [],
                  service_tier: ['base'],
                  feature_area: [],
                  topic_cluster: 'General',
                  content_type: 'guide',
                  journey_stage: 'operate',
                  integrations: [],
                  regions: ['us'],
                  product_variants: [],
                  is_plus_only: false,
                  updated_at: new Date().toISOString(),
                  owner_team: 'Help Center',
                  feedback_channels: ['article_vote'],
                  snippet: '',
                  signals: {
                    views_30d: Number(u.views || 0),
                    vote_total: voteTotal,
                    vote_sum: voteSum
                  },
                  vote_count: voteTotal,
                  vote_sum: voteSum,
                  html_url: `https://support.ramp.com/hc/en-us/search?query=${encodeURIComponent(title)}`,
                  isPlaceholder: true
                };
              })
          : [];

        setArticles([...baseArticles, ...placeholders]);
        setChunks(chunksData || []);
        setFetchedAt(new Date());
        setError(null);
      } catch (err) {
        console.error('Error fetching help center data:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [articlePages]);

  return { loading, error, articles, chunks, fetchedAt };
}