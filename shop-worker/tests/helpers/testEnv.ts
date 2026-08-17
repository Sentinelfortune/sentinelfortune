import type { Env } from "../../src/types";
import { createTestD1 } from "./d1-sqlite-adapter";
import { FakeR2Bucket } from "./fakeR2";

export const TEST_STRIPE_WEBHOOK_SECRET = "whsec_test_shop_secret_for_unit_tests_only";
export const TEST_STRIPE_SECRET_KEY = "sk_test_fake_key_for_unit_tests_only";
export const TEST_RESEND_API_KEY = "re_test_fake_key_for_unit_tests_only";

export async function buildTestEnv(overrides: Partial<Env> = {}): Promise<Env> {
  return {
    SHOP_DB: await createTestD1(false),
    SHOP_DOWNLOADS_BUCKET: new FakeR2Bucket(),
    SHOP_ASSETS_BUCKET: new FakeR2Bucket(),
    STRIPE_SECRET_KEY: TEST_STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: TEST_STRIPE_WEBHOOK_SECRET,
    RESEND_API_KEY: TEST_RESEND_API_KEY,
    RESEND_FROM_EMAIL: "shop@sentinelfortune.com",
    CF_ACCESS_TEAM_DOMAIN: "sentinelfortune-test.cloudflareaccess.com",
    CF_ACCESS_AUD: "test-aud-tag",
    SHOP_PUBLIC_BASE_URL: "https://sentinelfortune.github.io/sentinelfortune/shop",
    // SHOP_ASSETS_PUBLIC_BASE_URL deliberately unset — the default (and the
    // deployed configuration) serves images through the Worker itself.
    SHOP_WORKER_BASE_URL: "https://shop-worker.example.workers.dev",
    ENVIRONMENT: "test",
    ...overrides,
  };
}
