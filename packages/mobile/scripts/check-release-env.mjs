/**
 * EAS Build runs this after installing dependencies (the package's
 * `eas-build-post-install` script), so a build without its config fails
 * in seconds instead of producing an app that can't start.
 *
 * Release builds don't see .env.local (it's gitignored, so it's never
 * uploaded), and they have no dev server to fall back to for the API.
 * The values come from the build's EAS environment, and iOS only lets a
 * release build use HTTPS.
 */
const REQUIRED = [
  { name: "EXPO_PUBLIC_API_URL", https: true },
  { name: "EXPO_PUBLIC_SUPABASE_URL", https: true },
  { name: "EXPO_PUBLIC_SUPABASE_ANON_KEY", https: false },
];

const problems = REQUIRED.flatMap(({ name, https }) => {
  const value = process.env[name]?.trim();
  if (!value) return [`${name} is not set`];
  if (https && !/^https:\/\/[^\s/]+/.test(value)) return [`${name} must be an https:// URL`];
  return [];
});

if (problems.length > 0) {
  console.error(
    [
      "This build is missing the app's config:",
      ...problems.map((problem) => `  - ${problem}`),
      'Set it in the build profile\'s EAS environment ("production" for eas.json\'s',
      "production profile). See packages/mobile/README.md.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`Release config OK. The app will call ${process.env.EXPO_PUBLIC_API_URL}.`);
