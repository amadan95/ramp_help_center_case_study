// Minimal Gemini API client for generating an AI answer using article context

export function buildContextFromArticles(articles, { maxArticles = 6, maxCharsPerArticle = 600 } = {}) {
  if (!Array.isArray(articles) || !articles.length) return '';
  const selected = articles.slice(0, maxArticles);
  const lines = selected.map((a, idx) => {
    const body = (a.raw?.body || a.snippet || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const trimmed = body.slice(0, maxCharsPerArticle);
    const persona = (a.persona || []).join(', ');
    const tiers = (a.service_tier || []).join(', ');
    const integrations = (a.integrations || []).join(', ');
    return [
      `[${idx + 1}] ${a.title}`,
      persona ? `Persona: ${persona}` : null,
      tiers ? `Service tier: ${tiers}` : null,
      integrations ? `Integrations: ${integrations}` : null,
      `URL: ${a.html_url || a.source_url || ''}`,
      trimmed ? `Excerpt: ${trimmed}` : null
    ].filter(Boolean).join('\n');
  });
  return lines.join('\n\n');
}

export async function generateAiAnswer({ apiKey, query, articles, persona = [], tiers = [], integrations = [] }) {
  if (!apiKey) {
    throw new Error('Missing Gemini API key');
  }
  const context = buildContextFromArticles(articles);
  const audience = [
    persona.length ? `Persona: ${persona.join(', ')}` : null,
    tiers.length ? `Service tier: ${tiers.join(', ')}` : null,
    integrations.length ? `Integrations: ${integrations.join(', ')}` : null
  ].filter(Boolean).join(' | ');

  const prompt = [
    'You are Ramp Help Center AI. Provide a concise, step-by-step answer.',
    'Use ONLY the provided context. If insufficient, say so briefly and suggest next steps.',
    'Be specific to the audience if provided. Prefer bullet points and numbered steps.',
    audience ? `Audience: ${audience}` : null,
    `User question: ${query || '(no query provided)'}\n`,
    'Context (numbered sources):\n' + (context || '(no context)')
  ].filter(Boolean).join('\n\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 700
    }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Gemini request failed: ${resp.status} ${resp.statusText} ${text}`);
  }
  const data = await resp.json();
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const answer = parts.map(p => p.text).filter(Boolean).join('\n').trim();
  return {
    answer: answer || 'No answer generated.',
    // Provide the first few sources for display
    sources: (articles || []).slice(0, 6).map((a, idx) => ({
      index: idx + 1,
      title: a.title,
      url: a.html_url || a.source_url || ''
    }))
  };
}


