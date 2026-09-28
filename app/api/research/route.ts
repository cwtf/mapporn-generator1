import { z } from 'zod';
const schema = z.object({
  source: z.enum([
    'wikipedia',
    'wikipedia_article',
    'wikidata',
    'wikidata_entity',
    'wikidata_query',
    'worldbank',
  ]),
  query: z.string().trim().min(1).max(4000),
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});
const headers = {
  'User-Agent': 'AtlasMapStudio/1.0 (public map editor; open-data research)',
  Accept: 'application/json',
};
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 6000) throw new Error('Research request too large.');
    const { source, query, year } = schema.parse(JSON.parse(raw));
    let url: URL;
    if (source === 'wikipedia') {
      url = new URL('https://en.wikipedia.org/w/api.php');
      url.search = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: query,
        srlimit: '6',
        format: 'json',
        formatversion: '2',
      }).toString();
    } else if (source === 'wikipedia_article') {
      url = new URL('https://en.wikipedia.org/w/api.php');
      url.search = new URLSearchParams({
        action: 'query',
        prop: 'extracts',
        explaintext: '1',
        titles: query,
        redirects: '1',
        format: 'json',
        formatversion: '2',
      }).toString();
    } else if (source === 'wikidata') {
      url = new URL('https://www.wikidata.org/w/api.php');
      url.search = new URLSearchParams({
        action: 'wbsearchentities',
        search: query,
        language: 'en',
        limit: '6',
        format: 'json',
      }).toString();
    } else if (source === 'wikidata_entity') {
      if (!/^Q\d+$/.test(query)) throw new Error('Use a Wikidata Q-ID.');
      url = new URL(`https://www.wikidata.org/wiki/Special:EntityData/${query}.json`);
    } else if (source === 'wikidata_query') {
      if (
        !/\bSELECT\b/i.test(query) ||
        /\b(SERVICE|LOAD|INSERT|DELETE|DROP|CLEAR|CREATE|MOVE|COPY|ADD)\b/i.test(query)
      )
        throw new Error('Only read-only SELECT queries without SERVICE are supported.');
      url = new URL('https://query.wikidata.org/sparql');
      url.search = new URLSearchParams({
        query: /\bLIMIT\s+\d+/i.test(query)
          ? query.replace(/\bLIMIT\s+(\d+)/i, (_, n) => `LIMIT ${Math.min(Number(n), 300)}`)
          : `${query}\nLIMIT 300`,
        format: 'json',
      }).toString();
    } else {
      if (!/^[A-Z0-9_.]+$/i.test(query))
        throw new Error('Use a World Bank indicator code, such as SP.POP.TOTL.');
      url = new URL(`https://api.worldbank.org/v2/country/all/indicator/${query}`);
      url.search = new URLSearchParams({
        format: 'json',
        per_page: '350',
        ...(year ? { date: year } : { mrnev: '1' }),
      }).toString();
    }
    const response = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(source === 'worldbank' ? 45000 : 25000),
      ]),
    });
    if (!response.ok)
      throw new Error(
        `The data source returned HTTP ${response.status}. Try another source or retry later.`,
      );
    const rawData = await response.text();
    if (rawData.length > 5_000_000) throw new Error('Source result too large. Narrow the query.');
    const data = JSON.parse(rawData);
    let result: unknown;
    let sources: { title: string; url: string }[] = [];
    if (source === 'wikipedia') {
      result = (data.query?.search || []).map((p: any) => ({
        title: p.title,
        snippet: p.snippet.replace(/<[^>]+>/g, ''),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replaceAll(' ', '_'))}`,
      }));
      sources = (result as any[]).map((p) => ({ title: p.title, url: p.url }));
    } else if (source === 'wikipedia_article') {
      result = (data.query?.pages || []).map((p: any) => ({
        title: p.title,
        text: p.extract?.slice(0, 18000) || 'Article not found',
        truncated: (p.extract?.length || 0) > 18000,
      }));
      sources = [
        {
          title: query,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query.replaceAll(' ', '_'))}`,
        },
      ];
    } else if (source === 'wikidata') {
      result = (data.search || []).map((p: any) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        url: `https://www.wikidata.org/wiki/${p.id}`,
      }));
      sources = (result as any[]).map((p) => ({ title: p.label || p.id, url: p.url }));
    } else if (source === 'wikidata_entity') {
      const entity = data.entities?.[query];
      result = entity
        ? {
            id: query,
            label: entity.labels?.en?.value,
            description: entity.descriptions?.en?.value,
            claims: entity.claims,
          }
        : { error: 'Entity not found' };
      sources = [{ title: query, url: `https://www.wikidata.org/wiki/${query}` }];
    } else if (source === 'wikidata_query') {
      result = data.results?.bindings ?? data;
      sources = [
        {
          title: 'Wikidata query',
          url: `https://query.wikidata.org/#${encodeURIComponent(query)}`,
        },
      ];
    } else {
      if (!Array.isArray(data) || !Array.isArray(data[1]))
        throw new Error('Indicator not found or no observations available.');
      result = {
        metadata: data[0],
        observations: data[1].map((p: any) => ({
          country: p.country?.value,
          iso3: p.countryiso3code,
          year: p.date,
          value: p.value,
          indicator: p.indicator?.value,
        })),
        note: 'Includes regional aggregates. Match country records to map names; preserve each observation year.',
      };
      sources = [
        { title: `World Bank · ${query}`, url: `https://data.worldbank.org/indicator/${query}` },
      ];
    }
    const encoded = JSON.stringify(result);
    return Response.json(
      {
        source,
        result:
          encoded.length > 65000 ? { excerpt: encoded.slice(0, 65000), truncated: true } : result,
        sources,
        retrievedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? 'Invalid research request.'
            : e instanceof Error
              ? e.message
              : 'Research source unavailable.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
