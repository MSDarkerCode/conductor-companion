import {useCallback,useEffect,useRef,useState} from 'react';

const api=async(p,o={})=>{
  const r=await fetch('/api'+p,{method:o.body?'POST':'GET',headers:o.body?{'Content-Type':'application/json'}:{},body:o.body&&JSON.stringify(o.body),signal:AbortSignal.timeout?.(8000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d.error||'Something went wrong.'),{status:r.status});
  return d;
};
const ls={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
const rs=v=>v?'₹'+v:'Free';
const MUL={full:1,half:.5,free:0},LBL={full:'Full',half:'Half',free:'Free'};
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,12);
let ac;
function fb(u){navigator.vibrate?.(u?[20,40,20]:30);
  try{ac=ac||new AudioContext();const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=u?330:880;g.gain.value=.08;o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+.07)}catch{}}
const clock=ms=>ms?new Date(ms).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'none yet';

export default function App(){
  const [user,setUser]=useState(undefined);
  useEffect(()=>{api('/auth/me').then(setUser,()=>setUser(null))},[]);
  const th=ls.get('theme','sun');
  if(user===undefined)return <div className={'app '+th}><div className="shell"><div className="auth"><p>Loading…</p></div></div></div>;
  if(!user)return <Auth onAuth={setUser}/>;
  const out=()=>setUser(null);
  return user.role==='admin'?<Admin user={user} out={out}/>:<Ticketing user={user} out={out}/>;
}

function Auth({onAuth}){
  const [reg,setReg]=useState(false),[f,setF]=useState({name:'',email:'',password:''}),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
  const up=k=>e=>setF({...f,[k]:e.target.value});
  const go=async e=>{e.preventDefault();setBusy(true);setErr('');
    try{onAuth(await api(reg?'/auth/register':'/auth/login',{body:f}))}
    catch(x){setErr(x.status?x.message:'No connection. Check your network and try again.');setBusy(false)}};
  return <div className={'app '+ls.get('theme','sun')}><div className="shell"><div className="auth">
    <h1>Conductor Companion</h1><p>{reg?'Create your conductor account.':'Sign in to start your shift.'}</p>
    <form onSubmit={go}>
      {reg&&<input placeholder="Full name" value={f.name} onChange={up('name')} autoComplete="name" required/>}
      <input type="email" placeholder="Email" value={f.email} onChange={up('email')} autoComplete="email" required/>
      <input type="password" placeholder="Password (8 or more characters)" value={f.password} onChange={up('password')} autoComplete={reg?'new-password':'current-password'} minLength={reg?8:undefined} required/>
      {err&&<div className="err" role="alert">{err}</div>}
      <button className="pri" disabled={busy}>{busy?'Please wait…':reg?'Create account':'Sign in'}</button>
    </form>
    <button className="lnk" onClick={()=>{setReg(!reg);setErr('')}}>{reg?'I already have an account':'New conductor? Create an account'}</button>
  </div></div></div>;
}

function Ticketing({user,out}){
  const [route,setRoute]=useState(()=>ls.get('route',null));
  const [cur,setCur]=useState(()=>ls.get('cur:'+user.id,0)),[sel,setSel]=useState(null),[type,setType]=useState('full');
  const [tot,setTot]=useState({n:0,pax:0,cash:0,list:[]}),[q,setQ]=useState(()=>ls.get('q:'+user.id,[]));
  const [net,setNet]=useState(navigator.onLine),[last,setLast]=useState(null),[secs,setSecs]=useState(null),[msg,setMsg]=useState('');
  const [theme,setTheme]=useState(()=>ls.get('theme','sun')),[hand,setHand]=useState(()=>ls.get('hand','R')),[menu,setMenu]=useState(false);
  const t0=useRef(0),lastAt=useRef(0),tm=useRef(),pend=useRef(),sx=useRef(0),qr=useRef(q);
  const setQueue=n=>{qr.current=n;setQ(n);ls.set('q:'+user.id,n)};
  const price=t=>route?Math.ceil(route.fares[t.to-t.from]*MUL[t.type])*t.pax:0;
  const adj=(s,t)=>setTot(x=>({...x,n:x.n+s,pax:x.pax+s*t.pax,cash:x.cash+s*price(t)}));
  const pick=(k,v)=>{(k==='theme'?setTheme:setHand)(v);ls.set(k,v)};

  const refresh=useCallback(async()=>{
    try{const d=await api('/tickets');setTot({...d.totals,list:d.tickets});setNet(true)}
    catch(e){e.status===401?out():setNet(false)}},[]);
  const flush=useCallback(async()=>{
    for(const t of [...qr.current]){
      try{await api('/tickets',{body:t})}
      catch(e){if(e.status===401)return out();if(!e.status){setNet(false);return}}
      setQueue(qr.current.filter(x=>x.cid!==t.cid));
    }
    await refresh()},[refresh]);
  useEffect(()=>{
    api('/route').then(r=>{setRoute(r);ls.set('route',r)},()=>{});
    flush();
    const on=()=>{setNet(true);flush()},off=()=>setNet(false);
    addEventListener('online',on);addEventListener('offline',off);
    const iv=setInterval(()=>qr.current.length&&flush(),15000);
    return()=>{removeEventListener('online',on);removeEventListener('offline',off);clearInterval(iv)}},[]);

  if(!route)return <div className={'app '+theme}><div className="shell"><div className="auth"><p>Loading the route. Check your connection if this stays here.</p></div></div></div>;

  const D=route.fares.length-1;
  let ds=Array.from({length:D},(_,i)=>i+1);const pr=[];for(let k=0;k<D;k+=2)pr.push(ds.slice(k,k+2));ds=pr.reverse().flat();
  const stop=i=>route.stops[i];
  const cash=tot.cash+q.reduce((s,t)=>s+price(t),0),n=tot.n+q.length;
  const per=sel?Math.ceil(route.fares[sel]*MUL[type]):0;

  function issue(p){
    if(!sel||Date.now()-lastAt.current<500)return;lastAt.current=Date.now();
    const t={cid:uid(),from:cur,to:cur+sel,pax:p,type,at:Date.now()};
    setSecs(t0.current?(Date.now()-t0.current)/1000:null);t0.current=0;setSel(null);setMsg('');
    setLast({...t,queued:false});adj(1,t);fb();
    clearTimeout(tm.current);tm.current=setTimeout(()=>setLast(null),5000);
    pend.current=api('/tickets',{body:t}).then(()=>{setNet(true);refresh()},e=>{
      if(e.status===401)return out();
      adj(-1,t);
      if(e.status){setLast(null);setMsg(e.message)}
      else{setNet(false);setQueue([...qr.current,t]);setLast(l=>l&&l.cid===t.cid?{...l,queued:true}:l)}});
  }
  async function undo(){
    const l=last;if(!l)return;clearTimeout(tm.current);setLast(null);fb(1);await pend.current;
    if(qr.current.some(x=>x.cid===l.cid))return setQueue(qr.current.filter(x=>x.cid!==l.cid));
    adj(-1,l);
    try{await api(`/tickets/${l.cid}/void`,{body:{}})}catch(e){setMsg(e.status?e.message:'Could not undo: no connection.')}
    refresh();
  }
  const adv=()=>{const m=route.stops.length-D,k=(cur+1)%m;setCur(k);ls.set('cur:'+user.id,k);setSel(null);t0.current=0};
  const logout=async()=>{await api('/auth/logout',{body:{}}).catch(()=>{});out()};

  return <div className={`app ${theme} ${hand}`}><div className="shell">
    <div className="gl">
      <div className="row"><div><small>Now at</small><b className="cur">{stop(cur)}</b></div><div><small>Next</small><b className="nxt">{stop(cur+1)}</b></div></div>
      <div className="chips"><span>{route.no}</span><span>Cash <b>₹{cash}</b></span><span>Tickets <b>{n}</b></span>
        {secs!=null&&<span className={secs<4?'g':'r'}>{secs.toFixed(1)}s</span>}
        {(!net||q.length>0)&&<span className="am">{net?'Syncing ':'Offline, '}{q.length} queued</span>}
        <button className="gear" aria-label="Menu" onClick={()=>setMenu(true)}>⚙</button></div>
    </div>
    <div className={'rcpt '+(last?'ok':msg?'bad':'')} onPointerDown={e=>sx.current=e.clientX} onPointerUp={e=>{if(last&&e.clientX-sx.current<-60)undo()}}>
      <span>{last?`✓ ${last.pax} × ${stop(last.to)}, ${rs(price(last))}${last.queued?' (will sync)':''}`:msg||'Ready. Tap a stop.'}</span>
      {last?<button className="rb" onClick={undo}>Undo</button>:msg?<button className="rb" onClick={()=>setMsg('')}>Dismiss</button>:<button className="rb" onClick={adv}>Next stop ›</button>}
    </div>
    <div className="dest">{ds.map(d=><button key={d} className={'tile'+(sel===d?' on':'')} onPointerDown={()=>{if(!t0.current)t0.current=Date.now()}} onClick={()=>setSel(d)}><span>{stop(cur+d)}</span><b>₹{route.fares[d]}</b></button>)}</div>
    <div className={'dock'+(sel?'':' idle')}>
      <div className="sel">{sel?`${stop(cur+sel)}, ${per?'₹'+per+' each':'free'}. Now tap passengers.`:'Pick a stop'}</div>
      <div className="seg">{Object.keys(MUL).map(k=><button key={k} className={type===k?'on':''} onClick={()=>setType(k)}>{LBL[k]}</button>)}</div>
      <div className="cnt">{[1,2,3,4,5].map(p=><button key={p} onClick={()=>issue(p)}>{p}</button>)}</div>
    </div>
    {menu&&<div className="menu">
      <div className="row"><h2>{user.name}</h2><button className="rb" onClick={()=>setMenu(false)}>Close</button></div>
      <div className="seg"><button className={theme==='sun'?'on':''} onClick={()=>pick('theme','sun')}>Sun theme</button><button className={theme==='night'?'on':''} onClick={()=>pick('theme','night')}>Night theme</button></div>
      <div className="seg"><button className={hand==='R'?'on':''} onClick={()=>pick('hand','R')}>Right hand</button><button className={hand==='L'?'on':''} onClick={()=>pick('hand','L')}>Left hand</button></div>
      <h3>Today's tickets</h3>
      <ul>{tot.list.length?tot.list.map(t=><li key={t.cid} className={t.voided?'void':''}>{stop(t.from_idx)} to {stop(t.to_idx)}: {t.pax} × {LBL[t.fare_type]}, {rs(t.amount)}</li>):<li>No tickets yet today.</li>}</ul>
      <button className="rb" style={{width:'100%',marginTop:12}} onClick={logout}>Sign out</button>
    </div>}
  </div></div>;
}

function Admin({user,out}){
  const [d,setD]=useState(null),[route,setRoute]=useState(null),[err,setErr]=useState('');
  useEffect(()=>{
    api('/route').then(setRoute,()=>{});
    const l=()=>api('/admin/summary').then(x=>{setD(x);setErr('')},e=>e.status===401?out():setErr(e.status?e.message:'Offline. Retrying…'));
    l();const i=setInterval(l,8000);return()=>clearInterval(i)},[]);
  const tot=(d?.rows||[]).reduce((s,r)=>({n:s.n+r.tickets,pax:s.pax+r.pax,cash:s.cash+r.cash}),{n:0,pax:0,cash:0});
  return <div className={'app '+ls.get('theme','sun')}><div className="adm">
    <div className="row"><div><h1>Depot dashboard</h1><p className="mute">Signed in as {user.name}. Today's figures, refreshed every 8 seconds.</p></div>
      <button className="rb" onClick={async()=>{await api('/auth/logout',{body:{}}).catch(()=>{});out()}}>Sign out</button></div>
    {err&&<div className="err" role="alert">{err}</div>}
    <div className="kpis"><div><small>Collected</small><b>₹{tot.cash}</b></div><div><small>Tickets</small><b>{tot.n}</b></div><div><small>Passengers</small><b>{tot.pax}</b></div></div>
    <h2>Conductors</h2>
    <div className="w"><table><thead><tr><th>Conductor</th><th className="num">Tickets</th><th className="num">Passengers</th><th className="num">Cash</th><th>Last ticket</th></tr></thead>
      <tbody>{d&&d.rows.length?d.rows.map(r=><tr key={r.id}><td>{r.name}<br/><small>{r.email}</small></td><td className="num">{r.tickets}</td><td className="num">{r.pax}</td><td className="num">₹{r.cash}</td><td>{clock(r.last)}</td></tr>):<tr><td colSpan="5">No conductors yet. Ask them to create an account.</td></tr>}</tbody></table></div>
    <h2>Latest tickets</h2>
    <ul>{route&&d&&d.recent.map(t=><li key={t.cid} className={t.voided?'void':''}>{clock(t.created_at)}, {t.name}: {route.stops[t.from_idx]} to {route.stops[t.to_idx]}, {t.pax} × {LBL[t.fare_type]}, ₹{t.amount}{t.voided?' (voided)':''}</li>)}</ul>
  </div></div>;
}
