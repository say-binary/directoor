import { Polar } from "@polar-sh/sdk";

/**
 * Single shared Polar client. Returns null when no access token is
 * configured — every billing route checks this and returns 503 when
 * absent so the rest of the app keeps working in environments without
 * billing.
 *
 * Polar has two environments — `production` and `sandbox`. We default
 * to sandbox in development and production everywhere else; explicitly
 * override with POLAR_SERVER if you want to test prod from local.
 */

const ACCESS_TOKEN = process.env.POLAR_ACCESS_TOKEN;
const SERVER = (process.env.POLAR_SERVER as "production" | "sandbox" | undefined) ??
  (process.env.NODE_ENV === "production" ? "production" : "sandbox");

export const polar = ACCESS_TOKEN
  ? new Polar({ accessToken: ACCESS_TOKEN, server: SERVER })
  : null;

export const POLAR_CONFIGURED = !!ACCESS_TOKEN;

/** Product ID for the Pro plan ($12/mo). Set in Polar dashboard then env. */
export const POLAR_PRO_PRODUCT_ID = process.env.POLAR_PRO_PRODUCT_ID ?? "";

export const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET ?? "";
