import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { AppTheme } from '@/theme';

export type CompactToggleOption = { value: string; label: string };

type Props = {
  value: string;
  options: CompactToggleOption[];
  onChange: (value: string) => void;
  theme: AppTheme;
  isRTL: boolean;
};

export function CompactToggle({ value, options, onChange, theme, isRTL }: Props) {
  const buttonWidth = 78;
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const offset = useSharedValue(activeIndex);

  useEffect(() => {
    offset.value = withSpring(activeIndex, { damping: 15, stiffness: 150 });
  }, [activeIndex, offset]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: isRTL ? -(offset.value * buttonWidth) : offset.value * buttonWidth }],
  }));

  return <View style={{
    position: 'relative', flexDirection: isRTL ? 'row-reverse' : 'row', padding: 2,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14,
    backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden',
  }}>
    <Animated.View pointerEvents="none" style={[{
      position: 'absolute', top: 2, bottom: 2, [isRTL ? 'right' : 'left']: 2,
      width: buttonWidth, borderRadius: 12, backgroundColor: theme.colors.primary,
    }, indicatorStyle]} />
    {options.map((option, index) => {
      const active = index === activeIndex;
      return <Pressable
        key={option.value}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(option.value)}
        style={({ pressed }) => ({
          width: buttonWidth, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12,
          alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.72 : 1, zIndex: 1,
        })}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit style={{
          color: active ? '#fff' : theme.colors.textMuted, fontSize: 13, fontWeight: '900',
        }}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}
