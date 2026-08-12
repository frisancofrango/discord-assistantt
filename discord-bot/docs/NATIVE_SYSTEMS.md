# Azure native server systems

Migration `005_native_systems.sql` adds the durable source of truth for support, verification, commerce, moderation, consent marketing, and analytics. Run `npm run migrate` before deployment. Workers rebuild SLA, expiry, moderation, and campaign jobs from PostgreSQL on restart; BullMQ keys make scheduling idempotent.

## Support

Tickets enforce per-member open limits and recent-subject duplicate detection. The state machine supports claim/assignment, priorities, tags, staff notes, member-visible messages, waiting states, escalation, close/reopen, transcripts with SHA-256 evidence, and one satisfaction response. Configure limits and SLA through `TICKET_*`. Production panel setup should use private channels or threads with explicit member, staff, and bot overwrites; never expose transcript content in public logs.

## Verification

Verification begins with rules acceptance, then a built-in salted scrypt arithmetic challenge or a compatible challenge adapter. Attempts and expiry are persisted. Join-risk scores route suspicious members to manual review or quarantine. Successful role grants run through the typed Discord tool runtime and require a verified receipt. Azure never requests a user token, password, QR login, or Discord credentials.

## Commerce

Products require an acceptable-use statement and reject account credentials or stolen/unauthorized goods. Variants, reservations, carts, order snapshots, risk flags, payment events, fulfillment receipts, refunds, and verified reviews are durable. Inventory mutation uses row locks. Payment adapters must verify the raw body signature before parsing and provide a provider event ID; `(provider,event_id)` and native idempotency prevent replay. Only allowlisted fulfillment mechanisms are accepted. Provider secrets stay in runtime secret storage, never templates, prompts, or logs.

## Moderation

Cases preserve reason templates, severity, immutable evidence references, private notes, escalation recommendations, action expiry, Discord tool receipts, and appeal ticket links. Timeout/kick/ban/unban use hierarchy-aware tools and policy approval. AutoMod gateway events remain evidence inputs; destructive or member-affecting actions keep foundation policy enforcement.

## Consent marketing

Only explicit `opted_in` records qualify for a campaign purpose. Eligibility is rechecked immediately before every delivery; opt-out wins. Campaigns have drafts, schedules, quiet hours, rate ceilings, attribution tokens, experiment variants, and idempotent per-member delivery. Unsolicited DMs, scraping, fake engagement, and evasion are denied. Do not import recipients without verifiable consent proof.

## Analytics and privacy

Events use required idempotency keys and roll into daily aggregates for verification, tickets/SLA, moderation, storefront/orders/refunds, and campaign attribution. Identifiable events have a shorter retention path; `ANALYTICS_RETENTION_DAYS` controls aggregate event retention. Components V2 summaries expose aggregates, not private ticket, moderation, payment, or message content.

## Validation boundary

Unit and syntax checks validate local contracts and state rules. A staging guild and payment-provider sandbox are still required to validate Discord permissions/rate limits, webhook ingress, role hierarchy, private overwrites, and end-to-end payment behavior. Never describe those integrations as live until those checks are actually run.
