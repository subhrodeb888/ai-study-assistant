import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";

import { Header } from "../components/Header";
import { Screen } from "../components/Screen";
import { colors } from "../constants/colors";
import { authClient } from "../lib/auth-client";

export default function SignupScreen() {
  const [name, setName] = useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] = useState("");

  async function handleSignup() {
    const trimmedName = name.trim();
    const trimmedEmail =
      email.trim().toLowerCase();

    if (!trimmedName) {
      setError("Please enter your name.");
      return;
    }

    if (!trimmedEmail) {
      setError("Please enter your email.");
      return;
    }

    if (password.length < 8) {
      setError(
        "Password must contain at least 8 characters.",
      );
      return;
    }

    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error } =
        await authClient.signUp.email({
          name: trimmedName,
          email: trimmedEmail,
          password,
        });

      if (error) {
        setError(
          error.message ??
            "Unable to create your account.",
        );

        return;
      }

      router.replace("/");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : "height"
        }
      >
        <Header
          title="Create Account"
          subtitle="Start learning with your AI study assistant."
          showBack
        />

        <ScrollView
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.form}>
            <Text style={styles.label}>
              Name
            </Text>

            <TextInput
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError("");
              }}
              placeholder="Your name"
              placeholderTextColor={
                colors.textSecondary
              }
              autoCapitalize="words"
              editable={!loading}
              style={styles.input}
            />

            <Text style={styles.label}>
              Email
            </Text>

            <TextInput
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setError("");
              }}
              placeholder="you@example.com"
              placeholderTextColor={
                colors.textSecondary
              }
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              style={styles.input}
            />

            <Text style={styles.label}>
              Password
            </Text>

            <TextInput
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setError("");
              }}
              placeholder="At least 8 characters"
              placeholderTextColor={
                colors.textSecondary
              }
              secureTextEntry
              autoCapitalize="none"
              editable={!loading}
              style={styles.input}
            />

            {error && (
              <View
                style={
                  styles.errorContainer
                }
              >
                <Text
                  style={styles.errorText}
                >
                  {error}
                </Text>
              </View>
            )}

            <Pressable
              onPress={handleSignup}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryButton,

                loading &&
                  styles.buttonDisabled,

                pressed &&
                  styles.buttonPressed,
              ]}
            >
              {loading ? (
                <>
                  <ActivityIndicator
                    size="small"
                    color={colors.white}
                  />

                  <Text
                    style={
                      styles.buttonText
                    }
                  >
                    Creating Account...
                  </Text>
                </>
              ) : (
                <Text
                  style={styles.buttonText}
                >
                  Create Account
                </Text>
              )}
            </Pressable>

            <View
              style={styles.footer}
            >
              <Text
                style={styles.footerText}
              >
                Already have an account?
              </Text>

              <Pressable
                onPress={() =>
                  router.push("/login")
                }
                disabled={loading}
              >
                <Text
                  style={
                    styles.footerLink
                  }
                >
                  Sign in
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  form: {
    width: "100%",
  },

  label: {
    marginBottom: 8,
    marginTop: 16,

    fontSize: 15,
    fontWeight: "700",

    color: colors.text,
  },

  input: {
    minHeight: 52,

    paddingHorizontal: 16,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,

    fontSize: 15,
    color: colors.text,

    backgroundColor: colors.surface,
  },

  errorContainer: {
    marginTop: 16,
    padding: 14,

    borderRadius: 12,

    backgroundColor: "#FEF2F2",
  },

  errorText: {
    fontSize: 14,
    lineHeight: 20,

    color: "#B91C1C",
  },

  primaryButton: {
    flexDirection: "row",

    alignItems: "center",
    justifyContent: "center",

    gap: 10,

    minHeight: 52,

    marginTop: 24,

    borderRadius: 16,

    backgroundColor: colors.primary,
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  buttonPressed: {
    opacity: 0.8,
  },

  buttonText: {
    fontSize: 15,
    fontWeight: "700",

    color: colors.white,
  },

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,

    marginTop: 24,
  },

  footerText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  footerLink: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
});