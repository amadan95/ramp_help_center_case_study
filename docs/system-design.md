# Ramp Help Center Redesign – System Blueprint

## Problem recap
- Current help center forces a one-size-fits-all narrative, leading to dense articles and uncertainty for varied personas (employees, admins, bookkeepers, vendors) and product tiers (Base, Plus).
- AI surfaces the same long-form content to every query, increasing hallucination risk and lowering answer precision.
- Operators lack structured metadata and insight loops to prioritize updates.

## Signals from usage data
- 206k article views in the last 30 days across 447 public articles (mean 462, median 176).
- Top 10 articles account for 62% of traffic; "Manage your communication preferences" alone drives 42k views but has only 20% positive votes, signalling confusion around notification management.
- Articles focused on urgent resolutions (login issues, contacting support) show the lowest satisfaction (e.g. just 14% positive votes on login troubleshooting, 0% on contacting support) and should be prioritized for restructure.
- Feedback volume is heavily skewed—only 186 articles received any votes—so implicit behavioural signals (search depth, in-product retries, ticket submissions) must augment article thumbs-up data.

## Organizing principle
- Treat each article as a knowledge node composed of three layers:
  1. **Core facts** – atomic, source-of-truth statements validated by product owners.
  2. **Context adapters** – metadata that tailor facts to roles, tiers, integrations, and geography.
  3. **Experience wrappers** – presentation variants (UI, snippet, chatbot chunk) that select and sequence the right facts for a channel.

## Metadata schema (v1)
Each knowledge node carries the following structured fields (see `prototype/data/articles.json` for an example instantiation):
- `id`, `title`, `source_url` – canonical identifiers.
- `persona` – target audiences (`employee`, `admin`, `bookkeeper`, `vendor`, `it`).
- `service_tier` – e.g. `base`, `plus`.
- `feature_area` – canonical product capabilities (notifications, bill-pay, travel, reimbursements, integrations).
- `topic_cluster` – higher-level taxonomy that drives navigation and RAG chunk clustering.
- `content_type` & `journey_stage` – supports UX choreography (e.g. "troubleshooting" surfaces checklists, "implement" surfaces setup tasks).
- `integrations`, `regions`, `product_variants` – gates for geography, accounting stack, or product edition-specific differences.
- `is_plus_only`, `last_reviewed`, `owner_team` – governance anchors.
- `signals` – 30-day views, up/down votes, deflection metrics, CSAT.
- `feedback_channels` – maps each node to the loops that should refresh it (support tickets, in-product feedback, AI red flag queue).

## Experience design
- **Authenticated web** – show personalised landing that defaults filters using identity data (role, tier, integrations installed). Surface "most viewed by peers", "open tasks" (e.g. receipts missing), and "Recently updated" banners for change management.
- **Unauthenticated web** – ask lightweight question to understand intent ("What describes you?" "Which product are you using?"). Response seeds filters and drives query suggestions. Provide trust badges (Last reviewed, edition, region) next to each recommendation to build confidence.
- **AI assist (chat or RAG)** – index chunk-level content (core fact + applicable adapters). Retrieval pipeline scores chunks on taxonomy match, freshness, and historical outcome (was it copied into a resolved ticket?). Provide structured citations back to the canonical article.

## Retrieval & ranking strategy
- Store knowledge nodes and chunks in a graph-backed index (e.g. Postgres + pgvector or managed Pinecone). Key steps per query:
  1. Determine persona/tier context from auth or user prompt; fallback to probabilities if unknown.
  2. Filter chunks by hard gates (tier, region, integrations). Return fallback variants if no direct match.
  3. Hybrid rank using semantic similarity (embedding), keyword match, and freshness score (boosting recently updated items when feature flags ship).
  4. Post-process results with safety guardrails: ensure at least one citation per chunk, cross-check `last_reviewed` < 90 days, and degrade to human handoff if accuracy confidence < threshold.
- Maintain "AI safety labels" on each chunk: `allowed_for_ai`, `needs_human_gate`, `beta_feature`. RAG pipeline respects these flags to curb leakage of unannounced features.

## Operator workflow
- Content Ops dashboard offers queue views: "High traffic + low CSAT", "Feature shipping soon", "Policy updates".
- Editing experience enforces structured authoring: authors input core facts, then attach adapters via multi-select fields (tier, persona, integration). UI generates channel previews (article, chatbot snippet, release note) so authors see how metadata changes the end experience.
- Review states: `Draft -> SME review -> Localization -> Publish`. Publishing triggers automated tests (linting for broken links, policy keywords) and notifies AI indexer to regenerate embeddings + metadata caches.
- Versioning: keep historical snapshots for compliance and to resolve regression reports from AI or customers.

## Feedback loops
- Tie each node to downstream outcomes:
  - Support: auto-tag Zendesk tickets with article IDs referenced in macros; surface unresolved tickets where the same article was suggested.
  - Product usage: push anonymised event metrics (e.g. reimbursements submitted, bill payments completed) into Looker to verify if content consumption correlates with task completion.
  - RAG quality: chatbot collects "was this helpful?" per chunk and routes low-confidence responses into a triage queue that creates draft annotations for Ops review.
  - Search logs: capture zero-result queries; auto-create backlog entries with suggested taxonomy additions.

## Roadmap (90-day view)
- **Phase 1 (0-30 days)** – Stand up metadata schema in CMS, backfill top 100 articles, build personalised navigation shell, add freshness + tier badges.
- **Phase 2 (30-60 days)** – Launch structured authoring form, implement analytics dashboards, integrate authentication hooks to pre-filter content.
- **Phase 3 (60-90 days)** – Deploy hybrid retrieval service for chatbot, enable automated testing + embedding refresh, pilot unsupervised feedback grouping (topic modelling on tickets/search).

## Success metrics
- Increase answer accuracy: reduce login/support article downvote rate by 50% within 2 quarters.
- Improve efficiency: cut average authenticated session depth (pages visited per solved session) by 25% via personalised navigation.
- Boost coverage: drive zero-result search rate below 1% through taxonomy enrichment and fallback suggestions.
- Raise operator velocity: shrink median article update cycle from 12 days to <5 days with structured workflows and alerting.
