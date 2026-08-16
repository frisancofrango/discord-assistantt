import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Interact with Loop Autonomous AI and neural studio.')
    .addSubcommand((s) =>
      s
        .setName('ask')
        .setDescription('Ask the AI assistant for help, product recommendations, or server info.')
        .addStringOption((o) =>
          o.setName('query').setDescription('Your question or request').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('persona')
        .setDescription('Inspect or switch active AI persona.')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Select persona type')
            .setRequired(false)
            .addChoices(
              { name: '🛎️ Concierge & Guide', value: 'concierge' },
              { name: '💰 Commerce & Sales Closer', value: 'sales_closer' },
              { name: '🛡️ Security Warden', value: 'security_warden' }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName('learn')
        .setDescription('Teach the AI new server knowledge and index into vector memory.')
        .addStringOption((o) =>
          o.setName('title').setDescription('Knowledge node title / topic').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('content').setDescription('Documentation text, FAQ answer, or rule').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('category').setDescription('Category (e.g. products, rules, faq)').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s.setName('status').setDescription('Inspect AI router health, persona, and vector memory stats.')
    ),

  async execute(interaction, client) {
    const aiStudio = client.runtime?.native?.aiStudio;
    const router = client.runtime?.agent?.router;
    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'ask') {
      const query = interaction.options.getString('query', true);
      await interaction.deferReply({ ephemeral: true });

      try {
        const persona = await aiStudio.getPersona(interaction.guildId);
        const completion = await router.complete({
          capability: 'conversation',
          messages: [
            { role: 'system', content: persona.systemPrompt },
            { role: 'user', content: query },
          ],
          contextTokens: 400,
          timeoutMs: 15_000,
        });

        return interaction.editReply({
          flags: V2,
          components: [
            panel({
              title: 'LOOP AI ASSISTANT',
              subtitle: `Persona: ${persona.name}`,
              body: completion.text || 'I could not generate an answer at this time.',
              footer: `Model: ${completion.profile || 'loop-neural-v1'} · Ingested RAG Knowledge Context`,
            }),
          ],
        });
      } catch (err) {
        return interaction.editReply({
          flags: V2,
          components: [
            notice({
              title: 'AI SERVICE NOTICE',
              body: `I am currently operating in offline fallback mode: **${query}**\n\nPlease check </help:0> or open a </ticket open:0> to contact human support.`,
            }),
          ],
        });
      }
    }

    if (sub === 'persona') {
      const selectedType = interaction.options.getString('type');
      if (selectedType) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: 'Manage Server permission is required.', ephemeral: true });
        }
        const updated = await aiStudio.setPersona(interaction.guildId, selectedType, null, ctx);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'AI PERSONA UPDATED',
              body: `Active AI Persona set to: **${updated.name}**\n\n> ${updated.description}`,
            }),
          ],
        });
      }

      const active = await aiStudio.getPersona(interaction.guildId);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'ACTIVE AI PERSONA',
            subtitle: active.name,
            body: `**Description:** ${active.description}\n\n**System Prompt Preview:**\n\`\`\`\n${active.systemPrompt}\n\`\`\``,
            buttons: [button.primary('panel:tab:ai', '⚙️ Open AI Studio Control Panel')],
          }),
        ],
      });
    }

    if (sub === 'learn') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'Manage Server permission is required.', ephemeral: true });
      }

      const title = interaction.options.getString('title', true);
      const content = interaction.options.getString('content', true);
      const category = interaction.options.getString('category') || 'general';

      const node = await aiStudio.ingestKnowledge({ guildId: interaction.guildId, title, category, content }, ctx);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'KNOWLEDGE NODE INGESTED',
            body: `Successfully learned and indexed **${node.title}** into semantic vector memory.`,
            footer: `Category: ${node.category} · Node ID: ${node.id}`,
          }),
        ],
      });
    }

    if (sub === 'status') {
      const persona = await aiStudio.getPersona(interaction.guildId);
      const nodes = await aiStudio.listKnowledgeNodes(interaction.guildId);
      const snapshot = router?.snapshot?.() || { status: 'online' };

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'AI STUDIO STATUS',
            subtitle: 'Autonomous Neural Engine',
            body:
              `> **Active Persona:** ${persona.name}\n` +
              `> **Vector Knowledge Nodes:** ${nodes.length} indexed\n` +
              `> **Router Status:** \`${snapshot.status || 'healthy'}\`\n` +
              `> **Context Tokens:** 128k supported (RAG assisted)`,
            buttons: [button.primary('panel:tab:ai', '⚙️ Manage in Control Panel')],
          }),
        ],
      });
    }
  },
};
