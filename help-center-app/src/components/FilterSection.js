import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DefinitionTooltip } from './DefinitionTooltip';
import { FONT_FAMILY, rampPalette } from '../theme';

export const FilterSection = memo(function FilterSection({ title, options, selected, onSelect, emptyLabel }) {
  const [open, setOpen] = useState(false);
  const selectedCount = selected.length;
  const summary = useMemo(() => {
    if (!options.length) return emptyLabel || 'No data yet';
    if (!selectedCount) return 'All';
    const labels = new Map(options.map(o => [o.value, o.label]));
    const names = selected.map(v => labels.get(v) || v);
    return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
  }, [options, selected, selectedCount, emptyLabel]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      <Pressable style={styles.control} onPress={() => setOpen(o => !o)}>
        <Text style={styles.controlText}>{summary}</Text>
        <Text style={styles.controlChevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.dropdown}>
          {options.length === 0 ? (
            <Text style={styles.empty}>{emptyLabel || 'No data yet'}</Text>
          ) : (
            options.map(option => {
              const isActive = selected.includes(option.value);
              return (
                <DefinitionTooltip key={option.value} label={option.label} description={option.definition}>
                  <Pressable
                    onPress={() => onSelect(option.value)}
                    style={[styles.optionRow, isActive && styles.optionRowActive]}
                  >
                    <Text style={[styles.optionMark]}>{isActive ? '✓' : '○'}</Text>
                    <Text style={[styles.optionLabel]}>{option.label}</Text>
                  </Pressable>
                </DefinitionTooltip>
              );
            })
          )}
          <View style={styles.dropdownFooter}>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.footerAction}>Close</Text>
            </Pressable>
            <Pressable onPress={() => selected.forEach(v => onSelect(v))}>
              <Text style={styles.footerAction}>Clear</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 240,
    marginRight: 20,
    marginBottom: 12
  },
  title: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: rampPalette.muted,
    fontWeight: '700',
    marginBottom: 14,
    fontFamily: FONT_FAMILY
  },
  control: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: rampPalette.border,
    backgroundColor: rampPalette.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: 'rgba(31,31,31,0.04)',
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }
  },
  controlText: {
    color: rampPalette.text,
    fontFamily: FONT_FAMILY
  },
  controlChevron: {
    color: rampPalette.muted
  },
  dropdown: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: rampPalette.border,
    backgroundColor: rampPalette.surface,
    paddingVertical: 6
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  optionRowActive: {
    backgroundColor: rampPalette.accentSoft
  },
  optionMark: {
    width: 18,
    textAlign: 'center',
    marginRight: 8,
    color: rampPalette.accentPrimary,
    fontFamily: FONT_FAMILY
  },
  optionLabel: {
    color: rampPalette.text,
    fontFamily: FONT_FAMILY
  },
  dropdownFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: rampPalette.border
  },
  footerAction: {
    color: rampPalette.accentPrimary,
    fontWeight: '600',
    fontFamily: FONT_FAMILY
  },
  empty: {
    color: rampPalette.muted,
    fontSize: 13,
    fontFamily: FONT_FAMILY
  }
});
