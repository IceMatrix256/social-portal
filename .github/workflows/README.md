# GitHub Actions Workflows

## Android APK Build (`android-build.yml`)

This workflow automatically builds the Android APK for the Social Portal app.

### When Does It Run?

The workflow runs **automatically** in the following scenarios:

1. **Pull Requests** - When a PR is opened or updated targeting the `main` branch
   - ✅ Automatically builds the APK
   - ✅ Uploads APK as a downloadable artifact (retained for 30 days)
   - ❌ Does NOT create a GitHub release

2. **Push to Main** - When code is merged to the `main` branch
   - ✅ Automatically builds the APK
   - ✅ Uploads APK as a downloadable artifact
   - ✅ Creates a GitHub release with the APK attached

3. **Manual Trigger** - Via the "Actions" tab in GitHub
   - Can be triggered manually using "Run workflow"
   - Useful for testing or creating builds on-demand

### What It Does

The workflow performs these steps:

1. Checks out the code
2. Sets up Node.js (v22) and Java (v21)
3. Installs npm dependencies
4. Builds the web project (`npm run build`)
5. Syncs Capacitor with Android (`npx cap sync android`)
6. Builds the debug APK using Gradle
7. Uploads the APK as an artifact (always)
8. Creates a release with the APK (only for pushes to main)

### Downloading the APK

#### From Pull Requests
1. Go to the PR page on GitHub
2. Click on "Checks" or "Actions" tab
3. Find the "Build Android APK" workflow run
4. Scroll down to "Artifacts" section
5. Download "app-debug-apk"

#### From Releases (Main Branch Only)
1. Go to the repository's "Releases" page
2. Find the latest release
3. Download the APK from the release assets

### Is It Automatic?

**Yes!** The APK build is completely automatic:
- ✅ No manual trigger needed for PRs
- ✅ No manual trigger needed for main branch pushes
- ✅ Runs on every PR update
- ✅ Runs on every merge to main

You only need to use manual trigger if you want to build without creating a PR or pushing to main.
