export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { parseStringPromise } from 'xml2js';

async function fetchText(u: string) { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.text(); }

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.nextUrl.searchParams.get('url') || '');
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 20), 500);
    const robotsTxt = await fetch(`${u.origin}/robots.txt`).then(r=>r.ok?r.text():'').catch(()=> '');
    let sitemapURL = `${u.origin}/sitemap.xml`; const m = robotsTxt.match(/sitemap:\s*(.*)$/im); if (m) sitemapURL = m[1].trim();
    const xml = await fetchText(sitemapURL); const parsed:any = await parseStringPromise(xml);
    let urls: string[] = [];
    if (parsed.sitemapindex?.sitemap) {
      const childMaps = parsed.sitemapindex.sitemap.map((s:any)=> s.loc?.[0]).filter(Boolean);
      for (const sm of childMaps) {
        if (urls.length >= limit) break;
        try {
          const childXml = await fetchText(sm); const childParsed:any = await parseStringPromise(childXml);
          const childUrls = (childParsed.urlset?.url || []).map((x:any)=> x.loc?.[0]).filter(Boolean);
          urls.push(...childUrls);
        } catch {}
      }
    } else {
      urls = (parsed.urlset?.url || []).map((x:any)=> x.loc?.[0]).filter(Boolean);
    }
    urls = urls.slice(0, limit);

    const origin = new URL(req.url).origin;
    const reports: any[] = [];
    for (const loc of urls) {
      try {
        const r = await fetch(`${origin}/api/analyze?url=${encodeURIComponent(loc)}`).then(r=>r.json());
        if (r?.reports?.[0]) reports.push(r.reports[0]);
      } catch {}
    }
    return NextResponse.json({ mode:'sitemap', target:u.toString(), limit, reports, siteSummary:null });
  } catch (e:any) {
    return NextResponse.json({ error:'No se pudo leer el sitemap', detail:String(e) }, { status:400 });
  }
}
