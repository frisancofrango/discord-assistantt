import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReply, collapseRepeats } from '../src/lib/sanitize.js';

test('sanitizeReply strips fabricated transcript scaffolding', () => {
  const leaky = `Loop APP — 5:43 PM
honestly not much yet. just this conversation and that you're the server owner. memory's pretty empty otherwise.
Loop is typing...
— 5:44 PM
told you, just this conversation and you owning the place. memory's still basically blank.
Looking at this, I need to understand how the Loop bot's memory system currently works. Let me explore the codebase to see the implementation.`;
  const out = sanitizeReply(leaky);
  assert.equal(out.includes('5:43 PM'), false);
  assert.equal(out.includes('typing...'), false);
  assert.equal(out.includes('5:44 PM'), false);
  assert.equal(out.includes('Looking at this'), false);
  assert.equal(out.includes('explore the codebase'), false);
  assert.equal(out.includes("memory's pretty empty otherwise."), true);
});

test('sanitizeReply collapses repeated echo answers', () => {
  const out = sanitizeReply('yeah all good. errything running smooth.\n\nyeah all good, errything running smooth. shop is fine.');
  assert.equal(out, 'yeah all good. errything running smooth.');
});

test('sanitizeReply collapses exact short paragraph echoes', () => {
  assert.equal(sanitizeReply('anytime\nanytime'), 'anytime');
  assert.equal(sanitizeReply('ok now.\n\nok now.'), 'ok now.');
});

test('sanitizeReply collapses paraphrased loop variants', () => {
  const out = sanitizeReply("nice try, but my code doesn't come with that feature.\n\nanyway, you still owe me a rematch on rock paper scissors.\n\ntold you, i'm still waiting on that rematch.");
  assert.equal(out.includes("still waiting on that rematch"), false);
  assert.equal(out.includes("owe me a rematch"), true);
});

test('sanitizeReply strips dangling ##REACT: markers', () => {
  assert.equal(sanitizeReply('yeah, told you. all good now 👍\n\n##REACT:'), 'yeah, told you. all good now 👍');
});

test('sanitizeReply keeps legitimate short chatter untouched', () => {
  assert.equal(sanitizeReply('doin good, still chillin in the shop. you checking in again? 😎'), 'doin good, still chillin in the shop. you checking in again? 😎');
});

test('sanitizeReply preserves runtime control markers', () => {
  assert.equal(sanitizeReply('##NO_REPLY##'), '##NO_REPLY##');
  assert.equal(sanitizeReply('##REACT:🔥'), '##REACT:🔥');
  assert.equal(sanitizeReply('##GHOSTEDIT## fixed it'), '##GHOSTEDIT## fixed it');
});

test('collapseRepeats drops exact duplicate consecutive paragraphs', () => {
  assert.equal(collapseRepeats('the shop is running smooth\n\nthe shop is running smooth'), 'the shop is running smooth');
});

test('sanitizeReply trims to empty when everything is scaffolding', () => {
  assert.equal(sanitizeReply('Loop APP — 5:43 PM\nLoop is typing...\nLooking at this, I need to see the codebase.'), '');
});

test('sanitizeReply collapses truncated near-duplicate sentences inside one paragraph', () => {
  const out = sanitizeReply('6zzy, what specifically needs fixing? the structure, channels, rules, something else? give me a bit more to work with than "bloody mess" 🤔6zzy, what specifically needs fixing? give me a bit more to work with than "bloody mess" 🤔');
  assert.equal(out.includes('give me a bit more to work with than "bloody mess"'), true);
  assert.equal((out.match(/what specifically needs fixing/g) ?? []).length, 1);
});

test('sanitizeReply keeps distinct sentences that merely share words', () => {
  const out = sanitizeReply('i love this server. i love this channel more.');
  assert.equal(out, 'i love this server. i love this channel more.');
});

test('sanitizeReply cuts stitched draft seams', () => {
  const out = sanitizeReply("i'll get started on the structure while you answer those. lemme know when you can.alright, so there's no bot code in this workspace. i can't directly modify your Discord server from here. what i can do is build you everything you need.");
  assert.equal(out, "i'll get started on the structure while you answer those. lemme know when you can.");
});

test('sanitizeReply keeps normal chat with similar phrasing intact', () => {
  const out = sanitizeReply('alright, so there\'s no rush on the listings. take your time.');
  assert.equal(out, 'alright, so there\'s no rush on the listings. take your time.');
});