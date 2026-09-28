import assert from 'node:assert/strict';
import test from 'node:test';
import { initialMap } from '../lib/model';
import {
  emptyLibrary,
  saveChat,
  deleteChat,
  parseLibrary,
  serializeLibrary,
  conversationFromMessages,
} from '../lib/chat-history';
test('saved chats keep independent map and conversation snapshots', () => {
  const map = structuredClone(initialMap);
  map.countries.France = { color: '#147d92', label: 'France' };
  const messages = [{ id: 1, role: 'user' as const, text: 'Color France' }];
  const one = saveChat(emptyLibrary(), 'one', map, messages, 1);
  map.countries.France.color = '#ffffff';
  messages[0].text = 'changed';
  assert.equal(one.chats[0].map.countries.France.color, '#147d92');
  assert.equal(one.chats[0].title, 'Color France');
  const two = saveChat(
    one,
    'two',
    { ...initialMap, projection: 'Equal Earth' },
    [{ id: 2, role: 'user', text: 'A second map' }],
    2,
  );
  const restored = parseLibrary(serializeLibrary(two));
  assert.equal(restored.activeId, 'two');
  assert.equal(restored.chats[1].map.countries.France.label, 'France');
  assert.equal(restored.chats[0].map.projection, 'Equal Earth');
});
test('individual and all deletions survive serialization without reviving maps', () => {
  let library = saveChat(emptyLibrary(), 'one', initialMap, [], 1);
  library = saveChat(library, 'two', initialMap, [], 2);
  const otherDeleted = deleteChat(library, 'one');
  assert.equal(otherDeleted.activeId, 'two');
  assert.equal(otherDeleted.chats.length, 1);
  const activeDeleted = deleteChat(library, 'two');
  assert.equal(activeDeleted.activeId, null);
  assert.equal(activeDeleted.chats[0].id, 'one');
  assert.deepEqual(parseLibrary(serializeLibrary(emptyLibrary())), emptyLibrary());
});
test('serialization excludes provider keys and wire payloads; invalid saved maps are rejected', () => {
  const library = saveChat(emptyLibrary(), 'one', initialMap, [], 1);
  const extra = {
    ...library,
    apiKey: 'secret',
    settings: { apiKey: 'secret' },
    chats: [{ ...library.chats[0], wire: [{ apiKey: 'secret' }], apiKey: 'secret' }],
  };
  assert.ok(!serializeLibrary(extra).includes('secret'));
  assert.throws(() => parseLibrary('{invalid'));
  assert.throws(() =>
    parseLibrary(
      JSON.stringify({
        ...library,
        chats: [{ ...library.chats[0], map: { ...initialMap, projection: 'Invalid' } }],
      }),
    ),
  );
  assert.equal(parseLibrary(JSON.stringify({ ...library, activeId: 'missing' })).activeId, null);
});
test('restored conversations use portable text with research sources', () => {
  const messages = conversationFromMessages([
    { id: 1, role: 'user', text: 'Map France' },
    {
      id: 2,
      role: 'activity',
      text: 'Read source',
      sources: [{ title: 'France', url: 'https://en.wikipedia.org/wiki/France' }],
    },
    { id: 3, role: 'error', text: 'Old provider error' },
  ]);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[1].role, 'assistant');
  assert.match(String(messages[1].content), /https:\/\/en.wikipedia.org/);
});
