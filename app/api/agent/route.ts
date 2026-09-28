import { z } from 'zod';
import {
  settingsSchema,
  providerEndpoint,
  relayHosts,
  providerRequest,
  normalizeResponse,
  systemPrompt,
} from '@/lib/provider';
import { agentTools } from '@/lib/map-actions';
const requestSchema = z.object({
  settings: settingsSchema,
  history: z.array(z.record(z.unknown())).min(1).max(180),
  map: z.unknown(),
  names: z.array(z.string().max(100)).max(300),
});
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 1_000_000)
      return Response.json({ error: 'Conversation too large. Start a new chat.' }, { status: 413 });
    const { settings, history, map, names } = requestSchema.parse(JSON.parse(raw));
    const endpoint = providerEndpoint(settings);
    if (!relayHosts.has(endpoint.hostname))
      return Response.json(
        { error: 'This provider must be called directly from your browser.' },
        { status: 400 },
      );
    const { headers, body } = providerRequest(
      settings,
      history,
      systemPrompt(map, names),
      agentTools,
    );
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
    });
    if (!response.ok)
      return Response.json(
        {
          error:
            response.status === 401 || response.status === 403
              ? 'Provider rejected the API key or model access. Check Settings.'
              : response.status === 429
                ? 'Provider rate limit or quota reached. Try again later.'
                : `Provider returned HTTP ${response.status}. Check the API format, model name, and base URL.`,
        },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Provider response exceeded the size limit.');
    return Response.json(normalizeResponse(settings.format, JSON.parse(text)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? 'Invalid provider settings or conversation. Check Settings.'
            : error instanceof Error && error.name === 'TimeoutError'
              ? 'The provider timed out. Please retry.'
              : 'Could not complete the provider request. Check your connection and provider settings.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
