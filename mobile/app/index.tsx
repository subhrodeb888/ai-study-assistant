import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { FeatureCard } from "../components/FeatureCard";
import { Screen } from "../components/Screen";
import { colors } from "../constants/colors";
import { authClient } from "../lib/auth-client";

export default function HomeScreen() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <View style={styles.authContainer}>
          <Text style={styles.title}>AI Study Assistant</Text>

          <Text style={styles.subtitle}>
            Learn faster with your personal AI study assistant.
          </Text>

          <Pressable
            onPress={() => router.push("/login")}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/signup")}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Create Account</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  async function handleSignOut() {
    try {
      await authClient.signOut();

      router.replace("/login");
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>Hello, {session.user.name}</Text>

            <Text style={styles.subtitle}>What do you want to learn?</Text>
          </View>

          <Pressable onPress={handleSignOut} hitSlop={8}>
            {({ pressed }) => (
              <Text style={[styles.signOut, pressed && styles.signOutPressed]}>
                Sign out
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.cards}>
          <FeatureCard
            emoji="💬"
            title="Ask AI"
            description="Ask questions and get explanations."
            onPress={() => router.push("/chat")}
          />

          <FeatureCard
            emoji="📝"
            title="Summarize"
            description="Turn long study material into concise notes."
            onPress={() => router.push("/summarize")}
          />

          <FeatureCard
            emoji="🧠"
            title="Generate Quiz"
            description="Create interactive quizzes from any topic."
            onPress={() => router.push("/quiz")}
          />

          <FeatureCard
            emoji="📁"
            title="Study Materials"
            description="Upload PDF and TXT study materials."
            onPress={() => router.push("/materials")}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },

  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  authContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  title: {
    textAlign: "center",

    fontSize: 30,
    fontWeight: "800",

    color: colors.text,
  },

  greeting: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
  },

  subtitle: {
    marginTop: 8,

    fontSize: 15,
    lineHeight: 22,

    color: colors.textSecondary,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",

    marginBottom: 28,
  },

  headerText: {
    flex: 1,
    paddingRight: 16,
  },

  signOut: {
    marginTop: 4,

    fontSize: 13,
    fontWeight: "700",

    color: colors.primary,
  },

  signOutPressed: {
    opacity: 0.5,
  },

  cards: {
    gap: 14,
  },

  primaryButton: {
    width: "100%",

    alignItems: "center",
    justifyContent: "center",

    minHeight: 52,

    marginTop: 28,

    borderRadius: 16,

    backgroundColor: colors.primary,
  },

  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",

    color: colors.white,
  },

  secondaryButton: {
    width: "100%",

    alignItems: "center",
    justifyContent: "center",

    minHeight: 52,

    marginTop: 12,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,

    backgroundColor: colors.surface,
  },

  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",

    color: colors.text,
  },

  buttonPressed: {
    opacity: 0.8,
  },
});
