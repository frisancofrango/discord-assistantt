import { ActionRowBuilder, Events, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getProduct, THEME } from '../config.js';
import { panel, button, V2 } from '../ui/theme.js';
import { consume } from '../lib/pending.js';
import { logAction, fail } from '../lib/moderation.js';
import { withCorrelation, correlationId } from '../foundation/logger.js';
import { evaluatePolicy } from '../foundation/policy.js';
import { hashApprovalToken } from '../autonomy/proposal.js';
import { decisionPanel, progressPanel, receiptPanel, diffPanel } from '../autonomy/ui.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    return withCorrelation(null, async () => {
    try {
      if (interaction.isChatInputCommand()) return handleCommand(interaction, client);
      if (interaction.isButton()) return handleButton(interaction, client);
      if (interaction.isModalSubmit()) return handleModal(interaction, client);
    } catch (err) {
      client.logger.error({ err, interactionId: interaction.id }, 'interaction failed');
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [panel({ title: 'ERROR', body: 'Something went wrong.' })],
        }).catch(() => {});
      }
    }
    });
  },
};

async function handleCommand(interaction, client) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  await command.execute(interaction, client);
}

async function handleButton(interaction, client) {
  const [action, arg, token] = interaction.customId.split(':');
  if (action === 'azp') return handleProposalDecision(interaction, client, arg, token);
  if (action === 'azr') return handleRollback(interaction, client, arg, token);
  if (action === 'adm') return handleAdminButton(interaction, client, arg, token);

  switch (action) {
    case 'buy':
      return handleBuy(interaction, arg);
    case 'checkout':
      return handleCheckout(interaction, arg);
    case 'modconfirm':
      return handleModConfirm(interaction, client, arg);
    case 'ticket':
      if (arg === 'close') { await client.runtime.native.tickets.closeByMember(token, interaction.user.id, `interaction:${interaction.id}`); return interaction.update({ flags:V2, components:[panel({ title:'TICKET CLOSED', body:'Your ticket is closed. Staff can reopen it if follow-up is needed.' })] }); }
      return;
    case 'verify':
      if (arg === 'rules') { const challenge=await client.runtime.native.verification.acceptRules(token,interaction.user.id); const input=new TextInputBuilder().setCustomId('answer').setLabel(challenge.prompt).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32); return interaction.showModal(new ModalBuilder().setCustomId(`verify-answer:${token}`).setTitle('Azure Verification').addComponents(new ActionRowBuilder().addComponents(input))); }
      return;
    case 'modcancel':
      return interaction.update({
        flags: V2,
        components: [panel({ title: 'CANCELLED', body: 'No action was taken.' })],
      });
    default:
      return;
  }
}

async function handleModal(interaction, client) {
  const [action, sessionId] = interaction.customId.split(':');
  if (action !== 'verify-answer') return;
  const result = await client.runtime.native.verification.answer(sessionId, interaction.user.id, interaction.fields.getTextInputValue('answer'), {
    guildId: interaction.guildId,
    actor: { id:interaction.user.id, authenticated:true, guildMember:interaction.inGuild(), bot:interaction.user.bot, isOwner:interaction.guild?.ownerId===interaction.user.id, permissions:interaction.memberPermissions?.toArray?.()??[] },
    autonomy:'operator', idempotencyKey:`interaction:${interaction.id}`,
  });
  return interaction.reply({ flags:V2, ephemeral:true, components:[panel({ title:result.verified?'VERIFIED':result.status==='manual_review'?'MANUAL REVIEW':'TRY AGAIN', body:result.verified?'Your role grant was verified.':result.status==='manual_review'?'Attempt limit reached. Staff will review your session.':`That answer was not accepted. ${result.remaining} attempt(s) remain.` })] });
}

async function handleProposalDecision(interaction, client, action, token) {
  const autonomy=client.runtime.autonomy, grant=await autonomy.store.findApprovalToken(hashApprovalToken(token,autonomy.config.approvalTokenPepper));
  if(!grant)return interaction.update(decisionPanel('EXPIRED','This approval is invalid or expired.'));
  const proposal=autonomy.hydrate(await autonomy.store.getProposal(grant.proposal_id));
  if(action==='diff')return interaction.reply({...diffPanel(proposal),ephemeral:true});
  if(action==='close')return interaction.update(decisionPanel('CLOSED','Diff dismissed.'));
  const actor={id:interaction.user.id,guildId:interaction.guildId,authenticated:true,bot:interaction.user.bot,isOwner:interaction.guild?.ownerId===interaction.user.id,permissions:interaction.memberPermissions?.toArray?.()??[]};
  const map={all:'approve_all',partial:'approve_partial',reject:'reject',changes:'request_changes'},decisionName=map[action];
  if(!decisionName)return;
  const safe=proposal.machinePlan.steps.filter(s=>!s.irreversible&&s.risk!=='high').map(s=>s.id);
  try{const decision=await autonomy.approvals.decide({token,proposal,actor,decision:decisionName,selectedStepIds:safe,policy:{default:{autonomy:'operator'}},budget:{limit:client.runtime.agent.router?.budgetUsd??5,spent:0}});
    if(!decisionName.startsWith('approve'))return interaction.update(decisionPanel(decisionName==='reject'?'REJECTED':'CHANGES REQUESTED','No server changes were made.'));
    await interaction.update(progressPanel({goal:proposal.goal,status:'running',stage:'preflight',completed:0,total:decision.approved_step_ids?.length??decision.approvedStepIds.length}));
    const result=await autonomy.executor.start({proposal,decision,actor});return interaction.editReply(receiptPanel(result.receipt));
  }catch(error){return interaction.update(decisionPanel(error.escalation?'ESCALATION REQUIRED':'BLOCKED',error.message));}
}
async function handleRollback(interaction,client,mode,executionId){if(interaction.guild?.ownerId!==interaction.user.id)return interaction.reply({...decisionPanel('BLOCKED','Only the server owner can roll back this workflow.'),ephemeral:true});await interaction.update(progressPanel({goal:'Rollback',status:'running',stage:'compensation',completed:0,total:1}));const result=await client.runtime.autonomy.rollback.rollback({executionId,actor:{id:interaction.user.id,guildId:interaction.guildId,authenticated:true,isOwner:true},full:mode==='full',targetStage:mode==='full'?null:Number(mode)});return interaction.editReply(receiptPanel(result.receipt));}

async function handleAdminButton(interaction, client, arg, token) {
  if (interaction.guild?.ownerId !== interaction.user.id) return interaction.reply({ content:'Only the server owner can use the Azure console.', ephemeral:true });
  if (arg === 'close') return interaction.update({ flags: V2, components:[panel({ title:'AZURE · CONSOLE CLOSED', body:'Panel dismissed.' })] });
  if (arg === 'wipe') {
    const removed = await client.runtime.memory.forgetAll({ guildId: interaction.guildId });
    return interaction.update({ flags: V2, components:[panel({ title:'MEMORY WIPED', body:`Removed ${removed.removed} semantic memory row(s) for this server.` })] });
  }
  if (arg === 'refresh') {
    const { renderOwnerView } = await import('../commands/admin.js');
    const view = await renderOwnerView(client, interaction.guildId, token);
    if (view.error) return interaction.update(decisionPanel('ERROR', view.error));
    return interaction.update(view.panel);
  }
  return;
}

// ---- Sales flow ----------------------------------------------------------

function handleBuy(interaction, productId) {
  const product = getProduct(productId);
  if (!product) return fail(interaction, 'That product is no longer available.');

  const perks = product.perks.map((p) => `${THEME.glyph.check} ${p}`).join('\n');
  return interaction.reply({
    flags: V2,
    ephemeral: true,
    components: [
      panel({
        title: `CHECKOUT ${THEME.glyph.bullet} ${product.name}`,
        subtitle: product.tagline,
        body: `**Price:** ${product.price}\n\n${perks}`,
        footer: 'Click continue to proceed to payment.',
        buttons: [button.primary(`checkout:${product.id}`, 'Continue to Payment')],
      }),
    ],
  });
}

function handleCheckout(interaction, productId) {
  const product = getProduct(productId);
  if (!product) return fail(interaction, 'That product is no longer available.');

  // -----------------------------------------------------------------------
  // PAYMENT HOOK
  // Plug your payment provider in here. Typically you would create a
  // checkout/session server-side and hand the user a link button, e.g.:
  //
  //   const url = await stripe.checkout.sessions.create({ ... });
  //   buttons: [button.link(url, 'Pay Now')]
  //
  // For now we return a placeholder so the flow is end-to-end testable.
  // -----------------------------------------------------------------------
  return interaction.update({
    flags: V2,
    components: [
      panel({
        title: 'ALMOST THERE',
        body:
          `Order started for **${product.name}** (${product.price}).\n\n` +
          'Connect a payment provider in `handleCheckout()` to complete this step.',
        footer: 'No charge has been made.',
      }),
    ],
  });
}

// ---- Moderation confirmations -------------------------------------------

async function handleModConfirm(interaction, client, token) {
  const data = consume(token);
  if (!data) {
    return interaction.update({
      flags: V2,
      components: [panel({ title: 'EXPIRED', body: 'This confirmation has expired. Run the command again.' })],
    });
  }

  const permission = data.type === 'ban' ? 'BanMembers' : 'KickMembers';
  const decision = evaluatePolicy({
    domain: 'moderation',
    autonomy: 'operator',
    risk: 'high',
    actor: {
      authenticated: true,
      guildMember: Boolean(interaction.inGuild()),
      bot: interaction.user.bot,
      isOwner: interaction.guild?.ownerId === interaction.user.id,
      permissions: interaction.memberPermissions?.has(permission) ? [permission] : [],
    },
    requiredPermissions: [permission],
    approval: { status: 'approved' },
  });
  client.logger.info({ decision, action: data.type, actorId: interaction.user.id, guildId: interaction.guildId, correlationId: correlationId() }, 'moderation policy evaluated');
  if (client.runtime.state.database) {
    await client.runtime.repositories.audit.record({
      action: `discord.moderation.${data.type}`,
      domain: 'moderation',
      risk: 'high',
      decision: decision.allowed ? 'allowed' : 'denied',
      reason: decision.reason,
      correlation_id: correlationId(),
      metadata: { discordGuildId: interaction.guildId, discordActorId: interaction.user.id, discordTargetId: data.userId },
    }).catch((err) => client.logger.error({ err }, 'failed to persist policy audit'));
  }
  if (!decision.allowed) {
    return interaction.update({
      flags: V2,
      components: [panel({ title: 'BLOCKED', body: `Policy denied this action: ${decision.reason}.` })],
    });
  }

  const guild = interaction.guild;
  try {
    if (data.type === 'ban') {
      await guild.members.ban(data.userId, { reason: data.reason });
    } else if (data.type === 'kick') {
      const member = await guild.members.fetch(data.userId).catch(() => null);
      if (!member) throw new Error('Member left the server.');
      await member.kick(data.reason);
    }
  } catch (err) {
    console.error('[modconfirm]', err);
    return interaction.update({
      flags: V2,
      components: [panel({ title: 'FAILED', body: `Could not complete the ${data.type}. Check my permissions.` })],
    });
  }

  await interaction.update({
    flags: V2,
    components: [
      panel({
        title: data.type === 'ban' ? 'BANNED' : 'KICKED',
        body: `**${data.tag}** has been ${data.type === 'ban' ? 'banned' : 'kicked'}.`,
      }),
    ],
  });

  await logAction(client, {
    action: data.type === 'ban' ? 'Ban' : 'Kick',
    target: data.tag,
    moderator: interaction.user.tag,
    reason: data.reason,
  });
}
