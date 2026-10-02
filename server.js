import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app=express(); app.use(express.json({limit:"10mb"}));
const PORT=Number(process.env.PORT||8080);
const SHOP=(process.env.INSALES_SHOP||"").trim().replace(/^https?:\/\//,"").replace(/\/+$/,"");
const LOGIN=(process.env.INSALES_LOGIN||"").trim();
const PASSWORD=(process.env.INSALES_PASSWORD||"").trim();

async function api(path,method="GET",body){
 if(!SHOP||!LOGIN||!PASSWORD) throw new Error("InSales environment variables are not configured.");
 if(typeof path!=="string"||!path.startsWith("/admin/")||!path.endsWith(".json")||path.includes("..")||path.includes("@")) throw new Error("Only /admin/*.json paths are allowed.");
 const auth=Buffer.from(`${LOGIN}:${PASSWORD}`).toString("base64");
 const r=await fetch(`https://${SHOP}${path}`,{method,headers:{Authorization:`Basic ${auth}`,Accept:"application/json",...(body!==undefined?{"Content-Type":"application/json"}:{})},body:body!==undefined?JSON.stringify(body):undefined});
 const t=await r.text(); let d; try{d=t?JSON.parse(t):null}catch{d=t}
 if(!r.ok) throw new Error(`InSales API ${r.status}: ${typeof d==="string"?d.slice(0,1000):JSON.stringify(d).slice(0,1000)}`);
 return d;
}
const out=d=>({content:[{type:"text",text:JSON.stringify(d,null,2)}]});

function makeServer(){
 const s=new McpServer({name:"fanerkin43-insales",version:"1.0.0"});
 s.tool("insales_get","Read an InSales JSON API endpoint.",{path:z.string()},async({path})=>out(await api(path)));
 return s;
}
const transports=new Map();
app.get("/",(_q,r)=>r.json({ok:true,service:"fanerkin43-mcp",mcp:"/mcp"}));
app.get("/health",(_q,r)=>r.json({ok:true}));
app.post("/mcp",async(req,res)=>{
 try{
  const id=req.headers["mcp-session-id"]; let tr;
  if(id&&transports.has(id)) tr=transports.get(id);
  else if(!id&&req.body?.method==="initialize"){
   tr=new StreamableHTTPServerTransport({sessionIdGenerator:()=>randomUUID(),onsessioninitialized:id=>transports.set(id,tr)});
   tr.onclose=()=>{if(tr.sessionId)transports.delete(tr.sessionId)};
   await makeServer().connect(tr);
  } else return res.status(400).json({error:"Invalid or missing MCP session"});
  await tr.handleRequest(req,res,req.body);
 }catch(e){console.error(e);if(!res.headersSent)res.status(500).json({error:e.message})}
});
app.get("/mcp",async(req,res)=>{const tr=transports.get(req.headers["mcp-session-id"]);if(!tr)return res.status(400).send("Invalid MCP session");await tr.handleRequest(req,res)});
app.delete("/mcp",async(req,res)=>{const tr=transports.get(req.headers["mcp-session-id"]);if(!tr)return res.status(400).send("Invalid MCP session");await tr.handleRequest(req,res)});
app.listen(PORT,"0.0.0.0",()=>console.log(`fanerkin43-mcp listening on ${PORT}`));
