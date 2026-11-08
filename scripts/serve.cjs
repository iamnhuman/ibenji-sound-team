'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const orderFile=path.join(root,'gallery-order.js');

function readGallery() {
  const manifest=fs.readFileSync(path.join(__dirname,'original-sources.json'),'utf8');
  const script=fs.readFileSync(orderFile,'utf8');
  const [prefix,json]=script.split('\n})(');
  const order=JSON.parse(json.trimEnd().slice(0,-2));
  const catalog=JSON.parse(manifest).map(scene=>scene.id);
  const known=new Set(catalog),removed=new Set(order.removed);
  const ids=[...new Set([...order.ids,...catalog])].filter(id=>known.has(id)&&!removed.has(id));
  const revision=createHash('sha256').update(manifest).update(script).digest('hex');
  return {ids,revision,catalog,prefix};
}

async function serveGallery(req,res) {
  const send=(status,payload)=>{
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify(payload));
  };
  const host=req.headers.host;
  const actualPort=server.address().port;
  const hosts=['127.0.0.1','localhost'].map(name=>actualPort===80?name:`${name}:${actualPort}`);
  if(!hosts.includes(host)||(req.headers.origin&&req.headers.origin!==`http://${host}`))return send(403,{error:'origin'});
  if(!['GET','PUT'].includes(req.method))return send(405,{error:'method'});

  try {
    if(req.method==='GET') {
      const {ids,revision}=readGallery();
      return send(200,{ids,revision});
    }
    if(req.headers.origin!==`http://${host}`)return send(403,{error:'origin'});
    if(req.headers['content-type']?.split(';',1)[0]!=='application/json')return send(415,{error:'type'});
    let body='';
    req.setEncoding('utf8');
    for await(const chunk of req) {
      body+=chunk;
      if(body.length>32768)return send(413,{error:'size'});
    }
    let input;
    try { input=JSON.parse(body); } catch { return send(400,{error:'json'}); }
    if(!input||typeof input.revision!=='string'||!Array.isArray(input.ids))return send(400,{error:'order'});
    const current=readGallery();
    if(JSON.stringify(input.ids)===JSON.stringify(current.ids))return send(200,{revision:current.revision});
    if(input.revision!==current.revision)return send(409,{error:'changed'});
    const ids=new Set(input.ids);
    const visible=new Set(current.ids);
    if(!ids.size||ids.size!==input.ids.length||[...ids].some(id=>!visible.has(id)))return send(422,{error:'order'});

    // Keep both the order and exclusions in one file so readers always see a complete edit.
    const order={ids:input.ids,removed:current.catalog.filter(id=>!ids.has(id))};
    const temporary=path.join(root,`.gallery-order-${randomUUID()}.js`);
    try {
      fs.writeFileSync(temporary,`${current.prefix}\n})(${JSON.stringify(order,null,2)});\n`,{flag:'wx'});
      fs.renameSync(temporary,orderFile);
    } finally {
      fs.rmSync(temporary,{force:true});
    }
    return send(200,{revision:readGallery().revision});
  } catch(error) {
    console.error(error.message);
    return send(500,{error:'save'});
  }
}

const server=http.createServer((req,res)=>{
  let requested;
  try{requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end('Bad request');return;}
  if(requested==='/__dev/gallery')return serveGallery(req,res);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  if(requested==='/'||requested==='/index.html')requested='/index.html';
  const file=path.resolve(root,'.'+requested);
  if(!file.startsWith(root+path.sep)||requested.split('/').some(part=>part.startsWith('.'))){res.writeHead(403);res.end('Forbidden');return;}
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD'){res.end();return;}
    const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
  });
});
server.listen(port,'127.0.0.1',()=>console.log(`IBENJI pixel works: http://127.0.0.1:${server.address().port}`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
