/** @type {import('next').NextConfig} */
const nextConfig = {
  // We deploy natively with PM2 running `next start` (see ecosystem.config.js),
  // not Docker, so we don't use `output: "standalone"` — Next warns that the two
  // don't work together, and standalone would need the static assets copied by
  // hand. Plain `next start` serves everything from `.next` with no extra steps.
  reactStrictMode: true,
};

export default nextConfig;
