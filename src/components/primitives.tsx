import { Image } from "expo-image";
import React, { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radii, typography } from "@/theme/tokens";

export function Screen({
  children,
  scroll = true,
  footer,
  style,
  contentStyle,
}: PropsWithChildren<{
  scroll?: boolean;
  footer?: React.ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}>) {
  const insets = useSafeAreaInsets();
  // Dynamic padding for notch / Dynamic Island; falls back to 24 on devices without insets.
  const topPad = insets.top > 0 ? insets.top + 12 : 24;
  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: topPad, ...style }}>
        {children}
        {footer}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, ...style }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topPad,
          paddingHorizontal: 18,
          paddingBottom: footer ? 130 : 36,
          gap: 18,
          ...contentStyle,
        }}
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

// Plus Jakarta Sans family map. PJS tops out at 800 ExtraBold — any
// weight="900" in the codebase maps down to 800 so existing call sites
// keep rendering without a fallback to the system font.
const jakartaFamily: Record<"400" | "500" | "600" | "700" | "800" | "900", string> = {
  "400": "PlusJakartaSans_400Regular",
  "500": "PlusJakartaSans_500Medium",
  "600": "PlusJakartaSans_600SemiBold",
  "700": "PlusJakartaSans_700Bold",
  "800": "PlusJakartaSans_800ExtraBold",
  "900": "PlusJakartaSans_800ExtraBold",
};

export function AppText({
  children,
  size = typography.body,
  weight = "400",
  color = colors.text,
  style,
  selectable = false,
  numberOfLines,
}: PropsWithChildren<{
  size?: number;
  weight?: "400" | "500" | "600" | "700" | "800" | "900";
  color?: string;
  style?: TextStyle | TextStyle[];
  selectable?: boolean;
  numberOfLines?: number;
}>) {
  return (
    <Text
      selectable={selectable}
      numberOfLines={numberOfLines}
      style={[
        {
          color,
          fontSize: size,
          // fontFamily carries the visual weight when Plus Jakarta Sans
          // is loaded; we also keep fontWeight so any non-font-loaded
          // fallback path (e.g. Web preview without the font yet) still
          // gets approximately the right boldness from the system font.
          fontFamily: jakartaFamily[weight],
          fontWeight: weight,
          lineHeight: Math.round(size * 1.28),
          letterSpacing: 0,
        },
        style as TextStyle,
      ]}
    >
      {children}
    </Text>
  );
}

export function StatusLogo({ size = 30, dimmed = false }: { size?: number; dimmed?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <AppText
        size={size}
        weight="900"
        color={dimmed ? "#5e5e61" : colors.text}
        style={{ lineHeight: Math.round(size * 1.05), letterSpacing: -0.5 }}
      >
        status
      </AppText>
      <AppText
        size={Math.round(size * 0.5)}
        color={dimmed ? "#5e5e61" : colors.amber}
        style={{ marginLeft: 2, marginTop: -2 }}
      >
        ✦
      </AppText>
    </View>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{
  style?: ViewStyle;
}>) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderSoft,
        borderWidth: 1,
        borderRadius: radii.lg,
        borderCurve: "continuous",
        padding: 16,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

export function CapsuleButton({
  children,
  onPress,
  color = colors.blue,
  textColor = colors.text,
  disabled,
  style,
  size = "lg",
}: PropsWithChildren<{
  onPress?: (event: GestureResponderEvent) => void;
  color?: string;
  textColor?: string;
  disabled?: boolean;
  style?: ViewStyle;
  size?: "lg" | "md" | "sm";
}>) {
  const height = size === "lg" ? 54 : size === "md" ? 46 : 38;
  const fontSize = size === "lg" ? 18 : size === "md" ? 16 : 14;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: height,
        borderRadius: radii.pill,
        backgroundColor: disabled ? colors.surfaceSoft : color,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 22,
        opacity: pressed ? 0.78 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        ...style,
      })}
    >
      <AppText color={textColor} size={fontSize} weight="800">
        {children}
      </AppText>
    </Pressable>
  );
}

export function IconButton({
  children,
  onPress,
  size = 44,
  color = colors.surfaceAlt,
  style,
}: PropsWithChildren<{
  onPress?: () => void;
  size?: number;
  color?: string;
  style?: ViewStyle;
}>) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.72 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
        ...style,
      })}
    >
      {children}
    </Pressable>
  );
}

export function Avatar({
  uri,
  size = 52,
  ring,
  ringWidth = 2,
}: {
  uri: string;
  size?: number;
  ring?: string;
  ringWidth?: number;
}) {
  if (!ring) {
    return (
      <Image
        source={{ uri }}
        contentFit="cover"
        transition={180}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.surfaceSoft,
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        padding: ringWidth,
        backgroundColor: ring,
      }}
    >
      <Image
        source={{ uri }}
        contentFit="cover"
        transition={180}
        style={{
          flex: 1,
          borderRadius: (size - ringWidth * 2) / 2,
          backgroundColor: colors.surfaceSoft,
        }}
      />
    </View>
  );
}

export function ProgressBar({
  value,
  max = 100,
  height = 10,
  color = colors.blue,
  track = colors.surfaceSoft,
}: {
  value: number;
  max?: number;
  height?: number;
  color?: string;
  track?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <View
      style={{
        flex: 1,
        height,
        borderRadius: radii.pill,
        overflow: "hidden",
        backgroundColor: track,
      }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: radii.pill,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

// Centered bar (used for relationship %): 0 in the middle.
// Positive grows right (green), negative grows left (yellow/orange).
export function CenteredBar({
  value, // -100..100
  height = 12,
}: {
  value: number;
  height?: number;
}) {
  const clamped = Math.max(-100, Math.min(100, value));
  const halfPct = Math.abs(clamped) / 2;
  const positive = clamped >= 0;
  const fillColor = positive ? colors.lime : colors.amber;
  return (
    <View
      style={{
        flex: 1,
        height,
        borderRadius: radii.pill,
        backgroundColor: colors.surfaceSoft,
        overflow: "hidden",
        flexDirection: "row",
      }}
    >
      <View style={{ flex: 1, alignItems: "flex-end", justifyContent: "center" }}>
        {!positive && (
          <View
            style={{
              width: `${halfPct * 2}%`,
              height,
              backgroundColor: fillColor,
            }}
          />
        )}
      </View>
      <View
        style={{
          width: 2,
          height,
          backgroundColor: "rgba(255,255,255,0.18)",
        }}
      />
      <View style={{ flex: 1, justifyContent: "center" }}>
        {positive && (
          <View
            style={{
              width: `${halfPct * 2}%`,
              height,
              backgroundColor: fillColor,
            }}
          />
        )}
      </View>
    </View>
  );
}

export function Field({
  value,
  onChangeText,
  placeholder,
  multiline,
  secureTextEntry,
  style,
  maxLength,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  style?: TextStyle;
  maxLength?: number;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      multiline={multiline}
      secureTextEntry={secureTextEntry}
      maxLength={maxLength}
      style={[
        {
          minHeight: multiline ? 96 : 50,
          borderRadius: radii.md,
          borderCurve: "continuous",
          backgroundColor: colors.surfaceAlt,
          color: colors.text,
          fontSize: 16,
          lineHeight: 22,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 0,
          textAlignVertical: multiline ? "top" : "center",
        } as TextStyle,
        style,
      ]}
    />
  );
}

export function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <StatusLogo size={56} />
      <ActivityIndicator color={colors.blue} />
    </View>
  );
}

export function VerifiedBadge({ size = 16, color = colors.blue }: { size?: number; color?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          backgroundColor: color,
          transform: [{ rotate: "0deg" }],
          // approximate scalloped-circle via large radius
          borderRadius: size / 2,
        }}
      />
      <AppText
        size={Math.round(size * 0.7)}
        weight="900"
        color="#fff"
        style={{ lineHeight: size }}
      >
        ✓
      </AppText>
    </View>
  );
}

export function Chip({
  children,
  color = colors.surfaceAlt,
  textColor = colors.text,
  onPress,
  style,
  size = "md",
}: PropsWithChildren<{
  color?: string;
  textColor?: string;
  onPress?: () => void;
  style?: ViewStyle;
  size?: "sm" | "md" | "lg";
}>) {
  const padH = size === "lg" ? 14 : size === "md" ? 12 : 10;
  const padV = size === "lg" ? 8 : size === "md" ? 6 : 4;
  const fontSize = size === "lg" ? 15 : size === "md" ? 13 : 12;
  const Comp: typeof View | typeof Pressable = onPress ? Pressable : View;

  return (
    <Comp
      onPress={onPress}
      style={
        {
          borderRadius: radii.pill,
          backgroundColor: color,
          paddingHorizontal: padH,
          paddingVertical: padV,
          alignSelf: "flex-start",
          ...style,
        } as ViewStyle
      }
    >
      <AppText size={fontSize} weight="700" color={textColor}>
        {children}
      </AppText>
    </Comp>
  );
}

export function DeltaPill({ delta, suffix = "%" }: { delta: number; suffix?: string }) {
  const positive = delta >= 0;
  const color = positive ? colors.green : colors.amber;
  return (
    <AppText size={13} weight="800" color={color}>
      {positive ? "+" : ""}
      {delta.toFixed(1)}
      {suffix}
    </AppText>
  );
}

// Milestone node — alternating circle / diamond shapes like the real game
export function MilestoneNode({
  label,
  variant,
  shape = "circle",
}: {
  label: string;
  variant: "completed" | "current" | "future";
  shape?: "circle" | "diamond";
}) {
  const bg =
    variant === "completed"
      ? colors.blue
      : variant === "current"
        ? colors.surfaceSoft
        : colors.surfaceAlt;
  const size = variant === "completed" ? 36 : 32;
  const rotation = shape === "diamond" ? "45deg" : "0deg";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: shape === "diamond" ? 8 : size / 2,
        transform: [{ rotate: rotation }],
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: variant === "current" ? 2 : 0,
        borderColor: colors.muted,
      }}
    >
      <View style={{ transform: [{ rotate: shape === "diamond" ? "-45deg" : "0deg" }] }}>
        <AppText size={14} weight="900" color={colors.text}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <AppText size={22} weight="900">
        {title}
      </AppText>
      <View style={{ flex: 1 }} />
      {action ? (
        <Pressable onPress={onAction}>
          <AppText size={14} weight="700" color={colors.blue}>
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return (
    <View
      style={{
        height: 1,
        marginHorizontal: -inset,
        backgroundColor: colors.divider,
      }}
    />
  );
}

export function formatCount(value: number) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value >= 10000000 ? 1 : 1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return `${value}`;
}

export { typography };
