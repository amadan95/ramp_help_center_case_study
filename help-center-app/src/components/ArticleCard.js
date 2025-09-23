import { memo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { deriveVotes } from '../utils/metadata';
import { FONT_FAMILY, rampPalette } from '../theme';

export const ArticleCard = memo(function ArticleCard({ article, showSentiment = true }) {
  const votes = deriveVotes(article.raw || article);
  const sentimentLabel = votes.positivity === null ? 'No feedback yet' : `${Math.round(votes.positivity * 100)}% positive`;
  const sentimentTone = votes.positivity !== null && votes.positivity < 0.4 ? styles.sentimentWarn : styles.sentimentOk;
  const isPlaceholder = !!article.isPlaceholder;
  const views = typeof article.signals?.views_30d === 'number' ? article.signals.views_30d : null;

  const handleOpen = () => {
    const url = article.html_url || article.source_url || 'https://support.ramp.com';
    Linking.openURL(url);
  };

  return (
    <Pressable style={styles.card} onPress={handleOpen}>
      <View style={styles.header}>
        <Text style={styles.section}>{article.topic_cluster}</Text>
        <Text style={styles.meta}>{article.owner_team}</Text>
      </View>

      <Text style={styles.title}>{article.title}</Text>
      <Text style={styles.snippet} numberOfLines={isPlaceholder ? 3 : 4}>
        {isPlaceholder
          ? 'Usage data is available for this article. Open the Help Center to review the latest guidance.'
          : article.snippet || 'Structured summary coming soon.'}
      </Text>
      {views !== null ? (
        <Text style={styles.views}>{`${views.toLocaleString()} views in the last 30 days`}</Text>
      ) : null}

  <View style={styles.tagRow}>
    <Text style={styles.tag}>{article.persona.join(' • ')}</Text>
    <Text style={styles.tag}>{article.service_tier.join(' • ')}</Text>
    {Array.isArray(article.feature_area) && article.feature_area.length ? (
      <Text style={styles.tag}>{formatAreas(article.feature_area)}</Text>
    ) : null}
    {article.is_plus_only ? <Text style={[styles.tag, styles.tagPlus]}>Ramp Plus</Text> : null}
  </View>

      <View style={styles.footer}>
        {showSentiment ? (
          <Text style={[styles.sentiment, sentimentTone]}>{sentimentLabel}</Text>
        ) : null}
        <Text style={styles.meta}>{isPlaceholder ? 'Usage snapshot' : `Updated ${formatRelative(article.updated_at)} ago`}</Text>
        <Text style={styles.meta}>{votes.total} votes</Text>
      </View>
    </Pressable>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: rampPalette.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: rampPalette.border,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  section: {
    fontSize: 12,
    letterSpacing: 1,
    color: rampPalette.accentTertiary,
    fontWeight: '700',
    textTransform: 'uppercase',
    fontFamily: FONT_FAMILY
  },
  meta: {
    fontSize: 12,
    color: rampPalette.muted,
    fontFamily: FONT_FAMILY
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 12,
    color: rampPalette.accentPrimary,
    lineHeight: 26,
    fontFamily: FONT_FAMILY
  },
  snippet: {
    color: rampPalette.muted,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FONT_FAMILY
  },
  views: {
    marginTop: 6,
    color: rampPalette.muted,
    fontSize: 13,
    fontFamily: FONT_FAMILY
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    marginHorizontal: -4
  },
  tag: {
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
  tagPlus: {
    backgroundColor: '#EBD2C6',
    color: rampPalette.accentTertiary
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18
  },
  sentiment: {
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    fontFamily: FONT_FAMILY
  },
  sentimentOk: {
    backgroundColor: 'rgba(161, 194, 0, 0.2)',
    color: rampPalette.success
  },
  sentimentWarn: {
    backgroundColor: 'rgba(212, 122, 60, 0.18)',
    color: rampPalette.warning
  }
});
