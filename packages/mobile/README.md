# theStats for iOS

The iPad and iPhone app. It's built with Expo (React Native) on the shared `@thestats/core` and `@thestats/app` packages, and it only runs in landscape.

It signs in and saves games through the web app's `/api` routes. In development the web app must be running; release builds need it deployed.

## Development

1. Copy `.env.example` to `.env.local`.
   - Fill in the Supabase URL and anon key, using the same values as `packages/web`.
   - Leave `EXPO_PUBLIC_API_URL` empty.
2. From the repo root, start the web app (`npm run dev`) and the Expo dev server (`npm run mobile`).
3. Scan the QR code with the iPad or iPhone camera to open the app in Expo Go.
   - Expo Go supports only one Expo SDK at a time.
   - Keep the project on the SDK that the App Store's Expo Go runs.

The landscape lock works on iPhone in Expo Go, and in builds from EAS. On an iPad, Expo Go still lets the app rotate to portrait, because Expo Go allows iPad multitasking.

To check the app, run `npm test`, `npm run typecheck` and `npm run lint` in this directory. React Native 0.88 needs Node 22.13+, 24.3+ or 26+.

## Releasing to TestFlight

Builds run on [EAS Build](https://docs.expo.dev/build/introduction/).
- `eas.json` has one profile, `production`, which makes App Store builds.
- EAS keeps the build number and raises it on every build.
- `version` in `app.json` is the version people see.

### What you need first

- An Apple Developer Program membership.
- An Expo account, with EAS CLI installed (`npm install -g eas-cli`) and signed in (`eas login`).
- The web app deployed at an HTTPS address. Release builds call it to sign in and save games, and iOS doesn't let them use plain HTTP.
- Supabase set up for that address, under Authentication → URL Configuration:
  - Set the Site URL to the address.
  - Add `https://<address>/auth/callback` to the Redirect URLs, so confirmation emails link to the deployed site.

### One-time setup

Run these in `packages/mobile`:

```sh
# Creates the EAS project and adds its ID to app.json; commit that change.
# Already done: the project is @eshwarg/thestats.
eas init

eas env:set production --name EXPO_PUBLIC_API_URL --value https://<web address> --visibility plaintext
eas env:set production --name EXPO_PUBLIC_SUPABASE_URL --value https://<project>.supabase.co --visibility plaintext
eas env:set production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --visibility plaintext
```

Release builds don't read `.env.local`. It's gitignored, so EAS never receives it. Builds take these three values from the `production` environment instead.

If a value is missing, or a URL isn't HTTPS, `scripts/check-release-env.mjs` stops the build within its first minutes. The values end up inside the app, and none of them is a secret, so `plaintext` is the right visibility.

### Build and upload

```sh
eas build --platform ios --profile production --auto-submit
```

On the first build:
1. You sign in with your Apple ID.
2. EAS registers the bundle ID (`app.thestats.ios`), and creates and stores the signing certificate and provisioning profile.
3. `--auto-submit` uploads the finished build to App Store Connect. On the first upload it also creates the app there. App Store names must be unique, so you may need a different name if "theStats" is taken.
4. Apple processes the build, usually within 30 minutes.

To upload a build that's already finished, run `eas submit --platform ios --latest`.

To let people install it:
1. In App Store Connect, open the app's TestFlight tab.
2. Add yourself and any teammates as internal testers. Internal testing doesn't need Apple's review.
3. Testers install the app from the TestFlight app on their iPad or iPhone.

## Before submitting to the App Store

TestFlight works without these, but App Review requires them:

- **Account deletion.** The app lets people create an account, so it must also let them delete it from inside the app (App Store Review Guideline 5.1.1(v)). It can't yet.
- **Privacy.** App Store Connect asks for a privacy policy URL and the App Privacy answers. The app stores an email address and the games people score.
- **App icon.** `assets/images/icon.png` is still Expo's placeholder.
- **Screenshots** for iPad and iPhone, both in landscape.
- **A demo account** for the reviewer, since everything is behind sign-in.
