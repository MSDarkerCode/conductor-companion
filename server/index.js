import express from 'express';import {DatabaseSync} from 'node:sqlite';import bcrypt from 'bcryptjs';import jwt from 'jsonwebtoken';import cookieParser from 'cookie-parser';
import crypto from 'crypto';import path from 'path';import fs from 'fs';import {fileURLToPath} from 'url';
process.env.TZ=process.env.TZ||'Asia/Kolkata';
const here=path.dirname(fileURLToPath(import.meta.url)),prod=process.env.NODE_ENV==='production';
const SECRET=process.env.JWT_SECRET||crypto.randomBytes(32).toString('hex');
if(!process.env.JWT_SECRET)console.warn('JWT_SECRET is not set. Using a temporary secret, so logins reset on restart.');

const db=new DatabaseSync(process.env.DB_PATH||path.join(here,'data.db'));db.exec('PRAGMA journal_mode=WAL');
db.exec(`create table if not exists users(id integer primary key,email text unique not null,name text not null,hash text not null,role text not null default 'conductor',created_at integer not null);
create table if not exists tickets(id integer primary key,cid text unique not null,user_id integer not null references users(id),from_idx integer not null,to_idx integer not null,pax integer not null,fare_type text not null,amount integer not null,voided integer not null default 0,created_at integer not null);
create index if not exists t_user on tickets(user_id,created_at)`);

const ROUTE={no:'335E',stops:["Majestic","Town Hall","Lalbagh","South End","Jayanagar 4th","Jayanagar 9th","BTM Layout","Silk Board","HSR Layout","Agara","Bellandur","Marathahalli","Kadubeesanahalli","Kundalahalli","ITPL"],fares:[0,5,10,10,15,15,20,20,25]};
const MUL={full:1,half:.5,free:0};
const AE=(process.env.ADMIN_EMAIL||'admin@depot.test').toLowerCase(),AP=process.env.ADMIN_PASSWORD||'admin12345';
if(!db.prepare('select 1 from users where email=?').get(AE)){
  db.prepare('insert into users(email,name,hash,role,created_at) values(?,?,?,?,?)').run(AE,'Depot admin',bcrypt.hashSync(AP,10),'admin',Date.now());
  if(prod&&!process.env.ADMIN_PASSWORD)console.warn('ADMIN_PASSWORD is not set. The admin account uses the default password.');
}

const pub=u=>({id:u.id,name:u.name,email:u.email,role:u.role});
const setCookie=(res,u)=>res.cookie('t',jwt.sign({id:u.id},SECRET,{expiresIn:'12h'}),{httpOnly:true,sameSite:'lax',secure:prod,maxAge:12*36e5});
const auth=(req,res,next)=>{try{const {id}=jwt.verify(req.cookies.t,SECRET);const u=db.prepare('select id,email,name,role from users where id=?').get(id);if(!u)throw 0;req.user=u;next()}catch{res.status(401).json({error:'Please sign in.'})}};
const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Admins only.'});
const hits=new Map();
const limit=(req,res,next)=>{const n=Date.now(),a=(hits.get(req.ip)||[]).filter(t=>n-t<6e4);a.push(n);hits.set(req.ip,a);a.length>20?res.status(429).json({error:'Too many attempts. Wait a minute and try again.'}):next()};
const day0=()=>{const d=new Date();d.setHours(0,0,0,0);return d.getTime()};
const COLS='cid,from_idx,to_idx,pax,fare_type,amount,voided,created_at';

const app=express();app.set('trust proxy',1);app.use(express.json({limit:'10kb'}),cookieParser());
app.get('/api/route',(q,r)=>r.json(ROUTE));

app.post('/api/auth/register',limit,(req,res)=>{
  const {email,name,password}=req.body||{};
  if(!/^\S+@\S+\.\S+$/.test(email||'')||!String(name||'').trim()||String(password||'').length<8)
    return res.status(400).json({error:'Enter your name, a valid email and a password of 8 or more characters.'});
  try{
    const id=db.prepare('insert into users(email,name,hash,role,created_at) values(?,?,?,?,?)').run(email.toLowerCase(),String(name).trim().slice(0,60),bcrypt.hashSync(String(password),10),'conductor',Date.now()).lastInsertRowid;
    const u=db.prepare('select * from users where id=?').get(id);setCookie(res,u);res.status(201).json(pub(u));
  }catch{res.status(409).json({error:'That email is already registered. Try signing in.'})}
});
app.post('/api/auth/login',limit,(req,res)=>{
  const {email,password}=req.body||{};
  const u=db.prepare('select * from users where email=?').get(String(email||'').toLowerCase());
  if(!u||!bcrypt.compareSync(String(password||''),u.hash))return res.status(401).json({error:'Wrong email or password.'});
  setCookie(res,u);res.json(pub(u));
});
app.post('/api/auth/logout',(q,r)=>r.clearCookie('t').json({ok:1}));
app.get('/api/auth/me',auth,(q,r)=>r.json(q.user));

app.get('/api/tickets',auth,(q,r)=>{
  const s=day0();
  r.json({tickets:db.prepare(`select ${COLS} from tickets where user_id=? and created_at>=? order by id desc limit 30`).all(q.user.id,s),
    totals:db.prepare('select count(*) n,coalesce(sum(pax),0) pax,coalesce(sum(amount),0) cash from tickets where user_id=? and voided=0 and created_at>=?').get(q.user.id,s)});
});
app.post('/api/tickets',auth,(req,res)=>{
  const {cid,from,to,pax,type,at}=req.body||{},L=ROUTE.fares.length;
  const ok=typeof cid==='string'&&cid.length>=8&&cid.length<=64&&Number.isInteger(from)&&Number.isInteger(to)&&from>=0&&to>from&&to<ROUTE.stops.length&&to-from<L&&Number.isInteger(pax)&&pax>=1&&pax<=20&&typeof type==='string'&&Object.hasOwn(MUL,type);
  if(!ok)return res.status(400).json({error:'That ticket is not valid.'});
  const ex=db.prepare(`select user_id,${COLS} from tickets where cid=?`).get(cid);
  if(ex)return ex.user_id===req.user.id?res.json(ex):res.status(409).json({error:'Ticket id already used.'});
  const now=Date.now(),when=Number.isFinite(at)&&at<=now&&now-at<864e5?at:now;
  const amount=Math.ceil(ROUTE.fares[to-from]*MUL[type])*pax;
  db.prepare('insert into tickets(cid,user_id,from_idx,to_idx,pax,fare_type,amount,created_at) values(?,?,?,?,?,?,?,?)').run(cid,req.user.id,from,to,pax,type,amount,when);
  res.status(201).json(db.prepare(`select ${COLS} from tickets where cid=?`).get(cid));
});
app.post('/api/tickets/:cid/void',auth,(q,r)=>{
  const t=db.prepare('select * from tickets where cid=? and user_id=?').get(q.params.cid,q.user.id);
  if(!t)return r.status(404).json({error:'Ticket not found.'});
  if(Date.now()-t.created_at>6e4)return r.status(403).json({error:'Too late to undo. Ask the depot admin.'});
  db.prepare('update tickets set voided=1 where id=?').run(t.id);r.json({ok:1});
});

app.get('/api/admin/summary',auth,admin,(q,r)=>r.json({
  rows:db.prepare(`select u.id,u.name,u.email,count(t.id) tickets,coalesce(sum(t.pax),0) pax,coalesce(sum(t.amount),0) cash,max(t.created_at) last from users u left join tickets t on t.user_id=u.id and t.voided=0 and t.created_at>=? where u.role='conductor' group by u.id order by cash desc`).all(day0()),
  recent:db.prepare('select t.cid,t.pax,t.amount,t.fare_type,t.from_idx,t.to_idx,t.voided,t.created_at,u.name from tickets t join users u on u.id=t.user_id order by t.id desc limit 15').all()}));

app.use('/api',(q,r)=>r.status(404).json({error:'Not found.'}));
const dist=path.join(here,'..','dist');
if(fs.existsSync(dist)){app.use(express.static(dist));app.get(/^\/(?!api).*/,(q,r)=>r.sendFile(path.join(dist,'index.html')))}
app.use((e,q,r,n)=>r.status(400).json({error:'Bad request.'}));
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('Conductor Companion on port '+PORT));
