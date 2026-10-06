import { createServer } from "node:http";
import { db } from "../packages/db/src/client";
import { createHmac, randomBytes } from "node:crypto";

if (process.env.NODE_ENV === "production" || !process.env.DATABASE_URL?.includes("@127.0.0.1:55439/lookout_v2_lab?")) throw new Error("Local laboratory only.");
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error("Missing laboratory secret.");
createServer(async (req,res)=>{
  if (!['localhost:4312','127.0.0.1:4312'].includes(req.headers.host ?? '')) {res.writeHead(403).end();return;}
  const userId = req.url === '/seba' ? 'demo-seba' : req.url === '/miguel' ? 'demo-miguel' : null;
  if (userId && req.method === 'POST') {
    const token = randomBytes(32).toString('hex');
    await db.session.create({data:{id:randomBytes(16).toString('hex'),token,userId,expiresAt:new Date(Date.now()+86400000),updatedAt:new Date()}});
    const cookie = encodeURIComponent(`${token}.${createHmac('sha256',secret).update(token).digest('base64')}`);
    res.writeHead(303,{'Set-Cookie':`crm.session_token=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,Location:'http://localhost:4310/lookout-lab'}).end();return;
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Lookout · Laboratorio</title><body style="font:18px system-ui;max-width:700px;margin:70px auto;padding:24px"><p>ENTERPRISE LOOKOUT · EVALUACIÓN LOCAL</p><h1>Asado de Ingeniería</h1><p>Todos los datos son ficticios. Esta versión organiza trabajos, eventos y auspicios.</p><p>Una marca compartida, dos usuarios, tres trabajos y dos eventos.</p><p>Presupuesto: $900.000 CLP · Meta: $600.000 CLP.<br>Propuesta: $200.000 + 180 latas. Nada comprometido ni recibido.</p><form method="post" action="/seba"><button style="font:inherit;padding:12px">Entrar como Sebastián · DEMO</button></form><form method="post" action="/miguel"><button style="font:inherit;padding:12px;margin-top:14px">Entrar como Miguel · DEMO</button></form><p>Puedes editar eventos, presupuestos, aportes y borradores. Supabase, envío de correo e IA siguen pendientes de conexión.</p></body></html>`);
}).listen(4312,'127.0.0.1',()=>console.log('Evaluation portal: http://localhost:4312'));
