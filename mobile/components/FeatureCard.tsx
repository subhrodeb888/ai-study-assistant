import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../constants/colors";

type FeatureCardProps = {
  emoji: string;
  title: string;
  description: string;
  onPress: () => void;
};

export function FeatureCard({
  emoji,
  title,
  description,
  onPress,
}: FeatureCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>

        <Text style={styles.description}>{description}</Text>
      </View>

      <Text style={styles.arrow}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",

    minHeight: 96,

    marginBottom: 14,
    padding: 18,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,

    backgroundColor: colors.background,
  },

  pressed: {
    opacity: 0.7,
    backgroundColor: colors.surface,
  },

  iconContainer: {
    width: 52,
    height: 52,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 14,
    backgroundColor: colors.primaryLight,
  },

  emoji: {
    fontSize: 25,
  },

  content: {
    flex: 1,
    marginLeft: 16,
  },

  title: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
  },

  description: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  arrow: {
    marginLeft: 10,
    fontSize: 28,
    fontWeight: "300",
    color: colors.textSecondary,
  },
});
