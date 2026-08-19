import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../constants/colors";

type HeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
};

export function Header({
  title,
  subtitle,
  showBack = false,
  onBack,
}: HeaderProps) {
  return (
    <View style={styles.container}>
      {showBack && (
        <Pressable
          onPress={onBack ?? (() => router.back())}
          style={styles.backButton}
          hitSlop={10}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      )}

      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>

        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },

  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  backText: {
    fontSize: 36,
    lineHeight: 36,
    color: colors.text,
    fontWeight: "300",
  },

  textContainer: {
    flex: 1,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },

  subtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
});
