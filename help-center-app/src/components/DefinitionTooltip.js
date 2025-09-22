import { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { FONT_FAMILY, rampPalette } from '../theme';

export function DefinitionTooltip({ label, description, children, width = 240, style }) {
  if (!description) {
    return style ? <View style={style}>{children}</View> : children;
  }

  const [visible, setVisible] = useState(false);
  const isWeb = Platform.OS === 'web';

  const show = useCallback(() => {
    if (isWeb) setVisible(true);
  }, [isWeb]);

  const hide = useCallback(() => {
    if (isWeb) setVisible(false);
  }, [isWeb]);

  const hoverHandlers = isWeb ? { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide } : {};

  return (
    <View style={[styles.anchor, style]} {...hoverHandlers}>
      {children}
      {visible ? (
        <View style={[styles.tooltip, { width, transform: [{ translateX: -(width / 2) }] }]} pointerEvents="none">
          {label ? <Text style={[styles.tooltipText, styles.tooltipLabel]}>{label}</Text> : null}
          <Text style={styles.tooltipText}>{description}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
    display: 'flex'
  },
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    marginBottom: 10,
    backgroundColor: rampPalette.accentPrimary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: 'rgba(20, 24, 45, 0.35)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 12,
    zIndex: 20
  },
  tooltipText: {
    color: 'white',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONT_FAMILY
  },
  tooltipLabel: {
    fontWeight: '700',
    marginBottom: 4
  }
});
