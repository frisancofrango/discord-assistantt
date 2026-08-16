import { SlashCommandBuilder } from 'discord.js';
import { panel, button, notice, V2 } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Complete verification challenge to gain server access.'),

  async execute(interaction, client) {
    const verification = client.runtime?.native?.verification;
    if (!verification) {
      return interaction.reply({ content: 'Verification service is currently unavailable.', ephemeral: true });
    }

    const ctx = actorContext(interaction);
    try {
      const session = await verification.begin(
        {
          idempotencyKey: `verify:cmd:${interaction.guildId}:${interaction.user.id}:${Date.now()}`,
          memberId: interaction.user.id,
          riskScore: 0,
          joinedAt: interaction.member?.joinedAt?.toISOString(),
        },
        ctx
      );

      if (session.status === 'verified') {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'ALREADY VERIFIED', body: 'You are already verified on this server.' })],
        });
      }

      const p = panel({
        title: 'SERVER VERIFICATION',
        subtitle: 'Security & Anti-Raid Gateway',
        body:
          'Welcome to the server! To prevent bots and spam, please review our community guidelines and click **Accept Rules** to solve a quick security challenge.',
        buttons: [button.primary(`verify:rules:${session.id}`, '✓ Accept Rules & Verify')],
        footer: 'Azure Anti-Raid & Verification Engine',
      });

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [p],
      });
    } catch (err) {
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [notice({ title: 'VERIFICATION ERROR', body: err.message })],
      });
    }
  },
};
