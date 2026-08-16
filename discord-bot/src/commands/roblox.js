import { SlashCommandBuilder } from 'discord.js';
import { robloxCalculatorPanel, notice, V2 } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('roblox')
    .setDescription('Roblox 70/30 fee calculator, account linking, and commerce utilities.')
    .addSubcommand((s) =>
      s
        .setName('calc')
        .setDescription('Calculate exact gross Gamepass price or net Robux received (30% marketplace fee).')
        .addIntegerOption((o) =>
          o.setName('amount').setDescription('Robux amount').setRequired(true).setMinValue(1)
        )
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Is this the net Robux you want to receive, or the gross Gamepass price?')
            .setRequired(false)
            .addChoices(
              { name: 'Target Net Robux (Desired payout)', value: 'net' },
              { name: 'Gross Listing Price (Storefront price)', value: 'gross' }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName('link')
        .setDescription('Link your Discord account to your verified Roblox profile.')
        .addStringOption((o) =>
          o.setName('username').setDescription('Your exact Roblox username').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('profile')
        .setDescription('View the linked Roblox profile for yourself or another member.')
        .addUserOption((o) =>
          o.setName('user').setDescription('Target member').setRequired(false)
        )
    ),

  async execute(interaction, client) {
    const roblox = client.runtime?.native?.roblox;
    if (!roblox) {
      return interaction.reply({ content: 'Roblox services are currently unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'calc') {
      const amount = interaction.options.getInteger('amount', true);
      const isNet = interaction.options.getString('type') !== 'gross';
      const calc = roblox.calculateFee(amount, isNet);

      const panel = robloxCalculatorPanel({
        netRobux: calc.targetNet,
        grossPrice: calc.grossPrice,
        feeAmount: calc.feeAmount,
        effectiveNet: calc.effectiveNet,
        isNet,
      });

      return interaction.reply({
        flags: V2,
        ephemeral: false,
        components: [panel],
      });
    }

    if (sub === 'link') {
      await interaction.deferReply({ ephemeral: true });
      const username = interaction.options.getString('username', true);

      try {
        const link = await roblox.linkAccount(
          {
            guildId: interaction.guildId,
            memberId: interaction.user.id,
            username,
          },
          ctx
        );

        return interaction.editReply({
          flags: V2,
          components: [
            notice({
              title: 'ROBLOX ACCOUNT LINKED',
              body:
                `Successfully linked Discord member <@${interaction.user.id}> to Roblox profile:\n\n` +
                `> **Username:** \`${link.robloxUsername}\`\n` +
                `> **Roblox ID:** \`${link.robloxId}\`\n` +
                `> **Verified:** ✓ Verified`,
              footer: 'Roblox ID mapped for automated Gamepass and group fulfillment.',
            }),
          ],
        });
      } catch (err) {
        return interaction.editReply({
          flags: V2,
          components: [
            notice({
              title: 'LINKING FAILED',
              body: `Could not link Roblox account: ${err.message}`,
            }),
          ],
        });
      }
    }

    if (sub === 'profile') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const link = await roblox.getLinkedAccount(interaction.guildId, targetUser.id);

      if (!link) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'NO LINKED PROFILE',
              body: `<@${targetUser.id}> has not linked a Roblox account yet.\nUse \`/roblox link <username>\` to link.`,
            }),
          ],
        });
      }

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'ROBLOX PROFILE',
            body:
              `Member: <@${targetUser.id}>\n\n` +
              `> **Roblox Username:** \`${link.robloxUsername}\`\n` +
              `> **Roblox User ID:** \`${link.robloxId}\`\n` +
              `> **Status:** ✓ Active & Verified`,
            footer: 'Azure Roblox Integration',
          }),
        ],
      });
    }
  },
};
