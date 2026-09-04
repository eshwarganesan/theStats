/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@thestats/core"],
  async redirects() {
    return [
      // Feature 010-games-library, FR-021: the games library moved from
      // /account/games/[id] to /games/[id]. Existing bookmarks and shared
      // links must resolve to the new URL rather than 404.
      {
        source: "/account/games/:id",
        destination: "/games/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
