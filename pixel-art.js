/* Original source pixels, sampled onto square grids. Lettering is part of each image. */
(function(root){
  'use strict';
  const originals=typeof module!=='undefined'&&module.exports?require('./pixel-originals.js'):root.PixelOriginals;
  const eyeMotion=typeof module!=='undefined'&&module.exports?require('./eye-motion.js'):root.PixelEye;
  const tau=Math.PI*2;
  const scenes=originals.records.map(({grids,...scene})=>scene);
  const byId=new Map(scenes.map(scene=>[scene.id,scene]));
  const colors=new Map();
  const shadeMaps=new Map();
  const letteringPixels=new WeakMap();
  function colorTable(scene){
    if(!colors.has(scene.id))colors.set(scene.id,scene.palette.map(hex=>{
      const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
      return {rgb,light:rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,neutral:Math.max(...rgb)-Math.min(...rgb)<48};
    }));
    return colors.get(scene.id);
  }
  function nearest(scene,rgb){
    let best=0,distance=Infinity;
    for(const [index,color]of colorTable(scene).entries()){
      const error=color.rgb.reduce((sum,v,c)=>sum+(v-rgb[c])**2*[2,4,3][c],0);
      if(error<distance){best=index;distance=error;}
    }
    return best;
  }
  function shadeMap(scene,strength){
    const step=Math.round(strength*12),key=scene.id+':'+step;
    if(!shadeMaps.has(key))shadeMaps.set(key,Uint8Array.from(colorTable(scene),({rgb},index)=>
      index?nearest(scene,rgb.map(v=>Math.min(255,Math.max(0,v+(255-v)*step/12)))):0));
    return shadeMaps.get(key);
  }
  function point(scene,size,u,v){
    const [x,y,w,h]=scene.placement;
    return [(x+u*w)*size,(y+v*h)*size];
  }
  function smooth(value) {
    const unit = Math.max(0, Math.min(1, value));
    return unit * unit * (3 - 2 * unit);
  }
  function samplePixel(scene, size, pixels, u, v, paper = 0) {
    const [ox, oy, w, h] = scene.placement;
    const x = Math.floor((ox + u * w) * size), y = Math.floor((oy + v * h) * size);
    return x >= 0 && x < size && y >= 0 && y < size ? pixels[y * size + x] : paper;
  }
  function bounds(scene,size,rect,padding=0){
    const [x,y]=point(scene,size,rect[0],rect[1]);
    const [right,bottom]=point(scene,size,rect[0]+rect[2],rect[1]+rect[3]);
    return [Math.max(0,Math.floor(x-padding)),Math.max(0,Math.floor(y-padding)),Math.min(size,Math.ceil(right+padding)),Math.min(size,Math.ceil(bottom+padding))];
  }
  function patch(scene,frame,rect,change){
    const {size,pixels}=frame,[left,top,right,bottom]=bounds(scene,size,rect);
    const [ox,oy,w,h]=scene.placement;
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      const index=y*size+x;
      pixels[index]=change(pixels[index],((x+.5)/size-ox)/w,((y+.5)/size-oy)/h,x,y);
    }
  }
  function layer(scene,frame,base,rect,inverse,{select=ink=>ink!==0,background=0,padding=.025}={}){
    const {size,pixels}=frame,[left,top,right,bottom]=bounds(scene,size,rect);
    const clear=typeof background==='function'?background:()=>background;
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      const ink=base[y*size+x];if(select(ink,x,y))pixels[y*size+x]=clear(x,y);
    }
    const [x0,y0,x1,y1]=bounds(scene,size,rect,Math.max(3,size*padding));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const [sx,sy]=inverse(x,y),xx=Math.round(sx),yy=Math.round(sy);
      if(xx<left||xx>=right||yy<top||yy>=bottom)continue;
      const ink=base[yy*size+xx];if(select(ink,xx,yy))pixels[y*size+x]=ink;
    }
  }
  function rotate(scene,frame,base,rect,center,angle,options){
    const [cx,cy]=point(scene,frame.size,...center),cos=Math.cos(angle),sin=Math.sin(angle);
    layer(scene,frame,base,rect,(x,y)=>[cx+(x-cx)*cos+(y-cy)*sin,cy-(x-cx)*sin+(y-cy)*cos],options);
  }
  function pose(time,keys){
    for(let i=1;i<keys.length;i++){
      const [end,...last]=keys[i];
      if(time>end)continue;
      const [start,...first]=keys[i-1];
      const progress=(time-start)/(end-start);
      const ease=progress*progress*(3-2*progress);
      return first.map((value,axis)=>value+(last[axis]-value)*ease);
    }
    return keys.at(-1).slice(1);
  }
  const eyeKeys = [[0, 0, 1], [.25, .014, 1], [.37, .014, 1], [.49, .004, .10],
    [.57, 0, .10], [.72, -.013, 1], [.89, -.013, 1], [1.15, 0, 1], [1.5, 0, 1]];
  const eyeRoots = [[.058, .315, .036, .162], [.192, .328, .028, .061], [.307, .338, .032, .052],
    [.611, .348, .038, .043], [.899, .355, .043, .133]];
  function animateEye(scene,frame,time){
    const elapsed=time%3;
    const wrapped=elapsed<0?elapsed+3:elapsed;
    if (wrapped < 1e-9) return;
    const [gaze,open]=pose(wrapped%1.5,eyeKeys);
    const [,firstLetterRow]=bounds(scene,frame.size,scene.text[0]);
    const shadow = nearest(scene, [99, 2, 75]);
    const turn = wrapped * tau / 1.5;
    const original = frame.pixels.slice();
    eyeMotion.draw(frame,firstLetterRow,{gaze,open,shadow,accent:scene.accent,turn});
    const { size } = frame;
    const table = colorTable(scene);
    for (const [index, rect] of eyeRoots.entries()) {
      const top = rect[1] * size, length = rect[3] * size;
      const sway = Math.sin(turn + index * .89) * Math.min(1, wrapped * 8, (3 - wrapped) * 8) * size * .013;
      const loose = index === 0 || index === eyeRoots.length - 1;
      layer(scene, frame, original, rect, (x, y) => {
        const t = Math.max(0, Math.min(1, (y + .5 - top) / length));
        return [x - sway * Math.sin(t * Math.PI * (loose ? .5 : 1)) ** 1.7, y];
      }, { select: ink => table[ink].neutral && table[ink].light > 73, padding: .016 });
    }
    restoreText(scene, frame, original);
  }

  function square(frame, x, y, side, ink) {
    const { size, pixels } = frame;
    const x0 = Math.round(x - side / 2);
    const y0 = Math.round(y - side / 2);
    const left = Math.max(0, x0);
    const right = Math.min(size, x0 + side);
    if (left >= right) return;
    for (let row = Math.max(0, y0); row < Math.min(size, y0 + side); row++) {
      pixels.fill(ink, row * size + left, row * size + right);
    }
  }

  const skullKeys = [[0, 0, 0], [.16, 0, 0], [.36, -.18, .9], [.52, -.18, 1], [.64, .13, .75],
    [.85, 0, 0], [1.22, 0, 0], [1.43, .12, 1], [1.60, -.08, .35], [1.82, 0, 0], [3, 0, 0]];

  function animateSkull(scene, frame, base, time, white) {
    const [angle, flash] = pose(time, skullKeys);
    const hinge = [.50, .57];
    if (angle) rotate(scene, frame, base, [.321, .232, .343, .366], hinge, angle, { select: white, padding: .07 });
    if (flash < .2) return;

    const [cx, cy] = point(scene, frame.size, ...hinge);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const red = frame.palette.indexOf(scene.accent);
    const side = Math.max(1, Math.round(frame.size * (.016 + .025 * flash)));
    for (const socket of [[.411, .326], [.584, .322]]) {
      const [x, y] = point(scene, frame.size, ...socket);
      const px = cx + (x - cx) * cosine - (y - cy) * sine;
      const py = cy + (x - cx) * sine + (y - cy) * cosine;
      square(frame, px, py, side, red);
      if (side >= 3 && flash > .7) square(frame, px, py, 1, frame.palette.indexOf('#ffffff'));
    }
  }

  const slimeBubbles = [
    { rect: [.487, .158, .151, .144], start: .10, rise: .70, lift: .113, drift: .023, regrow: .68 },
    { rect: [.337, .228, .081, .078], start: .36, rise: .54, lift: .124, drift: -.038, regrow: .61 },
    { rect: [.606, .303, .056, .053], start: .64, rise: .63, lift: .132, drift: .061, regrow: .53 },
    { rect: [.843, .278, .074, .072], start: 1.09, rise: .61, lift: .148, drift: .021, regrow: .57 }
  ];

  function animateBubbles(scene, frame, base, time) {
    const green = frame.palette.indexOf(scene.accent);
    const white = frame.palette.indexOf('#ffffff');
    const shadow = nearest(scene, [59, 157, 0]);
    const burstLength = .30;
    for (const [index, { rect, start, rise, lift, drift, regrow }] of slimeBubbles.entries()) {
      const age = time - start;
      const refillAt = rise + burstLength + .08;
      if (age <= 0 || age >= refillAt + regrow) continue;

      const [x, y, width, height] = rect;
      const u = x + width / 2;
      const v = y + height / 2;
      const [cx, cy] = point(scene, frame.size, u, v);
      function moveBubble(targetX, targetY, scaleX, scaleY) {
        const [tx, ty] = point(scene, frame.size, targetX, targetY);
        layer(scene, frame, base, rect, (px, py) => [cx + (px - tx) / scaleX, cy + (py - ty) / scaleY], { padding: .17 });
      }

      if (age < rise) {
        const progress = age / rise;
        const swell = 1 + .18 * progress;
        const wobble = Math.sin(progress * tau) * .1;
        const lifted = progress * (.55 + .45 * progress);
        moveBubble(u + drift * progress + Math.sin(progress * Math.PI) * .012,
          v - lift * lifted, swell * (1 + wobble), swell / (1 + wobble));
        continue;
      }

      if (age >= refillAt) {
        const progress = (age - refillAt) / regrow;
        const growth = .22 + .78 * progress;
        const birth = Math.min(.367, v + .14);
        moveBubble(u, birth + (v - birth) * progress, growth, growth);
        continue;
      }

      patch(scene, frame, rect, () => 0);
      const burst = (age - rise) / burstLength;
      if (burst >= 1) continue;
      for (let ray = 0; ray < 8; ray++) {
        if (burst > .68 && ray % 2) continue;
        const angle = (ray / 8 + index * .09) * tau;
        const distance = width * (.53 + burst * .8);
        const [px, py] = point(scene, frame.size, u + drift + Math.cos(angle) * distance,
          v - lift + Math.sin(angle) * distance * .82 + .047 * burst * burst);
        const side = Math.max(1, Math.round(frame.size * (ray % 3 ? .014 : .019) * (1 - burst * .58)));
        const ink = burst > .6 ? shadow : ray % 3 === 0 && burst < .35 ? white : green;
        square(frame, px, py, side, ink);
      }
    }
  }

  const waveKeys = [[0, 0, 0], [.19, -.11, .32], [.42, .62, .89], [.60, 1, .48],
    [.76, .84, -.24], [1.04, .20, -.17], [1.38, 0, 0], [1.5, 0, 0]];

  function animateWave(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [curl, lift] = pose(cycle, waveKeys);
    const { size } = frame;
    const [width, height] = scene.placement.slice(2);
    const redSun = nearest(scene, [245, 19, 19]);
    function water(ink, u, v) {
      if (!ink || u < .05 || u > .833 || v > .63) return false;
      if ((u < .236 && v < .216) || (u > .684 && v > .466 && v < .57)) return false;
      const [r, , b] = table[ink].rgb;
      return b >= r * .81;
    }
    patch(scene, frame, [.045, .002, .79, .632], (ink, u, v, x, y) => {
      const dx = u - .475, dy = v - .325;
      const body = Math.max(0, 1 - (dx / .43) ** 2 - (dy / .50) ** 2);
      const anchor = Math.max(0, Math.min(1, (v - .285) / .255));
      const falloff = body * (1 - anchor ** 2 * (3 - 2 * anchor));
      // Roll the barrel around its hollow, then lift and push the crest forward.
      const angle = curl * .55 * falloff;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      const du = dx - (dx * cosine + dy * .78 * sine) + curl * .040 * falloff;
      const dv = dy - (dy * cosine - dx / .78 * sine) - lift * .065 * falloff;
      const sx = Math.max(0, Math.min(size - 1, Math.round(x - du * width * size)));
      const sy = Math.max(0, Math.min(size - 1, Math.round(y - dv * height * size)));
      if (sx === x && sy === y) return ink;
      const sampled = base[sy * size + sx];
      const originalWater = water(ink, u, v);
      const movedWater = water(sampled, u - du, v - dv);
      if (v > .35 && !(originalWater && movedWater)) return ink;
      if (movedWater) return sampled;
      if (!originalWater) return ink;
      const sun = ((u - .661) / .174) ** 2 + ((v - .273) / .226) ** 2;
      return sun < .99 ? redSun : 0;
    });

    const blue = frame.palette.indexOf(scene.accent);
    const white = frame.palette.indexOf('#ffffff');
    for (let i = 0; i < 12; i++) {
      const age = (cycle - .35 - i * .023) / (.55 + (i % 4) * .042);
      if (age < 0 || age > 1) continue;
      const u = .577 + (i % 4) * .024 + age * (.086 + (i % 3) * .022);
      const v = .125 + (i % 5) * .030 - age * (.16 + (i % 3) * .050) + age ** 2 * .33;
      const [x, y] = point(scene, size, u, v);
      const side = Math.max(1, Math.round(size * (.025 - age * .018)));
      square(frame, x, y + side * .5, side, blue);
      square(frame, x - side * .5, y - side * .5, Math.max(1, side - 1), white);
      if (age > .23 && age < .68) square(frame, x + size * .019 * age, y - size * .038 * age, 1, white);
    }
  }

  function animateViolet(scene, frame, time, table) {
    const cycle = time % 1.5;
    const [open, charge] = pose(cycle, [[0, 1, 0], [.22, 1, .30], [.40, .19, 1], [.53, .2, .74],
      [.66, 1, .42], [.9, 1, 0], [1.5, 1, 0]]);
    const lime = frame.palette.indexOf(scene.accent);
    const white = frame.palette.indexOf('#ffffff');
    patch(scene, frame, [.181, .281, .096, .204], (ink, u, v) => {
      const [r, g, b] = table[ink].rgb;
      if (g < r * 1.18 || g < b * 1.4 || g < 75) return ink;
      const lid = .448 - (u - .193) * 1.62;
      return Math.abs(v - lid) < .080 * open + .28 / frame.size ? lime : 0;
    });
    const flash = shadeMap(scene, charge * .7);
    patch(scene, frame, [.087, .012, .47, .73], (ink, u, v) => {
      const [r, g, b] = table[ink].rgb;
      if (b < g * 1.3 || r < 82 || Math.abs(u + v * .25 - (.12 + cycle * .53)) > .042) return ink;
      return flash[ink];
    });
    for (let spark = 0; spark < 5; spark++) {
      const age = (cycle - .33 - spark * .065) / .44;
      if (age < 0 || age > 1) continue;
      const [x, y] = point(scene, frame.size, .208 + spark * .027 - age * .067, .39 + (spark % 3) * .15 + age * .28);
      const side = Math.max(1, Math.round(frame.size * .014 * (1 - age * .5)));
      square(frame, x, y, side, spark % 2 ? white : lime);
      if (age < .45) square(frame, x + side, y - side, 1, lime);
    }
  }

  // Inner and outer silhouettes of the original station, traced in its tilted plane.
  const stationRadii = [
    [.70, 1.02], [.75, 1.03], [.74, 1.22], [.59, 1.25], [.63, 1.23], [.59, 1.06], [.62, 1.23], [.62, 1.08],
    [.66, 1.04], [.45, .97], [.49, .85], [.49, .92], [.51, .84], [.51, .81], [.55, .86], [.59, .96]
  ];

  function stationBand(angle) {
    const position = (angle / tau * stationRadii.length + stationRadii.length * 2) % stationRadii.length;
    const index = Math.floor(position);
    const next = stationRadii[(index + 1) % stationRadii.length];
    return stationRadii[index].map((value, edge) => value + (next[edge] - value) * (position - index));
  }

  function animateStation(scene, frame, base, phase) {
    const { size } = frame;
    const white = frame.palette.indexOf('#ffffff');
    const steel = frame.palette.indexOf('#a6aeba');
    const seam = frame.palette.indexOf('#525b6a');
    const table = colorTable(scene);
    const tilt = -.74;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const centerX = 197, centerY = 228, major = 218, minor = 85;
    const star = (x, y) => Math.abs(x - 85) < 4 && y > 135 && y < 271 ||
      Math.abs(y - 211) < 3 && x < 153 || Math.abs(x - 85) + Math.abs(y - 211) < 14;
    patch(scene, frame, [0, .11, 1, .52], (ink, u, v) => {
      const sourceX = u * 386, sourceY = v * 670;
      if (star(sourceX, sourceY)) return ink;
      const dx = sourceX - centerX, dy = sourceY - centerY;
      const majorAxis = (dx * c + dy * s) / major;
      const minorAxis = (-dx * s + dy * c) / minor;
      const angle = Math.atan2(minorAxis, majorAxis);
      const distance = Math.hypot(majorAxis, minorAxis);
      const [inside, outside] = stationBand(angle);
      if (distance < inside || distance > outside) return ink;
      const depth = (distance - inside) / (outside - inside);
      const turn = angle - phase;
      const [inner, outer] = stationBand(turn);
      const radius = inner + (outer - inner) * depth;
      const px = Math.cos(turn) * radius * major;
      const py = Math.sin(turn) * radius * minor;
      let sx = centerX + px * c - py * s, sy = centerY + px * s + py * c;
      // The foreground star remains on the sky plane, never on a rotating panel.
      if (star(sx, sy)) { sx += sx < 85 ? -9 : 9; sy += sy < 211 ? -7 : 7; }
      const [x, y] = point(scene, size, sx / 386, sy / 670).map(Math.floor);
      const texture = x >= 0 && x < size && y >= 0 && y < size ? base[y * size + x] : 0;
      if (!texture) return depth < .12 || depth > .91 ? ink : 0;
      if (table[texture].light < 103) return texture;
      const panel = ((turn * 14 / tau) % 1 + 1) % 1;
      if (depth > .18 && depth < .80 && panel < .088) return seam;
      if (depth > .77 && Math.sin(angle) > .18) return panel < .20 ? white : steel;
      return texture;
    });
  }

  const planetLatitudes = [[124, .001], [176, .00065], [236, 0], [291, -.0005], [343, -.0009]];

  function animatePlanet(scene, frame, phase) {
    const white = frame.palette.indexOf('#ffffff');
    const gray = nearest(scene, [139, 139, 139]);
    const turn = phase / 15;
    const longitudes = Array.from({ length: 15 }, (_, i) => i * tau / 15 + turn)
      .filter(angle => Math.cos(angle) > .07).map(angle => [Math.sin(angle), Math.cos(angle)]);
    patch(scene, frame, [.14, .134, .70, .46], (ink, u, v) => {
      const x = u * 432, y = v * 656;
      const dx = x - 210, dy = y - 235;
      if ((dx / 144) ** 2 + (dy / 145) ** 2 > .92) return ink;
      const ring = 341 - x * .092 - x ** 2 * .00092;
      if (Math.abs(y - ring) < 14 || planetLatitudes.some(([row, curve]) => Math.abs(y - row - curve * dx ** 2) < 5)) return ink;
      const span = 144 * Math.sqrt(1 - (dy / 145) ** 2);
      const thickness = Math.max(3.3, 350 / frame.size);
      for (const [position, depth] of longitudes) {
        if (Math.abs(dx - position * span) <= thickness * (.64 + depth * .36)) return depth > .3 ? white : gray;
      }
      return 0;
    });
    const travel = phase / tau;
    const x = 67 + 299 * travel;
    const y = 341 - x * .092 - x ** 2 * .00092;
    const [px, py] = point(scene, frame.size, x / 432, y / 656);
    const side = Math.max(1, Math.round(frame.size * .025));
    square(frame, px, py - side, side, white);
  }

  function fallingDrops(scene, frame, time, streams, [body, shine, tail]) {
    const side = Math.max(1, Math.round(frame.size * .012));
    for (const [u, v, distance, delay, duration] of streams) {
      const age = ((time + 1.5 - delay) % 1.5) / duration;
      if (age >= 1) continue;
      const [x, y] = point(scene, frame.size, u, v + distance * age ** 2);
      if (age < .88) square(frame, x, y - side, Math.max(1, side - 1), tail);
      square(frame, x, y, side, age < .82 ? body : tail);
      if (side > 1 && age < .7) square(frame, x - .4, y - .4, 1, shine);
    }
  }

  const hazardDrips = [
    [.105, .841, .153, .12, .81], [.238, .941, .054, .41, .56],
    [.753, .933, .061, .68, .57], [.900, .824, .171, .89, .83]
  ];

  function animateFan(scene, frame, time, phase, table) {
    const amber = nearest(scene, [240, 171, 5]);
    const brass = nearest(scene, [160, 109, 6]);
    const blackSteel = nearest(scene, [36, 28, 19]);
    const edge = nearest(scene, [255, 209, 17]);
    const aperture = .079;
    patch(scene, frame, [.419, .786, .162, .162], (ink, u, v) => {
      const x = (u - .498) / aperture, y = (v - .866) / aperture;
      const radius = Math.hypot(x, y);
      if (radius >= 1 || radius < .18) return ink;
      // The original brace and rim stay in front of the rotating blades.
      const brace = Math.min(Math.abs(x + y * .94), Math.abs(x - y * 1.06));
      if (brace < .17 && table[ink].neutral && table[ink].light > 30) return ink;
      const segment = tau / 3;
      const angle = (Math.atan2(y, x) - phase * 2 + radius * .88 + tau * 3) % segment;
      const span = 1.18 - radius * .53;
      if (angle > span || radius > .91) return blackSteel;
      if (angle < .14) return edge;
      return angle > span * .72 ? brass : amber;
    });

    for (const [u, v] of hazardDrips) {
      patch(scene, frame, [u - .016, v + .008, .033, .036], ink => {
        const [r, g, b] = table[ink].rgb;
        return g > r * 1.08 && g > b * 1.5 ? 0 : ink;
      });
    }
    fallingDrops(scene, frame, time, hazardDrips, ['#a0dc18', '#d6ff45', '#506f13'].map(hex => frame.palette.indexOf(hex)));
  }

  const discCenter = [.505, .361];
  const discRadii = [.209, .191];
  const discInner = .356, discOuter = .986;
  const discSectors = 288;
  const discFrontEdge = [[.28, .354], [.365, .354], [.386, .358], [.401, .367], [.415, .388],
    [.421, .413], [.553, .413], [.577, .416], [.594, .412], [.72, .413]];
  const discTextures = new Map();

  function discExposure(u, v, radius, angle) {
    let edge = discFrontEdge[0][1];
    for (let i = 1; i < discFrontEdge.length; i++) {
      const [x, y] = discFrontEdge[i];
      if (u > x) continue;
      const [left, top] = discFrontEdge[i - 1];
      edge = top + (y - top) * Math.max(0, u - left) / (x - left);
      break;
    }
    const dx = Math.abs(u - .345), dy = Math.abs(v - .254);
    const flare = Math.min(dx / .047 + dy / .043, dx / .014 + dy / .106, dx / .113 + dy / .014);
    const rim = discOuter - .045 * Math.sin(2 * angle) - .012 * Math.sin(angle);
    return smooth(Math.min((edge - v) / .008, (flare - 1) * 2.5,
      (radius - discInner) / .031, (rim - radius) / .035));
  }

  function discTexture(scene, size, base) {
    if (discTextures.has(size)) return discTextures.get(size);
    const [cx, cy] = discCenter, [rx, ry] = discRadii;
    const table = colorTable(scene);
    const tracks = Math.max(8, Math.round(size * .118));
    const texture = new Uint8Array(tracks * discSectors);
    for (let track = 0; track < tracks; track++) {
      const offset = track * discSectors;
      // Use the reflective part of the plate as the texture. The etched rim and
      // hub are separate, so their outlines never get sampled into the moving face.
      const radius = .45 + .37 * track / (tracks - 1);
      const samples = [];
      for (let sector = 0; sector < discSectors; sector++) {
        const angle = sector * tau / discSectors;
        const u = cx + Math.cos(angle) * rx * radius, v = cy + Math.sin(angle) * ry * radius;
        if (discExposure(u, v, radius, angle) < .45) continue;
        const [x, y] = point(scene, size, u, v).map(Math.floor);
        const ink = base[y * size + x];
        if (!ink) continue;
        texture[offset + sector] = ink;
        samples.push(sector);
      }
      // Complete the hidden half from the other side of the same track. Match its
      // endpoints so a missing slice never comes round the hub during the turn.
      const visible = new Uint8Array(discSectors);
      for (const sector of samples) visible[sector] = texture[offset + sector];
      for (const [index, start] of samples.entries()) {
        const end = samples[index + 1] ?? samples[0] + discSectors;
        if (end - start <= 1) continue;
        const left = table[texture[offset + start]].rgb;
        const right = table[texture[offset + end % discSectors]].rgb;
        for (let sector = start + 1; sector < end; sector++) {
          const progress = smooth((sector - start) / (end - start));
          const mirror = visible[(discSectors * 2 - sector) % discSectors];
          const mix = end - start > discSectors / 4 && mirror
            ? smooth(Math.min(sector - start, end - sector) / (discSectors / 10)) : 0;
          texture[offset + sector % discSectors] = nearest(scene, left.map((value, channel) => {
            const bridge = value + (right[channel] - value) * progress;
            return bridge + (table[mirror].rgb[channel] - bridge) * mix;
          }));
        }
      }
    }
    const cells = [];
    const [left, top, right, bottom] = bounds(scene, size, [.289, .165, .430, .263]);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const index = y * size + x;
      if (!base[index]) continue;
      const u = (x + .5) / size, v = (y + .5) / size;
      const dx = (u - cx) / rx, dy = (v - cy) / ry;
      const radius = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
      const weight = discExposure(u, v, radius, angle);
      if (weight === 0) continue;
      const track = Math.min(tracks - 1, Math.round((radius - discInner) / (discOuter - discInner) * (tracks - 1)));
      cells.push({ index, offset: track * discSectors, angle: angle * discSectors / tau, weight });
    }
    const colors = table.length;
    const blends = new Uint8Array(8 * colors * colors);
    for (let step = 1; step < 7; step++) for (let from = 1; from < colors; from++) for (let to = 1; to < colors; to++) {
      blends[(step * colors + from) * colors + to] = nearest(scene, table[from].rgb.map((value, channel) =>
        value + (table[to].rgb[channel] - value) * step / 7));
    }
    const surface = { texture, cells, blends };
    discTextures.set(size, surface);
    return surface;
  }

  function animateDisc(scene, frame, base, phase) {
    const { texture, cells, blends } = discTexture(scene, frame.size, base);
    const spin = phase * discSectors / tau;
    const strength = smooth(Math.min(phase, tau - phase) / .24);
    const colors = frame.palette.length;
    for (const { index, offset, angle, weight } of cells) {
      const sector = Math.round(angle - spin + discSectors * 2) % discSectors;
      const ink = texture[offset + sector];
      const step = Math.round(weight * strength * 7);
      if (ink && step) frame.pixels[index] = step === 7 ? ink : blends[(step * colors + base[index]) * colors + ink];
    }
  }

  const bullKeys = [[0, 0, 0, 0], [.19, -.014, .007, 0], [.44, -.038, .026, 0], [.57, -.018, -.011, 0],
    [.68, .020, .003, 1], [.76, .011, .009, .77], [.92, -.027, -.014, .34], [1.16, -.014, .007, 0],
    [1.38, 0, 0, 0], [1.5, 0, 0, 0]];

  function animateBulls(scene, frame, base, time, table) {
    const [advance, dip, impact] = pose(time % 1.5, bullKeys);
    if (!advance && !dip && !impact) return;
    const { size } = frame;
    const [ox, oy, width, height] = scene.placement;
    const inSun = (u, v) => ((u - .513) / .169) ** 2 + ((v - .294) / .227) ** 2 < 1;
    const sun = nearest(scene, [255, 229, 12]);
    const [sunX] = point(scene, size, .513, .294).map(Math.floor);
    const background = (x, y) => {
      if (!inSun(((x + .5) / size - ox) / width, ((y + .5) / size - oy) / height)) return 0;
      const sample = base[y * size + sunX];
      return table[sample].rgb[1] > 165 ? sample : sun;
    };
    // The orange shadow on the sun's edge must stay with the disc.
    const body = table.map(({ rgb: [r, g, b] }) => r > 52 && r > b * 1.43 && r > g * 2);
    patch(scene, frame, [.086, .151, .854, .324], (ink, u, v) => inSun(u, v) ? ink : 0);
    const split = .513;
    for (const side of [-1, 1]) {
      const rect = side < 0 ? [.088, .151, split - .088, .324] : [split, .151, .937 - split, .324];
      const dx = -side * advance * width * size;
      const dy = dip * height * size;
      layer(scene, frame, base, rect, (x, y) => [x - dx, y - dy], {
        padding: .06,
        background,
        select: (ink, x, y) => {
          const u = ((x + .5) / size - ox) / width, v = ((y + .5) / size - oy) / height;
          if ((side < 0) !== (u < split)) return false;
          if (body[ink]) return true;
          const [r, g, b] = table[ink].rgb;
          if (r < 59 || g < 52 || r < b * 1.45) return false;
          // Carry the attached yellow edge through the overlap with the sun as well.
          for (let row = y - 1; row <= y + 1; row++) for (let col = x - 1; col <= x + 1; col++) {
            if (body[base[row * size + col]]) return true;
          }
          return false;
        }
      });
    }
    if (impact < .12) return;
    const bright = nearest(scene, [255, 255, 194]);
    const gold = frame.palette.indexOf(scene.accent);
    const spread = 1 - impact;
    for (let i = 0; i < 7; i++) {
      const angle = i * tau / 7 + .4;
      const distance = .027 + .135 * spread;
      const [x, y] = point(scene, size, .513 + Math.cos(angle) * distance, .38 + Math.sin(angle) * distance * .93);
      square(frame, x, y, Math.max(1, Math.round(size * .021 * impact)), i % 3 ? gold : bright);
    }
    const [x, y] = point(scene, size, .513, .393);
    square(frame, x, y, Math.max(1, Math.round(size * .028 * impact)), bright);
  }

  function animateSpecter(scene, frame, time, phase, table) {
    const { size } = frame;
    const white = frame.palette.indexOf('#ffffff');
    const red = frame.palette.indexOf(scene.accent);
    const dim = frame.palette.indexOf('#6b1421');
    const hot = frame.palette.indexOf('#ff988f');
    const glow = .5 + .5 * Math.cos(phase * 2 - 1.1);
    patch(scene, frame, [.54, .092, .34, .22], (ink, u, v) => {
      const dx = Math.abs(u - .711), dy = Math.abs(v - .20);
      const distance = dx / (.054 + .073 * glow) + dy / (.028 + .034 * glow);
      const [r, g] = table[ink].rgb;
      if (table[ink].light > 135 && r <= g * 1.4) return ink;
      if (distance < .18 + .16 * glow) return glow > .65 ? white : hot;
      if (distance < .49) return red;
      if (distance < .84 && table[ink].light < 40) return dim;
      return ink;
    });

    const particles = [];
    const gray = nearest(scene, [135, 135, 135]);
    const smoke = nearest(scene, [64, 64, 64]);
    patch(scene, frame, [.035, .059, .407, .593], (ink, u, v, x, y) => {
      const seed = ((Math.floor(u * 58) * 73 + Math.floor(v * 73) * 49) % 101) / 101;
      if (seed > .53 - u * .63 || !table[ink].neutral || table[ink].light < 60) return ink;
      const age = (time / 1.5 + seed * 4.7) % 1;
      if (age < .26) return ink;
      const progress = (age - .26) / .74;
      const px = x + .5 - size * (.028 + seed * .12) * progress;
      const py = y + .5 + size * ((seed - .22) * .11) * progress;
      if (progress < .84) particles.push([px, py, progress < .31 ? ink : progress < .61 ? gray : smoke]);
      return 0;
    });
    for (const [x, y, ink] of particles) square(frame, x, y, 1, ink);
  }

  function animateRadio(scene, frame, time) {
    const bright = frame.palette.indexOf('#ffffff');
    const fade = nearest(scene, [115, 115, 115]);
    const cycle = time % 1.5;
    const pulses = [0, .17, .34].map(delay => (cycle - delay) / .79).filter(age => age >= 0 && age < 1);
    patch(scene, frame, [-.14, 0, .59, .24], (ink, u, v) => {
      const dx = u * 406 - 111, dy = v * 656 - 91;
      const angle = Math.atan2(dy, dx);
      if (angle < -2.82 || angle > -1.64) return ink;
      const radius = Math.hypot(dx, dy);
      for (const age of pulses) {
        const width = Math.max(4.5, 360 / frame.size) * (1 - age * .2);
        if (Math.abs(radius - (16 + age * 81)) < width) return age < .77 ? bright : fade;
      }
      return ink;
    });
  }

  const monitorDrips = [
    [.285, .584, .093, .05, .73], [.323, .631, .047, .53, .54], [.68, .589, .089, .28, .71],
    [.303, .949, .047, .46, .55], [.375, .945, .049, .83, .51], [.576, .952, .047, .20, .57], [.637, .944, .05, .98, .48]
  ];

  function animateMonitor(scene, frame, time, table) {
    const white = frame.palette.indexOf('#ffffff');
    const silver = nearest(scene, [211, 214, 210]);
    const ash = nearest(scene, [96, 100, 96]);
    const age = ((time + .11) % 1.5) / .92;
    if (age < 1) {
      const front = age * .205;
      patch(scene, frame, [.29, .14, .32, .32], (ink, u, v) => {
        if (!table[ink].neutral || table[ink].light < 55) return ink;
        const distance = Math.hypot(u - .466, (v - .319) * 1.04);
        if (Math.abs(distance - front) < .026) return white;
        return distance < front && distance > front - .062 && table[ink].light < 190 ? silver : ink;
      });
      if (age < .55) {
        const [x, y] = point(scene, frame.size, .466, .319);
        const side = Math.max(1, Math.round(frame.size * (.057 - .055 * age)));
        square(frame, x, y, side, white);
      }
    }
    fallingDrops(scene, frame, time, monitorDrips, [silver, white, ash]);
  }

  function animatePet(scene, frame, time, table) {
    const cycle = time % 1.5;
    const mint = frame.palette.indexOf(scene.accent);
    const { anchor = 0, scale = 1 } = scene.upperStretch ?? {};
    const stretchY = y => anchor + (y - anchor) * scale;
    if (cycle > .25 && cycle < .56) {
      for (const x of [.426, .501]) {
        patch(scene, frame, [x - .02, stretchY(.386), .04, .023 * scale], ink => table[ink].light < 90 ? mint : ink);
        const [px, py] = point(scene, frame.size, x, stretchY(.406));
        const radius = Math.max(1, Math.floor(frame.size * .013));
        for (let i = -radius; i <= radius; i++) square(frame, px + i, py, 1, 0);
      }
    }
    const controls = [[.304, .51], [.469, .528], [.635, .509]];
    const button = Math.floor(cycle * 4) % controls.length;
    const [u, v] = controls[button];
    patch(scene, frame, [u - .025, stretchY(v - .012), .05, .027 * scale], ink => table[ink].light > 180 ? mint : ink);
    if (cycle < .36 || cycle > 1.06) return;
    const rise = (cycle - .36) / .70;
    const [x, y] = point(scene, frame.size, .629, stretchY(.417 - rise * .051));
    const cell = Math.max(1, Math.round(frame.size * .011));
    const pixelHeart = [[-1, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [0, 1]];
    for (const [dx, dy] of pixelHeart) square(frame, x + dx * cell, y + dy * cell, cell, 0);
  }

  const vectorKeys = [[0, 0, 0], [.12, -.013, 0], [.28, -.053, 0], [.40, .072, 1], [.49, .086, .79],
    [.65, .027, .22], [.79, -.012, 0], [1.04, 0, 0], [1.5, 0, 0]];

  function animateVector(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [thrust, speed] = pose(cycle, vectorKeys);
    const [response] = pose(Math.max(0, cycle - .10), vectorKeys);
    if (!thrust && !speed && !response) return;
    const { size } = frame;
    const red = table.map(({ rgb: [r, g, b] }) => r > 70 && r > g * 1.9 && r > b * 1.75);
    const white = frame.palette.indexOf('#ffffff');
    const bright = frame.palette.indexOf(scene.accent);
    const tail = nearest(scene, [145, 7, 20]);
    const silver = nearest(scene, [172, 171, 166]);
    const gleam = (cycle - .29) / .40;
    const phase = gleam * tau;
    const band = gleam * 1.13 - .10;
    patch(scene, frame, [0, .449, 1, .370], (ink, u, v) => {
      if (v < .449 || v > .819) return ink;
      const hinge = smooth((v - .449) / .035) * smooth((.819 - v) / .048);
      const x = .43 + (u - .43 - thrust) / (1 + thrust * 1.75);
      const y = v - hinge * (.24 * thrust * (u - .43) + speed * .011 * Math.sin(u * tau * 1.4 - phase));
      const foreground = samplePixel(scene, size, base, x, y);
      if (red[foreground]) {
        const sweep = u + (v - .50) * .40 - band;
        if (gleam > 0 && gleam < 1 && Math.abs(sweep) < .042) return Math.abs(sweep) < .010 ? white : bright;
        return foreground;
      }
      const silverX = .50 + (u - .50 + response * .33) / (1 - response * .17);
      const silverY = v + hinge * response * (.33 + .34 * Math.sin(u * tau * 1.2 - phase));
      const background = samplePixel(scene, size, base, silverX, silverY);
      if (red[background] || table[background].light < 58) return 0;
      return gleam > .15 && gleam < 1 && Math.abs(u - band + .13) < .028 && table[background].light > 130
        ? silver : background;
    });

    for (const [u, v, delay, length] of [[.16, .481, 0, .14], [.22, .516, .05, .13], [.28, .555, .11, .105]]) {
      const age = (cycle - .30 - delay) / .30;
      if (age <= 0 || age >= 1) continue;
      const head = u + age * .115;
      const span = length * Math.sin(age * Math.PI) ** .8;
      const depth = 1.05 / (size * scene.placement[3]);
      patch(scene, frame, [head - span, v - depth / 2, span, depth], (ink, x, y) => {
        if (ink || x < head - span || x > head || Math.abs(y - v) > depth / 2) return ink;
        return x > head - span * .30 ? bright : tail;
      });
    }
  }

  const crtKeys = [[0, 0, 1], [.27, -.031, 1], [.54, -.031, 1], [.65, 0, .09], [.73, 0, .09],
    [.85, .040, 1], [1.24, .040, 1], [1.51, 0, 1], [2.16, 0, 1], [2.25, 0, .11], [2.42, 0, 1], [3, 0, 1]];

  function animateCrt(scene, frame, time) {
    const [gaze, open] = pose(time, crtKeys);
    const white = frame.palette.indexOf('#ffffff');
    const silver = nearest(scene, [170, 170, 170]);
    const gray = nearest(scene, [87, 87, 87]);
    const charcoal = nearest(scene, [35, 35, 35]);
    const scan = .276 + time % 1 * .225;
    const locked = Math.min(1, time / .14, (3 - time) / .14);
    const pixelHeight = 1 / (frame.size * scene.placement[3]);
    patch(scene, frame, [.186, .27, .459, .241], (ink, u, v) => {
      const nx = (u - .421) / .187, dy = v - .407;
      if (nx ** 2 + (dy / .076) ** 2 >= 1) {
        return !ink && Math.abs(v - scan) < pixelHeight * .5 ? charcoal : ink;
      }
      if (v > .331 + .152 * locked) return ink;
      const lid = .064 * open * Math.max(0, 1 - Math.abs(nx) ** 1.7);
      if (open < .17) return Math.abs(dy + .013 * nx ** 2) <= pixelHeight * .54 ? silver : 0;
      if (Math.abs(dy) > lid) return 0;
      const pupilX = u - .422 - gaze;
      const iris = (pupilX / .071) ** 2 + (dy / .053) ** 2;
      if (iris < 1) {
        if (Math.abs(pupilX + .021) < .016 && Math.abs(dy + .014) < .013) return white;
        if (iris < .51) return 0;
        return dy < 0 ? gray : silver;
      }
      if (Math.abs(v - scan) < pixelHeight * .55) return silver;
      return dy < -lid * .74 || dy > lid * .83 ? silver : white;
    });
  }

  function animateTerminal(scene, frame, time) {
    const cycle = time % 1.5;
    const { size, palette } = frame;
    const cyan = palette.indexOf(scene.accent), steel = palette.indexOf('#96a0a5');
    const white = palette.indexOf('#ffffff');
    const boot = smooth((cycle - .16) / .72);
    const sweep = (cycle - .91) / .42;
    const [cursorX, cursorY] = point(scene, size, .222, .644);
    const unit = Math.max(1, Math.round(size * .016));
    square(frame, cursorX, cursorY, unit, Math.floor(cycle * 8) % 2 ? cyan : 0);
    for (const [index, u] of [.275, .326, .377, .428, .479, .530, .581, .632].entries()) {
      if (boot <= index / 8) continue;
      const [x, y] = point(scene, size, u, .644);
      const ink = boot < (index + 2) / 8 ? white : boot < .99 ? cyan : steel;
      square(frame, x, y, unit, ink);
      square(frame, x + unit, y, unit, ink);
    }
    if (sweep >= 0 && sweep <= 1) {
      const scan = .269 + sweep * .403;
      for (const u of [.136, .815]) {
        const [x, y] = point(scene, size, u, scan);
        square(frame, x, y, unit, cyan);
        square(frame, x, y - unit, unit, steel);
      }
      patch(scene, frame, [.167, .266, .614, .411], (ink, u, v) =>
        !ink && Math.abs(v - scan) < .65 / size && Math.floor(u * size) % 5 < 3 ? cyan : ink);
    }
    if (boot < .99) return;
    for (const [index, u] of [.617, .659, .701].entries()) {
      if (cycle - .86 < index * .075) continue;
      const [x, y] = point(scene, size, u, .798);
      square(frame, x, y, unit, index === 2 ? cyan : steel);
    }
  }

  function animateTorii(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const phase = cycle * tau / 1.5;
    const bright = nearest(scene, [251, 47, 49]);
    const deep = nearest(scene, [133, 13, 25]);
    const { size } = frame;
    const isRed = ink => table[ink].rgb[0] > 72 && table[ink].rgb[0] > table[ink].rgb[1] * 1.6;
    patch(scene, frame, [.09, .422, .82, .131], (ink, u, v, x, y) => {
      if (ink && !isRed(ink)) return ink;
      const depth = Math.max(0, (v - .422) / .131);
      const drift = Math.round(size * (.009 + depth * .030) * Math.sin(depth * 15 - phase * 2));
      const sample = base[y * size + Math.max(0, Math.min(size - 1, x - drift))];
      const ripple = (depth * 3 - cycle * 1.95 + 3) % 1;
      const center = .537 + Math.sin(depth * 9 - phase) * .031;
      const half = .036 + depth * .17;
      if (ripple < .17 && Math.abs(u - center) < half && (Math.floor(u * size) % 7 !== 0 || ripple < .08)) return bright;
      return isRed(sample) ? sample : 0;
    });
    for (let leaf = 0; leaf < 9; leaf++) {
      const age = (cycle - leaf * .086) / 1.02;
      if (age < 0 || age >= 1) continue;
      const u = .13 + (leaf % 4) * .062 + age * (.27 + (leaf % 3) * .073);
      const v = .129 + (leaf % 5) * .047 + age ** 2 * .131 + Math.sin(age * 7 + leaf) * .019;
      const [x, y] = point(scene, size, u, v);
      const side = Math.max(1, Math.round(size * (.017 - age * .008)));
      const sun = ((u - .5) / .288) ** 2 + ((v - .225) / .223) ** 2 < .9;
      square(frame, x, y, side, sun ? deep : bright);
      if (side > 1 && age < .63) square(frame, x - side * .65, y + Math.sin(age * tau) * side, 1, sun ? deep : bright);
    }
  }

  // Traced in the proportions of the thermal image so the bones sit under its face.
  const skullOutline = [[111, 277], [111, 214], [145, 149], [190, 106], [259, 82], [322, 87], [390, 112],
    [440, 153], [462, 211], [465, 271], [484, 304], [482, 333], [458, 358], [436, 403], [424, 448],
    [399, 492], [371, 526], [328, 544], [278, 529], [231, 504], [200, 471], [181, 430], [152, 391], [124, 352]];
  const skullMouth = [[267, 363], [296, 332], [338, 322], [380, 332], [411, 354], [419, 387], [408, 437],
    [384, 478], [357, 510], [327, 512], [297, 489], [271, 451], [255, 413]];
  const skullNose = [[390, 264], [405, 279], [410, 300], [389, 309], [371, 303], [376, 283]];
  const scannerKeys = [[0, .055, .055], [.14, .055, .055], [1.44, .787, .055], [1.83, .787, .055],
    [2.71, .787, .787], [3, .787, .787]];

  function animateThermal(scene, frame, time, table) {
    const [front, erase] = pose(time, scannerKeys);
    if (front - erase < .003) return;
    const [screen, shade, bone, edge] = scene.detailColors.map(hex => frame.palette.indexOf(hex));
    const white = frame.palette.indexOf('#ffffff');
    const row = time < 1.46 ? front : time > 1.83 ? erase : -1;
    const beam = Math.max(.004, .53 / frame.size);
    patch(scene, frame, [.063, .044, .894, .746], (ink, u, v, _x, gridY) => {
      if (Math.abs(v - row) <= beam) return Math.abs(v - row) < beam * .54 ? edge : bone;
      if (v < erase || v > front || ink === white && (Math.abs(u - .511) < .007 || Math.abs(v - .366) < .006)) return ink;
      const x = u * 562, y = v * 774;
      if (insideOutline(skullOutline, x, y)) {
        const leftEye = ((x - 323) / 47) ** 2 + ((y - 223 - (x - 323) * .23) / 27) ** 2;
        const rightEye = ((x - 430) / 28) ** 2 + ((y - 246 - (x - 430) * .28) / 22) ** 2;
        if (leftEye < 1.06 || rightEye < 1.10) return leftEye < .83 || rightEye < .80 ? screen : shade;
        if (insideOutline(skullNose, x, y)) return screen;
        if (insideOutline(skullMouth, x, y)) {
          const tooth = Math.floor((x + y * .33) / 11) % 4 !== 0;
          const upper = 340 + (x - 341) ** 2 * .004;
          const lower = 491 - (x - 338) ** 2 * .011;
          if (tooth && (y < upper + 9 || y > lower + 3)) return edge;
          return screen;
        }
        const cranium = y < 178 + Math.sin(x * .016) * 19;
        const temple = x < 208 && y > 181 || x > 437 && y > 268;
        return cranium || x > 300 && y > 473 ? edge : temple ? shade : bone;
      }
      if (y >= 516 && y <= 611 && Math.abs(x - (277 - (y - 516) * .20)) < 32) {
        const notch = Math.floor((y - 516) / 6) % 3;
        return notch === 0 ? shade : notch === 1 ? edge : bone;
      }
      return ink && table[ink].light > 16 ? gridY % 3 === 0 ? shade : screen : 0;
    });
  }

  const bassKeys = [[0, 0], [.13, 1], [.27, .17], [.45, .88], [.54, .95], [.72, .14], [1.0, .04], [1.5, 0]];

  function animateCandy(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [bass] = pose(cycle, bassKeys);
    const { size } = frame;
    const [cx, cy] = point(scene, size, .503, .335);
    const stretch = 1 + bass * .19;
    layer(scene, frame, base, [.437, .222, .131, .116], (x, y) => [cx + (x - cx) / stretch, cy + (y - cy) / stretch],
      { padding: .04 });
    const bright = shadeMap(scene, bass * .75);
    for (const left of [.329, .580]) {
      patch(scene, frame, [left, .225, .098, .118], (ink, _u, v, _x, y) => {
        const [r, g, b] = table[ink].rgb;
        return b > r * 1.22 && b > g * .96 && v > .344 - bass * .116 && y % 4 < 2 ? bright[ink] : ink;
      });
    }
    const white = frame.palette.indexOf('#ffffff');
    const pink = nearest(scene, [243, 153, 216]);
    for (const side of [-1, 1]) for (let note = 0; note < 2; note++) {
      const age = (cycle - .11 - .23 * note - (side > 0 ? .095 : 0)) / .67;
      if (age < 0 || age > 1) continue;
      const [x, y] = point(scene, size, .5 + side * (.207 + age * .123), .244 - age * .158 + note * .023);
      const cell = Math.max(1, Math.round(size * .013));
      const ink = note ? white : pink;
      for (const [dx, dy] of [[0, 0], [1, 0], [1, -1], [1, -2], [2, -2]]) square(frame, x + dx * cell, y + dy * cell, cell, ink);
    }
  }

  function animateConsole(scene, frame, base, phase, table) {
    const { size } = frame;
    const red = ink => {
      const [r, g, b] = table[ink].rgb;
      return r > 75 && r > g * 1.6 && r > b * 1.55;
    };
    const deck = ink => ink !== 0 && !table[ink].neutral && !red(ink);
    const blue = nearest(scene, [5, 100, 224]);
    const cyan = nearest(scene, [0, 199, 184]);
    const gold = nearest(scene, [255, 220, 0]);
    patch(scene, frame, [.212, .350, .561, .209], (ink, u, v) => {
      if (!deck(ink)) return ink;
      const dx = (u - .493) / .276, dy = (v - .447) / .100;
      const theta = Math.atan2(dy, dx) - phase;
      const r = Math.hypot(dx, dy);
      const [x, y] = point(scene, size, .493 + Math.cos(theta) * r * .276, .447 + Math.sin(theta) * r * .100);
      const sample = base[Math.floor(y) * size + Math.floor(x)];
      if (deck(sample)) return sample;
      return Math.cos(theta) < -.34 ? gold : Math.sin(theta) > .16 ? cyan : blue;
    });

    const tilt = Math.sin(phase);
    const width = 1 - tilt ** 2 * .25;
    const [cx, cy] = point(scene, size, .443, .535);
    layer(scene, frame, base, [.426, .110, .251, .454], (x, y) => [cx + (x - cx - (cy - y) * tilt * .10) / width, y], {
      select: red,
      background: (x, y) => {
        const v = (y + .5) / size;
        if (v < .368 || v > .52) return 0;
        const floor = base[y * size + Math.min(size - 1, x + Math.round(size * .081))];
        return deck(floor) ? floor : 0;
      },
      padding: .060
    });
  }

  const stampKeys = [[0, 0, 1, 0], [.23, -.069, 1, 0], [.36, -.035, 1.035, 0], [.45, 0, .885, 1],
    [.54, -.013, 1.023, .72], [.72, 0, 1, .21], [.93, 0, 1, 0], [1.5, 0, 1, 0]];

  function animateStamp(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [lift, squash, impact] = pose(cycle, stampKeys);
    if (!lift && squash === 1 && !impact) return;
    const { size } = frame;
    const [cx, cy] = point(scene, size, .519, .647);
    const spread = 1 + (1 - squash) * .47;
    layer(scene, frame, base, [.128, .104, .808, .548], (x, y) => [cx + (x - cx) / spread, cy + (y - cy - lift * size) / squash],
      { select: ink => ink !== 0 && (table[ink].light > 20 || !table[ink].neutral), padding: .087 });
    if (impact < .16) return;
    const gold = frame.palette.indexOf(scene.accent);
    const shadow = nearest(scene, [131, 97, 1]);
    const spreadTime = 1 - impact;
    for (const side of [-1, 1]) for (let bit = 0; bit < 4; bit++) {
      const u = .497 + side * (.345 + bit * .021 + spreadTime * (.034 + bit * .014));
      const v = .638 - (bit % 2) * .022 - Math.sin(spreadTime * Math.PI) * (.033 + bit * .007);
      const [x, y] = point(scene, size, u, v);
      square(frame, x, y, Math.max(1, Math.round(size * (.017 - spreadTime * .009))), impact > .52 ? gold : shadow);
    }
  }

  const streamDrops = [[.203, .04, .217], [.259, .10, .170], [.325, .14, .202], [.374, .20, .141],
    [.437, .25, .165], [.286, .34, .210], [.480, .39, .124], [.223, .53, .252], [.339, .59, .176],
    [.268, .65, .202], [.404, .69, .133], [.471, .75, .184], [.309, .81, .215], [.377, .90, .168], [.455, .98, .141]];

  function animateStreamDisc(scene, frame, base, time, table) {
    const { size } = frame;
    const lime = frame.palette.indexOf(scene.accent);
    const spark = nearest(scene, [174, 255, 139]);
    const green = nearest(scene, [26, 175, 61]);
    const shadow = nearest(scene, [14, 91, 36]);
    const isGreen = table.map(({ rgb: [r, g, b] }) => g > 90 && g > r * 1.48 && g > b * 1.24);
    const cycle = time % 1.5;
    const phase = cycle * tau / 1.5;
    const pulse = smooth(cycle / .15) * smooth((1.5 - cycle) / .15);
    // Offset the three cutouts within the green field, tapering the motion before the rim.
    patch(scene, frame, [.305, .211, .376, .269], (_ink, u, v) => {
      const depth = v - .254 - .94 * (u - .43) ** 2;
      const across = smooth((u - .309) / .024) * smooth((.679 - u) / .024);
      const inside = smooth((depth + .034) / .025) * smooth((.212 - depth) / .029);
      const sway = .018 * pulse * across * inside * Math.sin(phase - depth * 5.2);
      return samplePixel(scene, size, base, u, v - sway);
    });
    for (const [index, [v, delay, drift]] of streamDrops.entries()) {
      const age = (cycle - delay) / (.49 + (index % 4) * .065);
      if (age < 0 || age >= 1) continue;

      const rim = .499 + .216 * Math.sqrt(1 - ((v - .349) / .222) ** 2);
      const [outer, row] = point(scene, size, rim + .024, v).map(Math.floor);
      const [inner] = point(scene, size, rim - .050, v);
      let column = outer;
      while (column > inner && !(isGreen[base[row * size + column]] && isGreen[base[row * size + column - 1]])) column--;
      if (column <= inner) continue;

      const drop = .541 + (index % 3) * .006 - v;
      const x = column + .5 + size * drift * age * (2 - age);
      const y = row + .5 + size * drop * age * (.12 + .88 * age);
      const side = Math.max(1, Math.round(size * (index % 3 === 0 ? .024 : .015) * (1 - age * .58)));
      if (age > .055 && age < .31) frame.pixels[row * size + column] = age < .22 ? 0 : shadow;
      if (age > .30 && age < .86) {
        const trail = age - .105;
        square(frame, column + .5 + size * drift * trail * (2 - trail), row + .5 + size * drop * trail * (.12 + .88 * trail), 1, shadow);
      }
      square(frame, x, y, side, age < .12 ? spark : age < .57 ? lime : age < .88 ? green : shadow);
      if (side > 1 && age > .25 && age < .61) square(frame, x + side, y - side * .5, 1, green);
    }
  }

  const playerBlink = [[0, 1], [.31, 1], [.46, .11], [.53, .11], [.67, 1], [1.5, 1]];

  function animatePlayer(scene, frame, base, time, table) {
    const { size } = frame;
    const white = frame.palette.indexOf('#ffffff');
    const lilac = frame.palette.indexOf(scene.accent);
    const [bx, by] = point(scene, size, .503, .117).map(Math.floor);
    const toolbar = base[by * size + bx];
    const cycle = time % 1.5;
    const phase = cycle * tau / 1.5;
    patch(scene, frame, [.247, .093, .202, .057], (ink, u, v) => {
      if (u < .247 || u > .449 || v < .093 || v > .150) return ink;
      const column = (u - .248) / .0181;
      const bar = Math.floor(column);
      const level = .019 + .031 * (.5 + .5 * Math.sin(phase * 3 + bar * .87)) * (.66 + .34 * Math.cos(bar * .68));
      return v >= .147 - level && column % 1 < .65 ? (v < .147 - level * .66 ? lilac : white) : toolbar;
    });
    const sweep = shadeMap(scene, .40 + .33 * Math.sin(phase * 2));
    patch(scene, frame, [.217, .345, .137, .168], (ink, u, v) => {
      const dx = (u - .281) / .056, dy = (v - .423) / .071;
      const ring = dx ** 2 + dy ** 2;
      const angle = Math.atan2(dy, dx);
      const band = Math.sin((angle - phase * 2) / 2);
      if (!ink || table[ink].light < 49 || ring < .71 || ring > 1.27 || Math.abs(band) > .40) return ink;
      return sweep[ink];
    });
    const [open] = pose(cycle, playerBlink);
    if (open >= .99) return;
    const violet = nearest(scene, [54, 16, 99]);
    for (const [cx, cy, width, height] of [[.491, .382, .037, .037], [.651, .348, .027, .039]]) {
      patch(scene, frame, [cx - width, cy - height * 1.4, width * 2, height * 2.8], (ink, u, v, x) => {
        const dx = (u - cx) / width;
        if (Math.abs(dx) >= 1) return ink;
        const lid = cy - (u - cx) * .40;
        const dy = v - lid;
        const span = height * Math.sqrt(1 - dx ** 2);
        if (Math.abs(dy) > span) return ink;
        if (open < .18) return Math.abs(dy) < .49 / size ? violet : white;
        if (Math.abs(dy) > span * open) return white;
        const sy = Math.floor((lid + dy / open) * size);
        return base[sy * size + x];
      });
    }
  }

  const marqueeBulbs = [[65, 179], [69, 157], [74, 135], [84, 111], [103, 87], [123, 72], [146, 59],
    [298, 80], [317, 103], [332, 124], [341, 153], [342, 186]];
  const marqueeStars = [[61, 223, 15, .04], [72, 250, 19, .21], [204, 388, 16, .39],
    [339, 250, 19, .57], [352, 226, 16, .73]];
  const laughKeys = [[0, 0], [.12, -.26], [.27, 1], [.38, -.37], [.51, .89], [.63, -.32],
    [.76, .79], [.91, .12], [1.04, -.20], [1.18, .38], [1.37, 0], [1.5, 0]];

  function animateMarquee(scene, frame, base, time, table) {
    const { size } = frame;
    const cycle = time % 1.5;
    const white = frame.palette.indexOf('#ffffff');
    const yellow = frame.palette.indexOf(scene.accent);
    const amber = nearest(scene, [141, 97, 4]);
    const glow = (time * 8) % marqueeBulbs.length;
    for (const [index, [rawX, rawY]] of marqueeBulbs.entries()) {
      const u = rawX / 410, v = rawY / 410;
      const trail = (glow - index + marqueeBulbs.length) % marqueeBulbs.length;
      const lit = trail < 2.45;
      patch(scene, frame, [u - .015, v - .014, .03, .028], ink => {
        const [r, g, b] = table[ink].rgb;
        return r > 110 && g > 91 && r > b * 1.6 ? lit ? yellow : amber : ink;
      });
      if (trail < .90) {
        const [x, y] = point(scene, size, u, v);
        square(frame, x, y, Math.max(1, Math.round(size * .013)), white);
      }
    }
    const [pin] = point(scene, size, .504, .039);
    const flutter = Math.sin(time * tau * 2) * size * .013;
    layer(scene, frame, base, [.50, .009, .115, .043], (x, y) => [x, y - flutter * Math.max(0, (x - pin) / (size * .11))], {
      select: ink => {
        const [r, g, b] = table[ink].rgb;
        return r > 82 && r > g * 1.9 && r > b * 1.7;
      }
    });

    for (const [x, y, span, delay] of marqueeStars) {
      const age = (cycle - delay) / .53;
      if (age <= 0 || age >= 1) continue;
      const pulse = Math.sin(age * Math.PI) ** 2;
      const cx = x / 410, cy = y / 410, reach = span / 410;
      patch(scene, frame, [cx - reach, cy - reach, 2 * reach, 2 * reach], (ink, u, v) => {
        const [r, g, b] = table[ink].rgb;
        if (r < 143 || g < 120 || r < b * 1.6 || g < b * 1.25) return ink;
        const distance = Math.abs(u - cx) + Math.abs(v - cy);
        const core = Math.max(.67 / size, reach * (.18 + pulse * .62));
        return pulse > .47 && distance < core ? white : pulse > .21 ? yellow : ink;
      });
    }

    const [laugh] = pose(cycle, laughKeys);
    patch(scene, frame, [.355, .382, .284, .152], (ink, u, v, x) => {
      const across = (u - .355) / .284;
      if (across <= 0 || across >= 1 || !laugh) return ink;
      const arch = Math.sin(across * Math.PI);
      const seam = .381 + across * .049 + arch * .063;
      const collar = .534;
      if (v <= seam || v >= collar) return ink;

      // Open the gap under the upper teeth and carry the lower teeth as a row.
      const jawTop = seam + .011;
      const jawBottom = seam + .042;
      const drop = Math.min(laugh * arch * (laugh > 0 ? .045 : .019), (collar - jawBottom) * .86);
      const top = jawTop + drop, bottom = jawBottom + drop;
      let source = v - drop;
      if (v < top) source = seam + (v - seam) * (jawTop - seam) / (top - seam);
      else if (v > bottom) source = collar - (collar - v) * (collar - jawBottom) / (collar - bottom);
      const [, sy] = point(scene, size, u, source);
      return base[Math.floor(sy) * size + x];
    });
    if (laugh < .26) return;
    for (const [u, v] of [[.439, .320], [.587, .345]]) {
      patch(scene, frame, [u - .027, v - .024, .054, .048], (ink, x, y) => {
        const [r, g, b] = table[ink].rgb;
        if (r < 145 || g < 121 || b > 90) return ink;
        const lid = v + (x - u) * .28;
        const slit = Math.max(.56 / size, .020 - laugh * .014);
        return Math.abs(y - lid) < slit ? ink : 0;
      });
    }
  }

  const horseHinge = [.493, .552];
  const horseContour = [[.336, .279], [.386, .257], [.404, .204], [.447, .161], [.483, .142],
    [.535, .150], [.581, .171], [.621, .218], [.608, .262], [.675, .254], [.682, .360],
    [.635, .433], [.589, .471], [.547, .512], [.497, .581], [.454, .586], [.449, .523],
    [.414, .491], [.386, .455], [.367, .400], [.326, .371]];
  const rearKeys = [[0, 0], [.19, -.071], [.43, .136], [.62, .108], [.78, -.041], [.98, 0], [1.5, 0]];

  function animateHorse(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [angle] = pose(cycle, rearKeys);
    const { size } = frame;
    if (angle) {
      const outline = horseContour.map(([u, v]) => point(scene, size, u, v));
      const upperGold = nearest(scene, [245, 234, 2]), lowerGold = nearest(scene, [254, 242, 3]);
      // The original silhouette is matted against gold before placing the reared pose.
      rotate(scene, frame, base, [.323, .140, .361, .449], horseHinge, angle, {
        select: (ink, x, y) => table[ink].light < 148 && table[ink].rgb[0] < 174 &&
          insideOutline(outline, x + .5, y + .5),
        background: (_x, y) => y < size * .366 ? upperGold : lowerGold,
        padding: .064
      });
      const dark = table.map(({ light }) => light < 73);
      const neighbors = [-size - 1, -size, -size + 1, -1, 1, size - 1, size, size + 1];
      patch(scene, frame, [.276, .130, .462, .477], (ink, _u, _v, x, y) => {
        const index = y * size + x;
        // A lone black pixel can fall off the silhouette when the pose snaps to the grid.
        return dark[ink] && !dark[base[index]] && neighbors.every(offset => !dark[frame.pixels[index + offset]])
          ? base[index] : ink;
      });
    }
    const green = frame.palette.indexOf('#98c04d');
    const pale = frame.palette.indexOf('#cbd96d');
    const shade = frame.palette.indexOf('#557929');
    const [hingeX, hingeY] = horseHinge;
    const dx = .564 - hingeX, dy = .408 - hingeY;
    const rumpX = hingeX + dx * Math.cos(angle) - dy * Math.sin(angle);
    const rumpY = hingeY + dx * Math.sin(angle) + dy * Math.cos(angle);
    const beforeSmoke = frame.pixels.slice();
    const [rumpColumn, rumpRow] = point(scene, size, rumpX, rumpY).map(Math.floor);
    const scan = rumpRow * size;
    let vent = rumpColumn;
    while (vent > rumpColumn - size * .036 && table[beforeSmoke[scan + vent]].light >= 64) vent--;
    while (vent < rumpColumn + size * .055 && table[beforeSmoke[scan + vent]].light < 64) vent++;
    const burst = cycle - .37;
    if (burst >= 0 && burst < .22) {
      const length = Math.max(1, Math.round(size * (.017 + Math.min(burst, .11) * .34)));
      for (let cell = 0; cell < length; cell++) {
        square(frame, vent + .5 + cell, rumpRow + .5 - cell * .22, 1, cell < length / 2 ? shade : green);
      }
    }
    for (let puff = 0; puff < 3; puff++) {
      const age = (burst - puff * .086) / .55;
      if (age < 0 || age > 1) continue;
      const x = vent + .5 + size * age * (.080 + puff * .011);
      const y = rumpRow + .5 - size * age * (.042 + puff * .015);
      const cell = Math.max(1, Math.round(size * (.014 + Math.sin(Math.PI * age) * .018)));
      if (age < .70) {
        square(frame, x + cell * .23, y + cell * .37, cell + 1, shade);
        square(frame, x - cell * .70, y, cell, green);
        square(frame, x, y - cell * .52, cell + 1, pale);
        square(frame, x + cell * .60, y + cell * .33, cell, green);
      } else {
        square(frame, x - cell, y + cell, 1, green);
        square(frame, x + cell, y - cell, 1, pale);
      }
    }
    patch(scene, frame, [.52, .27, .22, .22], (ink, _u, _v, x, y) => {
      const field = beforeSmoke[y * size + x];
      const [r, g, b] = table[field].rgb;
      return r > 125 && g > 115 && b < r * .65 ? ink : field;
    });
  }

  const crocTail = [[75, 146], [80, 122], [96, 105], [118, 96], [154, 86], [197, 77], [238, 69],
    [242, 86], [207, 99], [168, 110], [135, 120], [115, 135], [109, 148], [89, 157]];
  const crocJaw = [[238, 161], [249, 156], [272, 159], [287, 165], [305, 169], [332, 171],
    [335, 188], [327, 197], [285, 197], [249, 191], [233, 185]];
  const biteKeys = [[0, 0, 0], [.18, -.12, 0], [.32, .24, 0], [.44, .31, .67], [.55, .29, 1],
    [.68, .24, .86], [.78, .15, .44], [.87, -.12, 0], [1.02, 0, 0], [1.5, 0, 0]];

  function animateCrocodile(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const { size } = frame;
    const outline = crocTail.map(([x, y]) => point(scene, size, x / 410, y / 410));
    const [root] = point(scene, size, .209, .34);
    const sway = Math.sin(cycle * tau * 2 / 1.5) * size * .047;
    layer(scene, frame, base, [.178, .162, .415, .230], (x, y) => {
      const tip = Math.max(0, Math.min(1, (x - root) / (size * .366)));
      return [x, y - sway * tip ** 1.7];
    }, {
      select: (ink, x, y) => {
        const [r, g, b] = table[ink].rgb;
        return g > 70 && g > r * 1.55 && g > b * 1.45 && insideOutline(outline, x + .5, y + .5);
      },
      padding: .065
    });
    const [angle, blast] = pose(cycle, biteKeys);
    const jaw = crocJaw.map(([x, y]) => point(scene, size, x / 410, y / 410));
    if (angle) rotate(scene, frame, base, [.565, .373, .259, .113], [.583, .403], angle, {
      select: (ink, x, y) => ink !== 0 && insideOutline(jaw, x + .5, y + .5), padding: .074
    });

    const red = frame.palette.indexOf('#f63120'), orange = frame.palette.indexOf('#ff7816');
    const gold = frame.palette.indexOf('#ffe449'), white = frame.palette.indexOf('#ffffff');
    if (blast > .02) patch(scene, frame, [.699, .274, .299, .217], (ink, u, v) => {
      if (ink && !motifInk('red', table[ink])) return ink;
      const along = (u - .699) / (.111 + blast * .168);
      if (along < 0 || along >= 1) return ink;
      const center = .420 - .084 * along ** 1.65 + .013 * Math.sin(along * 7.5 - cycle * 23) * along;
      const tongue = .69 + .31 * Math.sin(along * 19 - cycle * 31);
      const spread = (.013 + .093 * along ** .78) * (1 - along) ** .46 * (.35 + .65 * blast);
      const edge = Math.abs(v - center) / (spread * (.74 + tongue * .48));
      if (edge > 1) return ink;
      if (edge < .29 && along < .49) return white;
      if (edge < .44 && along < .84) return gold;
      return edge < .72 ? orange : red;
    });
    for (const [index, [delay, spread]] of [[.43, -.031], [.49, .028], [.54, -.085], [.61, -.052]].entries()) {
      const age = (cycle - delay) / .42;
      if (age < 0 || age > 1) continue;
      const [x, y] = point(scene, size, .807 + age * (.159 + .009 * (index % 2)),
        .391 - age * (.061 + age * .061) + spread * Math.sin(age * Math.PI * .86));
      const side = Math.max(1, Math.round(size * .017 * (1 - age * .63)));
      square(frame, x, y, side, age < .32 ? gold : age < .68 ? orange : red);
    }
  }

  const chromaKeys = [[0, 0, 0, 0, 0], [.12, 0, -.09, .12, -.011], [.30, .061, .124, -.07, .017],
    [.43, .043, .081, -.04, .015], [.52, .003, -.067, .147, -.009], [.64, .035, -.055, -.046, -.010],
    [.79, 0, .043, .067, .005], [.93, 0, 0, 0, 0], [1.5, 0, 0, 0, 0]];

  function animateChromaNote(scene, frame, base, time) {
    const cycle = time % 1.5;
    const [lift, angle, squash, offset] = pose(cycle, chromaKeys);
    const { size } = frame;
    if (lift || angle || squash) {
      const [cx, cy] = point(scene, size, .51, .518);
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      layer(scene, frame, base, [.301, .092, .426, .471], (x, y) => {
        const dx = x - cx - offset * size, dy = y - cy + lift * size;
        return [cx + (dx * cosine + dy * sine) / (1 + squash), cy + (dy * cosine - dx * sine) / (1 - squash)];
      }, { padding: .12 });
    }
    const cyan = frame.palette.indexOf(scene.accent);
    const red = nearest(scene, [253, 6, 68]);
    const dim = [nearest(scene, [1, 127, 138]), nearest(scene, [136, 4, 43])];
    for (let hit = 0; hit < 2; hit++) {
      const age = (cycle - .31 - hit * .22) / .43;
      if (age < 0 || age > 1) continue;
      for (const side of [-1, 1]) for (let dash = 0; dash < 3; dash++) {
        const u = .51 + side * (.234 + dash * .026 + age * (.055 + dash * .012));
        const v = .385 + dash * .051 - age * (.052 - dash * .012);
        const [x, y] = point(scene, size, u, v);
        const cell = Math.max(1, Math.round(size * .014 * (1 - age * .54)));
        const ink = age < .69 ? side < 0 ? cyan : red : dim[side < 0 ? 0 : 1];
        square(frame, x, y, cell, ink);
        if (age < .55 && dash !== 1) square(frame, x - side * cell, y + cell, 1, ink);
      }
    }
  }

  const harpStrings = [[177.5, 57, 171.5, 77], [188.5, 65, 178, 92], [198.5, 68, 184.5, 108],
    [208.5, 72, 190.5, 124], [219.5, 75, 197.5, 142], [231.5, 76, 205, 162], [242.5, 79, 215, 167]];

  function animateHarp(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const { size, pixels } = frame;
    const white = frame.palette.indexOf('#ffffff');
    const gold = frame.palette.indexOf(scene.accent);
    const stringInk = ink => {
      const [r, g, b] = table[ink].rgb;
      return r > 90 && g > 60 && r > b * 1.65;
    };
    const strings = harpStrings.map(([x0, y0, x1, y1], index) => {
      const age = (cycle - .04 - index * .074) / .57;
      const [sx, sy] = point(scene, size, x0 / 410, y0 / 410);
      const [ex, ey] = point(scene, size, x1 / 410, y1 / 410);
      const swing = age > 0 && age < 1
        ? Math.sin(cycle * tau * 5.1 - index * .39) * Math.min(1, age * 9) * (1 - age) ** .68 * size * .024
        : 0;
      return { sx, sy, ex, ey, swing, age };
    });

    const margin = Math.max(.8, size * .014);
    const [, top,, bottom] = bounds(scene, size, [0, 57 / 410, 1, 110 / 410]);
    for (let y = top; y < bottom; y++) {
      const knots = [];
      for (const { sx, sy, ex, ey, swing } of strings) {
        const fret = (y + .5 - sy) / (ey - sy);
        if (fret < 0 || fret > 1) continue;
        const anchor = Math.min(1, fret * 10, (1 - fret) * 10) ** .64;
        knots.push([sx + (ex - sx) * fret, swing * anchor]);
      }
      if (!knots.some(([, shift]) => shift)) continue;
      knots.unshift([knots[0][0] - margin, 0]);
      knots.push([knots.at(-1)[0] + margin, 0]);

      // Resample each row between neighboring strings so the spans move together.
      const targets = knots.map(([x, shift], index) => {
        if (!shift) return x;
        const room = .46 * Math.min(x - knots[index - 1][0], knots[index + 1][0] - x);
        return x + Math.max(-room, Math.min(room, shift));
      });
      const row = y * size;
      for (let segment = 0; segment < targets.length - 1; segment++) {
        const left = targets[segment], right = targets[segment + 1];
        const from = knots[segment][0], to = knots[segment + 1][0];
        for (let x = Math.ceil(left - .5); x < Math.ceil(right - .5); x++) {
          const sx = from + (to - from) * (x + .5 - left) / (right - left);
          pixels[row + x] = base[row + Math.floor(sx)];
        }
      }
      for (let index = 1; index < knots.length - 1; index++) {
        if (!knots[index][1]) continue;
        const column = row + Math.floor(knots[index][0]);
        const ink = [base[column], base[column - 1], base[column + 1]].find(stringInk);
        if (ink !== undefined) pixels[row + Math.floor(targets[index])] = ink;
      }
    }

    for (const { sx, sy, ex, ey, age } of strings) {
      if (age <= 0 || age >= 1) continue;
      const fret = .06 + age * .88;
      const y = Math.floor(sy + (ey - sy) * fret);
      const center = Math.floor(sx + (ex - sx) * fret);
      for (const shift of [0, -1, 1, -2, 2]) {
        const index = y * size + center + shift;
        if (stringInk(pixels[index])) {
          pixels[index] = age < .38 ? white : gold;
          break;
        }
      }
    }
  }

  const serpentKeys = [[0, 0, 0, 0, 0], [.18, -.065, -.023, .045, 0], [.31, -.029, .021, .14, 0],
    [.53, .173, .132, .14, .35], [.64, .205, .129, -.33, 1], [.75, .211, .121, -.20, .84],
    [.86, .214, .107, -.34, .93], [1.07, .169, .063, -.09, .52], [1.38, 0, 0, 0, 0], [1.5, 0, 0, 0, 0]];
  const serpentHead = [[.482, 0], [.91, 0], [.912, .307], [.848, .308], [.820, .305],
    [.808, .317], [.793, .360], [.759, .372], [.617, .259], [.595, .230], [.482, .231]];
  const serpentJaw = [[.627, .184], [.665, .198], [.696, .214], [.717, .234], [.758, .236], [.794, .259],
    [.784, .354], [.766, .359], [.701, .310], [.651, .277], [.629, .247], [.596, .224], [.605, .202]];
  const serpentSprites = new Map();

  function animateOuroboros(scene, frame, base, time) {
    const [travel, reach, bite, feed] = pose(time % 1.5, serpentKeys);
    if (!travel && !reach && !bite && !feed) return;
    const { size } = frame;
    if (!serpentSprites.has(size)) {
      const body = base.slice(), head = new Uint8Array(base.length), jaw = new Uint8Array(base.length);
      clearText(scene, size, body);
      for (const [index, ink] of body.entries()) {
        if (!ink) continue;
        const x = (index % size + .5) / size, y = (Math.floor(index / size) + .5) / size;
        if (!insideOutline(serpentHead, x, y)) continue;
        const sprite = insideOutline(serpentJaw, x, y) ? jaw : head;
        sprite[index] = ink;
        body[index] = 0;
      }
      serpentSprites.set(size, { body, head, jaw });
    }
    const { body, head, jaw } = serpentSprites.get(size);
    const cos = Math.cos(travel), sin = Math.sin(travel);
    const clearance = 1 - Math.min(.052, Math.abs(travel) * .30);
    const jawCos = Math.cos(bite), jawSin = Math.sin(bite);

    // The chain follows one circular track. The neck advances into the gap
    // ahead of the chain, and the lower jaw pivots on the original hinge.
    patch(scene, frame, [0, 0, 1, 1], (ink, u, v) => {
      const dx = (u - .5) / clearance, dy = (v - .5) / clearance;
      const x = .5 + dx * cos + dy * sin, y = .5 + dy * cos - dx * sin;
      const tip = feed * .041 * smooth((Math.hypot(dx, dy) - .405) / .089);
      const tail = feed * smooth((x - .796) / .049) * smooth((.447 - y) / .107);
      const armor = samplePixel(scene, size, body, x + tip * (y - .5) + .014 * tail, y - tip * (x - .5) + .020 * tail);
      if (x < .477 || y > .432) return armor;
      let sx = x, sy = y;
      for (let pass = 0; pass < 3; pass++) {
        const advance = reach * smooth((sx - .502) / .145);
        const c = Math.cos(advance), s = Math.sin(advance);
        sx = .5 + (x - .5) * c + (y - .5) * s;
        sy = .5 + (y - .5) * c - (x - .5) * s;
      }
      const jx = sx - .638, jy = sy - .203;
      return samplePixel(scene, size, head, sx, sy) ||
        samplePixel(scene, size, jaw, .638 + jx * jawCos + jy * jawSin, .203 + jy * jawCos - jx * jawSin) || armor;
    });
  }

  const emblemTurnKeys = [[0, 0, 0, 0], [.45, -.58, .13, -.04], [.79, -.37, .06, -.022],
    [1.04, .21, -.075, .012], [1.74, .97, -.18, .07], [2.03, .95, -.17, .065],
    [2.42, .38, -.075, .023], [2.73, 0, 0, 0], [3, 0, 0, 0]];

  function turnEmblem(frame, source, [cx, cy], [yaw, pitch, roll], depth) {
    const { size, pixels, palette } = frame;
    if (!yaw && !pitch && !roll) {
      for (const [index, ink] of source.entries()) if (ink) pixels[index] = ink;
      return;
    }
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw), sinX = Math.sin(pitch), cosX = Math.cos(pitch);
    const sinR = Math.sin(roll), cosR = Math.cos(roll);
    const distance = 1.95;
    const cameraX = -distance * sinY * cosX, cameraY = distance * sinX, cameraZ = distance * cosY * cosX;
    const steps = Math.max(1, Math.ceil(size * depth * (Math.abs(sinY) + Math.abs(sinX)) * 1.5));
    const rim = palette.indexOf('#8795a6'), side = palette.indexOf('#62758a'), shadow = palette.indexOf('#41505e');

    // Trace each square pixel through the front plane and the extrusion behind it.
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x + .5) / size - cx, v = (y + .5) / size - cy;
      const dx = u * cosR + v * sinR, dy = v * cosR - u * sinR;
      const rayX = dx * cosY + dy * sinX * sinY - cameraX;
      const rayY = dy * cosX - cameraY;
      const rayZ = dx * sinY - dy * sinX * cosY - cameraZ;
      const front = -cameraZ / rayZ, stride = -depth / (steps * rayZ);
      for (let level = 0; level <= steps; level++) {
        const travel = front + level * stride;
        const sx = Math.floor((cameraX + travel * rayX + cx) * size);
        const sy = Math.floor((cameraY + travel * rayY + cy) * size);
        if (sx < 0 || sx >= size || sy < 0 || sy >= size || !source[sy * size + sx]) continue;
        pixels[y * size + x] = level === 0 ? source[sy * size + sx] : level * 4 <= steps ? rim : level * 2 <= steps ? side : shadow;
        break;
      }
    }
  }

  function animateRingMark(scene, frame, time) {
    const [yaw, pitch, roll] = pose(time, emblemTurnKeys);
    if (!yaw && !pitch && !roll) return;
    const { size, pixels } = frame;
    const [cx, cy] = point(scene, size, .496, .352);
    const ring = new Uint8Array(pixels.length), mark = new Uint8Array(pixels.length), title = new Uint8Array(pixels.length);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const index = y * size + x, ink = pixels[index];
      if (!ink) continue;
      const radius = Math.hypot(x + .5 - cx, y + .5 - cy) / size;
      if ((y + .5) / size >= .642) title[index] = ink;
      else if (radius > .222) ring[index] = ink;
      else mark[index] = ink;
    }
    pixels.fill(0);
    const center = [cx / size, cy / size];
    turnEmblem(frame, ring, center, [yaw, pitch, roll], .040);
    turnEmblem(frame, mark, center, [-yaw * 1.04, -pitch * .82, -roll * .72], .034);
    turnEmblem(frame, title, [.50, .772], [-yaw * .88, -pitch * .63, -roll * .70], .026);
  }

  function animateChromeBadge(scene, frame, phase) {
    const { size, pixels } = frame;
    const badge = new Uint8Array(pixels.length);
    patch(scene, frame, [.246, 0, .532, .527], (ink, u, v, x, y) => {
      if (v > .441 && ((u - .509) / .265) ** 2 + ((v - .252) / .273) ** 2 > 1) return ink;
      badge[y * size + x] = ink;
      return 0;
    });
    const center = point(scene, size, .509, .247).map(value => value / size);
    const yaw = .60 * Math.sin(phase);
    const pitch = .15 * Math.sin(phase * 2);
    turnEmblem(frame, badge, center, [yaw, pitch, -.07 * Math.sin(phase)], .026);
  }

  function animateRedRoof(scene, frame, time) {
    const t = ((time % 3) + 3) % 3;
    if (t < 1e-9) return;
    const { size, artworkSize = size } = frame;
    const unit = size / artworkSize;
    const white = frame.palette.indexOf('#ffffff');
    const ash = nearest(scene, [108, 108, 108]);
    const smoke = nearest(scene, [76, 76, 76]);
    const soot = nearest(scene, [30, 27, 27]);
    const outlets = [.272, .447, .608, .719].map(u => {
      const [left, top, right, bottom] = bounds(scene, size, [u - .018, .449, .036, .188]);
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        if (frame.pixels[y * size + x] === white) return [(x + .5) / unit, y / unit];
      }
      return null;
    });
    const cloud = { size: artworkSize, pixels: new Uint8Array(artworkSize * artworkSize) };
    for (let puff = 0; puff < 22; puff++) {
      const age = (t - puff * .111) / 1.01;
      const outlet = outlets[puff % outlets.length];
      if (age < 0 || age >= 1 || !outlet) continue;
      const [startX, startY] = outlet;
      const inward = artworkSize * .49 - startX;
      const direction = Math.sign(inward);
      const curl = artworkSize * .027 * Math.sin(age * 5.3 + puff * 1.37) * age;
      const x = startX + inward * age * .42 + curl;
      const cell = Math.max(1, Math.round(artworkSize * (.009 + age * .024)));
      const y = startY - cell * .72 - artworkSize * age * (.105 + puff % 3 * .019);
      if (age < .82) {
        square(cloud, x, y, cell * 2 + 1, age < .57 ? smoke : soot);
        square(cloud, x + direction * cell * .55, y - cell * .69, cell + 1, age < .63 ? ash : smoke);
        square(cloud, x - direction * cell, y + cell * .36, cell, age < .57 ? smoke : soot);
        square(cloud, x + cell * .87, y + cell * .68, cell, soot);
      } else {
        square(cloud, x - cell, y, Math.max(1, cell - 1), soot);
        square(cloud, x + cell, y - cell, 1, smoke);
      }
    }
    patch(scene, frame, [.18, .18, .65, .43], (ink, _u, _v, x, y) =>
      ink || cloud.pixels[Math.floor(y / unit) * artworkSize + Math.floor(x / unit)]);
  }

  const shoeKeys = [[0, 0], [.23, .21], [.46, -.15], [.63, .17], [.82, -.10], [1.06, 0], [1.5, 0]];

  function animateWingedShoe(scene, frame, base, time) {
    const cycle = time % 1.5;
    const [angle] = pose(cycle, shoeKeys);
    const { size } = frame;
    if (angle) {
      const hinge = .535, bend = Math.tan(angle) / scene.placement[3];
      patch(scene, frame, [hinge, -.035, .35, .462], (ink, u, v) => {
        if (u <= hinge || v >= .41) return ink;
        const flex = smooth((.41 - v) / .16);
        return samplePixel(scene, size, base, u, v - (u - hinge) * bend * flex);
      });
    }
    const gold = frame.palette.indexOf(scene.accent);
    for (let i = 0; i < 4; i++) {
      const age = (cycle - .30 - i * .067) / .38;
      if (age < 0 || age >= 1) continue;
      const [x, y] = point(scene, size, .332 - age * (.147 + i * .018), .392 + i * .024 + age * .029);
      const step = Math.max(1, Math.round(size * .012 * (1 - age * .38)));
      square(frame, x, y, step, gold);
      if (age < .55) square(frame, x - step, y + step, 1, gold);
    }
  }

  function animateFlameType(scene, frame, base, time, phase, table) {
    const { size } = frame;
    const [width, height] = scene.placement.slice(2);
    const flameBounds = scene.flameBounds ?? [.053, .006, .910, .361];
    const flameTop = flameBounds[1], flameHeight = flameBounds[3];
    const hot = ink => {
      const [r, g, b] = table[ink].rgb;
      return r > 79 && r > g * .97 && r > b * 1.48;
    };
    patch(scene, frame, flameBounds, (ink, u, v, x, y) => {
      const length = Math.max(0, Math.min(1, (flameTop + flameHeight - .004 - v) / (flameHeight - .032)));
      const tongue = Math.floor(u * 10);
      const bend = Math.sin(phase * 4 + tongue * 1.28) * .023 * length ** 1.38;
      const lift = Math.sin(phase * 5 + tongue * 1.67) * .061 * length ** 1.24;
      const sx = Math.round(x - bend * width * size), sy = Math.round(y + lift * height * size);
      const sample = sx >= 0 && sx < size && sy >= 0 && sy < size ? base[sy * size + sx] : 0;
      if (hot(sample)) return sample;
      return hot(ink) ? 0 : ink;
    });
    const gold = frame.palette.indexOf('#ffd91d');
    const orange = frame.palette.indexOf(scene.accent);
    const cycle = time % 1.5;
    for (const [i, u] of [.167, .272, .436, .524, .663, .852, .932].entries()) {
      const age = (cycle - .12 - i * .096) / .56;
      if (age < 0 || age > 1) continue;
      const [x, y] = point(scene, size, u + Math.sin(age * 5 + i) * .030 * age, flameTop + .114 - age * (.086 + i % 3 * .019));
      square(frame, x, y, Math.max(1, Math.round(size * .013 * (1 - age * .58))), age < .37 ? gold : orange);
    }
  }

  const greenEyeKeys = [[0, 1], [.19, .94], [.44, .13], [.54, .17], [.72, 1], [1.5, 1]];

  function animateGreenEye(scene, frame, base, time, table) {
    const [open] = pose(time % 1.5, greenEyeKeys);
    if (open === 1) return;
    const { size } = frame;
    const isGreen = ink => {
      const [r, g, b] = table[ink].rgb;
      return g > 70 && g > r * .82 && b < g * .62;
    };
    const [fieldX, fieldY] = point(scene, size, .56, .101).map(Math.floor);
    const field = base.subarray(fieldY * size, (fieldY + 1) * size);
    const split = field.findIndex(isGreen);
    if (split < 0) return;
    const lime = field[fieldX];
    const middle = .307;
    const slit = .58 / (size * scene.placement[3]);
    // Blink the eye mask against the fixed two-color field.
    patch(scene, frame, [.172, .116, .570, .407], (ink, u, v, x) => {
      if (u > .742 || v < .116 || v > .523) return ink;
      const sv = middle + (v - middle) / open;
      const right = x >= split;
      let eye = false;
      if (open < .18) {
        eye = u > .192 && u < .722 && Math.abs(v - middle) < slit;
      } else if (sv >= .116 && sv <= .523) {
        const [, sy] = point(scene, size, u, sv);
        eye = right !== isGreen(base[Math.floor(sy) * size + x]);
      }
      return right !== eye ? lime : 0;
    });
  }

  const umbrellaKeys = [[0, 1, 0], [.17, .96, -.05], [.38, .55, -.34], [.48, .58, -.31],
    [.69, .96, .045], [.82, .985, .036], [.99, 1, 0], [1.5, 1, 0]];

  function animateUmbrella(scene, frame, base, time, table) {
    const [spread, angle] = pose(time % 1.5, umbrellaKeys);
    if (spread === 1 && !angle) return;
    const { size } = frame;
    const [cx, cy] = point(scene, size, .506, .313);
    const turn = time < 1.5 ? angle : -angle;
    const cos = Math.cos(turn), sin = Math.sin(turn);
    const height = spread ** 1.19;
    const [right, dots] = point(scene, size, .697, .557);
    layer(scene, frame, base, [.266, .022, .482, .580], (x, y) => {
      const dx = x + .5 - cx, dy = y + .5 - cy;
      return [cx + (dx * cos + dy * sin) / spread - .5, cy + (-dx * sin + dy * cos) / height - .5];
    }, {
      select: (ink, x, y) => table[ink].rgb[0] > 22 && (y + .5 < dots || x + .5 < right),
      padding: .026
    });
  }

  const tongueKeys = [[0, 0, 0], [.14, 0, 0], [.33, 8, -3.5], [.46, 13, 4.2], [.56, 11, 6.4],
    [.68, 12, -4.5], [.87, 0, 0], [1.15, 0, 0], [1.34, 7, -4.1], [1.45, 6, 2.5],
    [1.58, 5, -3], [1.77, 0, 0], [3, 0, 0]];
  // Boundary of the tongue in the original 1024 × 1024 image. Only source
  // pixels inside this mask move, keeping the cheeks and mouth outline in place.
  const tongueOutline=[[536,526],[581,523],[609,524],[623,533],[626,550],[632,560],
    [631,573],[628,596],[620,604],[613,612],[601,619],[575,619],[558,613],
    [550,607],[542,598],[533,585],[526,574],[520,553],[519,539],[524,532]];
  function insideOutline(outline, px, py) {
    let inside = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [ax, ay] = outline[j], [bx, by] = outline[i];
      if ((ay > py) !== (by > py) && px < ax + (bx - ax) * (py - ay) / (by - ay)) inside = !inside;
    }
    return inside;
  }
  function animateTongue(scene,frame,base,time){
    const [extension, flick] = pose(time, tongueKeys);
    if(!extension)return;
    const outline=tongueOutline.map(([x,y])=>point(scene,frame.size,x/1024,y/1024));
    const [center,root]=point(scene,frame.size,.56,525/1024);
    const stretch=1+(extension/192)/(92/1024);
    const length = frame.size * (92 / 1024);
    layer(scene,frame,base,[.503,.509,.123,.103],(x,y)=>{
      const sy = root + (y + .5 - root) / stretch;
      const depth = Math.max(0, Math.min(1, (sy - root) / length));
      const bend = flick * frame.size / 192 * depth ** 1.7;
      const spread = 1 + .18 * extension / 13 * depth;
      return [center + (x + .5 - center - bend) / spread - .5, sy - .5];
    },{select:(ink,x,y)=>ink!==0&&insideOutline(outline,x+.5,y+.5),padding:.092});
  }

  const girlBlinkKeys = [[0, 1], [.42, 1], [.51, .10], [.56, .10], [.67, 1],
    [2.08, 1], [2.20, .10], [2.26, .10], [2.40, 1], [3, 1]];
  const girlEyes = [
    { area: [125, 155, 64, 31], lid: [157, 164, -.14], outline: [[126, 168], [135, 163], [151, 158],
      [169, 157], [181, 158], [188, 161], [186, 170], [180, 176], [171, 181], [151, 183], [138, 178], [129, 173]] },
    { area: [241, 151, 70, 30], lid: [277, 159, .10], outline: [[243, 158], [252, 153], [267, 153],
      [283, 154], [300, 156], [309, 160], [308, 169], [302, 175], [291, 179], [277, 178], [261, 173], [249, 168]] }
  ];

  function animateGirlBlink(scene, frame, base, time) {
    const [open] = pose(time, girlBlinkKeys);
    if (open === 1) return;
    const { size } = frame;
    const pink = frame.palette.indexOf(scene.accent);
    for (const { area, lid: [cx, cy, slope], outline } of girlEyes) {
      const shape = outline.map(([x, y]) => point(scene, size, x / 410, y / 410));
      patch(scene, frame, area.map(value => value / 410), (ink, u, v, x, y) => {
        if (!insideOutline(shape, x + .5, y + .5)) return ink;
        const horizontal = u * 410 - cx;
        const crease = (cy + horizontal * slope + 3.7 * Math.max(0, 1 - (horizontal / 33) ** 2)) / 410;
        const gap = v - crease;
        if (open < .20) return Math.abs(gap) < .60 / size ? 0 : pink;
        const [, sourceY] = point(scene, size, u, crease + gap / open);
        return insideOutline(shape, x + .5, sourceY) ? base[Math.floor(sourceY) * size + x] : pink;
      });
    }
  }

  function animateGirlSurround(scene, frame, time) {
    const { size } = frame;
    const pink = frame.palette.indexOf(scene.accent);
    const white = frame.palette.indexOf('#f6f4fa');
    const cycle = time % 1.5;
    for (const side of [-1, 1]) {
      const u = .51 + side * .359, v = .348;
      const age = (cycle - (side < 0 ? .24 : .42)) / .58;
      if (age < 0 || age > 1) continue;
      const cell = Math.max(1, Math.round(size * .013));
      const [x, y] = point(scene, size, u, v);
      const reach = cell * (1 + age * 3.8);
      if (age < .60) {
        square(frame, x, y, cell, white);
        square(frame, x, y - reach, 1, pink);
        square(frame, x, y + reach, 1, pink);
      }
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + .54 + age * .76;
        const distance = size * (.026 + age * (.048 + (i % 2) * .013));
        square(frame, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance,
          age < .32 ? cell : 1, i % 2 || age > .52 ? pink : white);
      }
    }
  }

  const puppetKeys = [[0, 0, 0], [.14, .19, .11], [.36, 1, .18], [.52, .88, .45],
    [.72, .29, 1], [.88, .22, .78], [1.12, .46, .36], [1.43, 0, 0], [1.5, 0, 0]];
  const puppetArms = [
    {
      side: -1, joints: [[253, 301], [206, 280], [162, 332], [87, 367]], anchors: [[231, 107], [179, 153]],
      outline: [[87, 397], [86, 350], [121, 312], [149, 311], [161, 322], [192, 276], [197, 267],
        [211, 266], [238, 284], [254, 287], [267, 300], [261, 313], [240, 314], [206, 292], [175, 335],
        [168, 344], [177, 369], [164, 404], [99, 404]]
    },
    {
      side: 1, joints: [[449, 310], [492, 289], [538, 347], [615, 377]], anchors: [[463, 103], [520, 150]],
      outline: [[434, 307], [438, 295], [454, 293], [474, 282], [489, 277], [503, 279], [540, 334],
        [554, 329], [578, 342], [605, 351], [618, 376], [619, 410], [518, 415], [519, 375], [525, 352],
        [490, 302], [463, 316], [449, 325], [439, 319]]
    }
  ];

  function animateMarionette(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const pulls = pose(cycle, puppetKeys);
    if (!pulls.some(Boolean)) return;
    const { size, pixels } = frame;
    const warm = frame.palette.indexOf('#ffb371');
    const thread = frame.palette.indexOf('#e3cdbf');
    const at = ([x, y]) => point(scene, size, x / 700, y / 700);
    for (const [index, { side, joints, anchors, outline }] of puppetArms.entries()) {
      const pull = pulls[index];
      if (!pull) continue;
      const rest = joints.map(at);
      const moved = [rest[0]];
      for (const [joint, tilt] of [.65, .79, .21].entries()) {
        const dx = rest[joint + 1][0] - rest[joint][0], dy = rest[joint + 1][1] - rest[joint][1];
        const angle = -side * pull * tilt;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        moved.push([moved[joint][0] + dx * cos - dy * sin, moved[joint][1] + dx * sin + dy * cos]);
      }
      for (const [i, anchor] of anchors.entries()) {
        const [ax, ay] = at(anchor), [rx, ry] = rest[i + 1], [mx, my] = moved[i + 1];
        const thickness = Math.max(1, Math.round(size * .0037));
        for (let y = Math.ceil(ay); y < ry; y++) {
          const length = (y + .5 - ay) / (ry - ay);
          const oldX = ax + (rx - ax) * length;
          const clear = Math.max(.7, size * (.004 + .006 * smooth(length * 3)));
          for (let x = Math.floor(oldX - clear); x <= Math.floor(oldX + clear); x++) {
            const pixel = y * size + x;
            const [r, g, b] = table[base[pixel]].rgb;
            if (r > 58 && g > r * .63 && b > r * .48) pixels[pixel] = 0;
          }
        }
        for (let y = Math.ceil(ay); y < my; y++) {
          const length = (y + .5 - ay) / (my - ay);
          const x = ax + (mx - ax) * length;
          const accent = Math.abs(length - (cycle - .14 - index * .28) * 2.7) < .073;
          square(frame, x, y + .5, thickness, accent ? warm : thread);
        }
      }
      const mask = outline.map(at);
      layer(scene, frame, base, index ? [.616, .389, .277, .207] : [.116, .375, .267, .206], (x, y) => {
        let joint = 0;
        while (joint < 2 && (x + .5 - moved[joint + 1][0]) * side > 0) joint++;
        const [x0, y0] = moved[joint], [x1, y1] = moved[joint + 1];
        const across = (x + .5 - x0) / (x1 - x0);
        const [sx0, sy0] = rest[joint], [sx1, sy1] = rest[joint + 1];
        return [sx0 + (sx1 - sx0) * across - .5, y - (y0 - sy0) - (y1 - sy1 - y0 + sy0) * across];
      }, { select: (ink, x, y) => ink && insideOutline(mask, x + .5, y + .5), padding: .19 });
    }
  }

  const diamondKeys = [[0, 0, 0], [.14, .008, -.004], [.43, .054, .033],
    [.59, .052, .029], [.78, .010, -.005], [.93, .018, .011], [1.18, 0, 0], [1.5, 0, 0]];

  function animateDiamonds(scene, frame, base, time) {
    const [lift, innerLift] = pose(time % 1.5, diamondKeys);
    if (!lift && !innerLift) return;
    const edge = frame.palette.indexOf('#a9b1bc');
    const isInner = (u, v) => Math.abs(u - .5) / .373 + Math.abs(v - .352) / .167 < .68;
    patch(scene, frame, [.085, .115, .83, .417], (_ink, u, v) => {
      const outerX = u - lift * .36, outerY = v + lift;
      const innerX = u + innerLift * .50, innerY = v + innerLift;
      const outer = !isInner(outerX, outerY) && outerY < .533 ? samplePixel(scene, frame.size, base, outerX, outerY) : 0;
      const inner = isInner(innerX, innerY) ? samplePixel(scene, frame.size, base, innerX, innerY) : 0;
      if (outer || inner) return outer || inner;
      const depth = outerY - lift * .29;
      return lift > .020 && depth < .533 && !isInner(outerX, depth) &&
        samplePixel(scene, frame.size, base, outerX, depth) ? edge : 0;
    });
  }

  const barcodeLook = [[0, 1, 0], [.14, 1, -.015], [.32, .89, -.031], [.47, .76, -.021],
    [.57, .11, 0], [.63, .11, .017], [.74, 1, .034], [.99, 1, .034], [1.29, 1, 0], [1.5, 1, 0]];

  function animateBarcodeEye(scene, frame, base, time) {
    const cycle = time % 1.5;
    const [open, gaze] = pose(cycle, barcodeLook);
    const { size, palette } = frame;
    const ice = palette.indexOf('#a6a6a6');
    const white = palette.indexOf('#ffffff');
    patch(scene, frame, [0, .462, 1, .224], (_ink, u, v) => {
      const lid = .573 + (u - .52) * .018;
      const sy = lid + (v - lid) / open;
      const center = smooth((.397 - Math.abs(u - .53)) / .16);
      if (open < .23) return Math.abs(v - lid) < .55 / size && center > .4 ? ice : 0;
      return sy >= .462 && sy < .686 ? samplePixel(scene, size, base, u - gaze * center, sy) : 0;
    });
    // The fixed bars pick up the reader in order, then flash together on lock.
    const scan = smooth(cycle / .57);
    const lock = cycle >= .74 && cycle < .86;
    if (cycle >= .57 && !lock) return;
    for (const [top, height] of [[.176, .168], [.780, .105]]) {
      patch(scene, frame, [.103, top, .813, height], (ink, u) => {
        if (!ink) return ink;
        const travel = .08 + scan * .87 - u;
        if (lock || travel >= 0 && travel < .031) return white;
        return travel >= .031 && travel < .124 ? ice : ink;
      });
    }
  }

  const alienEyes = [[.483, .075, .075, .047, .14], [.794, .122, .065, .051, .52],
    [.829, .374, .092, .050, .78]];
  const alienLid = [[0, 1], [.055, .98], [.142, .10], [.206, .10], [.333, 1]];

  function animateAlienEyes(scene, frame, time, table) {
    for (const [cx, cy, rx, ry, delay] of alienEyes) {
      const age = time % 1.5 - delay;
      if (age < 0 || age > .333) continue;
      const [open] = pose(age, alienLid);
      patch(scene, frame, [cx - rx, cy - ry, rx * 2, ry * 2], (ink, u, v) => {
        const distance = Math.abs((u - cx) / rx);
        if (distance >= 1 || !table[ink].neutral || table[ink].light < 33) return ink;
        const lid = Math.max(.49 / frame.size, ry * open * (1 - distance ** 1.6) ** .45);
        return Math.abs(v - cy) <= lid ? ink : 0;
      });
    }
  }

  const catKeys = [[0, 0], [.17, -.48], [.35, 1], [.48, .92], [.67, -.35],
    [.85, -.12], [1.05, .78], [1.22, .08], [1.5, 0]];

  function animateChaoticCat(scene, frame, base, time, table) {
    const [jaw] = pose(time % 1.5, catKeys);
    const paper = frame.palette.indexOf('#ffffff');
    const embers = frame.palette.indexOf('#ff6b19');
    // The chin follows the bite while the nose and whiskers stay anchored.
    patch(scene, frame, [.350, .597, .312, .181], (ink, u, v) => {
      const cheeks = smooth(1 - ((u - .506) / .156) ** 2);
      const hinge = .601 + .019 * ((u - .506) / .156) ** 2;
      const amount = cheeks * smooth((v - hinge) / .056) * smooth((.778 - v) / .063);
      return samplePixel(scene, frame.size, base, u, v - jaw * .035 * amount, paper);
    });
    if (jaw > .65) patch(scene, frame, [.191, .469, .614, .089],
      ink => motifInk('red', table[ink]) ? embers : ink);
    for (const [x, y, r] of [[.182, .606, .044], [.174, .694, .057], [.816, .597, .044], [.824, .693, .057]]) {
      patch(scene, frame, [x - r, y - r, 2 * r, 2 * r], (ink, u, v) => {
        const reach = smooth(1 - Math.hypot(u - x, v - y) / r);
        const scale = 1 - jaw * .43 * reach;
        return samplePixel(scene, frame.size, base, x + (u - x) * scale, y + (v - y) * scale, paper);
      });
    }
  }

  const fingerKeys = [[0, 0], [.16, 0], [.25, 1], [.68, 1], [.78, 0],
    [1.08, 0], [1.16, 1], [1.32, 1], [1.41, 0], [1.78, 0],
    [1.86, 1], [2.08, 1], [2.18, 0], [3, 0]];

  function animateFinger(scene, frame, base, time) {
    const [fold] = pose(time, fingerKeys);
    if (!fold) return;
    const { size, pixels } = frame;
    const [left, top, right] = bounds(scene, size, [.393, .281, .163, .168]);
    const joint = Math.floor(size * .369);
    const root = Math.ceil(size * .449 - .5);
    const row = y => base.subarray(y * size + left, y * size + right);
    let tip = top;
    while (tip < joint && !row(tip).some(Boolean)) tip++;
    if (tip === joint) return;
    const cap = Math.max(tip, Math.floor(size * .297));

    // Foreshorten both finger bones around the fixed knuckle, then snap back to the source pose.
    const bentJoint = root - Math.max(1, Math.round((root - joint) * (1 - .61 * fold)));
    const bentTip = bentJoint - Math.max(1, Math.round((joint - tip) * (1 - .67 * fold)));
    for (let y = tip; y < root; y++) {
      pixels.fill(0, y * size + left, y * size + right);
      if (y < bentTip) continue;
      const upper = y < bentJoint;
      const progress = upper ? (y - bentTip) / (bentJoint - bentTip) : (y - bentJoint) / (root - bentJoint);
      const from = upper ? tip + Math.round(progress * (joint - tip)) : joint + Math.round(progress * (root - joint));
      const shift = Math.round(size * fold * (upper ? .014 + progress * .013 : .027 * (1 - progress)));
      pixels.set(row(y === bentTip && fold > .28 ? cap : Math.min(root - 1, from)), y * size + left + shift);
    }
  }

  const assemblyKeys = [[0, 0, 0, 0], [.18, 0, 0, 0], [.44, 0, .024, 0], [.67, .36, .024, 0],
    [1.01, 1, .005, 0], [1.18, 1, 0, 1], [2.26, 1, 0, 1], [2.72, 0, 0, 0], [3, 0, 0, 0]];
  const speakerKeys = [[0, 0], [1.17, 0], [1.32, 1], [1.49, .12], [1.57, .86], [1.76, .05],
    [1.86, .63], [2.07, 0], [3, 0]];

  function animateInstructions(scene, frame, base, time) {
    const [travel, lift, seat] = pose(time, assemblyKeys);
    const { size, palette } = frame;
    const gold = palette.indexOf(scene.accent);
    const white = palette.indexOf('#ffffff');
    const paper = palette.indexOf(scene.bluePaper);
    const steel = palette.indexOf('#4276bc');
    if (time >= .12 && time <= 2.72) {
      const step = travel < .79 ? [.208, .635, .062, .040] : [.523, .632, .065, .045];
      patch(scene, frame, step, ink => ink === white ? gold : ink);
    }
    if (travel || lift) {
      const width = 1 - seat * .79;
      const height = 1 - seat * .59;
      const onPart = (u, v) => u >= .398 && u < .479 && v >= .710 && v < .837;
      patch(scene, frame, [.368, .657, .287, .198], (ink, u, v) => {
        const sx = .438 + (u - .438 - travel * .177) / width;
        const sy = .767 + (v - .767 + lift) / height;
        if (seat < .90 && onPart(sx, sy)) {
          const part = samplePixel(scene, size, base, sx, sy);
          if (part === white) return gold;
          if (part === steel) return steel;
        }
        return onPart(u, v) ? paper : ink;
      });
      patch(scene, frame, [.488, .752, .074, .056], (ink, u) =>
        ink === white && u < .488 + travel * .075 ? gold : ink);
    }
    for (const [index, [cy, rx, ry]] of [[.769, .022, .030], [.839, .036, .041]].entries()) {
      const [beat] = pose(Math.max(0, time - index * .062), speakerKeys);
      if (beat < .10) continue;
      const cx = .642;
      patch(scene, frame, [cx - rx, cy - ry, 2 * rx, 2 * ry], (ink, u, v) => {
        const radius = Math.hypot((u - cx) / rx, (v - cy) / ry);
        const ripple = Math.abs(radius - .74 * beat) < Math.max(.11, .54 / (rx * size));
        return radius < 1 && (ripple || (ink === white && beat > .48)) ? gold : ink;
      });
    }
  }

  const meterKeys = [[0, 0], [.09, .06], [.27, .84], [.40, .71], [.64, .19], [.79, .46], [.96, 0], [1.5, 0]];

  function animateThreeStripes(scene, frame, base, time, table) {
    const gains = [0, .12, .24].map(delay => {
      const age = time % 1.5 - delay;
      return age > 0 ? pose(age, meterKeys)[0] : 0;
    });
    const steel = frame.palette.indexOf('#9baac6');
    const { bottom, lean, bars } = scene.stripes;
    patch(scene, frame, [.152, .106, .701, .437], (ink, u, v) => {
      if (v > bottom) return ink;
      // Shorten along each stripe's diagonal so their gaps stay open.
      const across = u - (v - bottom) * lean;
      const stripe = bars.findIndex(([left, right]) => across >= left && across < right);
      if (stripe < 0) return 0;
      const gain = gains[stripe];
      const sv = bottom + (v - bottom) / (1 - gain * .43);
      if (sv < bars[stripe][2]) return 0;
      const color = samplePixel(scene, frame.size, base, across + (sv - bottom) * lean, sv);
      return table[color].light > 75 && gain > .36 && v > bottom - .027 ? steel : color;
    });
  }

  const diamondSpread = [[0, 0], [.16, .10], [.38, 1], [.50, 1], [.65, .18], [.76, .37], [1, 0], [1.5, 0]];

  function animateTripleDiamond(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [press] = pose(cycle, diamondSpread);
    const red = table.map(color => motifInk('red', color));
    const glow = frame.palette.indexOf('#ff7a65');
    if (!press) return;
    const [cx, cy] = point(scene, frame.size, .5, .388);
    layer(scene, frame, base, [.151, .039, .702, .544], (x, y) =>
      [cx + (x - cx) / (1 + press * .051), cy + (y - cy + press * frame.size * .015) / (1 - press * .13)],
    { select: ink => red[ink], padding: .062 });
    const light = .10 + .54 * smooth((cycle - .24) / .63);
    patch(scene, frame, [.132, .037, .736, .548], (ink, u, v) => {
      return red[ink] && Math.abs(v + (u - .5) * .35 - light) < .018 ? glow : ink;
    });
  }

  const crestKeys = [[0, 0, 0], [.16, -.010, -.007], [.44, .033, .016], [.59, .040, .019],
    [.78, .017, -.005], [1.11, 0, 0], [1.5, 0, 0]];

  function animateMountain(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [lift, curl] = pose(cycle, crestKeys);
    if (!lift && !curl) return;
    const spray = frame.palette.indexOf('#b8dfec'), white = frame.palette.indexOf('#ffffff');
    patch(scene, frame, [.108, .089, .521, .370], (ink, u, v) => {
      if (motifInk('red', table[ink])) return ink;
      // The curl tapers above the ridge on the right and into the white base on the left.
      const tip = smooth((u - .36) / .14);
      const anchor = .456 - tip * .190;
      const flex = smooth((anchor - v) / (.175 - tip * .103)) * smooth((.621 - u) / .028);
      if (!flex) return ink;
      const source = samplePixel(scene, frame.size, base, u - curl * flex, v + lift * flex);
      return motifInk('red', table[source]) ? 0 : source;
    });
    for (let i = 0; i < 3; i++) {
      const age = (cycle - .52 - i * .038) / .23;
      if (age < 0 || age >= 1) continue;
      const u = .580 + age * (.039 + i * .011);
      const v = .181 - .027 * Math.sin(age * Math.PI) + age * (.016 + i * .01);
      if (!samplePixel(scene, frame.size, frame.pixels, u, v)) {
        const [x, y] = point(scene, frame.size, u, v);
        square(frame, x, y, 1, age > .56 ? spray : white);
      }
    }
  }

  const ribbonSpectrum = ['#234bff', '#4dd8ff', '#8d36ef', '#ff236f', '#f10b20',
    '#ffadb4', '#ff8c27', '#ffd278', '#ff236f', '#234bff'];

  function animateStreamingIdent(scene, frame, base, time, table) {
    if (time < .18 || time >= 2.51) return;
    const { size, palette } = frame;
    const edge = palette.indexOf('#ff6f54');
    const push = smooth((time - .18) / .70);
    const split = smooth((time - .61) / .43);
    const assemble = smooth((time - 1.68) / .83);
    patch(scene, frame, [0, .018, 1, .541], (_ink, u, v) => {
      if (time < 1.68 && split === 1) return 0;
      const zoom = time < 1.68 ? 1 + 1.47 * push : 1;
      const sx = .5 + (u - .5) / zoom - .068 * (zoom - 1);
      const sy = .318 + (v - .318) / zoom;
      const color = sy < .558 ? samplePixel(scene, size, base, sx, sy) : 0;
      if (!motifInk('red', table[color])) return 0;
      if (time < 1.68) {
        const strand = Math.floor(sx * size);
        if ((strand * 11 % 17) / 17 < split) return 0;
        return split > .10 && strand % 6 === 0 ? edge : color;
      }
      const depth = Math.max(0, Math.min(1, (sy - .117) / .442));
      const fold = .380 + depth * .226;
      const position = sx < .447 && sx < fold - .023 ? depth * .47 :
        sx > .550 && sx > fold + .042 ? .61 + (1 - depth) * .39 : .14 + .68 * depth;
      if (assemble < position) return 0;
      return assemble < .98 && assemble - position < .054 ? edge : color;
    });
    if (time < .64 || time >= 1.76) return;
    for (let track = 0; track < 29; track++) {
      const beat = (track * 17 % 23) / 23;
      const stretch = smooth((time - .64 - beat * .17) / .38);
      if (!stretch) continue;
      const rush = smooth((time - 1.28 - beat * .17) / .31);
      const origin = .424 + (track - 13) * (.006 + .029 * split) + (beat - .5) * .035 * split;
      const width = (.007 + beat ** 1.55 * .028) * (.48 + split * .52) * (1 - rush * .48);
      const top = .264 - stretch * (.177 + beat * .066) - rush * .19;
      const bottom = .346 + stretch * (.112 + beat * .090) - rush * .54;
      if (bottom <= .018) continue;
      const hue = Math.floor((track + 1) / 3) % ribbonSpectrum.length;
      const core = palette.indexOf(split > .35 + beat * .18 ? ribbonSpectrum[hue] : scene.accent);
      const shoulder = palette.indexOf(beat > .58 ? '#ffadb4' : '#ff6f54');
      const y = Math.max(.018, top);
      patch(scene, frame, [origin - width / 2, y, width, bottom - y], (ink, u, v) => {
        if (Math.abs(u - origin) > width * .5 || v < y || v > bottom) return ink;
        return beat > .48 && rush < .45 && Math.abs(u - origin) < width * .16 ? shoulder : core;
      });
    }
  }

  function animateSodaGlobe(scene, frame, base, time, table) {
    const { size } = frame;
    const cycle = time % 1.5;
    const [angle] = pose(cycle, [[0, 0], [.19, -.18], [.38, .40], [.60, 2.45], [.83, 5.62],
      [1.03, tau + .16], [1.28, tau], [1.5, tau]]);
    const u0 = .5, v0 = .345, cos = Math.cos(angle), sin = Math.sin(angle);
    const blue = frame.palette.indexOf('#1e62ff');
    patch(scene, frame, [.273, .114, .453, .453], (ink, u, v) => {
      const dx = u - u0, dy = v - v0;
      if (!ink || Math.hypot(dx, dy) > .210) return ink;
      const rotated = samplePixel(scene, size, base, u0 + dx * cos + dy * sin, v0 - dx * sin + dy * cos);
      const color = rotated || ink;
      const [r, g, b] = table[color].rgb;
      return b > r * 1.5 && b > g * 1.6 && Math.abs(dx + dy + cycle * .49 - .22) < .027 ? blue : color;
    });
  }

  const shellTurn = [[0, 0], [.17, -.24], [.41, .38], [.62, .46], [.86, -.13], [1.14, 0], [1.5, 0]];

  function animateShell(scene, frame, base, time) {
    const [turn] = pose(time % 1.5, shellTurn);
    if (!turn) return;
    const width = Math.cos(turn);
    const depth = Math.sin(turn) * .54;
    const slide = turn * .055;
    const lift = Math.abs(turn) * .023;
    patch(scene, frame, [.192, .061, .616, .504], (ink, u, v) => {
      const flex = smooth((.54 - v) / .132);
      if (!flex) return ink;
      const x = u - .5 - slide * flex;
      const sx = x / (1 + (width - 1 - depth * x) * flex);
      const sy = v + (lift + (v - .334 + lift) * depth * sx) * flex;
      return samplePixel(scene, frame.size, base, .5 + sx, sy);
    });
  }

  function trackPoint(track, progress) {
    const position = progress * (track.length - 1);
    const index = Math.floor(position), across = position - index;
    const [x, y] = track[index], [endX, endY] = track[index + 1];
    return [x + (endX - x) * across, y + (endY - y) * across];
  }

  const neuralCircuits = [
    { delay: .07, duration: .51, width: .019, track: [[.263, .516], [.288, .448], [.314, .373],
      [.365, .341], [.414, .334], [.448, .287], [.498, .270]] },
    { delay: .16, duration: .53, width: .017, track: [[.330, .509], [.369, .464], [.419, .425],
      [.462, .384], [.484, .327], [.525, .332], [.553, .377], [.554, .456]] },
    { delay: .24, duration: .46, width: .011, track: [[.309, .323], [.307, .258], [.309, .206],
      [.337, .174], [.380, .164], [.432, .172], [.490, .183]] }
  ];
  const neuralKeys = [[0, 0, 0, 0], [.43, 0, -.43, 0], [.61, .92, -.43, 0], [.79, 1, -.30, 0],
    [1.01, 1, .52, .16], [1.12, 1, .52, 1], [1.26, .83, .44, .37], [1.36, .08, .24, .07],
    [1.49, .96, .23, 0], [1.84, .94, -.12, 0], [2.09, .30, -.12, 0], [2.23, 0, 0, 0], [3, 0, 0, 0]];

  function animateNeuralDrink(scene, frame, time, table) {
    const cyan = frame.palette.indexOf('#78f1ff');
    const shadow = frame.palette.indexOf('#2787a7');
    const white = frame.palette.indexOf('#ffffff');
    const [open, gaze, flash] = pose(time, neuralKeys);
    for (const { delay, duration, width, track } of neuralCircuits) {
      const pulse = (time - delay) / duration;
      if (pulse < 0 || pulse > 1.36) continue;
      const steps = track.length - 1;
      for (let i = 0; i < steps; i++) {
        if (i / steps > pulse || (i + 1) / steps < pulse - .36) continue;
        const [x, y] = track[i], [endX, endY] = track[i + 1];
        const dx = endX - x, dy = endY - y, length = dx * dx + dy * dy;
        patch(scene, frame, [Math.min(x, endX) - width, Math.min(y, endY) - width,
          Math.abs(dx) + 2 * width, Math.abs(dy) + 2 * width], (ink, u, v) => {
          if (table[ink].light < 60) return ink;
          const along = Math.max(0, Math.min(1, ((u - x) * dx + (v - y) * dy) / length));
          const lag = pulse - (i + along) / steps;
          if (lag < 0 || lag > .36 || (u - x - along * dx) ** 2 + (v - y - along * dy) ** 2 > width ** 2) return ink;
          return lag < .24 && table[ink].light > 122 ? cyan : shadow;
        });
      }
    }
    if (open > .04) patch(scene, frame, [.551, .166, .100, .062], (ink, u, v) => {
      const x = (u - .601) / .047;
      if (Math.abs(x) >= 1) return ink;
      const crease = .207 - x * .012 - (1 - x * x) * .007;
      const height = .023 * open * (1 - x * x) ** .64;
      const gap = Math.abs(v - crease);
      if (gap > Math.max(height, .32 / frame.size)) return ink;
      const pupil = Math.abs(x - gaze);
      if (pupil < .24) return gap < height * .45 ? white : cyan;
      return gap < height * .57 ? cyan : shadow;
    });
    if (flash <= .05) return;
    patch(scene, frame, [.712, .100, .162, .222], (ink, u, v) => {
      const dx = Math.abs(u - .785), dy = Math.abs(v - .213);
      const core = dx + dy < .014 + flash * .016;
      const ray = Math.min(dx / .011 + dy / .109, dy / .009 + dx / .086);
      if (core) return flash > .40 ? white : cyan;
      if (ray < .49 + flash * .42) return cyan;
      return ray < 1.24 && table[ink].light > 117 ? shadow : ink;
    });
  }

  const xboxOrbit = [[.692, .220], [.777, .224], [.840, .249], [.827, .296], [.751, .359], [.649, .414],
    [.529, .462], [.393, .498], [.270, .514], [.212, .505], [.197, .477], [.226, .435], [.274, .399]];

  function animateXboxOrb(scene, frame, time, table) {
    const cycle = time % 1.5;
    const progress = (cycle - .08) / 1.13;
    const trails = [0, .025, .052, .09].flatMap(lag => {
      const at = progress - lag;
      return at > 0 && at < 1 ? [trackPoint(xboxOrbit, at)] : [];
    });
    const lime = frame.palette.indexOf('#c7ff3c');
    const white = frame.palette.indexOf('#ffffff');
    const charge = smooth((cycle - .24) / .23) * smooth((1.17 - cycle) / .26);
    const flash = .337 + charge * .021 - .18 * smooth((cycle - .24) / .82);
    patch(scene, frame, [.17, .132, .70, .435], (ink, u, v) => {
      const [r, g, b] = table[ink].rgb;
      if (g < 70 || g < r * .96) return ink;
      for (const [index, [x, y]] of trails.entries()) {
        if ((u - x) ** 2 + (v - y) ** 2 < (index ? .00061 : .00043)) return index ? lime : white;
      }
      const radius = Math.hypot((u - .498) / .208, (v - .352) / .210);
      if (radius < .96 && g > 164 && b < g * .83 &&
        Math.abs(v - flash - .22 * (u - .50)) < .024 * charge) return g > 231 ? white : lime;
      return ink;
    });
  }

  const chipHand = [[292, 151], [294, 140], [309, 133], [321, 125], [331, 114], [341, 104], [348, 99],
    [369, 99], [380, 110], [382, 141], [375, 154], [357, 164], [355, 168], [356, 185], [351, 196],
    [343, 205], [331, 213], [319, 216], [300, 217], [286, 220], [284, 209], [291, 202], [296, 194],
    [300, 181], [301, 169], [295, 165], [292, 160]];
  const chipKeys = [[0, 0, 1], [.19, -.075, 1], [.41, .19, .10], [.49, .22, .10],
    [.61, .19, 1], [.79, -.038, 1], [.95, .08, 1], [1.19, 0, 1], [1.5, 0, 1]];

  function animateChipMascot(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [lift, lid] = pose(cycle, chipKeys);
    const { size } = frame;
    if (lift) {
      const hand = chipHand.map(([x, y]) => point(scene, size, x / 430, y / 430));
      rotate(scene, frame, base, [.65, .222, .246, .294], [.693, .501], lift, {
        select: (ink, x, y) => ink && insideOutline(hand, x + .5, y + .5), padding: .10
      });
    }
    if (lid < .99) for (const [cx, cy] of [[.437, .282], [.559, .269]]) {
      const paper = samplePixel(scene, size, base, cx - .028, cy);
      patch(scene, frame, [cx - .022, cy - .027, .044, .054], (ink, u, v) => {
        const dx = (u - cx) / .022, dy = (v - cy) / .027;
        if (dx * dx + dy * dy > 1) return ink;
        const sy = cy + (v - cy) / Math.max(.26, lid);
        return Math.abs(sy - cy) < .025 ? samplePixel(scene, size, base, u, sy) : paper;
      });
    }
    const light = frame.palette.indexOf('#fff1a3');
    const strike = .678 + .155 * smooth((cycle - .21) / .37);
    if (cycle > .21 && cycle < .64) patch(scene, frame, [.677, .124, .161, .105], (ink, u) =>
      motifInk('warm', table[ink]) && Math.abs(u - strike) < .028 ? light : ink);
  }

  const mushroomBreath = [[0, 0, 0], [.18, -.009, -.048], [.39, .023, .062], [.56, .026, .081],
    [.75, .008, .027], [.93, -.006, -.020], [1.14, 0, 0], [1.5, 0, 0]];
  const smallCaps = [
    { x: .235, delay: .135, outline: [[.126, .379], [.142, .333], [.196, .298], [.241, .297],
      [.283, .314], [.325, .353], [.329, .389], [.294, .413], [.274, .449], [.266, .464], [.166, .472], [.164, .423], [.127, .409]] },
    { x: .745, delay: .235, outline: [[.644, .374], [.670, .345], [.713, .318], [.761, .318], [.802, .334],
      [.842, .381], [.842, .418], [.798, .428], [.766, .469], [.665, .474], [.676, .431], [.646, .412]] }
  ];
  const sporeSources = [[.258, .260, .36], [.733, .270, .39], [.181, .358, .53], [.796, .380, .62]];
  const mushroomRoots = [
    [[.449, .817], [.423, .839], [.391, .854], [.345, .838], [.307, .837], [.276, .846], [.243, .832], [.236, .816]],
    [[.460, .816], [.439, .843], [.401, .853], [.344, .867], [.318, .883], [.279, .898], [.222, .919]],
    [[.333, .877], [.298, .897], [.301, .918], [.296, .937]],
    [[.470, .818], [.461, .847], [.450, .871], [.420, .889], [.389, .900], [.351, .917], [.338, .942]],
    [[.403, .853], [.350, .875], [.342, .904], [.340, .925], [.335, .947]],
    [[.483, .817], [.480, .849], [.475, .879], [.471, .904], [.458, .930], [.440, .950]],
    [[.486, .818], [.481, .849], [.476, .889], [.493, .908], [.519, .927], [.511, .953], [.508, .980]],
    [[.492, .909], [.521, .931], [.538, .944], [.547, .955]],
    [[.516, .817], [.519, .848], [.529, .875], [.548, .900], [.574, .922], [.580, .944]],
    [[.544, .817], [.554, .841], [.581, .858], [.619, .871], [.655, .875], [.675, .892], [.717, .905], [.752, .917]],
    [[.577, .859], [.612, .884], [.624, .909], [.634, .933], [.654, .947]],
    [[.553, .817], [.566, .841], [.609, .845], [.629, .830], [.674, .824], [.698, .847], [.732, .839], [.772, .814]]
  ];

  function animateMushroom(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const rose = frame.palette.indexOf('#ff708e');
    const ivory = frame.palette.indexOf('#fff9df');
    const red = frame.palette.indexOf(scene.accent);
    const { size } = frame;
    const [lift, spread] = pose(cycle, mushroomBreath);
    patch(scene, frame, [.180, .004, .640, .465], (ink, u, v) => {
      if (v < .212 && u < .233 || v > .317 && (u < .330 || u > .653)) return ink;
      const stem = smooth((.469 - v) / .156);
      const sx = .498 + (u - .498) / (1 + spread * stem);
      const sy = v + lift * stem;
      if (sy > .321 && (sx < .330 || sx > .653)) return 0;
      const source = samplePixel(scene, size, base, sx, sy);
      if (lift < .007 || sy < .212 || sy > .403) return source;
      const [r, g, b] = table[source].rgb;
      const reach = Math.hypot((sx - .50) / .31, (sy - .302) / .143);
      const pulse = smooth((cycle - .24) / .50);
      return r > 159 && g > r * .74 && b > r * .46 && Math.abs(reach - pulse) < .092 ? ivory : source;
    });
    for (const { x, delay, outline } of smallCaps) {
      if (cycle <= delay) continue;
      const [rise, bloom] = pose(cycle - delay, mushroomBreath);
      if (!rise && !bloom) continue;
      const [cx, root] = point(scene, size, x, .467);
      const mask = outline.map(([u, v]) => point(scene, size, u, v));
      layer(scene, frame, base, [x - .113, .285, .226, .193], (px, py) => {
        const taper = smooth((root - py) / (size * .086));
        return [cx + (px - cx) / (1 + bloom * taper), py + rise * taper * size * .61];
      }, { select: (ink, px, py) => ink && insideOutline(mask, px + .5, py + .5), padding: .032 });
    }
    // Each fork gets its own pulse along the ink of the original root.
    const rootLights = mushroomRoots.flatMap((track, i) => {
      const head = (time - .28 - i * .172) / (.46 + i % 3 * .037);
      return [0, .065, .13].flatMap((lag, tail) => {
        const age = head - lag;
        return age > 0 && age < 1 ? [[...trackPoint(track, age), tail]] : [];
      });
    });
    if (rootLights.length) {
      const radius = Math.max(.012, .82 / size);
      patch(scene, frame, [.194, .807, .612, .180], (ink, u, v) => {
        const [r, g, b] = table[ink].rgb;
        if (r < 145 || g < r * .70 || b < r * .45) return ink;
        for (const [x, y, tail] of rootLights) {
          if ((u - x) ** 2 + (v - y) ** 2 <= radius ** 2) return tail ? rose : ivory;
        }
        return ink;
      });
    }
    for (const [u, v, release] of sporeSources) for (let index = 0; index < 5; index++) {
      const age = (cycle - release - index * .032) / .68;
      if (age <= 0 || age >= 1) continue;
      const direction = u < .5 ? -1 : 1;
      const drift = age * (.105 + index * .011) + .011 * Math.sin(age * 5.3 + index);
      const [x, y] = point(scene, size, u + direction * drift, v - lift * .64 - age * (.111 + index % 3 * .032));
      const at = Math.floor(y) * size + Math.floor(x);
      if (!frame.pixels[at]) square(frame, x, y, Math.max(1, Math.round(size * (.014 - .009 * age))),
        age < .41 ? ivory : age < .76 ? rose : red);
    }
  }

  const chevronKeys = [[0, 0, 0], [.15, -.017, 0], [.32, .065, 1], [.43, .055, .70], [.56, .020, .30],
    [.77, -.005, 0], [.90, 0, 0], [1.5, 0, 0]];

  function animateChevron(scene, frame, base, time) {
    const [kick, speed] = pose(time % 1.5, chevronKeys);
    const steel = frame.palette.indexOf('#a1b7db');
    const { size } = frame;
    if (kick) layer(scene, frame, base, [.286, .179, .475, .336], (x, y) => [x - kick * size, y],
      { padding: .076 });
    if (speed > .02) for (const [i, [x, y]] of [[.327, .277], [.298, .346], [.345, .417]].entries()) {
      const end = x + kick - .023;
      const length = speed * (.065 + i % 2 * .041);
      patch(scene, frame, [end - length, y, length, Math.max(.008, 1 / size)], ink => ink || steel);
    }
  }

  const coinKeys = [[0, 0, 0], [.21, .108, 0], [.33, .111, 0], [.49, .056, 1], [.56, .071, .52],
    [.68, .101, 0], [.80, .062, .81], [.88, .054, .35], [1.13, 0, 0], [1.5, 0, 0]];

  function animateCoins(scene, frame, time) {
    const [separation, impact] = pose(time % 1.5, coinKeys);
    if (!separation && !impact) return;
    const { size, palette } = frame;
    const red = nearest(scene, [251, 3, 16]), gold = nearest(scene, [255, 204, 2]);
    const amber = palette.indexOf('#fe7d01'), flash = palette.indexOf('#ffe88c');
    patch(scene, frame, [.088, .129, .824, .412], (_ink, u, v) => {
      const leftDisc = ((u - .396 + separation) / .189) ** 2 + ((v - .337 + separation * .088) / .191) ** 2 <= 1;
      const rightDisc = ((u - .606 - separation) / .189) ** 2 + ((v - .337 - separation * .065) / .191) ** 2 <= 1;
      if (leftDisc && rightDisc) return amber;
      return leftDisc ? red : rightDisc ? gold : 0;
    });
    if (impact > .18) for (const [i, [x, y]] of [[.489, .240], [.514, .249], [.485, .449], [.515, .438]].entries()) {
      const travel = (1 - impact) * .068;
      const [px, py] = point(scene, size, x + (i % 2 ? travel : -travel) * .40, y + (i < 2 ? -travel : travel));
      square(frame, px, py, Math.max(1, Math.round(size * impact * .016)), i % 2 ? flash : amber);
    }
  }

  const chatKeys = [[0, 0, 0, 1], [.19, -.019, .004, 1], [.37, -.027, .023, 1],
    [.47, -.018, .024, .08], [.54, .004, .022, .08], [.65, .026, .012, 1],
    [.83, .027, .007, 1], [.97, .011, .021, .15], [1.06, -.006, .017, 1], [1.30, 0, 0, 1], [1.5, 0, 0, 1]];

  function animateChat(scene, frame, base, time, table) {
    const [offset, lift, lid] = pose(time % 1.5, chatKeys);
    if (!offset && !lift && lid === 1) return;
    const { size } = frame;
    layer(scene, frame, base, [.319, .144, .395, .388], (x, y) => [x - offset * size, y + lift * size], {
      select: (ink, x, y) => ink !== 0 && ((y + .5) / size < .449 || (x + .5) / size > .405 && (x + .5) / size < .623),
      padding: .045
    });
    if (lid < 1) patch(scene, frame, [.467 + offset, .235 - lift, .155, .108], (ink, _u, v) =>
      table[ink].light > 138 && Math.abs(v + lift - .292) >= Math.max(.61 / size, .048 * lid) ? 0 : ink);
  }

  const sealBeat = [[0, 1, 3, 4, 3, 1], [.18, 1, 2, 3, 2, 1], [.31, 3, 4, 2, 4, 3],
    [.48, 2, 1, 4, 1, 2], [.66, 1, 3, 2, 3, 1], [.84, 2, 4, 4, 4, 2],
    [1.03, 3, 2, 1, 2, 3], [1.24, 1, 3, 4, 3, 1], [1.5, 1, 3, 4, 3, 1]];

  function animateCoffeeSeal(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const meters = pose(cycle, sealBeat);
    const mint = frame.palette.indexOf('#b5ffe0');
    const white = frame.palette.indexOf('#ffffff');
    const paper = samplePixel(scene, frame.size, base, .497, .654);
    patch(scene, frame, [.423, .661, .15, .105], (ink, u, v) => {
      const column = Math.floor((u - .426) / .027);
      const row = Math.floor((.766 - v) / .023);
      if (column < 0 || column >= meters.length || row < 0 || row > 4) return ink;
      const inside = (u - .426) / .027 - column < .72 && (.766 - v) / .023 - row < .73;
      const height = Math.round(meters[column]);
      return inside && row < height ? row === height - 1 ? mint : white : paper;
    });
    const pulse = smooth((cycle - .20) / .15) * smooth((.54 - cycle) / .16) +
      smooth((cycle - .73) / .13) * smooth((1.04 - cycle) / .16);
    if (pulse > .3) for (const x of [.338, .602]) {
      patch(scene, frame, [x, .447, .062, .10], ink => table[ink].light > 129 ? mint : ink);
    }
  }

  const turbineKeys = [[0, 0], [.22, 0], [.33, -.009], [.46, .018], [.60, -.006], [.75, .005], [.98, 0], [1.5, 0]];

  function animateTurbine(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [jump] = pose(cycle, turbineKeys);
    const pink = frame.palette.indexOf('#ff9089'), ember = frame.palette.indexOf('#ff644e');
    const start = smooth((cycle - .08) / .31);
    const discharge = smooth((cycle - .37) / .36);
    const live = smooth((cycle - .08) / .1) * smooth((.93 - cycle) / .23);
    patch(scene, frame, [.146, .048, .711, .454], (_ink, u, v) => {
      const sy = v + jump;
      const ink = sy < .499 ? samplePixel(scene, frame.size, base, u, sy) : 0;
      if (!live || !motifInk('red', table[ink])) return ink;
      const wing = Math.abs(u - .502) / .345;
      if (sy < .243 && Math.abs(wing - (1 - start)) < live * .14) return pink;
      if (Math.abs(sy - (.20 + discharge * .288)) < live * .029) return discharge < .56 ? pink : ember;
      return ink;
    });
    for (const [i, [x, y]] of [[.290, .254], [.710, .254], [.425, .345], [.581, .345]].entries()) {
      const age = (cycle - .43 - i * .023) / .33;
      if (age < 0 || age > 1) continue;
      const [px, py] = point(scene, frame.size, x + (i % 2 ? 1 : -1) * (.047 + age * .081), y + age * .079);
      const at = Math.floor(py) * frame.size + Math.floor(px);
      if (!frame.pixels[at]) square(frame, px, py, Math.max(1, Math.round(frame.size * (.017 - age * .010))), age < .42 ? pink : ember);
    }
  }

  const mascotArm = [[369, 204], [383, 189], [411, 181], [425, 164], [449, 151], [474, 143], [482, 127],
    [485, 95], [501, 95], [514, 111], [516, 124], [552, 118], [580, 114], [595, 131], [594, 153],
    [570, 170], [545, 178], [517, 184], [508, 213], [482, 244], [455, 263], [423, 280],
    [407, 282], [399, 261], [391, 235]];
  const mascotWave = [[0, 0, 0], [.20, -.12, -.09], [.38, .13, .14], [.57, -.15, -.17], [.74, .11, .15],
    [.93, -.10, -.12], [1.13, .06, .08], [1.36, 0, 0], [1.5, 0, 0]];

  function animateTireMascot(scene, frame, base, time) {
    const [swing, flick] = pose(time % 1.5, mascotWave);
    if (!swing) return;
    const { size } = frame;
    const outline = mascotArm.map(([x, y]) => point(scene, size, x / 640, y / 640));
    const [ax, ay] = point(scene, size, .636, .359), [wx, wy] = point(scene, size, .756, .264);
    const armCos = Math.cos(swing), armSin = Math.sin(swing);
    layer(scene, frame, base, [.568, .138, .371, .313], (x, y) => {
      const sx = ax + (x - ax) * armCos + (y - ay) * armSin;
      const sy = ay + (y - ay) * armCos - (x - ax) * armSin;
      const wrist = flick * smooth(((sx - wx) * .92 - (sy - wy) * .39) / (size * .065));
      const handCos = Math.cos(wrist), handSin = Math.sin(wrist);
      return [wx + (sx - wx) * handCos + (sy - wy) * handSin, wy + (sy - wy) * handCos - (sx - wx) * handSin];
    }, { select: (ink, x, y) => ink !== 0 && insideOutline(outline, x + .5, y + .5), padding: .10 });
  }

  function animateArchFill(scene, frame, time, table) {
    const cycle = time % 1.5;
    const reset = smooth((cycle - 1.18) / .28);
    const steel = nearest(scene, [176, 191, 211].map(value => value + reset * (255 - value)));
    const filled = [.08, .27, .46].map(delay => smooth((cycle - delay) / .32));
    const { size } = frame;
    patch(scene, frame, [.640, .134, .309, .790], (ink, u, v) => {
      if (table[ink].light < 122 || u < .650 || v > .897) return ink;
      const dx = u - .652, dy = (.894 - v) * scene.placement[3];
      const radius = Math.hypot(dx, dy);
      const angle = Math.atan2(dx, dy), top = Math.max(0, Math.cos(angle));
      const band = radius < .057 + .061 * top ** 2.6 ? 0 : radius < .160 + .084 * top ** 1.8 ? 1 : 2;
      return reset < .96 && angle <= filled[band] * Math.PI / 2 && radius > .5 / size ? steel : ink;
    });
  }

  function animateTrailArches(scene, frame, time, table) {
    const cycle = time % 1.5;
    const dim = smooth(cycle / .20);
    if (cycle >= 1.18) return;
    const dimmed = nearest(scene, [255 - 197 * dim, 255 - 192 * dim, 255 - 175 * dim]);
    const lip = frame.palette.indexOf('#a0b2c7');
    const fill = [.18, .30, .42].map(delay => smooth((cycle - delay) / .67));
    patch(scene, frame, [.525, .202, .371, .445], (ink, u, v) => {
      if (table[ink].light < 115 || u < .528 || v >= .646 || (v > .489 && u < .633)) return ink;
      const x = u - .528, y = (.646 - v) * .81;
      const radius = Math.hypot(x, y);
      const pitch = y / radius;
      const arc = radius < .164 + .064 * pitch ? 0 : radius < .252 + .060 * pitch ? 1 : 2;
      const distance = Math.atan2(x, y) / (Math.PI / 2);
      if (fill[arc] >= 1 || distance < fill[arc] - .058) return ink;
      return distance < fill[arc] ? lip : dimmed;
    });
  }

  const citrusLeaf = [[.605, .276], [.609, .227], [.620, .173], [.662, .132], [.715, .106],
    [.774, .098], [.839, .093], [.831, .119], [.808, .178], [.770, .220], [.716, .251], [.661, .265], [.619, .283]];
  const citrusFlex = [[0, 0], [.17, -.028], [.34, .035], [.53, -.043], [.70, .026],
    [.88, -.012], [1.11, 0], [1.5, 0]];

  function animateCitrus(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [bend] = pose(cycle, citrusFlex);
    const { size } = frame;
    if (bend) {
      const leaf = citrusLeaf.map(([u, v]) => point(scene, size, u, v));
      layer(scene, frame, base, [.594, .086, .258, .203], (x, y) => {
        const tip = smooth(((x + .5) / size - .622) / .205);
        return [x, y - bend * tip * size];
      }, { select: (ink, x, y) => ink !== 0 && insideOutline(leaf, x + .5, y + .5), padding: .05 });
    }
    const cream = frame.palette.indexOf('#fff9a3');
    const gold = smooth((cycle - .28) / .18) * smooth((.93 - cycle) / .26);
    if (gold > .22) patch(scene, frame, [.285, .135, .338, .175], (ink, u, v) => {
      const gleam = 1 - ((u - .452) / .16) ** 2 - ((v - .190) / .067) ** 2;
      return motifInk('warm', table[ink]) && gleam * gold > .58 ? cream : ink;
    });
  }

  const prixKeys = [[0, 0, 0], [.15, -.021, 0], [.36, .063, .92], [.47, .075, 1], [.67, .032, .65],
    [.86, .007, .19], [1.09, 0, 0], [1.5, 0, 0]];

  function animateGrandPrix(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [drive, speed] = pose(cycle, prixKeys);
    const hot = frame.palette.indexOf('#ff774a'), steel = frame.palette.indexOf('#aec0dd');
    patch(scene, frame, [.037, .063, .954, .345], (ink, u, v) => {
      const stripe = samplePixel(scene, frame.size, base, .49 + (u - .49 - drive) / (1 + speed * .05), v);
      if (!motifInk('red', table[stripe])) return 0;
      const fuel = .15 + .87 * smooth((cycle - .24) / .54);
      return speed > .12 && Math.abs(u + .25 * (v - .17) - fuel) < .032 ? hot : stripe;
    });
    for (const [i, [u, v]] of [[.171, .163], [.140, .241], [.105, .333]].entries()) {
      const age = (cycle - .30 - i * .046) / .43;
      if (age <= 0 || age >= 1) continue;
      const tip = u + drive * .45 - age * .046;
      const length = Math.sin(age * Math.PI) * (.094 - i * .013);
      patch(scene, frame, [tip - length, v, length, .012], ink => ink || hot);
    }
    const flag = smooth((cycle - .37) / .37);
    if (cycle > .37 && cycle < 1.05) patch(scene, frame, [.685, .765, .279, .165], (ink, u, v) => {
      return table[ink].light > 112 && u - (v - .765) * .44 < .68 + flag * .30 ? steel : ink;
    });
  }

  function animateBackToBack(scene, frame, base, time) {
    const [lean, lift] = pose(time % 1.5, [[0, 0, 0], [.19, .009, .002], [.40, .034, .012],
      [.60, .025, .006], [.79, .012, -.004], [.94, .022, .004], [1.19, 0, 0], [1.5, 0, 0]]);
    if (!lean && !lift) return;
    patch(scene, frame, [.069, .120, .862, .460], (ink, u, v) => {
      const fromSpine = u - .5;
      const flex = smooth((.548 - v) / .28) * smooth(Math.abs(fromSpine) / .116);
      return flex ? samplePixel(scene, frame.size, base,
        u - Math.sign(fromSpine) * lean * flex, v + lift * flex) : ink;
    });
  }

  const swooshOutline = [[.030, .634], [.055, .527], [.153, .431], [.177, .432], [.148, .492], [.132, .546],
    [.164, .582], [.237, .600], [.432, .574], [.651, .517], [.966, .460], [.981, .496],
    [.716, .569], [.467, .626], [.254, .685], [.151, .722], [.082, .718], [.039, .689]];

  function animateFlight(scene, frame, time, table) {
    const cycle = time % 1.5;
    const steel = frame.palette.indexOf('#abb9cc');
    const dark = shadeMap(scene, -.39);
    if (cycle > .10 && cycle < .68) {
      const front = .035 + 1.07 * smooth((cycle - .13) / .52);
      patch(scene, frame, [.026, .431, .955, .294], (ink, u, v) => {
        if (table[ink].light < 105 || !insideOutline(swooshOutline, u, v)) return ink;
        const along = u - .14 * (v - .58);
        if (along > front + .031) return dark[ink];
        return along > front - .048 ? steel : ink;
      });
    }
    for (const [i, [u, v]] of [[.106, .544], [.153, .583], [.293, .685], [.507, .627]].entries()) {
      const age = (cycle - .25 - i * .057) / .32;
      if (age < 0 || age >= 1) continue;
      const length = .083 * Math.sin(age * Math.PI), tip = u + .12 * age;
      patch(scene, frame, [tip - length, v - .013, length, .033], (ink, x, y) => {
        return !ink && Math.abs(y - v + (x - tip) * .25) < .62 / frame.size ? steel : ink;
      });
    }
  }

  const playerPress = [[0, 0], [.18, 0], [.31, .95], [.46, .45], [.59, -.10], [.77, 0], [1.5, 0]];

  function animatePlayBadge(scene, frame, base, time) {
    const cycle = time % 1.5;
    const [press] = pose(cycle, playerPress);
    const playing = cycle > .37 && cycle < 1.23;
    const white = frame.palette.indexOf('#ffffff');
    const sheen = frame.palette.indexOf('#ff705e');
    const dark = frame.palette.indexOf('#760515');
    const bars = [0, 1, 2, 3, 4].map(i => .031 + .037 * Math.abs(Math.sin(cycle * 20 + i * .96)));
    patch(scene, frame, [.211, .141, .578, .324], (_ink, u, v) => {
      const sx = .5 + (u - .5) / (1 - press * .11);
      const sy = .301 + (v - .301 - press * .018) / (1 - press * .16);
      const color = sy < .465 ? samplePixel(scene, frame.size, base, sx, sy) : 0;
      if (!playing || !color) return color;
      if (sx > .355 && sx < .645 && sy > .222 && sy < .373) {
        const position = (sx - .370) / .055;
        const bar = Math.floor(position);
        return bar >= 0 && bar < bars.length && position - bar < .68 && Math.abs(sy - .294) < bars[bar] ? white : dark;
      }
      if (sy > .389 && sy < .410 && sx > .281 && sx < .281 + .439 * (cycle - .37) / .86) return sheen;
      return color;
    });
  }

  function animateRedTab(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [pulse, light] = pose(cycle, [[0, 0, 0], [.17, .06, .12], [.36, .94, .33], [.51, 1, .49],
      [.68, -.44, .70], [.90, .23, .89], [1.16, 0, 1], [1.5, 0, 1]]);
    const sheen = frame.palette.indexOf('#ff5b55');
    patch(scene, frame, [.055, .575, .886, .083], (ink, u, v) => {
      const fold = smooth((v - .575) / .066) * Math.sin(Math.PI * (u - .055) / .886) ** 2;
      return samplePixel(scene, frame.size, base, u, v - pulse * fold * .040);
    });
    patch(scene, frame, [.055, .275, .884, .054], (ink, u, v) =>
      v < .319 && motifInk('red', table[ink]) && Math.abs(u - light) < .045 ? sheen : ink);
  }

  function animateSteelOval(scene, frame, base, time) {
    const [pitch, tilt] = pose(time % 1.5, [[0, 1, 0], [.24, .79, -.065], [.47, .19, -.094],
      [.57, .12, -.056], [.78, .72, .063], [.97, 1.10, .025], [1.18, 1, 0], [1.5, 1, 0]]);
    const steel = frame.palette.indexOf('#aebcca');
    patch(scene, frame, [.147, .210, .702, .288], (ink, u, v) => {
      const dx = u - .499, dy = v - .364 - dx * tilt;
      const sx = .499 + dx / (1 - (1 - pitch) * .13);
      const sy = .364 + dy / pitch;
      const sample = sv => sv > .231 && sv < .491 ? samplePixel(scene, frame.size, base, sx, sv) : 0;
      const face = sample(sy);
      if (face) return face;
      const thickness = (1 - pitch) * .021;
      return thickness > 0 && sample(sy - thickness / pitch) ? steel : 0;
    });
  }

  function animateBlueOrbit(scene, frame, time, table) {
    const phase = (time % 1.5) / 1.5;
    const energy = smooth(phase / .16) * smooth((1 - phase) / .24);
    const head = -.14 + phase * 1.28;
    const blue = frame.palette.indexOf('#7cd3ff');
    const bright = shadeMap(scene, .18);
    patch(scene, frame, [.073, .202, .858, .512], (ink, u, v) => {
      if (!motifInk('cool', table[ink])) return ink;
      const travel = u - v * .32;
      const level = energy * Math.max(0, 1 - Math.abs(travel - head) / .19);
      return level > .85 ? blue : level > .24 ? bright[ink] : ink;
    });
  }

  function animateRace(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [shift, stretch] = pose(cycle, [[0, 0, 1], [.17, -.036, .98], [.35, .051, 1.06], [.48, .047, 1.01],
      [.61, .021, 1], [.78, -.017, .98], [1.01, 0, 1], [1.5, 0, 1]]);
    const flash = frame.palette.indexOf('#ff9883');
    patch(scene, frame, [.051, .233, .948, .251], (ink, u, v) => {
      const sx = .51 + (u - .51 - shift) / stretch;
      const color = samplePixel(scene, frame.size, base, sx, v);
      if (!motifInk('red', table[color])) return motifInk('red', table[ink]) ? 0 : ink;
      return Math.abs(sx - (v - .36) * .54 - cycle * 1.51 + .13) < .045 ? flash : color;
    });
    if (cycle < .30 || cycle > .63) return;
    for (const [u, v, length] of [[.227, .296, .108], [.178, .374, .11], [.152, .439, .088]]) {
      const tail = u - (cycle - .3) * .26;
      patch(scene, frame, [tail - length, v, length, .012], ink => ink || flash);
    }
  }

  function animateArcade(scene, frame, time, table) {
    const cycle = time % 1.5;
    const salmon = frame.palette.indexOf('#ff8b64');
    const white = frame.palette.indexOf('#ffffff');
    const off = shadeMap(scene, -.47);
    const pale = nearest(scene, [156, 165, 174]);
    patch(scene, frame, [.159, .158, .674, .419], (ink, u, v) => {
      const frontier = .57 - cycle * .34;
      const band = Math.abs(v - frontier);
      if (motifInk('red', table[ink])) {
        if (band < .018) return salmon;
        if (v < frontier && Math.floor(v * 29 - cycle * 9) % 3 === 0) return off[ink];
      }
      if (table[ink].light > 165 && band < .055) return band < .013 ? white : pale;
      return ink;
    });
    if (cycle < .36 || cycle > 1.08) return;
    const light = (cycle - .36) / .72;
    const [x, y] = point(scene, frame.size, .498, .167 - Math.sin(light * Math.PI) * .069);
    square(frame, x, y, Math.max(1, Math.round(frame.size * .016)), white);
    for (const side of [-1, 1]) square(frame, x + side * frame.size * .017, y, 1, salmon);
  }

  const jawKeys = [[0, 0, 0], [.16, -.021, 0], [.33, .029, -.017], [.49, .058, .013], [.66, -.025, .015],
    [.85, .035, -.015], [1.06, 0, .006], [1.33, 0, 0], [1.5, 0, 0]];

  function animateHeadphones(scene, frame, base, time) {
    const cycle = time % 1.5;
    const [jaw, gaze] = pose(cycle, jawKeys);
    const paper = frame.palette.indexOf('#ffffff');
    const rect = [.285, .445, .451, .264];
    const [left, top, width, height] = rect;
    patch(scene, frame, rect, (ink, u, v) => {
      const weight = smooth(Math.min((u - left) / .093, (left + width - u) / .083, (v - top) / .085,
        (top + height - v) / .067));
      return samplePixel(scene, frame.size, base, u - gaze * weight * .50, v - jaw * weight, paper);
    });
    const eyes = [[.372, .391, .079, .061], [.591, .364, .079, .061]];
    for (const [x, y, rx, ry] of eyes) {
      patch(scene, frame, [x - rx, y - ry, 2 * rx, 2 * ry], (ink, u, v) => {
        const reach = smooth(1 - ((u - x) / rx) ** 2 - ((v - y) / ry) ** 2);
        return samplePixel(scene, frame.size, base, u - gaze * reach * 2, v, paper);
      });
    }
    const blue = frame.palette.indexOf('#8a30ff');
    const lift = Math.max(0, jaw) * 1.1;
    patch(scene, frame, [.035, .890, .93, .107], (ink, x, y) => {
      const pulse = lift * Math.sin(x * tau * 13 - cycle * 18) * smooth(1 - Math.abs(x - .5) * 1.9);
      return Math.abs(y - .932 - pulse) < .62 / frame.size ? blue : ink;
    });
  }

  const ritualKeys = [[0, 0, 0], [.13, -.06, .18], [.33, -.23, .8], [.49, -.16, .26], [.72, .22, .87],
    [.88, .16, .35], [1.05, -.102, .55], [1.22, .04, .11], [1.40, 0, 0], [1.5, 0, 0]];
  const ritualHead = [[.343, .482], [.392, .487], [.435, .509], [.511, .512], [.568, .508], [.593, .490],
    [.631, .477], [.659, .477], [.660, .601], [.678, .653], [.687, .716], [.674, .763], [.632, .807],
    [.559, .833], [.552, .944], [.463, .944], [.459, .834], [.399, .824], [.347, .793], [.307, .738],
    [.307, .679], [.343, .599]];
  const ritualEyes = [[.437, .581, .207, .656], [.578, .581, .785, .653]];

  function animateRitualCat(scene, frame, base, time, table) {
    const [swing, laser] = pose(time % 1.5, ritualKeys);
    if (!swing && !laser) return;
    const gold = frame.palette.indexOf('#fff400'), ember = frame.palette.indexOf('#ff991c');
    const { size } = frame;
    const outline = ritualHead.map(([u, v]) => point(scene, size, u, v));
    const cx = .504, cy = .714;
    const cos = Math.cos(swing), sin = Math.sin(swing);
    const beamRect = [.194, .522, .605, .150];
    const beamWidth = Math.max(.009, .62 / size);
    const eyeArea = (u, v) => ritualEyes.some(([x, y]) => ((u - x) / .055) ** 2 + ((v - y) / .037) ** 2 < 1);
    patch(scene, frame, beamRect, (ink, u, v) => {
      if (!motifInk('red', table[ink]) || eyeArea(u, v)) return ink;
      for (const [eyeX, eyeY, endX, endY] of ritualEyes) {
        const along = (u - endX) / (eyeX - endX);
        if (along > 0 && along < 1 && Math.abs(v - endY - along * (eyeY - endY)) < beamWidth * (1.15 + along)) return 0;
      }
      return ink;
    });
    rotate(scene, frame, base, [.304, .469, .385, .480], [cx, cy], swing, {
      select: (ink, x, y) => {
        const u = (x + .5) / size, v = (y + .5) / size;
        if (!insideOutline(outline, x + .5, y + .5)) return false;
        if (!ink) return Math.abs(u - .506) < .059 && v > .644 && v < .785;
        return !motifInk('red', table[ink]) || eyeArea(u, v);
      },
      padding: .064
    });
    const red = frame.palette.indexOf(scene.accent);
    for (const [eyeX, eyeY, endX, endY] of ritualEyes) {
      const x = cx + (eyeX - cx) * cos - (eyeY - cy) * sin;
      const y = cy + (eyeX - cx) * sin + (eyeY - cy) * cos;
      patch(scene, frame, beamRect, (ink, u, v) => {
        const along = (u - endX) / (x - endX);
        if (along < 0 || along >= 1 || Math.abs(v - endY - along * (y - endY)) > beamWidth * (.38 + along * .52)) return ink;
        return laser > .68 && along > .40 ? ember : red;
      });
      if (laser > .32) {
        const [px, py] = point(scene, size, x, y);
        const diameter = Math.max(1, Math.round(size * .017 * laser));
        square(frame, px, py, diameter + 1, ember);
        square(frame, px, py, diameter, gold);
      }
    }
  }

  const screamKeys = [[0, 0, 0], [.19, -.48, .06], [.36, 1, 1], [.48, .86, .47], [.65, .06, 0],
    [.80, -.27, .09], [.97, .74, .85], [1.08, .32, .30], [1.29, 0, 0], [1.5, 0, 0]];

  function animatePaperScream(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [shout, beat] = pose(cycle, screamKeys);
    if (!shout && !beat) return;
    const { size } = frame;
    patch(scene, frame, [.294, .470, .420, .304], (ink, u, v) => {
      const reach = smooth((1 - ((u - .505) / .210) ** 2 - ((v - .623) / .151) ** 2) / .57);
      if (!reach) return ink;
      const sx = .505 + (u - .505) / (1 + shout * .22 * reach);
      const sy = .602 + (v - .602) / (1 + shout * .34 * reach) - shout * .026 * reach;
      return samplePixel(scene, size, base, sx, sy);
    });
    const glow = frame.palette.indexOf('#d8ff78');
    for (const [u, v, rx, ry] of [[.142, .555, .061, .074], [.851, .543, .063, .078]]) {
      patch(scene, frame, [u - rx, v - ry, rx * 2, ry * 2], (_ink, x, y) => {
        const reach = smooth((1 - ((x - u) / rx) ** 2 - ((y - v) / ry) ** 2) / .48);
        const scale = 1 + beat * .23 * reach;
        const color = samplePixel(scene, size, base, u + (x - u) / scale, v + (y - v) / scale);
        return beat > .51 && reach > .35 && motifInk('green', table[color]) ? glow : color;
      });
    }
    if (beat > .16) for (const rect of [[.008, .248, .201, .397], [.793, .242, .199, .398]]) {
      const hot = frame.palette.indexOf('#ffb22e');
      patch(scene, frame, rect, (ink, _u, v) => {
        const [r, g, b] = table[ink].rgb;
        return r > 174 && g > 57 && g < 155 && b < 56 && Math.abs(v - .48) < beat * .24 ? hot : ink;
      });
    }
  }

  function animateAcidCabinet(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const beat = pose(cycle, [[0, 0], [.16, .15], [.26, 1], [.39, .14], [.52, .65], [.65, .09],
      [.83, 1], [1.04, .18], [1.13, .51], [1.33, 0], [1.5, 0]])[0];
    const green = frame.palette.indexOf(scene.accent), pink = frame.palette.indexOf('#ff079c');
    for (const [cx, cy, rx, ry, scale] of [[.468, .663, .146, .167, .28], [.492, .454, .050, .055, .31]]) {
      patch(scene, frame, [cx - rx, cy - ry, rx * 2, ry * 2], (ink, u, v) => {
        const distance = Math.hypot((u - cx) / rx, (v - cy) / ry);
        if (distance >= 1) return ink;
        const spring = 1 + beat * scale * smooth((1 - distance) / .40);
        const color = samplePixel(scene, frame.size, base, cx + (u - cx) / spring, cy + (v - cy) / spring);
        return cy < .5 && beat > .63 && table[color].light > 125 ? green : color;
      });
    }
    for (const [side, rect] of [[-1, [.092, .365, .249, .469]], [1, [.670, .365, .251, .469]]]) {
      const strike = .47 + .32 * smooth((cycle - (side < 0 ? .12 : .26)) / .38);
      patch(scene, frame, rect, (ink, u, v) => {
        const kick = beat * .017 * smooth(Math.abs(u - .5) / .32) * smooth((.837 - v) / .20);
        const source = samplePixel(scene, frame.size, base, u - side * kick, v + .26 * kick);
        if (motifInk('pink', table[source]) && (!ink || motifInk('pink', table[ink]))) {
          return beat > .32 && Math.abs(v - strike) < .073 ? frame.palette.indexOf('#ffffff') : pink;
        }
        return motifInk('pink', table[ink]) ? 0 : ink;
      });
    }
  }

  const footprintKeys = [[0, 0, 0], [.17, .013, -.021], [.39, .086, .045], [.57, .058, .025],
    [.72, 0, -.012], [.93, 0, 0], [1.5, 0, 0]];
  const centerClaw = [[.410, .085], [.488, .062], [.535, .055], [.593, .111], [.565, .151], [.539, .168],
    [.532, .328], [.524, .433], [.507, .542], [.504, .664], [.452, .664], [.468, .452], [.464, .332],
    [.475, .184], [.449, .145], [.409, .133]];

  function animateToxicFeet(scene, frame, base, time, table) {
    const { size } = frame;
    const cycle = time % 1.5;
    const envelope = smooth(time / .18) * smooth((3 - time) / .18);
    const [leftLift, leftToe] = pose(cycle, footprintKeys);
    const [rightLift, rightToe] = pose((cycle + .75) % 1.5, footprintKeys);
    const slime = table.map(({ rgb: [r, g, b] }) => g > b * 1.27 && g > r * .98);
    patch(scene, frame, [.165, 0, .677, .671], (ink, u, v) => {
      if (insideOutline(centerClaw, u, v) || ink && !slime[ink]) return ink;
      const left = 1 - smooth((u - .393) / .099), right = smooth((u - .503) / .103);
      const room = envelope * smooth(v / .128);
      const lift = leftLift * left + rightLift * right;
      const tilt = leftToe * left - rightToe * right;
      const gap = .043 * smooth((v - .20) / .40);
      const from = v + room * (lift + gap);
      const sx = u - room * tilt * (.68 - v);
      const color = from < .671 && !insideOutline(centerClaw, sx, from) ? samplePixel(scene, size, base, sx, from) : 0;
      if (!slime[color]) return 0;
      // Loose shadow pixels below the soles aren't part of the moving claw tips.
      return from < .485 || table[color].light >= 66 ? color : 0;
    });
  }

  const inkTagLift = [[0, 0], [.12, 0], [.39, 1], [.57, .93], [2.52, .93], [2.94, 0], [3, 0]];

  function animateInkTag(scene, frame, base, time) {
    const [lift] = pose(time, inkTagLift);
    if (!lift) return;
    const { size, palette } = frame;
    const paper = palette.indexOf('#ffffff');
    const rim = palette.indexOf('#a9660a');
    const amber = palette.indexOf('#e4a817');
    const gold = palette.indexOf('#ffe168');
    const highlight = palette.indexOf('#fff3b1');
    const scale = 1 - .17 * lift;
    const center = .5 - .104 * lift;
    const [, paperTop, , paperHeight] = scene.placement;
    const firstRow = Math.ceil(paperTop * size - .5);
    const endRow = Math.ceil((paperTop + paperHeight) * size - .5);
    patch(scene, frame, [0, 0, 1, 1], (_ink, u, v) => {
      const sx = .5 + (u - .5) / scale, sy = .5 + (v - center) / scale;
      const row = Math.floor((paperTop + sy * paperHeight) * size);
      return row >= firstRow && row < endRow ? samplePixel(scene, size, base, sx, sy, paper) : paper;
    });

    const start = .38, stop = 1.73, flight = .26;
    const landing = start + flight;
    const surface = .912;
    // Start the stream at the bottom of the original M stroke.
    const originX = .5 + (.836 - .5) * scale;
    const originY = center + (.928 - .5) * scale;
    const impactX = originX + .067;
    const fill = smooth((time - landing) / (stop - start)) * (1 - smooth((time - 2.40) / .41));
    const hit = landing + Math.floor((Math.min(time, stop + flight) - landing) / .18) * .18;
    const splash = (time - hit) / .30;
    if (fill > 0) {
      const width = .119 * Math.sqrt(fill);
      const height = .036 * fill ** .43;
      const x = impactX - fill * .034;
      patch(scene, frame, [x - width, surface - height, width * 2, height * 2], (ink, u, v) => {
        const dx = (u - x) / width, dy = (v - surface) / height;
        const edge = dx * dx + dy * dy + .095 * Math.cos(dx * 7 + dy * 3);
        if (edge > 1 || ink !== paper) return ink;
        const ring = Math.hypot((u - impactX) / .100, (v - surface) / .035);
        if (splash < .83 && Math.abs(ring - splash) < .15) return highlight;
        if (dy > .22 && edge > .57) return rim;
        return dy > .09 || edge > .78 ? amber : gold;
      });
    }
    if (time >= start && time < stop + flight) {
      const speed = .34, acceleration = 1.32;
      patch(scene, frame, [originX - .019, originY, .112, surface - originY], (ink, u, v) => {
        if (v < originY || v > surface || ink === 0) return ink;
        const depth = (v - originY) / (surface - originY);
        const along = (Math.sqrt(speed ** 2 + 2 * acceleration * depth) - speed) / acceleration;
        const emitted = time - along * flight;
        if (emitted < start || emitted > stop) return ink;
        const drift = Math.sin(emitted * 42) * .005 * along;
        const offset = u - originX - .067 * along - drift;
        const half = Math.max(.0075 + .004 * along, .58 / size);
        return Math.abs(offset) > half ? ink : offset > half * .33 ? rim : amber;
      });
    }
    if (time >= landing && splash >= 0 && splash < 1) {
      const cell = Math.max(1, Math.round(size * .011));
      for (const [dx, rise] of [[-.063, .047], [.044, .061], [-.029, .072]]) {
        const [x, y] = point(scene, size, impactX + dx * splash, surface - rise * 4 * splash * (1 - splash));
        square(frame, x, y, cell, splash < .45 ? amber : rim);
      }
    }
  }

  function animateInkDrips(scene, frame, base, time) {
    const { size, pixels } = frame, white = frame.palette.indexOf('#ffffff');
    const cycle = time % 1.5;
    const tips = [[.108, .55], [.257, .52], [.410, .56], [.59, .52], [.84, .547], [.913, .571],
      [.106, .855], [.238, .838], [.433, .86], [.674, .848], [.851, .846], [.955, .827]];
    for (const [i, [u, v]] of tips.entries()) {
      const [x, start] = point(scene, size, u, v).map(Math.floor);
      let y = start;
      while (y > start - size * .065 && base[y * size + x] !== white) y--;
      if (base[y * size + x] !== white) continue;
      while (y + 1 < size && base[(y + 1) * size + x] === white) y++;
      const age = (cycle - .10 - i % 6 * .111) / .75;
      if (age < 0 || age >= 1) continue;
      const thread = age < .38 ? Math.round(size * age * .095) : 0;
      const fall = age < .38 ? thread : Math.round(size * (.036 + (age - .38) ** 2 * .205));
      for (let cell = 1; cell <= thread; cell++) if (!base[(y + cell) * size + x]) square(frame, x + .5, y + cell + .5, 1, white);
      if (y + fall < size && !pixels[(y + fall) * size + x]) {
        square(frame, x + .5, y + fall + .5, Math.max(1, Math.round(size * (.016 - age * .011))), white);
      }
    }
  }

  function motifInk(rule, color) {
    const { rgb: [r, g, b], light, neutral } = color;
    switch (rule) {
      case 'light': return neutral && light > 125;
      case 'red': return r > 95 && r > g * 1.55 && r > b * 1.42;
      case 'pink': return r > 95 && b > 78 && Math.min(r, b) > g * 1.38;
      case 'green': return g > 102 && g > b * 1.35 && g > r * .92;
      case 'warm': return r > 137 && g > 77 && b < Math.min(r, g) * .7;
      case 'cool': return b > 85 && b > r * 1.19;
      default: return light > 21 || Math.max(r, g, b) > 36;
    }
  }

  function animateMotif(scene, frame, base, time, table) {
    const { size, palette } = frame;
    for (const effect of scene.motif) {
      const { type, rect, offset = 0 } = effect;
      const [u, v, width, height] = rect;
      const cycle = (time / 1.5 + offset) % 1;
      const envelope = Math.min(1, time * 5, (3 - time) * 5);
      const sway = envelope * Math.sin(cycle * tau);
      const paper = palette.indexOf(effect.paper ?? '#000000');
      const selected = ink => ink !== paper && motifInk(effect.ink, table[ink]);

      if (type === 'glint') {
        const glow = palette.indexOf(effect.color);
        patch(scene, frame, rect, (ink, x, y) => {
          if (!selected(ink)) return ink;
          const dx = (x - u) / width, dy = (y - v) / height;
          let position = effect.axis === 'y' ? dy : effect.axis === 'diag' ? dx * .66 + dy * .34 : dx;
          if (effect.axis === 'arc') position = Math.atan2(dy - .5, dx - .5) / tau + .5;
          const distance = Math.abs(position - cycle);
          return (effect.axis === 'arc' ? Math.min(distance, 1 - distance) : distance) < .082 ? glow : ink;
        });
      } else if (type === 'bend') {
        patch(scene, frame, rect, (ink, x, y) => {
          const fx = (x - u) / width, fy = (y - v) / height;
          if (fx <= 0 || fx >= 1 || fy <= 0 || fy >= 1) return ink;
          const force = Math.sin(fx * Math.PI) * Math.sin(fy * Math.PI) * sway;
          const [sx, sy] = point(scene, size, x - effect.x * force, y - effect.y * force).map(Math.floor);
          return base[sy * size + sx];
        });
      } else if (type === 'hop' || type === 'blink') {
        const [, cy] = point(scene, size, u, v + height / 2);
        const stretch = type === 'blink' ? 1 - .84 * Math.sin(Math.PI * Math.min(1, cycle * 1.85)) ** 4 : 1;
        const slide = (effect.y ?? 0) * size * Math.sin(cycle * Math.PI) ** 2 * envelope;
        layer(scene, frame, base, rect, (x, y) => [x, cy + (y + .5 - cy + slide) / stretch - .5],
          { select: selected, background: paper, padding: .045 });
      }
    }
  }

  function clearText(scene, size, pixels) {
    for (const rect of scene.text) {
      const [left, top, right, bottom] = bounds(scene, size, rect);
      for (let y = top; y < bottom; y++) pixels.fill(0, y * size + left, y * size + right);
    }
  }

  function restoreText(scene,frame,base,transparent=false){
    for(const rect of scene.text){
      const [left,top,right,bottom]=bounds(scene,frame.size,rect);
      for(let y=top;y<bottom;y++){
        const start=y*frame.size+left,end=y*frame.size+right;
        if(transparent) {
          for(let index=start;index<end;index++) if(base[index]) frame.pixels[index]=base[index];
        } else frame.pixels.set(base.subarray(start,end),start);
      }
    }
  }
  function animate(scene,frame,time,transparentText){
    const t=((time%3)+3)%3;
    if(t<1e-9)return;
    const phase=t*tau/3,beat=Math.sin(phase)**2,base=frame.pixels.slice();
    const table=colorTable(scene),scale=frame.size/100;
    const light=shadeMap(scene,.33*beat);
    const neutral=ink=>ink!==0&&table[ink].neutral&&table[ink].light>65;
    const red = ink => {
      const [r, g, b] = table[ink].rgb;
      return r > 100 && r > g * 1.5 && r > b * 1.4;
    };
    switch(scene.motion){
      case 'marionette':
        animateMarionette(scene, frame, base, t, table);
        break;
      case 'diamond-stack':
        animateDiamonds(scene, frame, base, t);
        break;
      case 'barcode-feed':
        animateBarcodeEye(scene, frame, base, t);
        break;
      case 'alien-blink':
        animateAlienEyes(scene, frame, t, table);
        break;
      case 'cat-beat':
        animateChaoticCat(scene, frame, base, t, table);
        break;
      case 'finger-flick':
        animateFinger(scene, frame, base, t);
        break;
      case 'assembly-guide':
        animateInstructions(scene, frame, base, t);
        break;
      case 'peak-meter':
        animateThreeStripes(scene, frame, base, t, table);
        break;
      case 'diamond-lock':
        animateTripleDiamond(scene, frame, base, t, table);
        break;
      case 'surf-crest':
        animateMountain(scene, frame, base, t, table);
        break;
      case 'ribbon-fold':
        animateStreamingIdent(scene, frame, base, t, table);
        break;
      case 'globe-roll':
        animateSodaGlobe(scene, frame, base, t, table);
        break;
      case 'shell-fan':
        animateShell(scene, frame, base, t);
        break;
      case 'race-sprint':
        animateGrandPrix(scene, frame, base, t, table);
        break;
      case 'chevron-kick':
        animateChevron(scene, frame, base, t);
        break;
      case 'coin-clink':
        animateCoins(scene, frame, t);
        break;
      case 'chat-blink':
        animateChat(scene, frame, base, t, table);
        break;
      case 'seal-meter':
        animateCoffeeSeal(scene, frame, base, t, table);
        break;
      case 'turbine-charge':
        animateTurbine(scene, frame, base, t, table);
        break;
      case 'mascot-wave':
        animateTireMascot(scene, frame, base, t);
        break;
      case 'arch-fill':
        animateArchFill(scene, frame, t, table);
        break;
      case 'trail-fill':
        animateTrailArches(scene, frame, t, table);
        break;
      case 'citrus-flex':
        animateCitrus(scene, frame, base, t, table);
        break;
      case 'paper-scream':
        animatePaperScream(scene, frame, base, t, table);
        break;
      case 'acid-beat':
        animateAcidCabinet(scene, frame, base, t, table);
        break;
      case 'neural-drink':
        animateNeuralDrink(scene, frame, t, table);
        break;
      case 'xbox-orb':
        animateXboxOrb(scene, frame, t, table);
        break;
      case 'chip-mascot':
        animateChipMascot(scene, frame, base, t, table);
        break;
      case 'mushroom-emblem':
        animateMushroom(scene, frame, base, t, table);
        break;
      case 'mirrored-lean':
        animateBackToBack(scene, frame, base, t);
        break;
      case 'swoosh-launch':
        animateFlight(scene, frame, t, table);
        break;
      case 'play-press':
        animatePlayBadge(scene, frame, base, t);
        break;
      case 'tab-spring':
        animateRedTab(scene, frame, base, t, table);
        break;
      case 'steel-pitch':
        animateSteelOval(scene, frame, base, t);
        break;
      case 'orbit-current':
        animateBlueOrbit(scene, frame, t, table);
        break;
      case 'race-launch':
        animateRace(scene, frame, base, t, table);
        break;
      case 'arcade-scan':
        animateArcade(scene, frame, t, table);
        break;
      case 'headphone-shock':
        animateHeadphones(scene, frame, base, t);
        break;
      case 'ritual-beam':
        animateRitualCat(scene, frame, base, t, table);
        break;
      case 'toxic-steps':
        animateToxicFeet(scene, frame, base, t, table);
        break;
      case 'motif':
        animateMotif(scene, frame, base, t, table);
        break;
      case 'ink-tag-stream':
        animateInkTag(scene, frame, base, t);
        break;
      case 'ink-drips':
        animateInkDrips(scene, frame, base, t);
        return;
      case 'tongue':
        animateTongue(scene,frame,base,t);
        animateGirlBlink(scene, frame, base, t);
        animateGirlSurround(scene, frame, t);
        break;
      case 'skull-snap':
        animateSkull(scene, frame, base, t, neutral);
        break;
      case 'face':{
        const original=base;
        const [left,top,right,bottom]=bounds(scene,frame.size,[.0,.31,1,.51]);
        for(let y=top;y<bottom;y++){
          const shift=Math.round(Math.sin(y*.19-phase*3)*beat*2.4*scale);
          for(let x=left;x<right;x++)frame.pixels[y*frame.size+x]=x-shift>=left&&x-shift<right?original[y*frame.size+x-shift]:0;
        }
        break;
      }
      case 'breaking-wave':
        animateWave(scene, frame, base, t, table);
        break;
      case 'violet-hunt':
        animateViolet(scene, frame, t, table);
        break;
      case 'pupil':{
        const [cx,cy]=point(scene,frame.size,.5,.51),[rx,ry]=[frame.size*scene.placement[2]*.14,frame.size*scene.placement[3]*.18];
        patch(scene,frame,[.35,.32,.3,.38],(ink,_u,_v,x,y)=>{
          const distance=((x-cx)/rx)**2+((y-cy)/ry)**2;
          if(distance>=1)return ink;
          const falloff=(1-distance)**2;
          const sx=Math.round(x-Math.sin(phase)*3*scale*falloff),sy=Math.round(y-Math.sin(phase*2)*scale*falloff);
          return base[sy*frame.size+sx];
        });
        break;
      }
      case 'station-spin':
        animateStation(scene, frame, base, phase);
        break;
      case 'specter-glow':
        animateSpecter(scene, frame, t, phase, table);
        break;
      case 'centipede':{
        // Move the original bones and legs as hinged sections; the purple globe stays fixed.
        const joints=[[84,114],[109,98],[141,86],[173,76],[206,79],[237,93],[265,119],[289,151],[304,190],
          [307,226],[301,261],[284,292],[261,320],[229,342],[195,358],[157,371],[119,395],[90,422],[77,453]]
          .map(([x,y])=>point(scene,frame.size,x/394,y/642));
        const envelope=Math.sin(phase/2);
        layer(scene,frame,base,[0,0,1,.75],(x,y)=>{
          let index=0,distance=Infinity;
          for(let i=0;i<joints.length;i++){
            const [cx,cy]=joints[i],d=(x-cx)**2+(y-cy)**2;
            if(d<distance){distance=d;index=i;}
          }
          const [cx,cy]=joints[index];
          const leg=Math.sqrt(distance)>3.5*scale;
          const angle=envelope*Math.sin(phase*3-index*.61)*(leg?.17:.065);
          const dx=envelope*Math.sin(phase*2-index*.5)*1.6*scale;
          const dy=envelope*Math.cos(phase*2-index*.5)*.8*scale;
          return [cx+(x-cx-dx)*Math.cos(angle)+(y-cy-dy)*Math.sin(angle),
            cy-(x-cx-dx)*Math.sin(angle)+(y-cy-dy)*Math.cos(angle)];
        },{select:neutral});
        break;
      }
      case 'radio':
        animateRadio(scene, frame, t);
        break;
      case 'screen':
        animateCrt(scene, frame, t);
        break;
      case 'terminal-boot':
        animateTerminal(scene, frame, t);
        break;
      case 'planet':
        animatePlanet(scene, frame, phase);
        break;
      case 'water':
        animateTorii(scene, frame, base, t, table);
        break;
      case 'x-ray':
        animateThermal(scene, frame, t, table);
        break;
      case 'cracks':
        animateMonitor(scene, frame, t, table);
        break;
      case 'hand':{
        const offset = Math.round(beat * 2.6 * scale);
        layer(scene, frame, base, [.277, .242, .554, .398], (x, y) => [x + offset, y - offset], { select: neutral });
        break;
      }
      case 'pet':
        animatePet(scene, frame, t, table);
        break;
      case 'fan':
        animateFan(scene, frame, t, phase, table);
        break;
      case 'headphones':
        animateCandy(scene, frame, base, t, table);
        break;
      case 'disc':
        animateDisc(scene, frame, base, phase);
        return;
      case 'bubbles':
        animateBubbles(scene, frame, base, t);
        break;
      case 'console-boot':
        animateConsole(scene, frame, base, phase, table);
        break;
      case 'stamp':
        animateStamp(scene, frame, base, t, table);
        break;
      case 'stream-disc':
        animateStreamDisc(scene, frame, base, t, table);
        break;
      case 'player-meter':
        animatePlayer(scene, frame, base, t, table);
        break;
      case 'marquee':
        animateMarquee(scene, frame, base, t, table);
        break;
      case 'rear':
        animateHorse(scene, frame, base, t, table);
        break;
      case 'crocodile':
        animateCrocodile(scene, frame, base, t, table);
        break;
      case 'chroma-note':
        animateChromaNote(scene, frame, base, t);
        break;
      case 'harp':
        animateHarp(scene, frame, base, t, table);
        break;
      case 'mecha-ouroboros':
        animateOuroboros(scene, frame, base, t);
        break;
      case 'ring-mark':
        animateRingMark(scene, frame, t);
        return;
      case 'chrome-badge':
        animateChromeBadge(scene, frame, phase);
        break;
      case 'winged-shoe':
        animateWingedShoe(scene, frame, base, t);
        break;
      case 'flame-type':
        animateFlameType(scene, frame, base, t, phase, table);
        break;
      case 'green-eye':
        animateGreenEye(scene, frame, base, t, table);
        break;
      case 'umbrella':
        animateUmbrella(scene, frame, base, t, table);
        break;
      case 'starfield': {
        const sky = nearest(scene, [19, 51, 227]);
        const stars = [[.329, .185], [.529, .166], [.61, .25], [.25, .307], [.346, .77]];
        for (const [index, [x, y]] of stars.entries()) {
          if ((t * 1.4 + index * .23) % 1 < .4) {
            patch(scene, frame, [x - .022, y - .031, .044, .062], ink => neutral(ink) ? sky : ink);
          }
        }
        const sweep = .46 + t * .16;
        patch(scene, frame, [.45, .065, .48, .365], (ink, u) => red(ink) && Math.abs(u - sweep) < .05 ? light[ink] : ink);
        break;
      }
      case 'bull-charge':
        animateBulls(scene, frame, base, t, table);
        break;
      case 'vector-swipe':
        animateVector(scene, frame, base, t, table);
        break;
      case 'metal-tips': {
        const swing = Math.sin(phase * 2);
        const flex = .13 * swing;
        const edges = { select: neutral, padding: .045 };
        rotate(scene, frame, base, [.035, .44, .145, .51], [.18, .52], flex, edges);
        rotate(scene, frame, base, [.82, .44, .145, .51], [.82, .52], -flex, edges);
        for (const [left, width, direction] of [[.14, .30, 1], [.584, .202, -1]]) {
          patch(scene, frame, [left, 0, width, .183], (ink, u, v) => {
            const reach = Math.max(0, (.183 - v) / .183);
            const drift = direction * swing * .040 * reach ** 1.25;
            const [x, y] = point(scene, frame.size, u + drift, v).map(Math.floor);
            return base[y * frame.size + x];
          });
        }
        break;
      }
    }
    restoreText(scene,frame,base,transparentText);
  }
  function addLettering(frame,detail,transparent=false){
    const {size,patches}=detail;
    const scale=size/frame.size;
    const pixels=new Uint8Array(size*size);
    for(let row=0;row<frame.size;row++){
      const start=row*scale*size;
      for(let column=0;column<frame.size;column++){
        const left=start+column*scale;
        pixels.fill(frame.pixels[row*frame.size+column],left,left+scale);
      }
      for(let copy=1;copy<scale;copy++)pixels.copyWithin(start+copy*size,start,start+size);
    }
    for(const patch of patches){
      if(!letteringPixels.has(patch)){
        const runs=atob(patch.data);
        const ink=new Uint8Array(patch.width*patch.height);
        let offset=0;
        for(let i=0;i<runs.length;i+=2){
          const end=offset+runs.charCodeAt(i);
          ink.fill(runs.charCodeAt(i+1),offset,end);
          offset=end;
        }
        letteringPixels.set(patch,ink);
      }
      const ink=letteringPixels.get(patch);
      for(let row=0;row<patch.height;row++){
        const offset=row*patch.width;
        const start=(patch.top+row)*size+patch.left;
        if(transparent) {
          for(let column=0;column<patch.width;column++) if(ink[offset+column]) pixels[start+column]=ink[offset+column];
        } else pixels.set(ink.subarray(offset,offset+patch.width),start);
      }
    }
    return {...frame,size,pixels,artworkSize:frame.size};
  }
  function render(id,size=160,time=0,{lettering=false}={}){
    const scene=byId.get(id);
    if(!scene)throw new Error('Unknown scene: '+id);
    if(!Number.isInteger(size)||size<32||size>1000)throw new Error('Grid size must be an integer from 32 to 1000.');
    const original=originals.baseFrame(id,size);
    const frame={...original,pixels:original.pixels.slice()};
    const smokeFromLetters=scene.motion==='red-roof';
    const detail=lettering&&scene.lettering?.[size];
    const transparentText=scene.motion==='mecha-ouroboros'||scene.motion==='chrome-badge';
    if(detail&&transparentText)clearText(scene,size,frame.pixels);
    if(scene.motion==='eye')animateEye(scene,frame,time);
    else if(!smokeFromLetters)animate(scene,frame,time,transparentText);
    const result=detail?addLettering(frame,detail,transparentText):frame;
    if(smokeFromLetters)animateRedRoof(scene,result,time);
    return result;
  }
  function rgba(frame,output=new Uint8ClampedArray(frame.pixels.length*4)){
    const paletteBytes=new Uint8Array(frame.palette.length*4);
    frame.palette.forEach((hex,index)=>{
      for(let c=0;c<3;c++)paletteBytes[index*4+c]=parseInt(hex.slice(1+c*2,3+c*2),16);
      paletteBytes[index*4+3]=255;
    });
    const colors=new Uint32Array(paletteBytes.buffer),words=new Uint32Array(output.buffer,output.byteOffset,frame.pixels.length);
    for(let i=0;i<words.length;i++)words[i]=colors[frame.pixels[i]];
    return output;
  }
  const api={scenes,render,rgba};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PixelArt=api;
})(globalThis);
