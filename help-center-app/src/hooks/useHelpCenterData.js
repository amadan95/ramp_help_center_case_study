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
        
        if (!articlesRes.ok || !chunksRes.ok) {
          throw new Error('Failed to load data');
        }
        
        const articlesData = await articlesRes.json();
        const chunksData = await chunksRes.json();
        
        setArticles(articlesData.slice(0, articlePages * 10) || []);
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