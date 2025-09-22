import { Platform, StyleSheet } from 'react-native';

export const FONT_FAMILY = Platform.select({ web: '"Inter", "Helvetica Neue", Arial, sans-serif', default: 'System' });

export const rampPalette = {
  background: '#FCFBFA', // Pampas
  surface: '#FFFFFF',
  border: '#E7E3D8',
  accentPrimary: '#1F1F1F', // Mine Shaft
  accentSecondary: '#E4F222', // Ripe Lemon
  accentTertiary: '#924F35', // Mule Fawn
  accentSoft: '#F6F6ED',
  accentBadge: '#F9FBD9',
  text: '#1F1F1F',
  muted: '#787868', // Bandicoot
  success: '#A1C200', // toned variant of Ripe Lemon for legibility
  warning: '#D47A3C', // warm derivative of Mule Fawn
  danger: '#924F35'
};

export const sharedShadows = StyleSheet.create({
  elevationLow: {
    shadowColor: 'rgba(31, 31, 31, 0.08)',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4
  }
});
