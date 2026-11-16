function easterSunday(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
  return new Date(Date.UTC(year,month-1,day));
}
export function getOpeningStatus(now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const y=Number(parts.year),mo=Number(parts.month),day=Number(parts.day),minutes=Number(parts.hour)*60+Number(parts.minute),date=`${parts.year}-${parts.month}-${parts.day}`;
  const weekday=new Date(Date.UTC(y,mo-1,day)).getUTCDay();
  const fixed=['01-01','05-01','05-08','07-05','07-06','09-28','10-28','11-17','12-24','12-25','12-26'];
  const easter=easterSunday(y),offset=n=>new Date(easter.getTime()+n*86400000).toISOString().slice(0,10);
  if(date>='2026-10-28'&&date<='2026-10-30')return {open:false,label:'Zavřeno',detail:'28.–30. října zavřeno'};
  if(fixed.includes(date.slice(5))||date===offset(-2)||date===offset(1))return {open:false,label:'Zavřeno',detail:'Dnes je svátek'};
  if(weekday===0||weekday===6)return {open:false,label:'Zavřeno',detail:'O víkendu zavřeno'};
  const summer=mo>=3&&mo<=10;
  if(summer&&minutes>=600&&minutes<720)return {open:true,label:'Otevřeno',detail:'Dnes 10–12 / 13–17 hod.'};
  if(minutes>=780&&minutes<1020)return {open:true,label:'Otevřeno',detail:summer?'Dnes 10–12 / 13–17 hod.':'Dnes 13–17 hod.'};
  if(summer&&minutes>=720&&minutes<780)return {open:false,label:'Polední přestávka',detail:'Otevíráme ve 13:00'};
  return {open:false,label:'Zavřeno',detail:minutes<780?(summer?'Dnes od 10:00':'Dnes od 13:00'):'Dnes jsme měli otevřeno do 17:00'};
}
if(typeof document!=='undefined') {
  let notices=[],available=false;
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  const banner=document.createElement('aside');banner.className='live-notice';banner.hidden=true;banner.setAttribute('aria-label','Aktuální oznámení');document.querySelector('header')?.after(banner);
  function update(){let s=getOpeningStatus();const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const closing=notices.find(n=>n.closed&&n.start_date<=date&&n.end_date>=date);if(closing)s={open:false,label:'Zavřeno',detail:closing.message};if(!available&&!local)s={open:false,label:'Ověřte telefonicky',detail:'Aktuální změny otevírací doby se nepodařilo načíst.'};document.querySelectorAll('[data-opening]').forEach(el=>{el.classList.toggle('is-open',s.open);el.classList.toggle('is-closed',!s.open);el.querySelector('[data-status-label]').textContent=s.label;el.title=s.detail;el.setAttribute('aria-label',s.label+'. '+s.detail);});const format=d=>new Intl.DateTimeFormat('cs-CZ',{day:'numeric',month:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));banner.textContent=notices.map(n=>format(n.start_date)+(n.end_date!==n.start_date?' – '+format(n.end_date):'')+': '+n.message).join(' · ');banner.hidden=!notices.length;const originalClosure=document.querySelector('.shop-news strong');if(originalClosure)originalClosure.hidden=date>'2026-10-30';}
  async function refresh(){try{const r=await fetch('/api/notice',{cache:'no-store'});if(!r.ok)throw new Error();const data=await r.json();notices=data.notices;available=true;}catch{available=false;}update();}
  refresh();setInterval(update,30000);setInterval(refresh,60000);
  const menu=document.querySelector('.mobile-menu');
  menu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.open=false;}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu?.open){menu.open=false;menu.querySelector('summary').focus();}});
}

if(typeof document!=='undefined'){
 const links=document.querySelectorAll('.original-gallery a, .content-gallery a');
 if(links.length){
 const dialog=document.createElement('dialog');dialog.className='photo-viewer';dialog.setAttribute('aria-label','Fotografie v plné velikosti');
 const close=document.createElement('button');close.type='button';close.textContent='Zavřít ×';
 const image=document.createElement('img');dialog.append(close,image);document.body.append(dialog);
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 links.forEach(link=>link.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();image.src=link.href;image.alt=link.querySelector('img')?.alt||'Fotografie BikeTech';dialog.showModal();}));
 }
}
