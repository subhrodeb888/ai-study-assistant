import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";

import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  baseURL: process.env.BETTER_AUTH_URL,

  secret: process.env.BETTER_AUTH_SECRET,

  trustedOrigins: [
    process.env.BETTER_AUTH_URL!,
    "ai-study-assistant://",
    "exp://*",
  ],

  emailAndPassword: {
    enabled: true,

    minPasswordLength: 8,

    autoSignIn: true,
  },

  plugins: [expo()],
});
