import { memo } from 'react';
import Link from 'next/link';
import { deriveVotes } from '../utils/metadata';
import { FONT_FAMILY, rampPalette } from '../theme.next';
import styles from './ArticleCard.module.css';

export const ArticleCard = memo(function ArticleCard({ article }) {
  const votes = deriveVotes(article.raw || article);
  const sentimentLabel = votes.positivity === null ? 'No feedback yet' : `${Math.round(votes.positivity * 100)}% positive`;
  const sentimentTone = votes.positivity !== null && votes.positivity < 0.4 ? styles.sentimentWarn : styles.sentimentOk;
  const isPlaceholder = !!article.isPlaceholder;
  const views = typeof article.signals?.views_30d === 'number' ? article.signals.views_30d : null;
  
  const url = article.html_url || article.source_url || 'https://support.ramp.com';

  return (
    <Link href={url} target="_blank" className={styles.link}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.section}>{article.topic_cluster}</span>
          <span className={styles.meta}>{article.owner_team}</span>
        </div>

        <h3 className={styles.title}>{article.title}</h3>
        <p className={styles.snippet}>
          {isPlaceholder
            ? 'Usage data is available for this article. Open the Help Center to review the latest guidance.'
            : article.snippet || 'Structured summary coming soon.'}
        </p>
        {views !== null && (
          <p className={styles.views}>{`${views.toLocaleString()} views in the last 30 days`}</p>
        )}

        <div className={styles.tagRow}>
          <span className={styles.tag}>{(article.persona || []).join(' • ')}</span>
          <span className={styles.tag}>{(article.service_tier || []).join(' • ')}</span>
          {Array.isArray(article.feature_area) && article.feature_area.length ? (
            <span className={styles.tag}>{formatAreas(article.feature_area)}</span>
          ) : null}
          {article.is_plus_only ? <span className={`${styles.tag} ${styles.tagPlus}`}>Ramp Plus</span> : null}
        </div>

        <div className={styles.footer}>
          <span className={`${styles.sentiment} ${sentimentTone}`}>{sentimentLabel}</span>
          <span className={styles.meta}>{isPlaceholder ? 'Usage snapshot' : `Updated ${formatRelative(article.updated_at)} ago`}</span>
          <span className={styles.meta}>{votes.total} votes</span>
        </div>
      </div>
    </Link>
  );
});

function formatAreas(areas) {
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  return areas
    .map(a => a.split(/[-_]/).map(cap).join(' '))
    .join(' • ');
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
