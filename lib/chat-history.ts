import { z } from 'zod';
import { projections, type MapState } from './model';
import type { WireMessage } from './provider';

export const HISTORY_KEY = 'atlas.chat-history.v1';
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const mapSchema = z.object({
  title: z.string().max(100),
  subtitle: z.string().max(200),
  projection: z.enum(projections),
  countries: z.record(z.object({ color: color.optional(), label: z.string().max(80).optional() })),
  legend: z.array(z.object({ label: z.string().max(80), color })).max(15),
  showLabels: z.boolean(),
});
const messageSchema = z.object({
  id: z.number().int().nonnegative(),
  role: z.enum(['user', 'assistant', 'activity', 'error']),
  text: z.string(),
  sources: z
    .array(
      z.object({
        title: z.string(),
        url: z
          .string()
          .url()
          .refine((url) => url.startsWith('https://')),
      }),
    )
    .optional(),
});
const chatSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  map: mapSchema,
  messages: z.array(messageSchema),
});
const librarySchema = z.object({
  version: z.literal(1),
  activeId: z.string().nullable(),
  chats: z.array(chatSchema),
});
export type Message = z.infer<typeof messageSchema>;
export type SavedChat = z.infer<typeof chatSchema>;
export type ChatLibrary = z.infer<typeof librarySchema>;
export function emptyLibrary(): ChatLibrary {
  return { version: 1, activeId: null, chats: [] };
}
export function parseLibrary(raw: string | null): ChatLibrary {
  if (!raw) return emptyLibrary();
  const library = librarySchema.parse(JSON.parse(raw));
  if (new Set(library.chats.map((c) => c.id)).size !== library.chats.length)
    throw new Error('Duplicate chat identifiers.');
  if (!library.chats.some((c) => c.id === library.activeId)) library.activeId = null;
  return library;
}
export function saveChat(
  library: ChatLibrary,
  id: string,
  map: MapState,
  messages: Message[],
  now = Date.now(),
): ChatLibrary {
  const previous = library.chats.find((c) => c.id === id);
  const title =
    messages
      .find((m) => m.role === 'user')
      ?.text.trim()
      .slice(0, 90) || (map.title === 'A world of possibilities' ? 'Untitled map' : map.title);
  const chat: SavedChat = structuredClone({
    id,
    title,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    map,
    messages,
  });
  return { version: 1, activeId: id, chats: [chat, ...library.chats.filter((c) => c.id !== id)] };
}
export function deleteChat(library: ChatLibrary, id: string): ChatLibrary {
  return {
    ...library,
    activeId: library.activeId === id ? null : library.activeId,
    chats: library.chats.filter((c) => c.id !== id),
  };
}
// Persist only the display transcript and map, never provider configuration or wire payloads.
export function serializeLibrary(library: ChatLibrary) {
  return JSON.stringify(librarySchema.parse(library));
}
export function conversationFromMessages(messages: Message[]): WireMessage[] {
  return messages
    .filter((m) => m.role !== 'error')
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content:
        m.text +
        (m.sources?.length
          ? `\nSources: ${m.sources.map((s) => `${s.title}: ${s.url}`).join('\n')}`
          : ''),
    }));
}
