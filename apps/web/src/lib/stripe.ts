import Stripe from "stripe";

/**
 * Single shared Stripe client. Returns null when no key is configured
 * — every route that calls this falls back to a 503 in that case so
 * the rest of the app keeps working in environments without billing.
 */

const KEY = process.env.STRIPE_SECRET_KEY;

// We don't pin an apiVersion — let Stripe default to the SDK's version
// to avoid type drift across SDK upgrades.
export const stripe = KEY ? new Stripe(KEY) : null;

export const STRIPE_CONFIGURED = !!KEY;

/** Price ID for the Pro plan ($12/mo). Set via env. */
export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID ?? "";

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
