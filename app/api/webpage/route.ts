import { z } from 'zod';
import { readBoundedText, readWebpage, WebpageError } from '@/lib/webpage-reader';

const schema = z.object({ url: z.string().trim().min(1).max(4000) }).strict();
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    return Response.json(
      { error: 'Cross-origin requests are not allowed.' },
      { status: 403, headers },
    );
  }
  try {
    const raw = await readBoundedText(new Response(request.body), 6000);
    const { url } = schema.parse(JSON.parse(raw));
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
    return Response.json(await readWebpage(url, signal), { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof WebpageError
            ? error.message
            : error instanceof z.ZodError || error instanceof SyntaxError
              ? 'Provide a valid webpage URL.'
              : error instanceof Error && error.name === 'TimeoutError'
                ? 'The webpage timed out. Try another source or retry later.'
                : request.signal.aborted
                  ? 'Webpage reading stopped.'
                  : 'Could not read this webpage. It may be unavailable or block automated requests. Try another source.',
      },
      { status: 400, headers },
    );
  }
}
