import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMapPatch, agentTools } from '../lib/map-actions';
import { initialMap, initialSettings } from '../lib/model';
import {
  providerEndpoint,
  providerRequest,
  normalizeResponse,
  toolResultMessages,
  relayHosts,
} from '../lib/provider';
import { POST as agent } from '../app/api/agent/route';
import { POST as research } from '../app/api/research/route';
const names = ['France', 'Germany'];
test('map edits are atomic, validated and do not mutate undo snapshots', () => {
  const before = structuredClone(initialMap);
  const next = applyMapPatch(
    before,
    {
      countries: [{ name: 'France', color: '#147d92', label: 'Example' }],
      legend: [{ label: 'Example', color: '#147d92' }],
    },
    names,
  );
  assert.deepEqual(before, initialMap);
  assert.equal(next.countries.France.label, 'Example');
  assert.throws(
    () =>
      applyMapPatch(
        next,
        {
          countries: [
            { name: 'Germany', color: '#ffffff' },
            { name: 'Atlantis', color: '#ffffff' },
          ],
        },
        names,
      ),
    /Unknown country/,
  );
  assert.equal(next.countries.Germany, undefined);
  assert.throws(() =>
    applyMapPatch(
      next,
      { countries: [{ name: 'France', color: 'url(https://evil.test)' }] },
      names,
    ),
  );
  assert.throws(() => applyMapPatch(next, { projection: 'Fake projection' }, names));
  assert.deepEqual(applyMapPatch(next, { reset: true }, names).countries, {});
  assert.deepEqual(
    applyMapPatch(next, { countries: [{ name: 'France', color: null, label: null }] }, names)
      .countries,
    {},
  );
});
test('provider endpoints preserve custom bases and reject credential-bearing URLs', () => {
  assert.equal(
    providerEndpoint(initialSettings).href,
    'https://api.openai.com/v1/chat/completions',
  );
  assert.equal(
    providerEndpoint({ ...initialSettings, baseUrl: 'https://openrouter.ai/api/v1/' }).href,
    'https://openrouter.ai/api/v1/chat/completions',
  );
  assert.equal(
    providerEndpoint({
      ...initialSettings,
      format: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
    }).href,
    'https://api.anthropic.com/v1/messages',
  );
  assert.throws(() =>
    providerEndpoint({ ...initialSettings, baseUrl: 'https://key@example.com/v1' }),
  );
  assert.throws(() =>
    providerEndpoint({ ...initialSettings, baseUrl: 'http://localhost:8080/v1' }),
  );
  assert.equal(relayHosts.has('api.openai.com.evil.test'), false);
});
for (const format of ['openai', 'responses', 'anthropic'] as const)
  test(`${format} translates tool calls and results`, () => {
    const config = { ...initialSettings, format, model: 'test-model', apiKey: 'test-key' };
    const request = providerRequest(
      config,
      [{ role: 'user', content: 'Color France' }],
      'system',
      agentTools,
    );
    assert.equal(request.body.model, 'test-model');
    assert.equal(
      format === 'anthropic' ? request.headers['x-api-key'] : request.headers.Authorization,
      format === 'anthropic' ? 'test-key' : 'Bearer test-key',
    );
    const input = { countries: [{ name: 'France', color: '#147d92' }] };
    const data =
      format === 'openai'
        ? {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call-1',
                      type: 'function',
                      function: { name: 'edit_map', arguments: JSON.stringify(input) },
                    },
                  ],
                },
              },
            ],
          }
        : format === 'anthropic'
          ? { content: [{ type: 'tool_use', id: 'call-1', name: 'edit_map', input }] }
          : {
              output: [
                {
                  type: 'function_call',
                  call_id: 'call-1',
                  name: 'edit_map',
                  arguments: JSON.stringify(input),
                },
              ],
            };
    const normalized = normalizeResponse(format, data);
    assert.deepEqual(normalized.calls, [{ id: 'call-1', name: 'edit_map', input }]);
    const results = toolResultMessages(format, [{ id: 'call-1', result: { applied: true } }]);
    assert.match(JSON.stringify(results), /call-1/);
    assert.match(JSON.stringify(results), /applied/);
  });
test('server rejects unlisted relay destinations before making a request', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Should not fetch');
  });
  const response = await agent(
    new Request('https://atlas.test/api/agent', {
      method: 'POST',
      body: JSON.stringify({
        settings: {
          ...initialSettings,
          baseUrl: 'https://127.0.0.1/v1',
          model: 'test',
          apiKey: 'test-key',
        },
        history: [{ role: 'user', content: 'hello' }],
        map: initialMap,
        names,
      }),
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(fetchMock.mock.callCount(), 0);
});
test('provider relay returns tool calls without returning the key', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: any) => {
    assert.equal(options.redirect, 'manual');
    return Response.json({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Done',
            tool_calls: [
              {
                id: '1',
                type: 'function',
                function: { name: 'edit_map', arguments: '{"title":"Test map"}' },
              },
            ],
          },
        },
      ],
    });
  });
  const response = await agent(
    new Request('https://atlas.test/api/agent', {
      method: 'POST',
      body: JSON.stringify({
        settings: { ...initialSettings, model: 'test', apiKey: 'secret-fixture' },
        history: [{ role: 'user', content: 'hello' }],
        map: initialMap,
        names,
      }),
    }),
  );
  assert.equal(response.status, 200);
  const raw = await response.text();
  assert.ok(!raw.includes('secret-fixture'));
  assert.match(raw, /edit_map/);
});
test('research strips search markup and provides article source links', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ query: { search: [{ title: 'France', snippet: 'A <span>country</span>.' }] } }),
  );
  const response = await research(
    new Request('https://atlas.test/api/research', {
      method: 'POST',
      body: JSON.stringify({ source: 'wikipedia', query: 'France' }),
    }),
  );
  const data = (await response.json()) as any;
  assert.equal(data.result[0].snippet, 'A country.');
  assert.equal(data.sources[0].url, 'https://en.wikipedia.org/wiki/France');
});
test('research refuses external SPARQL services and malformed indicator codes', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Should not fetch');
  });
  for (const input of [
    { source: 'wikidata_query', query: 'SELECT ?x WHERE { SERVICE <https://example.com> {} }' },
    { source: 'worldbank', query: '../../secret' },
  ]) {
    const response = await research(
      new Request('https://atlas.test/api/research', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
    assert.equal(response.status, 400);
  }
  assert.equal(mock.mock.callCount(), 0);
});
