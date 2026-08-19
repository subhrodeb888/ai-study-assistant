import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error("EXPO_PUBLIC_API_URL is not configured.");
}

export const authClient = createAuthClient({
  baseURL: API_URL,

  plugins: [
    expoClient({
      scheme: "ai-study-assistant",

      storagePrefix: "ai-study-assistant",

      storage: SecureStore,
    }),
  ],
});
