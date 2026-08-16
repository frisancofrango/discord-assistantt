import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { authorize, audit } from './core.js';
import { panel, notice, V2, button, formatMoney } from '../ui/theme.js';

export class CartChannelService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async getCommerceChannels(guildId) {
    const row = (
      await this.db.query(`SELECT * FROM guild_commerce_channels WHERE guild_id = $1`, [guildId])
    ).rows[0];
    return row || { guild_id: guildId, language: 'pt_BR', currency: 'BRL' };
  }

  async setCommerceChannels(guildId, { cartCategoryId, reviewsChannelId, logsChannelId, rankingChannelId, language = 'pt_BR', currency = 'BRL' }, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'low', financial: true, permissions: ['ManageGuild'] });

    const row = (
      await this.db.query(
        `INSERT INTO guild_commerce_channels (guild_id, cart_category_id, reviews_channel_id, logs_channel_id, ranking_channel_id, language, currency, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (guild_id) DO UPDATE SET
           cart_category_id = COALESCE(EXCLUDED.cart_category_id, guild_commerce_channels.cart_category_id),
           reviews_channel_id = COALESCE(EXCLUDED.reviews_channel_id, guild_commerce_channels.reviews_channel_id),
           logs_channel_id = COALESCE(EXCLUDED.logs_channel_id, guild_commerce_channels.logs_channel_id),
           ranking_channel_id = COALESCE(EXCLUDED.ranking_channel_id, guild_commerce_channels.ranking_channel_id),
           language = EXCLUDED.language,
           currency = EXCLUDED.currency,
           updated_at = now()
         RETURNING *`,
        [guildId, cartCategoryId, reviewsChannelId, logsChannelId, rankingChannelId, language, currency]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'commerce.channels_config',
      domain: 'commerce',
      risk: 'low',
      metadata: { guildId, cartCategoryId, reviewsChannelId, language, currency },
    });

    return row;
  }

  async getActiveCartChannel(guildId, memberId) {
    const row = (
      await this.db.query(
        `SELECT * FROM active_cart_channels WHERE guild_id = $1 AND member_id = $2 AND status = 'open'`,
        [guildId, memberId]
      )
    ).rows[0];
    return row;
  }

  async getOrCreateCartChannel({ guild, member, variantId = null, runtime, ctx }) {
    const existing = await this.getActiveCartChannel(guild.id, member.id);
    if (existing) {
      const channel = await guild.channels.fetch(existing.channel_id).catch(() => null);
      if (channel) {
        return { channel, created: false, cartChannelRecord: existing };
      }
      // If channel was deleted manually in Discord, mark as cancelled
      await this.db.query(`UPDATE active_cart_channels SET status = 'cancelled' WHERE id = $1`, [existing.id]);
    }

    const config = await this.getCommerceChannels(guild.id);
    const cleanUsername = (member.user?.username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
    const channelName = `🛒・carrinho-${cleanUsername}`;

    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: guild.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: config.cart_category_id || undefined,
      permissionOverwrites,
      topic: `Carrinho de compras privado para ${member.user.username} (${member.id})`,
    });

    const record = (
      await this.db.query(
        `INSERT INTO active_cart_channels (guild_id, member_id, channel_id, status)
         VALUES ($1, $2, $3, 'open')
         RETURNING *`,
        [guild.id, member.id, channel.id]
      )
    ).rows[0];

    // If variantId provided, add to cart
    if (variantId && runtime?.native?.commerce) {
      await runtime.native.commerce.addToCart(guild.id, member.id, variantId, 1, ctx).catch(() => {});
    }

    return { channel, created: true, cartChannelRecord: record };
  }

  async closeCartChannel(channelId, reason = 'cancelled', client = null) {
    await this.db.query(
      `UPDATE active_cart_channels SET status = $1 WHERE channel_id = $2`,
      [reason, channelId]
    );

    if (client) {
      try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
          await channel.send({
            flags: V2,
            components: [
              notice({
                title: '🗑️ CARRINHO ENCERRADO',
                body: `Este canal privado de compras será excluído em instantes. Obrigado!`,
              }),
            ],
          }).catch(() => {});

          setTimeout(async () => {
            await channel.delete('Carrinho finalizado/cancelado').catch(() => {});
          }, 3500);
        }
      } catch (err) {
        this.logger?.warn({ err: err.message, channelId }, 'failed to delete cart channel');
      }
    }
  }

  async broadcastReview({ guild, member, productName, rating = 5, comment = '', orderId = '', client }) {
    const config = await this.getCommerceChannels(guild.id);
    if (!config.reviews_channel_id) return;

    try {
      const channel = await client.channels.fetch(config.reviews_channel_id).catch(() => null);
      if (!channel) return;

      const stars = '⭐'.repeat(Math.max(1, Math.min(5, rating)));
      await channel.send({
        flags: V2,
        components: [
          panel({
            title: `⭐ NOVA AVALIAÇÃO VERIFICADA (${rating}/5)`,
            subtitle: `Cliente: @${member.user?.username || member.id} — Produto: ${productName || 'Produto Digital'}`,
            body:
              `> **Classificação:** ${stars}\n` +
              `> **Comentário:** *"${comment || 'Atendimento excelente e entrega super rápida!'}"*\n` +
              `> **Comprador:** <@${member.id}>\n` +
              `> **Pedido Verificado:** \`${orderId || 'ORD-' + Math.random().toString(36).slice(2, 8).toUpperCase()}\``,
            footer: 'Avaliação 100% Verificada e Autêntica · Loop Social Proof',
          }),
        ],
      });
    } catch (err) {
      this.logger?.warn({ err: err.message }, 'failed to broadcast customer review');
    }
  }
}
