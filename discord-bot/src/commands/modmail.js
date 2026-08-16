import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { notice, V2 } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('modmail')
    .setDescription('Modmail operations and anonymous DM support desk.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s.setName('close').setDescription('Close the current active modmail thread.')
    ),

  async execute(interaction, client) {
    const modmail = client.runtime?.native?.modmail;
    if (!modmail) {
      return interaction.reply({ content: 'Modmail service is unavailable.', ephemeral: true });
    }

    const thread = await modmail.getThreadByThreadId(interaction.channelId);
    if (!thread) {
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'NOT A MODMAIL THREAD',
            body: 'This command can only be used inside an active Modmail thread.',
          }),
        ],
      });
    }

    await modmail.closeThread(interaction.channelId, actorContext(interaction));

    // Notify user in DM if possible
    try {
      const user = await client.users.fetch(thread.member_id);
      await user.send({
        flags: V2,
        components: [
          notice({
            title: 'MODMAIL THREAD CLOSED',
            body: 'Staff has resolved and closed your modmail session. Send another DM if you need further help.',
          }),
        ],
      });
    } catch {}

    return interaction.reply({
      flags: V2,
      components: [
        notice({
          title: 'THREAD RESOLVED',
          body: `Modmail session for <@${thread.member_id}> has been closed.`,
        }),
      ],
    });
  },
};
