import { config, THEME } from '../config.js';
import { panel, V2 } from '../ui/theme.js';

/**
 * Post a moderation action to the configured mod-log channel.
 * Silently no-ops if MOD_LOG_CHANNEL_ID isn't set or the channel is missing.
 */
export async function logAction(client, { action, target, moderator, reason, extra }) {
  if (!config.modLogChannelId) return;
  try {
    const channel = await client.channels.fetch(config.modLogChannelId);
    if (!channel?.isTextBased()) return;

    const lines = [
      `**Action** ${THEME.glyph.bullet} ${action}`,
      `**Target** ${THEME.glyph.bullet} ${target}`,
      `**Moderator** ${THEME.glyph.bullet} ${moderator}`,
      `**Reason** ${THEME.glyph.bullet} ${reason || 'No reason provided'}`,
    ];
    if (extra) lines.push(`**Details** ${THEME.glyph.bullet} ${extra}`);

    await channel.send({
      flags: V2,
      components: [
        panel({
          title: 'MOD LOG',
          body: lines.join('\n'),
          footer: new Date().toUTCString(),
        }),
      ],
    });
  } catch (err) {
    console.error('[mod-log] Failed to log action:', err);
  }
}

/** Standard ephemeral error reply used across moderation commands. */
export async function fail(interaction, message) {
  const payload = {
    flags: V2,
    components: [panel({ title: 'BLOCKED', body: message })],
  };
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ ...payload, ephemeral: true });
  }
  return interaction.reply({ ...payload, ephemeral: true });
}

/**
 * Guard a target member against common invalid moderation actions.
 * Returns an error string if the action should be blocked, else null.
 */
export function guardTarget(interaction, targetMember) {
  const me = interaction.guild.members.me;

  if (!targetMember) return null; // e.g. user not in guild (ban by ID still ok)
  if (targetMember.id === interaction.user.id) return 'You cannot action yourself.';
  if (targetMember.id === interaction.client.user.id) return 'I cannot action myself.';
  if (targetMember.id === interaction.guild.ownerId) return 'You cannot action the server owner.';

  // Role hierarchy checks.
  if (targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
    return 'That member has an equal or higher role than you.';
  }
  if (me && targetMember.roles.highest.position >= me.roles.highest.position) {
    return "That member's role is higher than mine, so I can't action them.";
  }
  return null;
}
