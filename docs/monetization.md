# PostureLens Monetization Strategy

**Status**: Draft — exploring options  
**Constraint**: Zero telemetry, zero data leakage, local-first privacy model  
**Last Updated**: 2026-02-07

---

## Guiding Principle

PostureLens's privacy promise is non-negotiable. Every monetization path must satisfy one rule: **no user data — behavioral, biometric, or otherwise — ever leaves the browser**. The app never phones home, never tracks impressions, never fingerprints users.

This is not just an ethical stance — it's a competitive moat. Users trust PostureLens *because* the source code proves there's nothing to hide.

---

## Why Contextual Relevance Works Without Tracking

Traditional ad tech matches ads to users by surveilling behavior. PostureLens doesn't need to. The app's entire purpose pre-qualifies the audience:

- Someone using a posture-correction tool is already interested in posture health
- Someone getting face-touch alerts is already thinking about skin and hygiene habits
- The *context of the product* replaces the need for *tracking the person*

This means relevant placements are a natural fit — not because we profiled anyone, but because the product's function aligns with the advertiser's audience.

---

## Tier 1: Sponsor Sidebar (Static Placements)

### How It Works
A fixed sidebar or footer section displays curated sponsor cards — chiropractors, physical therapists, dermatologists, ergonomic product vendors. Content is static HTML/CSS bundled with the app. No remote ad server, no JavaScript pixels, no impression tracking.

Sponsors pay a flat fee (monthly or quarterly) for placement. No per-click billing, no conversion tracking.

### Why This Preserves Privacy
- Ad content ships as part of the static build — identical to any other UI element
- No third-party scripts injected into the page
- No network requests triggered by ad rendering
- No impression or click counters reported anywhere
- The sponsor sees zero data about who viewed their placement

### Revenue Model
- Flat-rate sponsorship: predictable revenue, simple invoicing
- Tiered pricing by placement prominence (sidebar vs. footer vs. contextual card)
- Curated admission — quality control protects user trust

### Risks & Mitigations
- **Risk**: Sponsors want proof of reach (impressions/clicks)
- **Mitigation**: Provide aggregate download/install stats from Cloudflare analytics (page views only, no user-level data). Sponsors buy *audience alignment*, not measurable clicks. Frame it as brand placement, not performance marketing.

---

## Tier 2: Contextual Cards (Behavior-Aware, Still Local)

### How It Works
The app shows contextually relevant cards based on which alert type fires — but the matching logic runs entirely in the browser:

- **Posture alert fires** → show a posture/chiropractic/ergonomics card
- **Face-touch alert fires** → show a skincare/dermatology card
- **No alerts** → show a general wellness or "good job" card

Card content is bundled as a static JSON file or embedded HTML. The nudge engine already knows which alert type fired — the card selection is a simple `if/else` in local code, not a remote API call.

### Why This Preserves Privacy
- Card selection logic runs in `nudge-engine.ts` alongside existing alert code — no new data paths
- Card content is pre-bundled at build time, not fetched from a remote server
- No behavioral data is transmitted, logged, or aggregated
- From the network's perspective, showing a contextual card is indistinguishable from showing any other UI element — zero additional requests

### Revenue Model
- Premium over Tier 1 pricing — contextual relevance commands higher rates
- Sponsors choose which alert context to associate with (posture, face-touch, or general)
- Still flat-rate, no per-impression billing

### Risks & Mitigations
- **Risk**: Users feel surveilled even though they aren't
- **Mitigation**: Transparent labeling — "This suggestion is shown because a posture alert fired. No data was shared." Link to source code or a plain-language privacy explainer.
- **Risk**: Slippery slope toward dynamic ad serving
- **Mitigation**: Hard rule in AGENTS.md and codebase — card content must be static/bundled. Any proposal to fetch cards from a remote endpoint requires a full privacy review and explicit opt-in from the user.

---

## Tier 3: Provider Directory (User-Initiated Lead Gen)

### How It Works
A "Find a Provider" section lets users browse a curated directory of practitioners — chiropractors, physical therapists, dermatologists, ergonomic consultants. Practitioners pay to be listed.

The user actively clicks into the directory and initiates contact. A simple contact form submits directly to the provider's email (mailto link or a lightweight form endpoint owned by the provider, not by PostureLens).

### Why This Preserves Privacy
- PostureLens never stores, proxies, or processes the user's contact information
- The directory is a static list bundled with the app — no search queries sent to a server
- Contact form submissions go directly from user → provider (PostureLens is not in the data path)
- No analytics on which providers users view or contact

### Revenue Model
- Annual or quarterly listing fee per provider
- Tiered listings: basic (name + link) vs. featured (card with description + photo)
- Geographic or specialty categorization (bundled as static data, not a dynamic search backend)

### Risks & Mitigations
- **Risk**: Directory becomes stale without a backend
- **Mitigation**: Quarterly refresh cycle aligned with billing — update directory data in the static build and redeploy. Providers on expired plans are removed automatically at build time.
- **Risk**: Users expect a search/filter experience that requires a backend
- **Mitigation**: Keep the directory small and curated (50-100 providers max at launch). Use client-side filtering over the static JSON — no server round-trips needed.
- **Risk**: Provider quality control
- **Mitigation**: Manual vetting process. Only licensed, verifiable practitioners are listed. Include a "Report" link that opens the user's email client to flag concerns (no tracking form).

---

## What We Will Never Do

These are hard boundaries, not aspirational goals:

- **Never inject third-party ad network scripts** (Google Ads, Meta Pixel, etc.)
- **Never track impressions, clicks, or conversions** on ad placements
- **Never transmit behavioral data** (alert frequency, posture scores, usage patterns) to any external service
- **Never sell or share user data** — there is no user data to sell
- **Never add remote ad-serving endpoints** that could be used to fingerprint or profile users
- **Never require account creation** for core functionality or ad interaction
- **Never use dark patterns** to drive ad engagement (forced clicks, deceptive placements, interstitials)

---

## Implementation Priority

1. **MVP (v0.1.x)**: No monetization. Ship the core product and build trust.
2. **v0.2.x**: Tier 1 — static sponsor sidebar. Validate that sponsors will pay for audience alignment without click metrics.
3. **v0.3.x**: Tier 2 — contextual cards. Requires nudge engine integration (post-Phase 3 in TASKS.md).
4. **v1.0+**: Tier 3 — provider directory. Requires enough user base to justify provider investment.

---

## Open Questions

- What's the right flat-rate price point for Tier 1? Benchmark against podcast sponsorships and niche tool sponsorships (similar audience size, alignment-based pricing).
- Should Tier 2 contextual cards rotate or show one fixed sponsor per context? Rotation adds complexity but distributes value.
- Is there a Tier 0 — a simple "Buy me a coffee" / donation link — worth adding before formal sponsorships?
- How do we communicate the privacy model to sponsors who are used to impression-based billing? Need a clear one-pager or pitch deck.
