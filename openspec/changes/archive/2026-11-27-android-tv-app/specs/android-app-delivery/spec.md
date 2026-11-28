# Spec Delta

## Purpose

Ships the Android TV client binary alongside the server: a short unauthenticated `/apk` redirect into the immutable asset cache, APK-optional image packaging under a no-clobber versioned-filename contract, and the SPA affordance that advertises the app wherever a TV user can reach it.

## ADDED Requirements

### Requirement: APK redirect route
The server SHALL serve GET /apk unauthenticated at all times — the route stays registered even when no APK is packaged (ahead of the SPA fallback, like the swagger surface): with an APK present it answers 307 with Location exactly `/assets/<apk filename>` (path-only, so reverse-proxy scheme/host rewrites cannot corrupt it) and `Cache-Control: no-cache`; without one it answers 404, never the SPA index fallback. When more than one APK matches, the route SHALL serve the lexically-first name deterministically and log a boot WARN.

#### Scenario: Redirect is path-only
- **WHEN** an APK-bearing build receives GET /apk
- **THEN** the response is 307 with Location exactly `/assets/mellifera-tv-<version>.apk` and Cache-Control no-cache

#### Scenario: Multiple APKs are deterministic
- **WHEN** the packaged assets contain two mellifera-tv-*.apk files
- **THEN** the route redirects to the lexically-first filename and the boot log carries a WARN naming the ambiguity

#### Scenario: Route is unauthenticated
- **WHEN** GET /apk arrives without any credential
- **THEN** the redirect is served — the APK URL is a short public pointer, the asset itself is the capability

### Requirement: HEAD on the APK surface
The server SHALL answer HEAD /apk with the same 307/404 as GET, headers only, and SHALL mount HEAD on /assets/* with the GET handler so a HEAD probe of the redirect target returns 200 with the immutable cache header and no body.

#### Scenario: HEAD probes
- **WHEN** HEAD /apk and HEAD /assets/mellifera-tv-<version>.apk are sent to an APK-bearing build
- **THEN** /apk answers 307 headers-only and the asset answers 200 with the immutable cache header

### Requirement: APK-absent answers leak nothing
With no APK packaged, GET and HEAD /apk SHALL answer 404 — never the SPA index fallback that every other unmatched path gets.

#### Scenario: Absent APK serves 404
- **WHEN** an APK-less build receives GET /apk
- **THEN** the response is 404 and the body is never the SPA index.html

### Requirement: APK asset content type
The server SHALL serve .apk files under /assets/* with Content-Type `application/vnd.android.package-archive` and the immutable /assets cache policy.

#### Scenario: APK asset headers
- **WHEN** GET /assets/mellifera-tv-<version>.apk hits an APK-bearing build
- **THEN** the answer carries Content-Type application/vnd.android.package-archive and the immutable cache header

### Requirement: APK rides the image, builds stay APK-optional
The image build SHALL copy `android/apk/` into the embedded asset tree AFTER the SPA dist copy and BEFORE the go build compiles the embed; a build without any APK (bare checkout, CI) SHALL stay green and serve the absent behavior. The APK never enters git: the drop dir is gitignored for *.apk with a committed .gitkeep, and gradle build outputs never reach the build context.

#### Scenario: APK-less build stays green
- **WHEN** the image is built from a bare checkout (android/apk/ holds only .gitkeep) and boots
- **THEN** the build succeeds with no Android tooling involved and /apk answers 404

### Requirement: Versioned filename is the wire contract
The release target SHALL produce `android/apk/mellifera-tv-<version>.apk` from a release build signed per the signing law (a release build without the keystore fails loudly — a debug-signed release shipped once would block updates on that TV forever) and SHALL never overwrite an existing file (no-clobber): filename↔bytes identity is what makes the immutable cache key and the SPA version label sound. The filename is the entire version wire contract; no separate version manifest is served.

#### Scenario: Re-release with the same version never clobbers
- **WHEN** the release target runs twice with the same VERSION and unchanged inputs
- **THEN** the second run leaves the first file untouched (identical checksum) and exits 0

#### Scenario: Release without the keystore fails loudly
- **WHEN** the release build runs with no keystore.properties present
- **THEN** the build fails with an explicit signing error and produces no APK

### Requirement: SPA advertises the app
The SPA SHALL probe `HEAD /apk` (redirect default-followed, cache bypassed): 404 renders nothing anywhere; 200 renders the download affordance in its placements — the TV-mode banner when the TV gate holds, the login footer and settings always — with the Downloader address rendered as `location.origin + "/apk"` and a version label parsed from the final URL's filename, degrading to the button without a label when the filename does not parse.

#### Scenario: Probe hides the affordance on 404
- **WHEN** the probe answers 404 (APK-less build)
- **THEN** no download affordance renders on any placement

#### Scenario: Version label from the redirect target
- **WHEN** the probe answers 200 landing on /assets/mellifera-tv-1.2.3.apk
- **THEN** the affordance labels the download 1.2.3 and shows the Downloader address location.origin + "/apk"
