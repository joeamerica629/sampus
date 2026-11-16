const encoder=new TextEncoder();
const security={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
function response(body,status=200,headers={}){return new Response(body,{status,headers:{...security,...headers}});}
function json(value,status=200,headers={}){return response(JSON.stringify(value),status,{'Content-Type':'application/json; charset=utf-8',...headers});}
async function digest(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
async function equals(a,b){const [l,r]=await Promise.all([digest(a),digest(b)]);let d=0;for(let i=0;i<l.length;i++)d|=l[i]^r[i];return d===0;}
async function sign(payload,password){const key=await crypto.subtle.importKey('raw',encoder.encode('biketech-admin-session:'+password),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function authenticated(request,env){if(!env.ADMIN_PASSWORD)return false;const token=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('bt_admin='))?.slice(9);if(!token)return false;const [expires,nonce,sig,...rest]=token.split('.');if(rest.length||!/^\d+$/.test(expires)||!nonce||!sig||Number(expires)<Date.now()||Number(expires)>Date.now()+9*3600000)return false;return equals(sig,await sign(expires+'.'+nonce,env.ADMIN_PASSWORD));}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function validDate(s){return typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
async function init(db){await db.prepare('CREATE TABLE IF NOT EXISTS notices (id TEXT PRIMARY KEY,start_date TEXT NOT NULL,end_date TEXT NOT NULL,message TEXT NOT NULL,closed INTEGER NOT NULL,created_at TEXT NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0)').run();await db.prepare('CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL)').run();}
async function basic(request,env){if(!env.PREVIEW_PASSWORD)return false;const header=request.headers.get('Authorization')||'';let user='',password='',format=false;if(/^Basic /i.test(header)){try{const raw=Uint8Array.from(atob(header.slice(6)),c=>c.charCodeAt(0)),decoded=new TextDecoder('utf-8',{fatal:true}).decode(raw),at=decoded.indexOf(':');if(at>=0){user=decoded.slice(0,at);password=decoded.slice(at+1);format=true;}}catch{}}const [u,p]=await Promise.all([equals(user,env.PREVIEW_USER||'klient'),equals(password,env.PREVIEW_PASSWORD)]);return format&&u&&p;}
export default{async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(url.protocol!=='https:')return response('HTTPS required',403);
  if(!env.ASSETS)return response('Preview is not configured.',503);
  const admin=await authenticated(request,env);
  if(path.startsWith('/api/admin/')){
    if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return json({error:'Neplatný původ požadavku.'},403);
    if(!env.ADMIN_PASSWORD||!env.DB)return json({error:'Správa ještě není nakonfigurovaná.'},503);
    try{
      if(path==='/api/admin/login'&&request.method==='POST'){
        if(Number(request.headers.get('Content-Length')||0)>4096)return json({error:'Příliš dlouhý požadavek.'},413);
        await init(env.DB);
        const ip=request.headers.get('CF-Connecting-IP')||'unknown',bucket=Math.floor(Date.now()/900000),key=[...await digest(ip+':'+bucket)].map(b=>b.toString(16).padStart(2,'0')).join('');
        const attempt=await env.DB.prepare('INSERT INTO login_attempts(key,attempts,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,Date.now()+900000).first();
        if(attempt.attempts>10)return json({error:'Příliš mnoho pokusů. Zkuste to za 15 minut.'},429,{'Retry-After':'900'});
        const input=await request.json();const [u,p]=await Promise.all([equals(String(input.username||'').normalize('NFC'),'Šampus'),equals(String(input.password||''),env.ADMIN_PASSWORD)]);
        if(!u||!p)return json({error:'Nesprávné jméno nebo heslo.'},401);
        const payload=(Date.now()+8*3600000)+'.'+crypto.randomUUID(),token=payload+'.'+await sign(payload,env.ADMIN_PASSWORD);
        await env.DB.prepare('DELETE FROM login_attempts WHERE expires < ?').bind(Date.now()-86400000).run();
        return json({ok:true},200,{'Set-Cookie':'bt_admin='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800'});
      }
      if(!admin)return json({error:'Přihlaste se prosím.'},401);
      if(path==='/api/admin/logout'&&request.method==='POST')return json({ok:true},200,{'Set-Cookie':'bt_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
      await init(env.DB);
      if(path==='/api/admin/notices'&&request.method==='GET'){const r=await env.DB.prepare('SELECT id,start_date,end_date,message,closed FROM notices WHERE cancelled=0 AND end_date>=? ORDER BY start_date,created_at DESC').bind(today()).all();return json({notices:r.results});}
      if(path==='/api/admin/notices'&&request.method==='POST'){
        if(Number(request.headers.get('Content-Length')||0)>4096)return json({error:'Příliš dlouhý požadavek.'},413);
        const n=await request.json();if(!validDate(n.start)||!validDate(n.end)||n.start>n.end||n.end<today()||typeof n.message!=='string'||!n.message.trim()||n.message.length>240||typeof n.closed!=='boolean')return json({error:'Zkontrolujte datum a text oznámení (nejvýše 240 znaků).'},400);
        const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO notices(id,start_date,end_date,message,closed,created_at) VALUES(?,?,?,?,?,?)').bind(id,n.start,n.end,n.message.trim(),n.closed?1:0,new Date().toISOString()).run();return json({ok:true,id},201);
      }
      if(path.startsWith('/api/admin/notices/')&&request.method==='DELETE'){
        const id=path.slice('/api/admin/notices/'.length);if(!/^[a-f0-9-]{36}$/.test(id))return json({error:'Neplatné oznámení.'},400);
        await env.DB.prepare('UPDATE notices SET cancelled=1 WHERE id=?').bind(id).run();return json({ok:true});
      }
      return json({error:'Nenalezeno.'},404);
    }catch{return json({error:'Uložení se nepodařilo. Zkuste to prosím znovu.'},503);}
  }
  if(['/sprava','/sprava/','/sprava.html','/sprava.css','/sprava.mjs','/assets/logo-original.png'].includes(path)){
    const target=new URL(request.url);if(path==='/sprava/')target.pathname='/sprava';
    const asset=await env.ASSETS.fetch(new Request(target,request));const r=new Response(asset.body,asset);for(const [k,v]of Object.entries(security))r.headers.set(k,v);return r;
  }
  const publicHost=['biketech.cz','www.biketech.cz'].includes(url.hostname);
  if(!publicHost&&!admin&&!await basic(request,env)){
    if(!env.PREVIEW_PASSWORD)return response('Preview is not configured. Přihlaste se na /sprava.',503);
    return response('Authentication required.',401,{'WWW-Authenticate':'Basic realm="BikeTech preview", charset="UTF-8"'});
  }
  if(path==='/api/notice'){
    if(!env.DB)return json({notices:[]});
    try{await init(env.DB);const r=await env.DB.prepare('SELECT start_date,end_date,message,closed FROM notices WHERE cancelled=0 AND end_date>=? ORDER BY start_date,created_at DESC').bind(today()).all();return json({notices:r.results});}catch{return json({error:'Oznámení se nepodařilo načíst.'},503);}
  }
  const asset=await env.ASSETS.fetch(request),r=new Response(asset.body,asset);for(const [k,v]of Object.entries(security))r.headers.set(k,v);return r;
}};
