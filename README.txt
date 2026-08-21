BUSINESS BRIDGE — REAL APP PACKAGE

This package contains the latest Pixora social-app UI from the uploaded project, including Home/feed, Search, Create, Messages, Notifications, Profile and Connect pages.

It is prepared as an installable Progressive Web App (PWA):
- manifest.json provides the app identity and standalone display.
- sw.js provides offline caching for the app shell.
- The existing Supabase configuration is retained.
- The “Built with Hercules” badge is not included.

INSTALL ON IPHONE/iPAD:
1. Host this folder on HTTPS (GitHub Pages, Netlify, Vercel, etc.).
2. Open the site in Safari.
3. Tap Share -> Add to Home Screen.
4. Launch Pixora from the Home Screen; it opens as a standalone app.

ANDROID:
Open the HTTPS site in Chrome and use Install app / Add to Home screen when offered.

NATIVE APK/IPA:
A native Android/iOS build still requires a platform build environment (Android SDK/Gradle for APK/AAB; Xcode/macOS for iOS). This package is ready to be wrapped with Capacitor when that build environment is available.


PIXORA BACKEND SETUP
1. Open Supabase SQL Editor for the project configured in supabase.js.
2. Run schema.sql once.
3. The app then uses Supabase for profiles, messages and in-app notifications. If the tables are not installed, the app falls back to local browser storage for testing on one device.
4. Supabase Auth email confirmation is controlled by Authentication settings; the app cannot force an email if the project's email provider/confirmation settings are not configured.
