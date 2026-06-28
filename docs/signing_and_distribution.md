# MojAbble - Signing & Distribution Setup

Everything builds on GitHub Actions. No local Mac needed.

---

## Step 1: Create an App Store Connect API Key

This lets GitHub Actions talk to Apple on your behalf.

1. Go to https://appstoreconnect.apple.com/access/integrations/api
2. Click the + button to generate a new key
3. Name: `MojAbble CI`
4. Access: `App Manager`
5. Click Generate
6. Download the `.p8` file (you can only download it once)
7. Note the **Key ID** and **Issuer ID** shown on the page

---

## Step 2: Register the App ID (if not done yet)

1. Go to https://developer.apple.com/account/resources/identifiers
2. Click +
3. App IDs > App
4. Description: `MojAbble`
5. Bundle ID: Explicit > `com.mojabble.app`
6. Register

---

## Step 3: Create the App in App Store Connect

1. Go to https://appstoreconnect.apple.com/apps
2. Click + > New App
3. Platform: iOS
4. Name: MojAbble
5. Primary Language: English (U.S.)
6. Bundle ID: select `com.mojabble.app`
7. SKU: `mojabble-001`
8. Full Access: select your user
9. Create

---

## Step 4: Generate a Distribution Certificate

Since you're on Windows, we'll use a tool called `fastlane match` running inside the GitHub Action itself. Alternatively, you can generate the certificate manually:

### Option A: Manual (using your Mojave Mac)

1. Open Keychain Access on the Mac
2. Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority
3. Enter your email, select "Saved to disk", click Continue
4. Save the `.certSigningRequest` file
5. Go to https://developer.apple.com/account/resources/certificates
6. Click + > Apple Distribution
7. Upload the CSR file
8. Download the `.cer` file
9. Double-click to install in Keychain
10. Export as `.p12` from Keychain Access (right-click > Export, set a password)

### Option B: Automated with Fastlane Match (recommended)

Let the GitHub Action handle certificate management. Requires a private GitHub repo to store encrypted certificates. We can set this up when ready.

---

## Step 5: Create a Provisioning Profile

1. Go to https://developer.apple.com/account/resources/profiles
2. Click +
3. Select "App Store Connect" under Distribution
4. Select App ID: `com.mojabble.app`
5. Select your Distribution Certificate
6. Name: `MojAbble App Store`
7. Generate and download the `.mobileprovision` file

---

## Step 6: Add Secrets to GitHub

Go to https://github.com/MartyChouette/mojabble-app/settings/secrets/actions

Add these repository secrets:

| Secret Name | Value |
|-------------|-------|
| `APPLE_API_KEY_ID` | Key ID from Step 1 |
| `APPLE_API_ISSUER_ID` | Issuer ID from Step 1 |
| `APPLE_API_KEY_P8` | Contents of the .p8 file (paste the full text) |
| `DISTRIBUTION_CERTIFICATE_P12` | Base64-encoded .p12 file* |
| `DISTRIBUTION_CERTIFICATE_PASSWORD` | Password you set when exporting the .p12 |
| `PROVISIONING_PROFILE` | Base64-encoded .mobileprovision file* |

*To base64 encode a file:
```bash
base64 -i certificate.p12 | pbcopy    # macOS
certutil -encode certificate.p12 tmp.b64 && type tmp.b64  # Windows
```

---

## Step 7: Updated GitHub Actions Workflow

Once secrets are in place, the workflow gets updated to:

1. Install the signing certificate and provisioning profile into a temporary keychain
2. Build a signed .ipa
3. Upload to TestFlight using the App Store Connect API key

The updated workflow will replace the current unsigned simulator build.

---

## Step 8: TestFlight

After the workflow uploads a build:

1. Open TestFlight on your iPhone 16
2. The build will appear under MojAbble
3. First build requires you to fill in test information in App Store Connect:
   - Beta App Description
   - Contact email
   - Privacy policy URL
4. Accept the build for testing
5. Install and play

---

## Step 9: App Store Submission

When you're ready to go public:

1. In App Store Connect, go to the MojAbble app
2. Fill in the listing details (see app_store_listing.md)
3. Upload screenshots (see icon_and_screenshots.md)
4. Select the TestFlight build to submit
5. Answer the export compliance question (MojAbble uses no encryption beyond HTTPS, select "No")
6. Submit for review

Apple review typically takes 24-48 hours for new apps.

---

## Summary of what you need to do

1. Create API key in App Store Connect
2. Register App ID
3. Create the App in App Store Connect
4. Generate certificate (on your Mac or via fastlane)
5. Create provisioning profile
6. Add all secrets to GitHub
7. Tell me when ready and I'll update the workflow
