# Sculptural Seraph study 03

## Review

Open `/art-study` in the signed-in project preview. This is one fixed **Remember / seed 408325749** sample, not a collectible and not connected to unsealing. It is not published. The current manifestation renderer remains version 2, while old snapshots continue to select their saved renderer or frozen version 1.

## Implemented

- Six returning curved ribbon wings with independently phased flex/breath motion, overlapping depth, lit front/back surfaces and gold edge binding.
- Authentic vector houndstooth tile from the attributed Kevin L. Durette geometry, rasterized once for GPU texture sampling and mapped by surface UV coordinates. It is not an AI texture or flat polygon overlay.
- Detailed radial iris, dark pupil, specular highlights, dimensional eye housing, small gaze motion and a timed blink.
- Three metallic orbital rings with different axes and speeds, true scene depth/occlusion and moving particles.
- Hold slows the playback smoothly; release restores it; tap displaces rings/wings in a short ripple; horizontal drag produces damped bounded parallax/gaze. Native vertical touch scrolling remains enabled.
- Calmer reduced-motion playback; offscreen/background rendering pause; no sound or remote image/text requests.

## Focused validation

- 11 tests pass: 7 existing deterministic/legacy manifestation tests plus 4 study tests covering six wings, seed replay, isolation from creation, continuous slowdown/restoration, gaze bounds, ripple decay and reduced motion.
- Harness reports build OK. Signed-in Chromium inspection at 390×844 and 1280×1800: scene is visible and framed, no horizontal overflow or runtime exceptions.
- Observed hold speed **0.160**, release **1.000**, tap ripple **0.75**, emulated touch-drag gaze **0.51** (bounded). Offscreen scene clock remained unchanged. Reduced-motion flag checked.
- Scene reports approximately **53 draw calls / 53,736 triangles** at the inspected frame, pixel ratio capped at 1.5 and one 1024 shadow map.
- Private Vault inspection shows all four current saved artworks still using their old appearance. No issuance/payment/wallet/database code was edited or invoked.
- The seven-second recording is a frame-sampled browser capture assembled at four frames per second: it demonstrates changing poses and interaction response, **not real-time iPhone frame rate**.

## Visual limitations / review gates

This is a procedural sculptural study, not a photoreal match to the planning illustration. The eye housing remains stylized, the ribbons are thin surfaces rather than volumetric anatomical feathers, there is only one eye, and there is no cinematic mist or complex subsurface lighting. Self-shadowing is real but limited by the mobile shadow budget. The prototype demonstrates depth and motion without claiming finished anatomy.

Actual iPhone Safari / Nimiq Pay WebView performance, thermal behavior, tactile feel and GPU appearance are **not device-validated**. Review the preview's `/art-study` on the phone: hold the artwork, release, tap, and drag sideways; vertical swipes should still scroll. Existing unsealings do not use this study. Wait for visual approval before any integration or further variants.

## Honest daily-drop audit

Read-only hosted queries confirm **120 scheduled drops and one distinct entity**, spanning November 1, 2026 through **March 1, 2027 at 00:00 UTC**. At the supplied November 8 session date, drop 8 occupies November 8–9 and next drop 9 activates **November 9, 2026 at 00:00 UTC** (November 8 at 6 pm Chicago).

Both point to **The Woven Seraph / Entity I · Ophan of the Broken Check**. There is no genuinely different next entity configured. The daily number/windows and repeating clues/sigils change; seed/intention vary personal art, not the daily structural identity.

Source evidence: `drizzle/migrations/0000_migration.sql`, `src/lib/queries.ts`, `src/components/Entity.tsx`, `src/routes/index.tsx`, `src/routes/_authenticated/unseal.tsx` and encounter routes. No automatic authored-content extension or wraparound exists. At schedule exhaustion, current-drop lookup returns no open drop and the app shows its no-artifact state; backend window checks reject issuance, while existing Vault items remain available. An already-open page relies on normal query refetch rather than an explicit midnight switch timer.

## Changed files

- New: `src/lib/seraph-study.ts`, `src/lib/seraph-study.test.ts`, `src/components/SeraphStudyScene.tsx`, `src/routes/_authenticated/art-study.tsx`, this report.
- Updated: `src/styles.css` (isolated full-bleed study sizing/gesture scope), `package.json`, `bun.lock`, `AGENTS.md`, `roadmap.md`.
- Router regenerated `src/routeTree.gen.ts` automatically.
- Existing manifestation generators/renderers, auth, payments, credits, Reserve, grants and saved rows were not changed. No publishing occurred.