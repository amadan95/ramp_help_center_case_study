// Extract votes information from article
export function deriveVotes(article) {
  if (!article) {
    return { total: 0, upvotes: 0, downvotes: 0, positivity: null };
  }

  // Direct vote fields
  if (typeof article.vote_count === 'number' && typeof article.vote_sum === 'number') {
    const total = article.vote_count;
    const upvotes = Math.round((article.vote_sum + total) / 2);
    const downvotes = Math.max(0, total - upvotes);
    const positivity = total > 0 ? upvotes / total : null;
    
    return { total, upvotes, downvotes, positivity };
  }

  // Signals fields
  if (article.signals?.vote_total && typeof article.signals.vote_sum === 'number') {
    const total = article.signals.vote_total;
    const upvotes = Math.round((article.signals.vote_sum + total) / 2);
    const downvotes = Math.max(0, total - upvotes);
    const positivity = total > 0 ? upvotes / total : null;
    
    return { total, upvotes, downvotes, positivity };
  }

  // No vote data
  return { total: 0, upvotes: 0, downvotes: 0, positivity: null };
}