import { test, expect, beforeEach, afterEach } from "bun:test";
import { getAuthConfig } from "../src/lib/auth-config";

const SAVED = {
  ids: process.env.GOOGLE_OAUTH_CLIENT_IDS,
  emails: process.env.ALLOWED_GOOGLE_EMAILS,
};

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_IDS = " a.apps.googleusercontent.com , b.apps.googleusercontent.com ";
  process.env.ALLOWED_GOOGLE_EMAILS = "Owner@Example.com";
});

afterEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_IDS = SAVED.ids;
  process.env.ALLOWED_GOOGLE_EMAILS = SAVED.emails;
});

test("parses comma-separated client ids, trimming whitespace", () => {
  const cfg = getAuthConfig();
  expect(cfg.clientIds).toEqual([
    "a.apps.googleusercontent.com",
    "b.apps.googleusercontent.com",
  ]);
});

test("lowercases allowlisted emails", () => {
  expect(getAuthConfig().allowedEmails).toEqual(["owner@example.com"]);
});

test("throws when client ids are missing", () => {
  delete process.env.GOOGLE_OAUTH_CLIENT_IDS;
  expect(() => getAuthConfig()).toThrow("Konfigurasi autentikasi tidak lengkap");
});

test("throws when allowed emails are missing", () => {
  delete process.env.ALLOWED_GOOGLE_EMAILS;
  expect(() => getAuthConfig()).toThrow("Konfigurasi autentikasi tidak lengkap");
});
