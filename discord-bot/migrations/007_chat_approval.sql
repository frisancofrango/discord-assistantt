ALTER TABLE proposals ADD COLUMN discord_message_id text;
CREATE INDEX proposals_guild_panel_idx ON proposals(guild_discord_id,status) WHERE discord_message_id IS NOT NULL;