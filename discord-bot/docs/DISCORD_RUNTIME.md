# Discord observation and tool runtime

Loop observes gateway events without responding to every message. Message create, update and delete events preserve exact revisions, attachments, mentions, references and correlation metadata. Reactions, interactions, members, roles, channels, threads, moderation, AutoMod, invites, scheduled events, webhooks and guild updates are normalized in `discord_events`; the gateway key prevents replay duplication.

Context assembly prioritizes the exact reply chain and exact recent channel/thread messages, then active tasks, user memories/preferences, guild facts and optional semantic retrieval. Lower-priority context is removed first to enforce `DISCORD_CONTEXT_TOKENS`.

Engagement is deterministic for DMs, mentions, replies to Loop, active tasks and owner commands. Passive traffic uses relevance scoring, cooldown and loop guards. Typing starts only after the policy chooses to engage. Material edits are observed and reconsidered; low-signal edits are not answered.

The typed registry validates every input and records domain, risk and required Discord permissions. Invocation requires an idempotency key and policy authorization, then runs preflight, execute and postcondition verification. Receipts contain resource IDs, snapshots, verification and compensation descriptors. Mutations use discord.js managers, which honor Discord rate-limit buckets; role/member operations additionally enforce hierarchy.

Supported domains include guild settings, channels/categories/forums/threads, roles and overwrites, messages/replies/pins/reactions and Components V2 payloads, expressions, members and moderation, invites, AutoMod, scheduled events and policy-gated webhooks. Destructive operations are marked irreversible when Discord provides no restoration primitive. Self-bots, user-token automation and arbitrary control of third-party applications are explicitly rejected. Discord has no universal bot forward operation; Loop uses attributable quoting/replying instead.

Guild snapshots are normalized and hashed. `diffSnapshots` emits stable add/remove/replace operations while ignoring capture time; these primitives are intended for proposal and rollback workflows.

Required gateway configuration: enable Server Members and Message Content privileged intents in the Discord Developer Portal. Apply migration `003_discord_runtime.sql` before startup.
