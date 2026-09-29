'use client';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Globe2,
  Settings2,
  Sparkles,
  ArrowUp,
  Compass,
  Layers,
  Download,
  Undo2,
  Moon,
  Sun,
  Monitor,
  X,
  Square,
  ExternalLink,
  Pencil,
  Check,
  RotateCcw,
} from 'lucide-react';
import WorldMap, { countryNames } from '@/components/world-map';
import {
  initialMap,
  initialSettings,
  projections,
  palette,
  type Projection,
  type MapState,
  type ProviderSettings,
} from '@/lib/model';
import { applyMapPatch, agentTools, editMapParameters } from '@/lib/map-actions';
import {
  settingsSchema,
  providerEndpoint,
  relayHosts,
  providerRequest,
  normalizeResponse,
  toolResultMessages,
  systemPrompt,
  type WireMessage,
} from '@/lib/provider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { exportMap } from '@/lib/export-map';
import ChatHistory from '@/components/chat-history';
import {
  HISTORY_KEY,
  emptyLibrary,
  parseLibrary,
  saveChat,
  deleteChat,
  serializeLibrary,
  conversationFromMessages,
  type Message,
  type SavedChat,
  type ChatLibrary,
} from '@/lib/chat-history';
type Theme = 'system' | 'light' | 'dark';
const suggestions = [
  'Highlight the Nordic countries',
  'Map population across Europe',
  'Label the largest countries',
];
export default function Home() {
  const [map, setMap] = useState<MapState>(initialMap);
  const mapRef = useRef(map);
  const [past, setPast] = useState<MapState[]>([]);
  const pastRef = useRef<MapState[]>([]);
  const [settings, setSettings] = useState<ProviderSettings>(initialSettings);
  const [draft, setDraft] = useState<ProviderSettings>(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [theme, setTheme] = useState<Theme>('system');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [activity, setActivity] = useState('');
  const history = useRef<WireMessage[]>([]);
  const abort = useRef<AbortController | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [color, setColor] = useState(palette[0]);
  const [label, setLabel] = useState('');
  const [titleOpen, setTitleOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState({ title: '', subtitle: '' });
  const [notice, setNotice] = useState('');
  const messageId = useRef(0);
  const messagesRef = useRef<Message[]>([]);
  const libraryRef = useRef<ChatLibrary>(emptyLibrary());
  const [chats, setChats] = useState<SavedChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState('');
  const historyReady = useRef(false);
  const persistenceBlocked = useRef(false);
  function persistLibrary(next: ChatLibrary) {
    libraryRef.current = next;
    setChats(next.chats);
    setActiveChatId(next.activeId);
    if (persistenceBlocked.current) return;
    try {
      localStorage.setItem(HISTORY_KEY, serializeLibrary(next));
      setHistoryError('');
    } catch {
      setHistoryError(
        'History could not be saved. Browser storage may be full or disabled. Keep this tab open and export your map.',
      );
    }
  }
  function saveCurrentChat() {
    if (!historyReady.current) return;
    const id = libraryRef.current.activeId || crypto.randomUUID();
    persistLibrary(saveChat(libraryRef.current, id, mapRef.current, messagesRef.current));
  }
  function restoreChat(chat?: SavedChat) {
    const nextMap = structuredClone(chat?.map ?? initialMap);
    const nextMessages = structuredClone(chat?.messages ?? []);
    mapRef.current = nextMap;
    setMap(nextMap);
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    history.current = conversationFromMessages(nextMessages);
    messageId.current = Math.max(0, ...nextMessages.map((m) => m.id));
    pastRef.current = [];
    setPast([]);
    setPrompt('');
    setSelected('');
    setTitleOpen(false);
  }
  function newChat() {
    if (busyRef.current) return;
    persistLibrary({ ...libraryRef.current, activeId: null });
    restoreChat();
  }
  function openChat(chat: SavedChat) {
    if (busyRef.current) return;
    persistLibrary({ ...libraryRef.current, activeId: chat.id });
    restoreChat(chat);
  }
  function removeChat(id: string) {
    if (busyRef.current) return;
    const wasActive = libraryRef.current.activeId === id;
    persistLibrary(deleteChat(libraryRef.current, id));
    if (wasActive) restoreChat();
  }
  function removeAllChats() {
    if (busyRef.current) return;
    persistenceBlocked.current = false;
    persistLibrary(emptyLibrary());
    restoreChat();
  }
  useEffect(() => {
    try {
      const library = parseLibrary(localStorage.getItem(HISTORY_KEY));
      libraryRef.current = library;
      setChats(library.chats);
      setActiveChatId(library.activeId);
      restoreChat(library.chats.find((c) => c.id === library.activeId));
    } catch {
      persistenceBlocked.current = true;
      setHistoryError(
        'Saved history could not be loaded. New edits are kept only in this tab; existing browser data has not been overwritten.',
      );
    }
    historyReady.current = true;
  }, []);
  function addMessage(role: Message['role'], text: string, sources?: Message['sources']) {
    messagesRef.current = [
      ...messagesRef.current,
      { id: ++messageId.current, role, text, sources },
    ];
    setMessages(messagesRef.current);
    saveCurrentChat();
  }
  function commit(next: MapState) {
    const snapshot = structuredClone(mapRef.current);
    pastRef.current = [...pastRef.current.slice(-49), snapshot];
    setPast(pastRef.current);
    mapRef.current = next;
    setMap(next);
    saveCurrentChat();
  }
  const commitRef = useRef(commit);
  commitRef.current = commit;
  function edit(input: unknown) {
    const next = applyMapPatch(mapRef.current, input, countryNames);
    commit(next);
    return { applied: true, styledCountries: Object.keys(next.countries).length };
  }
  function undo() {
    if (busyRef.current || !pastRef.current.length) return;
    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    setPast(pastRef.current);
    mapRef.current = previous;
    setMap(previous);
    saveCurrentChat();
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('atlas.preferences') || 'null');
      if (saved) {
        const value = { ...initialSettings, ...saved, apiKey: '' };
        setSettings(value);
      }
      const savedTheme = localStorage.getItem('atlas.theme');
      if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
    } catch {
      /* Preferences are optional. */
    }
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', dark);
    };
    sync();
    media.addEventListener('change', sync);
    try {
      localStorage.setItem('atlas.theme', theme);
    } catch {
      /* Optional preference. */
    }
    return () => media.removeEventListener('change', sync);
  }, [theme]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, activity]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(
          () => {},
        );
      } catch {
        /* Unsupported implementation. */
      }
    };
    register({
      name: 'read_map',
      description: 'Read the current map and available countries.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => ({ map: structuredClone(mapRef.current), countries: countryNames }),
    });
    register({
      name: 'edit_map',
      description:
        'Immediately apply undoable country colors, labels, title, legend or projection changes to this map.',
      inputSchema: editMapParameters,
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        if (busyRef.current) throw new Error('Wait for the map assistant to finish.');
        const next = applyMapPatch(mapRef.current, input, countryNames);
        flushSync(() => commitRef.current(next));
        return { applied: true, map: structuredClone(mapRef.current) };
      },
    });
    return () => lifecycle.abort();
  }, []);
  function openSettings() {
    setDraft(settings);
    setSettingsError('');
    setSettingsOpen(true);
  }
  function saveSettings() {
    try {
      const validated = settingsSchema.parse(draft);
      providerEndpoint(validated);
      setSettings(validated);
      history.current = conversationFromMessages(messagesRef.current);
      try {
        localStorage.setItem(
          'atlas.preferences',
          JSON.stringify({
            format: validated.format,
            baseUrl: validated.baseUrl,
            model: validated.model,
          }),
        );
      } catch {
        /* Settings still work in memory. */
      }
      setSettingsOpen(false);
      setNotice('Provider configured. Your key is kept only for this page session.');
    } catch {
      setSettingsError('Enter a valid HTTPS base URL, model ID, and API key.');
    }
  }
  function selectCountry(name: string) {
    if (busyRef.current) return;
    setSelected(name);
    setColor(mapRef.current.countries[name]?.color || palette[0]);
    setLabel(mapRef.current.countries[name]?.label ?? '');
  }
  async function send(text = prompt) {
    if (!text.trim() || busyRef.current) return;
    if (!settings.apiKey || !settings.model) {
      setPrompt(text);
      openSettings();
      return;
    }
    setPrompt('');
    setBusy(true);
    busyRef.current = true;
    setNotice('');
    const controller = new AbortController();
    abort.current = controller;
    addMessage('user', text.trim());
    const before = [...history.current];
    let wire: WireMessage[] = [...before, { role: 'user', content: text.trim() }];
    const sources = new Map<string, { title: string; url: string }>();
    let finished = false;
    try {
      for (let step = 0; step < 10; step++) {
        if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        setActivity(step === 0 ? 'Thinking about your map…' : 'Working with the results…');
        const endpoint = providerEndpoint(settings);
        let result: ReturnType<typeof normalizeResponse>;
        if (relayHosts.has(endpoint.hostname)) {
          const response = await fetch('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              settings,
              history: wire,
              map: mapRef.current,
              names: countryNames,
            }),
            signal: controller.signal,
          });
          const payload = (await response.json()) as ReturnType<typeof normalizeResponse> & {
            error?: string;
          };
          if (!response.ok) throw new Error(payload.error || 'Provider request failed.');
          result = payload;
        } else {
          const { headers, body } = providerRequest(
            settings,
            wire,
            systemPrompt(mapRef.current, countryNames),
            agentTools,
          );
          if (settings.format === 'anthropic')
            headers['anthropic-dangerous-direct-browser-access'] = 'true';
          let response: Response;
          try {
            response = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              redirect: 'error',
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]),
            });
          } catch (e) {
            if (controller.signal.aborted) throw e;
            throw new Error(
              'Could not connect directly. This custom provider must allow browser requests (CORS). Check the URL and your network.',
            );
          }
          if (!response.ok)
            throw new Error(
              `Provider returned HTTP ${response.status}. Check your model, API key, and quota.`,
            );
          result = normalizeResponse(settings.format, await response.json());
        }
        if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        if (!result.calls.length && !result.text)
          throw new Error(
            'The provider returned no text or tool calls. Try another model that supports tools.',
          );
        if (result.calls.length > 12)
          throw new Error('Too many tool calls in one step. Ask for a smaller task.');
        wire.push(...result.assistant);
        if (result.text) addMessage('assistant', result.text);
        if (!result.calls.length) {
          finished = true;
          break;
        }
        const results: { id: string; result: unknown }[] = [];
        for (const call of result.calls) {
          if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
          try {
            if (call.name === 'edit_map') {
              const outcome = edit(call.input);
              results.push({ id: call.id, result: outcome });
              addMessage('activity', 'Map updated · Undo is available in the toolbar.');
            } else if (call.name === 'research' || call.name === 'read_webpage') {
              const readingWebpage = call.name === 'read_webpage';
              setActivity(readingWebpage ? 'Reading webpage…' : 'Looking up open data…');
              const response = await fetch(readingWebpage ? '/api/webpage' : '/api/research', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(call.input),
                signal: controller.signal,
              });
              const research = (await response.json()) as {
                source: string;
                error?: string;
                sources?: { title: string; url: string }[];
              };
              if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
              results.push({ id: call.id, result: research });
              for (const source of research.sources || []) {
                try {
                  const url = new URL(source.url);
                  if (url.protocol === 'https:') sources.set(source.url, source);
                } catch {
                  /* Reject invalid source links. */
                }
              }
              addMessage(
                'activity',
                research.error
                  ? `Research unavailable: ${research.error}`
                  : readingWebpage
                    ? `Read webpage · ${research.sources?.[0]?.title || 'Source'}`
                    : `Read ${research.source.replaceAll('_', ' ')} results`,
                research.sources,
              );
            } else
              results.push({
                id: call.id,
                result: { error: 'Unknown tool. Use edit_map, research, or read_webpage.' },
              });
          } catch (e) {
            if (controller.signal.aborted) throw e;
            results.push({
              id: call.id,
              result: { error: e instanceof Error ? e.message : 'Tool failed.' },
            });
          }
        }
        wire.push(...toolResultMessages(settings.format, results));
      }
      history.current = wire;
      if (!finished)
        addMessage(
          'assistant',
          'I reached the research step limit. The map changes are kept. Ask me to continue if you need more detail.',
        );
    } catch (e) {
      history.current = before;
      addMessage(
        'error',
        controller.signal.aborted
          ? 'Stopped. Any map edits already applied are kept; use Undo to revert them.'
          : e instanceof Error
            ? e.message
            : 'Something went wrong. Please try again.',
      );
    } finally {
      setActivity('');
      setBusy(false);
      busyRef.current = false;
      abort.current = null;
    }
  }
  async function download(format: 'svg' | 'png') {
    try {
      await exportMap(svg.current!, map, format);
      setNotice(`${format.toUpperCase()} exported.`);
    } catch {
      setNotice('Export failed. Please try SVG export or another browser.');
    }
  }
  const styled = Object.keys(map.countries).length;
  return (
    <main className="studio">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Atlas map studio">
          <span className="brand-icon">
            <Globe2 size={25} />
          </span>
          <strong>
            atlas<span>map studio</span>
          </strong>
        </a>
        <span className="project-label">
          Map workspace <span className="local-badge">SAVED LOCALLY</span>
        </span>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label={`Theme: ${theme}. Switch to ${theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'}`}
            title={`Theme: ${theme}`}
            onClick={() =>
              setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')
            }
          >
            {theme === 'system' ? (
              <Monitor size={18} />
            ) : theme === 'dark' ? (
              <Moon size={18} />
            ) : (
              <Sun size={18} />
            )}
          </button>
          <button className="outline-button" onClick={openSettings} disabled={busy}>
            <Settings2 size={16} /> Settings
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="primary-button">
                <Download size={16} /> Export map
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => download('png')}>
                Download PNG image
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => download('svg')}>
                Download editable SVG
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="workspace">
        <section className="map-workspace" aria-label="Map editor">
          <div className="map-toolbar">
            <div className="toolbar-group">
              <Layers size={17} />
              <Select
                value={map.projection}
                disabled={busy}
                onValueChange={(v) => edit({ projection: v as Projection })}
              >
                <SelectTrigger aria-label="Map projection">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projections.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="toolbar-divider" />
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setTitleDraft({ title: map.title, subtitle: map.subtitle });
                  setTitleOpen(true);
                }}
              >
                <Pencil size={14} />
                <span>Map details</span>
              </button>
            </div>
            <div className="toolbar-group">
              <button
                className="icon-button"
                disabled={!past.length || busy}
                aria-label="Undo last map edit"
                title="Undo last map edit"
                onClick={undo}
              >
                <Undo2 size={18} />
              </button>
              <button
                className="icon-button"
                disabled={busy || (!styled && !map.legend.length)}
                aria-label="Clear country styles"
                title="Clear country styles (undoable)"
                onClick={() => edit({ reset: true })}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
          <div className="map-heading">
            <p className="eyebrow">THE WORLD, YOUR PERSPECTIVE</p>
            <h1>{map.title}</h1>
            <p>{map.subtitle}</p>
          </div>
          <WorldMap
            key={activeChatId || 'new-chat'}
            map={map}
            onSelect={selectCountry}
            svgRef={svg}
          />
          {!!map.legend.length && (
            <div className="map-legend">
              {map.legend.map((l, i) => (
                <span key={i}>
                  <i style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          )}
          <footer className="map-footer">
            <span>
              <Compass size={14} /> {map.projection} ·{' '}
              {styled ? `${styled} styled` : 'Click a country to edit'}
            </span>
            <span>
              <a
                href="https://www.naturalearthdata.com/about/terms-of-use/"
                target="_blank"
                rel="noreferrer"
              >
                Natural Earth
              </a>{' '}
              · Generalized boundaries
            </span>
          </footer>
        </section>
        <aside className="agent-panel" aria-label="AI map assistant">
          <div className="agent-header">
            <span className="agent-icon">
              <Sparkles size={19} />
            </span>
            <div>
              <h2>Map assistant</h2>
              <p>{busy ? 'Creating with you…' : 'Your ideas, mapped out.'}</p>
            </div>
          </div>
          <ChatHistory
            chats={chats}
            activeId={activeChatId}
            busy={busy}
            error={historyError}
            onOpen={openChat}
            onNew={newChat}
            onDelete={removeChat}
            onDeleteAll={removeAllChats}
          />
          <div className="agent-body" role="log" aria-live="polite">
            {!messages.length ? (
              <>
                <div className="welcome-icon">
                  <Globe2 size={29} />
                </div>
                <h3>What will you map?</h3>
                <p>
                  Turn a question into a map. I can research data, read webpage links, color
                  countries, and add labels.
                </p>
                <div className="suggestions">
                  {suggestions.map((p, i) => (
                    <button
                      key={p}
                      onClick={() => {
                        setPrompt(p);
                        if (settings.apiKey) void send(p);
                        else openSettings();
                      }}
                    >
                      <span>0{i + 1}</span>
                      {p}
                      <ArrowUp size={14} />
                    </button>
                  ))}
                </div>
                <div className="research-note">
                  <Compass size={17} />
                  <span>
                    Grounded in open data
                    <br />
                    <small>Wikipedia, Wikidata, World Bank & webpage links</small>
                  </span>
                </div>
                <p className="manual-tip">
                  No key needed to explore. Click a country to color or label it yourself.
                </p>
              </>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`message ${m.role}`}>
                  {m.role === 'assistant' && (
                    <span className="message-author">
                      <Sparkles size={12} /> ATLAS
                    </span>
                  )}
                  {m.role === 'activity' && <Check size={13} />}
                  <p>{m.text}</p>
                  {m.sources && (
                    <div className="source-links">
                      {m.sources.map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                          <ExternalLink size={11} />
                          {s.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            {activity && (
              <p className="thinking">
                <span className="thinking-dot" />
                {activity}
              </p>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="composer-area">
            <button className="connection-notice" onClick={openSettings} disabled={busy}>
              <span>
                {settings.apiKey
                  ? `${settings.model} · Configured`
                  : 'Connect your AI provider to begin'}
              </span>
              <Settings2 size={15} />
            </button>
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                aria-label="Message map assistant"
                placeholder="Describe the map you have in mind…"
                value={prompt}
                maxLength={6000}
                disabled={busy}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div>
                <span>
                  <Globe2 size={14} /> Open data & webpage links
                </span>
                {busy ? (
                  <button
                    type="button"
                    aria-label="Stop assistant"
                    onClick={() => abort.current?.abort()}
                  >
                    <Square size={13} />
                  </button>
                ) : (
                  <button type="submit" aria-label="Send message" disabled={!prompt.trim()}>
                    <ArrowUp size={18} />
                  </button>
                )}
              </div>
            </form>
            <p className="composer-footnote">
              Chats and maps are saved in this browser. API keys are not.
            </p>
          </div>
        </aside>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Dismiss notice" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="settings-dialog">
          <DialogTitle>Connect your AI provider</DialogTitle>
          <DialogDescription>
            Use your own API key and a model that supports tool calling.
          </DialogDescription>
          <div className="settings-fields">
            <label>
              API format
              <Select
                value={draft.format}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    format: v as ProviderSettings['format'],
                    baseUrl:
                      v === 'anthropic'
                        ? 'https://api.anthropic.com/v1'
                        : d.baseUrl === 'https://api.anthropic.com/v1'
                          ? 'https://api.openai.com/v1'
                          : d.baseUrl,
                    model: '',
                  }))
                }
              >
                <SelectTrigger aria-label="API format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI-compatible · Chat Completions</SelectItem>
                  <SelectItem value="responses">OpenAI-compatible · Responses</SelectItem>
                  <SelectItem value="anthropic">Claude-compatible · Messages</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              API base URL
              <input
                type="url"
                value={draft.baseUrl}
                onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                placeholder="https://api.example.com/v1"
                autoComplete="off"
              />
            </label>
            <div className="provider-presets">
              <span>Quick fill</span>
              {[
                { name: 'OpenAI', url: 'https://api.openai.com/v1', format: 'openai' },
                { name: 'Claude', url: 'https://api.anthropic.com/v1', format: 'anthropic' },
                { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', format: 'openai' },
                { name: 'Groq', url: 'https://api.groq.com/openai/v1', format: 'openai' },
              ].map((p) => (
                <button
                  key={p.name}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      baseUrl: p.url,
                      format: p.format as ProviderSettings['format'],
                      model: '',
                      apiKey: '',
                    }))
                  }
                >
                  {p.name}
                </button>
              ))}
            </div>
            <label>
              Model ID
              <input
                value={draft.model}
                onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                placeholder="Exact model ID from your provider"
                autoComplete="off"
              />
            </label>
            <label>
              API key
              <input
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                placeholder="Paste your API key"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="privacy-note">
              Your key stays in memory and clears on refresh. Supported providers use a transient
              server relay; keys are never saved by this app. Custom hosts connect directly and must
              allow browser requests. Your provider receives your prompt, map, and research results
              and may charge for usage.
            </div>
            {settingsError && (
              <p className="form-error" role="alert">
                {settingsError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="text-button"
                onClick={() => {
                  setSettings((s) => ({ ...s, apiKey: '' }));
                  setDraft((d) => ({ ...d, apiKey: '' }));
                  history.current = conversationFromMessages(messagesRef.current);
                  setSettingsOpen(false);
                  setNotice('API key cleared.');
                }}
              >
                Clear key
              </button>
              <button className="primary-button" onClick={saveSettings}>
                Save settings
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected('');
        }}
      >
        <DialogContent>
          <DialogTitle>Style a country</DialogTitle>
          <DialogDescription>Choose a color and a custom label for your map.</DialogDescription>
          <div className="settings-fields">
            <label>
              Find country
              <input
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder="Search country names"
              />
            </label>
            <Select value={selected} onValueChange={selectCountry}>
              <SelectTrigger aria-label="Country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {countryNames
                  .filter((n) => n.toLowerCase().includes(countrySearch.toLowerCase()))
                  .map((n) => (
                    <SelectItem value={n} key={n}>
                      {n}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <label>
              Fill color
              <div className="color-row">
                {palette.map((c) => (
                  <button
                    key={c}
                    className={color === c ? 'swatch selected' : 'swatch'}
                    style={{ background: c }}
                    aria-label={`Use ${c}`}
                    onClick={() => setColor(c)}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Custom country color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </label>
            <label>
              Label
              <input
                value={label}
                maxLength={80}
                placeholder={selected}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                className="text-button"
                onClick={() => {
                  edit({ countries: [{ name: selected, color: null, label: null }] });
                  setSelected('');
                }}
              >
                Clear style
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  edit({ countries: [{ name: selected, color, label: label || null }] });
                  setSelected('');
                }}
              >
                Apply style
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={titleOpen} onOpenChange={setTitleOpen}>
        <DialogContent>
          <DialogTitle>Map details</DialogTitle>
          <DialogDescription>
            Give your map context. Include the year and units when showing data.
          </DialogDescription>
          <div className="settings-fields">
            <label>
              Title
              <input
                value={titleDraft.title}
                maxLength={100}
                onChange={(e) => setTitleDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </label>
            <label>
              Subtitle
              <input
                value={titleDraft.subtitle}
                maxLength={200}
                onChange={(e) => setTitleDraft((d) => ({ ...d, subtitle: e.target.value }))}
              />
            </label>
            <label className="switch-row">
              Show country names
              <Switch
                checked={map.showLabels}
                onCheckedChange={(v) => edit({ showLabels: v })}
                aria-label="Show country names"
              />
            </label>
            <button
              className="primary-button"
              onClick={() => {
                edit(titleDraft);
                setTitleOpen(false);
              }}
            >
              Save map details
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
