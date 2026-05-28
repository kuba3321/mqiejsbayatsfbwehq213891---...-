import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { GameProvider } from "@/context/game-context";

export default function RootLayout() {
  // Plus Jakarta Sans — Twitter/X-style social ladder. We load five
  // weights (400 Regular / 500 Medium / 600 SemiBold / 700 Bold /
  // 800 ExtraBold). Medium 500 is the key addition for handles,
  // timestamps, and stat labels — the subtle hierarchy tier that a
  // social feed cannot live without. Plus Jakarta Sans tops out at
  // 800 ExtraBold; any AppText weight="900" maps down to 800 in
  // primitives.tsx so existing call sites keep rendering.
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // Hold the entire tree on a neutral dark background until the fonts
  // are ready — flashing a system font would make every header jump
  // weights on cold start.
  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: "#141519" }} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <GameProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#141519" },
          }}
        />
      </GameProvider>
    </SafeAreaProvider>
  );
}
