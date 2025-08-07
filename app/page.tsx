'use client';
import React, { useMemo, useState } from 'react';
import { Globe, BarChart3, Share2, Search, Sitemap as SitemapIcon } from 'lucide-react';

type HeadingMap = Record<'h1'|'h2'|'h3'|'h4'|'h5'|'h6', string[]>;
type SchemaItem = { type: string; valid: boolean; errors?: string[] };
type Scores = {
  overall: number; content: number; technical: number; links: number;
  accessibility: number; mobile: number; social: number; structuredData: number; performance: number;
};
type ParseInfo = {
  title?: string;
  meta: { name?: Record<string,string>, property?: Record<string,string> };
  headings: HeadingMap;
  images: { total: number; withAlt: number; withoutAlt: number };
  links: { total: number; internal: number; external: number; broken?: number };
  canonical?: string; robotsMeta?: string; viewport?: string; schemas: SchemaItem[]; ariaCount?: number;
};
type PageReport = {
  url: string; fetchOk: boolean; status?: number; finalUrl?: string; headers?: Record<string,string>;
  timing?: { ttfb?: number }; parsed?: ParseInfo; scores: Scores;
  issues: Array<{ severity: 'critical'|'warning'|'info', message: string, hint?: string }>;
};
type SiteReport = { mode: 'single'|'sitemap'; target: string; limit?: number; reports: PageReport[]; siteSummary: PageReport | null };

const scoreColor = (n:number) => n >= 90 ? 'text-emerald-600' : n >= 70 ? 'text-yellow-600' : 'text-red-600';

export default function Page(){
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'single'|'sitemap'>('sitemap');
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<SiteReport|null>(null);

  const normalizedUrl = useMemo(()=>{
    if(!url) return '';
    try{ const u = new URL(url.startsWith('http')? url : `https://${url}`); return u.toString(); } catch { return url; }
  }, [url]);

  async function run(){
    if (!normalizedUrl) return;
    setLoading(true); setError(''); setReport(null);
    try{
      const endpoint = mode==='single'
        ? `/api/analyze?url=${encodeURIComponent(normalizedUrl)}`
        : `/api/sitemap?url=${encodeURIComponent(normalizedUrl)}&limit=${limit}`;
      const res = await fetch(endpoint);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReport(data);
    }catch(e:any){
      setError('No pude analizar la URL. Verifica que exista y que permita ser consultada.');
    }finally{ setLoading(false); }
  }

  function downloadJSON(){
    if(!report) return;
    const blob = new Blob([JSON.stringify(report,null,2)], { type: 'application/json' });
    const a = document.createElement('a');
    const host = (()=>{ try{ return new URL(normalizedUrl).hostname }catch{ return 'site' }})();
    a.href = URL.createObjectURL(blob);
    a.download = `seo-report-${host}-${Date.now()}.json`;
    a.click();
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-7 h-7" />
            <h1 className="text-2xl font-semibold">SEO Analyzer Pro</h1>
            <span className="ml-2 text-xs px-2 py-1 rounded-full bg-slate-200">emergent.sh ready</span>
          </div>
        </header>

        <div className="bg-white border rounded-2xl p-4 mb-6">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-center">
            <input className="border rounded-lg px-3 py-2 w-full" placeholder="https://literas.mx/" value={url} onChange={(e)=>setUrl(e.target.value)} />
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border">
                <button onClick={()=>setMode('single')} className={`px-3 py-2 text-sm ${mode==='single'?'bg-slate-900 text-white':''}`}><Search className="inline w-4 h-4 mr-1"/>Página</button>
                <button onClick={()=>setMode('sitemap')} className={`px-3 py-2 text-sm ${mode==='sitemap'?'bg-slate-900 text-white':''}`}><SitemapIcon className="inline w-4 h-4 mr-1"/>Sitemap</button>
              </div>
              {mode==='sitemap' && (
                <div className="flex items-center gap-2 ml-2">
                  <label className="text-sm text-slate-500">Límite</label>
                  <input type="number" min={1} max={500} value={limit} onChange={(e)=>setLimit(parseInt(e.target.value||'50'))} className="w-20 border rounded-lg px-2 py-2"/>
                </div>
              )}
              <button onClick={run} disabled={loading||!url} className="px-4 py-2 rounded-lg bg-slate-900 text-white">{loading? 'Analizando...' : 'Analizar'}</button>
              <button onClick={downloadJSON} disabled={!report} className="px-4 py-2 rounded-lg border">Exportar</button>
            </div>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6">{error}</div>}

        {!report && !loading && (
          <div className="border border-dashed rounded-2xl p-8 bg-white text-center">
            <BarChart3 className="w-10 h-10 mx-auto" />
            <h2 className="text-lg font-semibold mt-2">Analiza cualquier página o todo el sitio</h2>
            <p className="text-sm text-slate-500">Incluye títulos, meta, encabezados, imágenes, enlaces, OG/Twitter, canonical, robots, Schema.org, accesibilidad, móvil y señales técnicas.</p>
          </div>
        )}

        {report && (
          <div className="space-y-6">
            <SummaryHeader report={report}/>
            <div className="grid md:grid-cols-2 gap-6">
              {report.reports.map((r:PageReport, i:number)=>(<PageCard key={i} r={r}/>))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryHeader({ report }:{ report: SiteReport }){
  const pages = report.reports.length || 1;
  const avg = (k:keyof Scores) => Math.round(report.reports.reduce((a,b)=> a + ((b.scores as any)?.[k]||0),0)/pages);
  const overall = avg('overall');
  const buckets = [
    ['Contenido','content'], ['Técnico','technical'], ['Enlaces','links'],
    ['Accesibilidad','accessibility'], ['Móvil','mobile'], ['Social','social'],
    ['Schema','structuredData'], ['Rendimiento','performance']
  ] as const;

  return (
    <div className="bg-white border rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`text-base font-semibold ${scoreColor(overall)}`}>Score global: {overall}</span>
          <span className="text-sm text-slate-500">Páginas: {pages}</span>
        </div>
        <div className="text-sm flex items-center gap-2 text-slate-500">
          <Share2 className="w-4 h-4"/> {report.mode==='single' ? '1 página' : `Sitemap (hasta ${report.limit})`}
        </div>
      </div>
      <div className="grid md:grid-cols-4 gap-3 mt-4">
        {buckets.map(([label, k]) => (
          <div key={k} className="rounded-xl border bg-white p-4">
            <div className="text-sm text-slate-500 mb-1">{label}</div>
            <div className={`font-semibold ${scoreColor(avg(k as keyof Scores))}`}>{avg(k as keyof Scores)}</div>
            <div className="mt-2 h-2 w-full bg-slate-200 rounded">
              <div className="h-2 bg-slate-900 rounded" style={{width:`${avg(k as keyof Scores)}%`}}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageCard({ r }:{ r: PageReport }){
  return (
    <div className="bg-white border rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <a className="font-medium hover:underline break-all" href={r.finalUrl || r.url} target="_blank">{r.finalUrl || r.url}</a>
          <div className="text-sm text-slate-500">HTTP {r.status || '—'} • TTFB {Math.round(r.timing?.ttfb ?? 0)} ms</div>
        </div>
        <span className={`text-sm font-semibold ${scoreColor(r.scores.overall)}`}>Score {r.scores.overall}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Contenido">
          <KV label="Title" value={r.parsed?.title || '(faltante)'} bad={!r.parsed?.title}/>
          <KV label="Meta description" value={r.parsed?.meta?.name?.description || '(faltante)'} bad={!r.parsed?.meta?.name?.description}/>
          <KV label="H1" value={(r.parsed?.headings?.h1||[]).join(' | ') || '(faltante)'} bad={!(r.parsed?.headings?.h1||[]).length}/>
        </Section>
        <Section title="Imágenes">
          <KV label="Total" value={String(r.parsed?.images?.total ?? 0)}/>
          <KV label="Con alt" value={String(r.parsed?.images?.withAlt ?? 0)}/>
          <KV label="Sin alt" value={String(r.parsed?.images?.withoutAlt ?? 0)} bad={(r.parsed?.images?.withoutAlt ?? 0)>0}/>
        </Section>
        <Section title="Enlaces">
          <KV label="Total" value={String(r.parsed?.links?.total ?? 0)}/>
          <KV label="Internos" value={String(r.parsed?.links?.internal ?? 0)}/>
          <KV label="Externos" value={String(r.parsed?.links?.external ?? 0)}/>
        </Section>
        <Section title="Técnico">
          <KV label="Canonical" value={r.parsed?.canonical || '—'}/>
          <KV label="Meta robots" value={r.parsed?.robotsMeta || '—'}/>
          <KV label="Viewport" value={r.parsed?.viewport || '—'}/>
        </Section>
        <Section title="Social (OG/Twitter)">
          <KV label="og:title" value={r.parsed?.meta?.property?.['og:title'] || '—'}/>
          <KV label="og:description" value={r.parsed?.meta?.property?.['og:description'] || '—'}/>
          <KV label="twitter:card" value={r.parsed?.meta?.name?.['twitter:card'] || '—'}/>
        </Section>
        <Section title="Schema.org">
          {(r.parsed?.schemas||[]).length===0 && <KV label="Schemas" value="(ninguno)" bad/>}
          {(r.parsed?.schemas||[]).slice(0,6).map((s,i)=>(
            <KV key={i} label={s.type} value={s.valid? 'OK' : `Errores (${(s.errors||[]).length})`} bad={!s.valid}/>
          ))}
        </Section>
        <Section title="Recomendaciones" wide>
          <ul className="list-disc ml-6 space-y-1">
            {r.issues.map((it,i)=>(
              <li key={i} className="text-sm">
                <span className="font-medium mr-1">[{it.severity.toUpperCase()}]</span>{it.message}{it.hint && <span className="text-slate-500 ml-1">— {it.hint}</span>}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children, wide=false }:{ title:string; children:React.ReactNode; wide?:boolean }){
  return (
    <div className={`border rounded-xl ${wide? 'md:col-span-2':''}`}>
      <div className="p-3 font-medium">{title}</div>
      <div className="border-t p-4 grid sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function KV({ label, value, bad }:{ label:string; value:any; bad?:boolean }){
  return (
    <div className="text-sm">
      <div className="text-slate-500">{label}</div>
      <div className={`font-medium break-words ${bad?'text-red-600':''}`}>{String(value)}</div>
    </div>
  );
}
