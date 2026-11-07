'use strict';
// npm run originals -- /tmp/ibenji-original-rgba
// Nearest-neighbor sampling and compact palettes.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const drawLettering=require('./pixel-lettering.cjs');
const root=path.resolve(__dirname,'..');
const scenes=require('./original-sources.json');
const input=process.argv[2];
if(!input)throw new Error('Pass the directory produced by read-originals.swift');
const levels=[50,100,112,125,144];
const letteringScales=new Map([[80,3],[92,4],[108,5],[112,2],[125,3],[128,2],[144,4],[160,3],[192,4]]);

function sample(raw,side,region={left:0,top:0,width:side,height:side},magnify=1) {
  const width=raw.readUInt32LE(0),height=raw.readUInt32LE(4);
  const maximum=Math.max(width,height)/magnify,step=maximum/side;
  const left=(maximum-width)/2,top=(maximum-height)/2;
  const rgb=new Uint8Array(region.width*region.height*3);
  for(let y=0;y<region.height;y++)for(let x=0;x<region.width;x++) {
    const sx=Math.floor((region.left+x+.5)*step-left);
    const sy=Math.floor((region.top+y+.5)*step-top);
    if(sx<0||sy<0||sx>=width||sy>=height)continue;
    const offset=(y*region.width+x)*3;
    for(let c=0;c<3;c++)rgb[offset+c]=raw[8+(sy*width+sx)*4+c];
    if(Math.max(rgb[offset],rgb[offset+1],rgb[offset+2])<24)rgb.fill(0,offset,offset+3);
    else if(Math.min(rgb[offset],rgb[offset+1],rgb[offset+2])>235)rgb.fill(255,offset,offset+3);
  }
  return rgb;
}

function prepareSource(raw,scene) {
  if(scene.edgeTrim||scene.erase) {
    const width=raw.readUInt32LE(0),height=raw.readUInt32LE(4);
    if(scene.edgeTrim) {
      const [left,right]=scene.edgeTrim;
      for(let row=0;row<height;row++) {
        const start=8+row*width*4,end=start+width*4;
        raw.fill(0,start,start+left*4);
        raw.fill(0,end-right*4,end);
      }
    }
    for(const [u,v,w,h] of scene.erase??[]) {
      const left=Math.floor(u*width),right=Math.ceil((u+w)*width);
      for(let row=Math.floor(v*height);row<Math.ceil((v+h)*height);row++) {
        const start=8+row*width*4;
        raw.fill(0,start+left*4,start+right*4);
      }
    }
  }
  if(scene.paperWhite||scene.gamma||scene.blueGain) {
    const gamma=Uint8Array.from({length:256},(_,value)=>Math.round(255*(value/255)**(scene.gamma??1)));
    for(let offset=8;offset<raw.length;offset+=4) {
      const [r,g,b]=raw.subarray(offset,offset+3);
      const peak=Math.max(r,g,b),low=Math.min(r,g,b);
      if(peak<24)continue;
      if(scene.blueGain&&b>60&&b>r*1.6&&b>g*1.6) {
        raw[offset]=Math.round(r+(b-r)*.12);
        raw[offset+1]=Math.round(g+(b-g)*.26);
        raw[offset+2]=Math.min(255,Math.round(b*scene.blueGain));
      } else if(low>=scene.paperWhite&&peak-low<42)raw.fill(255,offset,offset+3);
      else for(let channel=0;channel<3;channel++)raw[offset+channel]=gamma[raw[offset+channel]];
    }
  }
}

function makePalette(samples,accent,limit=24,details=[]) {
  const histogram=new Map();
  for(const rgb of samples)for(let i=0;i<rgb.length;i+=3) {
    const [r,g,b]=rgb.subarray(i,i+3);
    if(Math.max(r,g,b)<13||Math.min(r,g,b)>249)continue;
    const key=(r>>3)<<10|(g>>3)<<5|b>>3;
    const entry=histogram.get(key)??{color:[0,0,0],count:0};
    entry.count++;entry.color[0]+=r;entry.color[1]+=g;entry.color[2]+=b;
    histogram.set(key,entry);
  }
  const points=[...histogram.values()].map(({color,count})=>({color:color.map(v=>v/count),count}));
  function box(points) {
    const low=[255,255,255],high=[0,0,0];let count=0;
    for(const point of points) {
      count+=point.count;
      for(let c=0;c<3;c++){low[c]=Math.min(low[c],point.color[c]);high[c]=Math.max(high[c],point.color[c]);}
    }
    const ranges=high.map((v,c)=>(v-low[c])*[.85,1,1][c]);
    return {points,count,ranges,score:points.length>1?count*Math.max(...ranges)**2:0};
  }
  const boxes=[box(points)];
  while(boxes.length<limit-3-details.length) {
    let index=0;
    for(let i=1;i<boxes.length;i++)if(boxes[i].score>boxes[index].score)index=i;
    const selected=boxes[index];
    if(!selected.score)break;
    const axis=selected.ranges.indexOf(Math.max(...selected.ranges));
    selected.points.sort((a,b)=>a.color[axis]-b.color[axis]);
    let count=0,split=1;
    for(;split<selected.points.length;split++){count+=selected.points[split-1].count;if(count>=selected.count/2)break;}
    split=Math.min(selected.points.length-1,split);
    boxes.splice(index,1,box(selected.points.slice(0,split)),box(selected.points.slice(split)));
  }
  const hex=color=>'#'+color.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
  return [...new Set(['#000000','#ffffff',accent,...details,...boxes.map(({points,count})=>
    hex([0,1,2].map(c=>points.reduce((sum,p)=>sum+p.color[c]*p.count,0)/count))
  )])];
}
function indexSamples(rgb,palette) {
  const colors=palette.map(s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)));
  const cache=new Int16Array(32768).fill(-1),pixels=new Uint8Array(rgb.length/3);
  for(let i=0;i<pixels.length;i++) {
    const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2],key=(r>>3)<<10|(g>>3)<<5|b>>3;
    if(cache[key]>=0){pixels[i]=cache[key];continue;}
    let nearest=0,error=Infinity;
    for(let c=0;c<colors.length;c++) {
      const [rr,gg,bb]=colors[c],distance=(r-rr)**2*2+(g-gg)**2*4+(b-bb)**2*3;
      if(distance<error){nearest=c;error=distance;}
    }
    pixels[i]=cache[key]=nearest;
  }
  return pixels;
}
function pack(pixels) {
  const runs=[];
  for(let offset=0;offset<pixels.length;) {
    let count=1;
    while(count<255&&offset+count<pixels.length&&pixels[offset+count]===pixels[offset])count++;
    runs.push(count,pixels[offset]);offset+=count;
  }
  return Buffer.from(runs).toString('base64');
}

function captionStrokes(raw,patch,side,placement,caption,palette,compact) {
  const source=caption.rect;
  const target=compact&&caption.compactRect?caption.compactRect:source;
  const [left,top,width,height]=placement;
  const [x,y,w,h]=target;
  const sourceWidth=raw.readUInt32LE(0),sourceHeight=raw.readUInt32LE(4);
  const sampleSide=compact?200:side;
  const ink=palette.indexOf(caption.ink);
  if(ink<0)throw new Error('Caption ink missing from the source palette: '+caption.ink);
  const pixels=new Uint8Array(patch.width*patch.height).fill(255);
  for(let row=0;row<patch.height;row++)for(let col=0;col<patch.width;col++) {
    const sampleColumn=Math.floor((patch.left+col+.5)*sampleSide/side);
    const sampleRow=Math.floor((patch.top+row+.5)*sampleSide/side);
    const u=((sampleColumn+.5)/sampleSide-left)/width;
    const v=((sampleRow+.5)/sampleSide-top)/height;
    if(u<x||u>=x+w||v<y||v>=y+h)continue;
    let coverage=0;
    // Threshold the original stroke coverage into a solid pixel. This keeps a
    // narrow stem that falls between sampling points without adding gray edges.
    for(let sy=0;sy<5;sy++)for(let sx=0;sx<5;sx++) {
      const sampleU=u+((sx+.5)/5-.5)/(sampleSide*width);
      const sampleV=v+((sy+.5)/5-.5)/(sampleSide*height);
      const px=Math.floor((source[0]+(sampleU-x)*source[2]/w)*sourceWidth);
      const py=Math.floor((source[1]+(sampleV-y)*source[3]/h)*sourceHeight);
      if(px<0||px>=sourceWidth||py<0||py>=sourceHeight)continue;
      if(caption.counters?.some(([x,y,w,h])=>px>=x&&px<x+w&&py>=y&&py<y+h))continue;
      const offset=8+(py*sourceWidth+px)*4;
      const [red,green,blue]=raw.subarray(offset,offset+3);
      if(caption.ink==='#ffffff'?Math.min(red,green,blue)>128:green>115&&green>blue*1.3)coverage++;
    }
    pixels[row*patch.width+col]=coverage>=(compact?7:9)?ink:0;
  }
  return pixels;
}

function buildLettering(raw,scene,palette,placement,grids) {
  const [originX,originY,contentWidth,contentHeight]=placement;
  return Object.fromEntries([...letteringScales].filter(([grid])=>grids.includes(grid)).map(([grid,scale])=>{
    const size=grid*scale;
    const patches=scene.text.map(([x,y,w,h])=>{
      // Keep the patch boundary on an artwork cell edge.
      const left=Math.max(0,Math.floor((originX+x*contentWidth)*grid)*scale);
      const top=Math.max(0,Math.floor((originY+y*contentHeight)*grid)*scale);
      const right=Math.min(size,Math.ceil((originX+(x+w)*contentWidth)*grid)*scale);
      const bottom=Math.min(size,Math.ceil((originY+(y+h)*contentHeight)*grid)*scale);
      const region={left,top,width:right-left,height:bottom-top};
      const pixels=indexSamples(sample(raw,size,region,scene.magnify),palette);
      for(const caption of scene.captions??[]) {
        const mask=captionStrokes(raw,region,size,placement,caption,palette,grid===(scene.artworkGrids?.[200]??112));
        for(let i=0;i<mask.length;i++)if(mask[i]!==255)pixels[i]=mask[i];
      }
      drawLettering(scene,pixels,palette,size,placement,region);
      return {...region,data:pack(pixels)};
    });
    return [grid,{size,patches}];
  }));
}

const records=[];
for(const scene of scenes) {
  const raw=fs.readFileSync(path.join(input,scene.id+'.rgba'));
  prepareSource(raw,scene);
  const width=raw.readUInt32LE(0),height=raw.readUInt32LE(4);
  const maximum=Math.max(width,height)/(scene.magnify??1);
  const placement=[(1-width/maximum)/2,(1-height/maximum)/2,width/maximum,height/maximum];
  const sizes=[...new Set([...levels,...Object.values(scene.artworkGrids??{})])];
  const samples=sizes.map(side=>sample(raw,side,undefined,scene.magnify));
  const palette=scene.palette??makePalette(samples,scene.accent,scene.colorLimit,scene.detailColors);
  const grids=Object.fromEntries(sizes.map((side,index)=>{
    const pixels=indexSamples(samples[index],palette);
    drawLettering(scene,pixels,palette,side,placement,{left:0,top:0,width:side,height:side});
    return [side,pack(pixels)];
  }));
  records.push({...scene,palette,placement,lettering:buildLettering(raw,scene,palette,placement,sizes),
    sourceHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'img/done',scene.source))).digest('hex'),grids});
  console.log(scene.id+': '+palette.length+' colors, '+sizes.length+' artwork grids');
}
const moduleSource=`/* Generated from the unmodified images in img/done. Run npm run originals to rebuild. */
(function(root){
  'use strict';
  const records=${JSON.stringify(records)};
  const byId=new Map(records.map(record=>[record.id,record]));
  const cache=new Map();
  function baseFrame(id,size){
    const record=byId.get(id),key=id+':'+size;
    if(!record)throw new Error('Unknown scene: '+id);
    if(!cache.has(key)){
      if(record.grids[size]){
        const bytes=atob(record.grids[size]),pixels=new Uint8Array(size*size);
        let offset=0;
        for(let i=0;i<bytes.length;i+=2){const end=offset+bytes.charCodeAt(i);pixels.fill(bytes.charCodeAt(i+1),offset,end);offset=end;}
        if(offset!==pixels.length)throw new Error('Invalid source grid: '+key);
        cache.set(key,pixels);
      }else{
        const side=Math.max(...Object.keys(record.grids));
        const master=baseFrame(id,side).pixels,pixels=new Uint8Array(size*size);
        for(let y=0;y<size;y++)for(let x=0;x<size;x++)pixels[y*size+x]=master[Math.floor((y+.5)*side/size)*side+Math.floor((x+.5)*side/size)];
        cache.set(key,pixels);
      }
    }
    return {size,palette:record.palette,pixels:cache.get(key)};
  }
  const api={records,baseFrame};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PixelOriginals=api;
})(globalThis);
`;
fs.writeFileSync(path.join(root,'pixel-originals.js'),moduleSource);
console.log('Wrote pixel-originals.js: '+Math.round(Buffer.byteLength(moduleSource)/1024)+' KB');
