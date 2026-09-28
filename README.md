# Atlas — Map Studio

An AI-assisted world map editor for creating maps to share on r/MapPorn. The home page is the map workspace, with an AI assistant on the right (below the map on narrow screens).

## Run locally

Requires Node.js 22.13+ and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by the server (normally `http://localhost:5173`).

```sh
npm run typecheck  # TypeScript validation
npm test           # Map validation, provider adapters, and API boundary tests
npm run build      # Build the Cloudflare-compatible application
npm start          # Preview the built application locally
npm run format     # Format application code with Prettier
npm run lint       # ESLint (includes bundled starter components)
```

## Map workspace

- Mercator by default, with Equal Earth, Natural Earth, Equirectangular, and Globe projections.
- Click a country to set its color and label; use Map details for title, subtitle, and country names.
- Scroll or use the zoom buttons; drag to pan and use Fit world to reset the view.
- AI tool calls apply immediately. Undo restores the previous map edit; up to 50 edits are retained in memory.
- Export the current viewport, title, subtitle, and legend as PNG or editable SVG. These are local downloads, not automatic Reddit posts.
- System appearance by default; the header control cycles System → Light → Dark.
- Chats and their latest maps are saved automatically in this browser. Use Chat history to reopen a conversation and restore its map. New chat starts a fresh map. Delete an individual chat or all chats with confirmation. Deleting the active chat opens a blank map. History is device-local and does not sync between browsers; clearing site data removes it. Undo history resets when opening a saved chat. Browser storage failures are shown without discarding the map in the open tab.

## Configure an AI provider

Open Settings and enter an API format, base URL, exact model ID, and API key. Select a model supporting function/tool calls. No key is required for manual editing.

| Format | Example base URL | Endpoint appended |
| --- | --- | --- |
| OpenAI-compatible Chat Completions | `https://api.openai.com/v1` | `/chat/completions` |
| OpenAI-compatible Responses | `https://api.openai.com/v1` | `/responses` |
| Claude-compatible Messages | `https://api.anthropic.com/v1` | `/messages` |
| OpenRouter (Chat Completions) | `https://openrouter.ai/api/v1` | `/chat/completions` |
| Groq (Chat Completions) | `https://api.groq.com/openai/v1` | `/chat/completions` |

Base URLs may already include the endpoint. Only HTTPS without URL credentials, query strings, or custom ports is accepted. Other compatible providers are supported; compatibility depends on their tool-calling implementation. Responses mode is available for models that require it.

API keys remain in React memory and are cleared on reload. The format, URL, model ID, and theme persist in local browser preferences. Conversation transcripts and map snapshots are stored separately under `atlas.chat-history.v1`; provider keys and raw API payloads are excluded. Restored conversations continue using portable text messages and source links with the currently configured provider. Requests to the exact provider host allowlist in `lib/provider.ts` use a transient server relay. The app does not store or log those keys; they do pass through the server to the selected provider. Unlisted hosts are called directly by the browser and must allow CORS. The app never proxies arbitrary URLs or follows provider redirects. Providers receive conversation, current map, and retrieved research; their billing and retention rules apply.

## Research and map tools

The assistant receives validated `edit_map` and `research` tools. The browser runs a bounded loop (10 model rounds, at most 12 tool calls per round), reports progress, and offers Stop. Invalid country names, colors, or projections reject the entire edit before changing the map. Retrieved source text is treated as untrusted data, and citations appear below research events.

Research uses public endpoints without a search subscription:

- [Wikipedia search](https://www.mediawiki.org/wiki/API:Search) and plain-text article extracts.
- [Wikidata](https://www.wikidata.org/wiki/Wikidata:Data_access) entity search, entity claims, and bounded SELECT queries; external SPARQL services are disabled.
- [World Bank indicators](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures), using an explicit year or the most recent nonempty observation. Observations may have different years and include regional aggregates, which the agent must exclude when matching countries.

This is structured public-data research, not unrestricted web search. Upstream availability, rate limits, and model judgment affect results. Verify dates, units, missing data, and source claims before sharing a statistical map. The bundled [World Atlas](https://github.com/topojson/world-atlas) data uses generalized Natural Earth 1:50m country/territory boundaries and is not a statement on disputed borders. Tiny territories may be absent. Labels use the largest land polygon as their anchor.

## Architecture

- `app/page.tsx`: editor, undo history, session-only provider key, and agent loop.
- `components/world-map.tsx`: SVG geography, projections, pan, and zoom.
- `lib/map-actions.ts`: atomic map actions and tool schemas.
- `lib/provider.ts`: Chat Completions, Responses, and Claude wire adapters.
- `app/api/agent/route.ts`: allowlisted provider relay.
- `app/api/research/route.ts`: restricted public-data retrieval.
- `lib/export-map.ts`: self-contained SVG and PNG downloads.
- `lib/chat-history.ts`: versioned, validated browser history and immutable map snapshots.
- `components/chat-history.tsx`: saved-chat picker and deletion confirmations.
- `tests/*.test.ts`: core and saved-history regression tests.

Optional `document.modelContext` tools expose `read_map` and `edit_map` using the same map state. Browsers without that experimental API ignore the integration. Registration and state transitions were exercised with a test shim; native WebMCP validation was unavailable.

## Validation

Core tests and TypeScript checks pass. Browser checks cover projection switching, zoom, manual styles, undo after asynchronous AI edits, theme changes, provider validation, no key persistence, a mocked research/tool loop, both export formats, and narrow-screen overflow. Wikipedia and Wikidata were tested live. A paid-provider round trip requires a visitor's own key and was not run. No shared provider credential is bundled.

History browser checks cover two independent AI-created maps, switching and refreshing, continuing a restored chat after configuring a provider, deletion cancellation, individual deletion of active/inactive chats, bulk deletion surviving reload, mobile layout, and full/disabled storage feedback.

