const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Telegraf, Markup } = require("telegraf");
const router = express.Router();

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const dbOf = req => req.app.get("db");
const log = (db, deviceId, userId, type, description) =>
  db.prepare("INSERT INTO activity_logs(id,device_id,user_id,event_type,description,created_at) VALUES(?,?,?,?,?,?)")
    .run(id(), deviceId || null, userId || null, type, description, now());

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Authentication required" }); }
}
function ownerDevice(req, res, next) {
  const d = dbOf(req).prepare("SELECT * FROM devices WHERE id=? AND user_id=? AND revoked_at IS NULL").get(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: "Device not found" });
  req.device = d; next();
}
router.post("/auth/register", async (req,res) => {
  const { username, password } = req.body || {};
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username || "") || (password || "").length < 10) return res.status(400).json({error:"Username 3-32 chars; password minimum 10 chars"});
  const db=dbOf(req), uid=id();
  try {
    db.prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)").run(uid,username,await bcrypt.hash(password,12),now());
    res.json({token:jwt.sign({id:uid,username},process.env.JWT_SECRET,{expiresIn:"12h"}),user:{id:uid,username}});
  } catch { res.status(409).json({error:"Username already exists"}); }
});
router.post("/auth/login", async (req,res) => {
  const {username,password}=req.body||{}, db=dbOf(req);
  const u=db.prepare("SELECT * FROM users WHERE username=?").get(username||"");
  if (!u || !await bcrypt.compare(password||"",u.password_hash)) return res.status(401).json({error:"Invalid username or password"});
  res.json({token:jwt.sign({id:u.id,username:u.username},process.env.JWT_SECRET,{expiresIn:"12h"}),user:{id:u.id,username:u.username}});
});
router.use((req,res,next)=>{ if(req.path==="/devices/pair" || req.path==="/gallery/upload") return next(); return auth(req,res,next); });
router.get("/auth/me",(req,res)=>res.json({user:req.user}));
router.post("/auth/logout",(_req,res)=>res.json({ok:true}));

router.get("/overview",(req,res)=>{
 const db=dbOf(req), devices=db.prepare("SELECT * FROM devices WHERE user_id=? AND revoked_at IS NULL").all(req.user.id);
 const media=db.prepare("SELECT COUNT(*) n FROM media m JOIN devices d ON d.id=m.device_id WHERE d.user_id=?").get(req.user.id).n;
 const activity=db.prepare("SELECT a.* FROM activity_logs a LEFT JOIN devices d ON d.id=a.device_id WHERE a.user_id=? OR d.user_id=? ORDER BY a.created_at DESC LIMIT 8").all(req.user.id,req.user.id);
 res.json({total:devices.length,online:devices.filter(x=>x.status==="online").length,offline:devices.filter(x=>x.status!=="online").length,media,devices,activity});
});
router.get("/devices",(req,res)=>res.json(dbOf(req).prepare("SELECT id,device_name,device_model,android_version,status,last_seen,created_at FROM devices WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC").all(req.user.id)));
router.post("/devices/pair-code",(req,res)=>{
 const {device_name="Family device"}=req.body||{}, db=dbOf(req);
 const code=String(crypto.randomInt(1000,10000));
 const deviceId=id();
 db.prepare("INSERT INTO devices(id,user_id,device_name,pairing_code,created_at) VALUES(?,?,?,?,?)").run(deviceId,req.user.id,String(device_name).slice(0,60),code,now());
 log(db,deviceId,req.user.id,"pair_code_created","Pairing code created");
 res.json({deviceId,pairingCode:code,expiresInMinutes:15,note:"Pairing code is single-use and expires after 15 minutes."});
});
router.post("/devices/pair",(req,res)=>{
 const {pairingCode,deviceName,deviceModel,androidVersion}=req.body||{}, db=dbOf(req);
 const d=db.prepare("SELECT * FROM devices WHERE pairing_code=? AND user_id=? AND revoked_at IS NULL").get(String(pairingCode||""),req.user.id);
 if(!d) return res.status(400).json({error:"Invalid or already used pairing code"});
 const credential=crypto.randomBytes(32).toString("hex");
 db.prepare("UPDATE devices SET pairing_code=NULL,device_credential_hash=?,device_name=?,device_model=?,android_version=?,status='online',last_seen=? WHERE id=?")
   .run(bcrypt.hashSync(credential,12),String(deviceName||d.device_name).slice(0,60),String(deviceModel||"").slice(0,100),String(androidVersion||"").slice(0,40),now(),d.id);
 db.prepare("INSERT OR IGNORE INTO camera_permissions(id,device_id) VALUES(?,?)").run(id(),d.id);
 log(db,d.id,req.user.id,"device_paired","Android device paired");
 res.json({deviceId:d.id,deviceCredential:credential,deviceName:deviceName||d.device_name});
});
router.delete("/devices/:id",ownerDevice,(req,res)=>{
 const db=dbOf(req); db.prepare("UPDATE devices SET revoked_at=?,status='offline',device_credential_hash=NULL WHERE id=?").run(now(),req.device.id);
 db.prepare("UPDATE camera_permissions SET remote_camera_enabled=0,revoked_at=? WHERE device_id=?").run(now(),req.device.id);
 log(db,req.device.id,req.user.id,"device_revoked","Device access revoked");
 req.app.get("io").to(`device:${req.device.id}`).emit("device:revoked",{deviceId:req.device.id});
 res.json({ok:true});
});

const uploadRoot=path.resolve(process.env.UPLOAD_DIR||"./storage/uploads");
const storage=multer.diskStorage({destination:(_req,_file,cb)=>cb(null,uploadRoot),filename:(_req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).slice(0,10))});
const upload=multer({storage,limits:{fileSize:Number(process.env.MAX_UPLOAD_MB||50)*1024*1024},fileFilter:(_req,file,cb)=>cb(null,/^(image\/|video\/)/.test(file.mimetype))});
router.get("/gallery",(req,res)=>{
 const rows=dbOf(req).prepare("SELECT m.*,d.device_name FROM media m JOIN devices d ON d.id=m.device_id WHERE d.user_id=? ORDER BY m.created_at DESC LIMIT 200").all(req.user.id);
 res.json(rows.map(x=>({...x,downloadUrl:`/api/gallery/${x.id}/download`})));
});
router.post("/gallery/upload",upload.single("media"),(req,res)=>{
 if(!req.file) return res.status(400).json({error:"Choose an image or video first"});
 const db=dbOf(req), d=db.prepare("SELECT * FROM devices WHERE id=? AND revoked_at IS NULL").get(req.body.deviceId);
 if(!d || !bcrypt.compareSync(req.body.deviceCredential||"",d.device_credential_hash||"")) { fs.unlinkSync(req.file.path); return res.status(403).json({error:"Device authentication failed"}); }
 const mid=id(), type=req.file.mimetype.startsWith("image/")?"image":"video";
 db.prepare("INSERT INTO media(id,device_id,filename,original_name,media_type,file_path,file_size,created_at) VALUES(?,?,?,?,?,?,?,?)")
 .run(mid,d.id,req.file.filename,req.file.originalname,type,req.file.path,req.file.size,now());
 log(db,d.id,d.user_id,"media_shared",`${type} shared: ${req.file.originalname}`);
 res.json({id:mid,mediaType:type,fileSize:req.file.size});
});
router.get("/gallery/:id/download", (req,res)=>{
 const row=dbOf(req).prepare("SELECT m.* FROM media m JOIN devices d ON d.id=m.device_id WHERE m.id=? AND d.user_id=?").get(req.params.id,req.user.id);
 if(!row || !fs.existsSync(row.file_path)) return res.status(404).json({error:"Media not found"});
 res.download(row.file_path,row.original_name);
});
router.delete("/gallery/:id",(req,res)=>{
 const db=dbOf(req), row=db.prepare("SELECT m.* FROM media m JOIN devices d ON d.id=m.device_id WHERE m.id=? AND d.user_id=?").get(req.params.id,req.user.id);
 if(!row) return res.status(404).json({error:"Media not found"});
 if(fs.existsSync(row.file_path)) fs.unlinkSync(row.file_path);
 db.prepare("DELETE FROM media WHERE id=?").run(row.id); res.json({ok:true});
});

router.get("/permissions/:id",ownerDevice,(req,res)=>{
 const p=dbOf(req).prepare("SELECT * FROM camera_permissions WHERE device_id=?").get(req.device.id);
 res.json(p||{remote_camera_enabled:0});
});
router.post("/permissions/:id/revoke",ownerDevice,(req,res)=>{
 const db=dbOf(req); db.prepare("UPDATE camera_permissions SET remote_camera_enabled=0,revoked_at=? WHERE device_id=?").run(now(),req.device.id);
 db.prepare("UPDATE camera_sessions SET status='stopped',stopped_at=? WHERE device_id=? AND status='active'").run(now(),req.device.id);
 req.app.get("io").to(`device:${req.device.id}`).emit("camera:stop",{reason:"consent_revoked"});
 log(db,req.device.id,req.user.id,"camera_consent_revoked","Remote camera consent revoked");
 res.json({ok:true});
});
router.post("/camera/start/:id",ownerDevice,(req,res)=>{
 const db=dbOf(req), p=db.prepare("SELECT * FROM camera_permissions WHERE device_id=?").get(req.device.id);
 if(!p || !p.remote_camera_enabled || p.revoked_at) return res.status(403).json({error:"Remote Camera consent is not active on this device"});
 const sid=id(); db.prepare("INSERT INTO camera_sessions(id,device_id,user_id,status,started_at) VALUES(?,?,?,'requested',?)").run(sid,req.device.id,req.user.id,now());
 req.app.get("io").to(`device:${req.device.id}`).emit("camera:start-request",{sessionId:sid});
 log(db,req.device.id,req.user.id,"camera_start_requested","Remote camera session requested");
 res.json({sessionId:sid,status:"requested",message:"The device must accept/fulfil the request while showing a visible camera notification."});
});
router.post("/camera/stop/:id",ownerDevice,(req,res)=>{
 const db=dbOf(req); db.prepare("UPDATE camera_sessions SET status='stopped',stopped_at=? WHERE device_id=? AND status IN ('requested','active')").run(now(),req.device.id);
 req.app.get("io").to(`device:${req.device.id}`).emit("camera:stop",{reason:"owner_stopped"});
 res.json({ok:true});
});
router.get("/camera/sessions",(req,res)=>res.json(dbOf(req).prepare("SELECT s.* ,d.device_name FROM camera_sessions s JOIN devices d ON d.id=s.device_id WHERE d.user_id=? ORDER BY s.started_at DESC LIMIT 100").all(req.user.id)));
router.get("/camera/status",(req,res)=>res.json(dbOf(req).prepare("SELECT d.id deviceId,d.device_name,p.remote_camera_enabled,p.revoked_at FROM devices d LEFT JOIN camera_permissions p ON p.device_id=d.id WHERE d.user_id=? AND d.revoked_at IS NULL").all(req.user.id)));
router.get("/activity",(req,res)=>res.json(dbOf(req).prepare("SELECT a.* FROM activity_logs a LEFT JOIN devices d ON d.id=a.device_id WHERE a.user_id=? OR d.user_id=? ORDER BY a.created_at DESC LIMIT 200").all(req.user.id,req.user.id)));
router.get("/activity/:deviceId",(req,res)=>{
 const d=dbOf(req).prepare("SELECT id FROM devices WHERE id=? AND user_id=?").get(req.params.deviceId,req.user.id);
 if(!d) return res.status(404).json({error:"Device not found"});
 res.json(dbOf(req).prepare("SELECT * FROM activity_logs WHERE device_id=? ORDER BY created_at DESC LIMIT 200").all(d.id));
});

router.get("/settings",(req,res)=>res.json({telegramConfigured:!!process.env.BOT_TOKEN,stunConfigured:!!process.env.STUN_SERVER,turnConfigured:!!process.env.TURN_SERVER}));
router.get("/webrtc/config",auth,(req,res)=>res.json({iceServers:[{urls:process.env.STUN_SERVER||"stun:stun.l.google.com:19302"},...(process.env.TURN_SERVER?[{urls:process.env.TURN_SERVER,username:process.env.TURN_USERNAME,credential:process.env.TURN_PASSWORD}]:[])]}));

// Telegram bot uses the same owner-scoped database. Commands are read-only unless explicitly stated.
if(process.env.BOT_TOKEN) {
 const bot=new Telegraf(process.env.BOT_TOKEN);
 const botDb = new (require("better-sqlite3"))(path.resolve(process.env.DATABASE_FILE || "./database/parent-monitor.sqlite"));
 bot.start(ctx=>ctx.reply("ZXZ PARENT MONITOR\nGunakan /help untuk perintah."));
 bot.help(ctx=>ctx.reply("/devices — daftar perangkat\n/gallery — jumlah media\n/activity — aktivitas terbaru\n/settings — konfigurasi bot"));
 bot.command("devices",ctx=>{
   const u=botDb.prepare("SELECT id FROM users WHERE username=?").get(String(ctx.from.id));
   if(!u) return ctx.reply("Akun Telegram belum ditautkan ke username dashboard.");
   const ds=botDb.prepare("SELECT device_name,status,last_seen FROM devices WHERE user_id=? AND revoked_at IS NULL").all(u.id);
   ctx.reply(ds.length?ds.map(d=>`${d.device_name} — ${d.status} — ${d.last_seen||"-"}`).join("\n"):"Belum ada perangkat.");
 });
 bot.command("gallery",ctx=>ctx.reply("Media yang dibagikan dapat dilihat melalui Web Dashboard setelah login."));
 bot.command("activity",ctx=>ctx.reply("Riwayat aktivitas tersedia di Web Dashboard."));
 bot.command("settings",ctx=>ctx.reply("Bot aktif. Hubungkan akun melalui pengaturan backend."));
 bot.launch().catch(e=>console.error("Telegram bot:",e.message));
 process.once("SIGINT",()=>bot.stop("SIGINT")); process.once("SIGTERM",()=>bot.stop("SIGTERM"));
}
module.exports=router;
