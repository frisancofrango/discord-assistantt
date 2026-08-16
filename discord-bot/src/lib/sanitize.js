// Hardening for model output before it reaches chat. Strips leaked
// chain-of-thought ("Looking at this, I need to understand..."), fabricated
// chat-transcript scaffolding ("Loop APP — 5:43 PM", "Loop is typing...",
// " — 5:44 PM"), and echo/repetition the model emits when it loops on a
// question. Pure text in, cleaned text out. Runtime control markers
// (##NO_REPLY##, ##REACT:..##, ##GHOSTEDIT##) are left untouched.

const apostrophe = (t) => String(t).replace(/[\u2018\u2019`]/g, "'");

// "Loop APP — 5:43 PM", "6zzy — 5:42 PM", or a stray " — 5:44 PM" tail line.
const transcriptLine = /^\s*[^@#\n]{0,40}\s*(?:—|–)\s*\d{1,2}:\d{2}\b[^\n]{0,60}$/;
// "Loop is typing..." and friends.
const typingLine = /^[^#\n]{1,40}\s+is\s+typing\.{2,}$/i;
// Chain-of-thought / coding-assistant lead-ins (leading or trailing lines only).
const cotLead = /^(?:looking at this[,.]?|let(?:'s| me) (?:start|begin|take a look at|look|check|explore|see|read|investigate|dig|search|understand)|i need to (?:understand|see|check|look)|i(?:'m|'ll| will) (?:go(?:ing)? to )?(?:look|check|explore|see|read|open|inspect|examine|search|investigate|dig|start)|first[,:]?\s+i (?:need|should|want)|my (?:next )?step is|so[,;]?\s+let(?:'s| me) (?:start|begin|look|check|explore))[^\n]{0,220}$/i;

const normalize = (t) => apostrophe(t).toLowerCase().replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim();
const baseWords = (t) => (normalize(t).match(/[a-z0-9']{2,}/g) ?? []).filter((w) => w.length >= 3);

function overlap(a, b) {
  const wa = baseWords(a);
  const wb = baseWords(b);
  if (!wa.length || !wb.length) return 0;
  const set = new Set(wb);
  const shared = wa.filter((w) => set.has(w)).length;
  return shared / Math.min(wa.length, wb.length);
}

// Drop repeated sentences inside a single paragraph, keeping the first.
// Handles exact duplicates and truncated near-duplicates: when a later
// sentence's words all appear, in order, inside what was already kept (e.g.
// "6zzy, what specifically needs fixing? ... 🤔6zzy, what specifically needs
// fixing? ..."), the echo is a faded copy of the earlier sentence — drop it.
function collapseSentences(p) {
  const parts = p.match(/[^.!?\n\p{Extended_Pictographic}]+(?:\p{Extended_Pictographic}+|[.!?]+)?/gu) ?? [p];
  const seen = new Set();
  const kept = [];
  let acc = [];
  for (const s of parts) {
    const n = normalize(s);
    const words = baseWords(s);
    const dup = n.length >= 3 && seen.has(n);
    let echo = false;
    if (!dup && words.length >= 4 && words.length <= acc.length) {
      let i = 0;
      for (const w of acc) {
        if (w === words[i]) i++;
        if (i === words.length) { echo = true; break; }
      }
    }
    if (dup || echo) continue;
    if (n.length >= 3) seen.add(n);
    kept.push(s);
    acc = acc.concat(words).slice(-80);
  }
  return kept.join('').trim();
}

// Cut model drafts that stitch a SECOND reply onto the first with no newline
// ("...when you can.alright, so there's no bot code in this workspace. what i
// can do is build you..."). The seam is a giveaway phrase — everything from it
// onward is a spent draft, not the live answer. Keep the prefix up to the
// seam, trimmed to the last sentence boundary.
const seamPatterns = [
  /\bthere'?s\s+no\s+(?:bot|code)\s+(?:code\s+)?in\s+(?:this\s+)?workspace\b/i,
  /\bi\s+can'?t\s+(?:directly\s+)?(?:modify|edit|change|deploy|touch)\s+(?:your\s+)?(?:discord\s+)?server\b/i,
  /\bwhat\s+i\s+can\s+do\s+is\s+(?:build|write|set\s*up)\b/i,
  /\bwant\s+me\s+to\s+build\s+out\s+these\s+templates\b/i,
];
function seamCut(text) {
  let at = -1;
  for (const re of seamPatterns) {
    const m = re.exec(text);
    if (m && (at === -1 || m.index < at)) at = m.index;
  }
  if (at < 0) return text;
  const prefix = text.slice(0, at);
  const cut = Math.max(prefix.lastIndexOf('.'), prefix.lastIndexOf('?'), prefix.lastIndexOf('!'), prefix.lastIndexOf('\n'));
  return (cut > 0 ? prefix.slice(0, cut + 1) : prefix).trim();
}

// Drop consecutive echo paragraphs: look-alike restatements the model stacks
// when it loops on a question.
export function collapseRepeats(text) {
  const paragraphs = String(text ?? '').split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length) return '';
  const out = [];
  let prev = null;
  for (const p of paragraphs) {
    const collapsed = collapseSentences(p);
    if (prev) {
      if (normalize(prev) === normalize(collapsed)) continue;
      const min = Math.min(baseWords(prev).length, baseWords(collapsed).length);
      if (min >= 3 && overlap(prev, collapsed) >= 0.4) continue;
    }
    if (collapsed) {
      out.push(collapsed);
      prev = collapsed;
    }
  }
  return out.join('\n\n');
}

// Dangling "##REACT:" marker (no emoji) renders as gibberish in chat — drop it.
const danglingReact = /##REACT:[ \t]*#*(?=\s*(?:\n|$))/gi;

export function sanitizeReply(text) {
  const lines = apostrophe(seamCut(text)).split('\n');
  const kept = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (transcriptLine.test(t) || typingLine.test(t)) continue;
    kept.push(line);
  }
  while (kept.length && cotLead.test(kept[0].trim())) kept.shift();
  while (kept.length && cotLead.test(kept[kept.length - 1].trim())) kept.pop();
  const joined = kept.join('\n').replace(danglingReact, '').trim();
  return collapseRepeats(joined);
}