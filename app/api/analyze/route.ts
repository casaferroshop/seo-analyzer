export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const abs = (base: string, href?: string|null) => { try { return new URL(String(href||''), base).toString(); } catch { return null; } };
const hostname = (u: string) => { try { return new URL(u).hostname; } catch { return ''; } };

function analyzeHTML(url: string, finalUrl: string, headers: Record<string,string>, html: string){
  const $ = cheerio.load(html);
  const metaName: Record<string,string> = {}; const metaProp: Record<string,string> = {};
  $('meta[name]').each((_,el)=>{ metaName[$(el).attr('name')!] = $(el).attr('content') || ''; });
  $('meta[property]').each((_,el)=>{ metaProp[$(el).attr('property')!] = $(el).attr('content') || ''; });
  const headings: Record<string,string[]> = {h1:[],h2:[],h3:[],h4:[],h5:[],h6:[]};
  Object.keys(headings).forEach(h=>{ $(h).each((_,el)=>headings[h].push($(el).text().trim())); });
  const imgs = $('img');
  const images = { total: imgs.length, withAlt: imgs.filter((_,el)=>!!($(el).attr('alt')||'').trim()).length, withoutAlt: imgs.filter((_,el)=>!($(el).attr('alt')||'').trim()).length };
  const a = $('a[href]');
  let internal = 0, external = 0; const host = hostname(finalUrl||url);
  a.each((_,el)=>{ const target = abs(finalUrl||url, $(el).attr('href')); if (!target) return; if (hostname(target)===host) internal++; else external++; });
  const canonical = $('link[rel="canonical"]').attr('href') ? abs(finalUrl||url, $('link[rel="canonical"]').attr('href'))! : undefined;
  const robotsMeta = $('meta[name="robots"]').attr('content');
  const viewport = $('meta[name="viewport"]').attr('content');
  const schemas: Array<{type:string, valid:boolean, errors?:string[]}> = [];
  $('script[type="application/ld+json"]').each((_,el)=>{ try { const json = JSON.parse($(el).contents().text()); const arr = Array.isArray(json)? json : [json]; arr.forEach((obj:any)=>{ const type = Array.isArray(obj['@type'])? obj['@type'][0] : obj['@type'] || 'Thing'; const valid = !!obj['@context'] && !!obj['@type']; schemas.push({ type: String(type||'Thing'), valid, errors: valid?[]:['Falta @context o @type'] }); }); } catch { schemas.push({ type:'LD+JSON', valid:false, errors:['JSON inválido']}); } });
  $('[itemscope][itemtype]').each((_,el)=>{ const type = ($(el).attr('itemtype')||'').split('/').pop() || 'Thing'; schemas.push({ type, valid: true }); });
  const ariaCount = $('[aria-*], [role]').length;
  const title = $('title').text().trim(); const md = metaName['description'];
  const hasTitle = !!title; const hasMd = !!(md && md.length>=50 && md.length<=180);
  const hasH1 = headings.h1.length===1; const tooManyH1 = headings.h1.length>1;
  const score:any = {};
  score.content = (hasTitle?40:0)+(hasMd?30:0)+(hasH1?30:0)-(tooManyH1?15:0);
  const https = (finalUrl||url).startsWith('https:'); const hasCanonical = !!canonical;
  const cache = headers['cache-control']?20:0; const gzip = /gzip|br/.test(headers['content-encoding']||'') ? 20 : 0;
  score.technical = (https?30:0)+(hasCanonical?20:0)+cache+gzip+30;
  const totalLinks = a.length; const ratioInt = totalLinks? (internal/totalLinks) : 0;
  score.links = Math.min(100, Math.round((ratioInt*60) + Math.min(40, totalLinks>50?40:totalLinks)));
  const noAlt = images.withoutAlt;
  score.accessibility = Math.max(0, 100 - Math.min(60, noAlt*5)) - (tooManyH1?10:0) + Math.min(10, ariaCount>0?10:0);
  score.mobile = viewport?90:40;
  const ogOk = !!metaProp['og:title'] && !!metaProp['og:description'];
  const twOk = !!metaName['twitter:card'];
  score.social = (ogOk?60:0) + (twOk?40:0);
  const sdOk = schemas.length>0 && schemas.every(s=>s.valid);
  score.structuredData = sdOk?95: (schemas.length>0?70:30);
  const ttfb = Number(headers['x-response-time']||0);
  const perfBase = 60; const ttfbPenalty = ttfb>800 ? 20 : ttfb>400 ? 10 : 0;
  score.performance = Math.max(0, perfBase - ttfbPenalty + (gzip?10:0));
  const issues:any[] = [];
  if (!hasTitle) issues.push({ severity:'critical', message:'Falta <title>.'});
  if (!md) issues.push({ severity:'warning', message:'Falta meta description o fuera de 50–180.'});
  if (!hasH1) issues.push({ severity:'critical', message:'Falta H1 único.'});
  if (tooManyH1) issues.push({ severity:'warning', message:'Hay múltiples H1.'});
  if (noAlt>0) issues.push({ severity:'warning', message:`${noAlt} imágenes sin alt.`});
  if (!ogOk) issues.push({ severity:'info', message:'Completa OG (og:title, og:description, og:image).'});
  if (!twOk) issues.push({ severity:'info', message:'Agrega Twitter Card.'});
  if (!https) issues.push({ severity:'critical', message:'El sitio no usa HTTPS.'});
  if (!hasCanonical) issues.push({ severity:'info', message:'Falta canonical.'});
  if (!viewport) issues.push({ severity:'warning', message:'Falta meta viewport para móvil.'});
  const clamp = (v:number) => Math.max(1, Math.min(100, Math.round(v)));
  const weights = { content:.2, technical:.2, links:.15, accessibility:.15, mobile:.1, social:.05, structuredData:.1, performance:.05 };
  const overall = clamp(
    score.content*weights.content + score.technical*weights.technical + score.links*weights.links +
    score.accessibility*weights.accessibility + score.mobile*weights.mobile + score.social*weights.social +
    score.structuredData*weights.structuredData + score.performance*weights.performance
  );
  return {
    url, finalUrl, headers, status: 200, timing: { ttfb },
    parsed: { title, meta: { name: metaName, property: metaProp }, headings, images,
      links: { total: a.length, internal, external }, canonical, robotsMeta, viewport, schemas, ariaCount },
    scores: { overall, ...score }, issues
  };
}

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.nextUrl.searchParams.get('url') || '');
    const t0 = Date.now();
    const res = await fetch(u.toString(), { redirect: 'follow' });
    const ttfb = Date.now() - t0;
    const html = await res.text();
    const headers = Object.fromEntries(res.headers.entries());
    const r = analyzeHTML(u.toString(), res.url, headers as any, html);
    r.status = res.status; r.timing = { ttfb };
    return NextResponse.json({ mode:'single', target:u.toString(), reports:[r], siteSummary:null });
  } catch (e:any) {
    return NextResponse.json({ error: 'Bad URL', detail: String(e) }, { status: 400 });
  }
}
