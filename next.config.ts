import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Content Security Policy. Fonts are self-hosted by next/font. Images may be
// served from the private S3 bucket through short-lived pre-signed redirects.
// 'unsafe-inline' on scripts is needed for Next's inline hydration data while
// pages are not nonce-rendered; 'unsafe-eval' is development-only (React dev tools / HMR).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.amazonaws.com",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation and camera are used only by the attendance page (same origin).
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Cache Components is not used: every internal page is private, per-user data.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Uploads (certificates, documents, attendance photos) go through server actions.
      bodySizeLimit: "12mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      { source: "/sign-in", destination: "/login", permanent: true },
      { source: "/create-account", destination: "/register", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
