import { authorize, NativeError, audit, stableHash } from './core.js';

export const AI_PERSONAS = {
  concierge: {
    id: 'concierge',
    name: 'Concierge & Guide',
    description: 'Helpful, warm, and clear server guide answering questions and assisting members.',
    systemPrompt: 'You are Azure Concierge, a helpful, polite, and efficient Discord assistant. You guide members through server rules, products, and support tickets with clarity and professionalism.',
  },
  sales_closer: {
    id: 'sales_closer',
    name: 'Commerce & Sales Closer',
    description: 'High-converting, value-driven shopping assistant highlighting live stock, deals, and digital assets.',
    systemPrompt: 'You are Azure Sales Specialist. You help customers discover digital products, explain pricing and Roblox 70/30 fee breakdowns, and assist with 1-click wallet and instant checkout.',
  },
  security_warden: {
    id: 'security_warden',
    name: 'Security Warden',
    description: 'Strict, rule-oriented anti-raid and moderation enforcer focusing on server safety.',
    systemPrompt: 'You are Azure Security Warden. You monitor server safety, enforce verification challenges, identify spam or raid patterns, and guide users to respect community guidelines.',
  },
};

export class AIStudioService {
  constructor({ db, memory, settings, logger }) {
    this.db = db;
    this.memory = memory;
    this.settings = settings;
    this.logger = logger;
  }

  async getPersona(guildId) {
    const s = await this.settings.getSettings(guildId);
    const personaKey = s.aiPersona || 'concierge';
    const persona = AI_PERSONAS[personaKey] || AI_PERSONAS.concierge;
    const customPrompt = s.metadata?.customAiPrompt || null;

    return {
      personaKey,
      name: persona.name,
      description: persona.description,
      systemPrompt: customPrompt || persona.systemPrompt,
      isCustom: Boolean(customPrompt),
    };
  }

  async setPersona(guildId, personaKey, customPrompt = null, ctx) {
    authorize(ctx, { domain: 'server_design', risk: 'high', permissions: ['ManageGuild'] });

    if (!AI_PERSONAS[personaKey] && personaKey !== 'custom') {
      throw new NativeError('invalid_persona', `Unknown AI persona: ${personaKey}`);
    }

    const updates = {
      aiPersona: personaKey,
      metadata: { customAiPrompt: customPrompt },
    };

    await this.settings.updateSettings(guildId, updates, ctx);

    await audit(this.db, ctx, {
      action: 'ai.set_persona',
      domain: 'server_design',
      risk: 'high',
      metadata: { personaKey, hasCustomPrompt: Boolean(customPrompt) },
    });

    return this.getPersona(guildId);
  }

  async ingestKnowledge({ guildId, title, category = 'documentation', content }, ctx) {
    authorize(ctx, { domain: 'server_design', risk: 'medium', permissions: ['ManageGuild'] });

    const cleanTitle = String(title || '').trim();
    const cleanContent = String(content || '').trim();

    if (!cleanTitle || !cleanContent) {
      throw new NativeError('invalid_knowledge', 'Title and content cannot be empty');
    }

    const hash = stableHash(`${cleanTitle}:${cleanContent}`);

    const row = (
      await this.db.query(
        `INSERT INTO ai_knowledge_nodes (guild_id, title, category, content, content_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id, content_hash) DO UPDATE SET
           title = EXCLUDED.title,
           category = EXCLUDED.category,
           content = EXCLUDED.content
         RETURNING *`,
        [guildId, cleanTitle, category, cleanContent, hash]
      )
    ).rows[0];

    // Index into Semantic Memory if available
    if (this.memory?.remember) {
      await this.memory.remember({
        guildId,
        userId: ctx.actor?.id || 'system',
        text: `[KNOWLEDGE: ${cleanTitle}] (${category})\n${cleanContent}`,
        source: `knowledge:${row.id}`,
      }).catch((err) => this.logger?.warn({ err: err.message }, 'failed to embed knowledge snippet'));
    }

    await audit(this.db, ctx, {
      action: 'ai.ingest_knowledge',
      domain: 'server_design',
      risk: 'medium',
      metadata: { title: cleanTitle, category },
    });

    return {
      id: row.id,
      guildId: row.guild_id,
      title: row.title,
      category: row.category,
      content: row.content,
      createdAt: row.created_at,
    };
  }

  async listKnowledgeNodes(guildId) {
    const rows = (
      await this.db.query(
        `SELECT * FROM ai_knowledge_nodes WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [guildId]
      )
    ).rows;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      content: r.content,
      createdAt: r.created_at,
    }));
  }
}
