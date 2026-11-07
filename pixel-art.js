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

  const discCenter = [.505, .360];
  const discRadii = [.205, .190];
  const discInner = .348, discOuter = .946;
  const discSectors = 144;
  const discTextures = new Map();

  function visibleDisc(u, v) {
    const dx = Math.abs(u - .345), dy = Math.abs(v - .254);
    const star = dx / .033 + dy / .035 < 1 || dx < .008 && dy < .10 || dy < .007 && dx < .118;
    return !star && v <= .409 && (u >= .417 || v <= .348);
  }

  function discTexture(scene, size, base) {
    if (discTextures.has(size)) return discTextures.get(size);
    const [cx, cy] = discCenter, [rx, ry] = discRadii;
    const table = colorTable(scene);
    const tracks = Math.max(8, Math.round(size * .118));
    const texture = new Uint8Array(tracks * discSectors);
    for (let track = 0; track < tracks; track++) {
      const offset = track * discSectors;
      const radius = discInner + (discOuter - discInner) * track / (tracks - 1);
      const samples = [];
      for (let sector = 0; sector < discSectors; sector++) {
        const angle = sector * tau / discSectors;
        const u = cx + Math.cos(angle) * rx * radius, v = cy + Math.sin(angle) * ry * radius;
        if (!visibleDisc(u, v)) continue;
        const [x, y] = point(scene, size, u, v).map(Math.floor);
        const ink = base[y * size + x];
        if (!ink) continue;
        texture[offset + sector] = ink;
        samples.push(sector);
      }
      // Bridge the sectors behind the lettering so the texture can make a full turn.
      for (const [index, start] of samples.entries()) {
        const end = samples[index + 1] ?? samples[0] + discSectors;
        if (end - start <= 1) continue;
        const left = table[texture[offset + start]].rgb;
        const right = table[texture[offset + end % discSectors]].rgb;
        for (let sector = start + 1; sector < end; sector++) {
          const progress = (sector - start) / (end - start);
          texture[offset + sector % discSectors] = nearest(scene, left.map((value, channel) =>
            value + (right[channel] - value) * progress));
        }
      }
    }
    const surface = { tracks, texture };
    discTextures.set(size, surface);
    return surface;
  }

  function animateDisc(scene, frame, base, phase) {
    const [cx, cy] = discCenter, [rx, ry] = discRadii;
    const { tracks, texture } = discTexture(scene, frame.size, base);
    patch(scene, frame, [.293, .169, .422, .241], (ink, u, v) => {
      const x = (u - cx) / rx, y = (v - cy) / ry;
      const radius = Math.hypot(x, y);
      if (!ink || radius > discOuter || radius < discInner || !visibleDisc(u, v)) return ink;
      const track = Math.round((radius - discInner) / (discOuter - discInner) * (tracks - 1));
      const sector = Math.round((Math.atan2(y, x) - phase) / tau * discSectors);
      return texture[track * discSectors + (sector + 2 * discSectors) % discSectors] || ink;
    });
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
    const body = table.map(({ rgb: [r, g, b] }) => r > 52 && g < 165 && r > b * 1.43 && r > g * 1.22);
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
          if (r < 59 || g < 52 || r < b * 1.45 || inSun(u, v)) return false;
          // Carry only the yellow edge attached to an animal. The sun's own rim stays fixed.
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
    if (cycle > .25 && cycle < .56) {
      for (const x of [.426, .501]) {
        patch(scene, frame, [x - .02, .386, .04, .023], ink => table[ink].light < 90 ? mint : ink);
        const [px, py] = point(scene, frame.size, x, .406);
        const radius = Math.max(1, Math.floor(frame.size * .013));
        for (let i = -radius; i <= radius; i++) square(frame, px + i, py, 1, 0);
      }
    }
    const controls = [[.304, .51], [.469, .528], [.635, .509]];
    const button = Math.floor(cycle * 4) % controls.length;
    const [u, v] = controls[button];
    patch(scene, frame, [u - .025, v - .012, .05, .027], ink => table[ink].light > 180 ? mint : ink);
    if (cycle < .36 || cycle > 1.06) return;
    const rise = (cycle - .36) / .70;
    const [x, y] = point(scene, frame.size, .629, .417 - rise * .051);
    const cell = Math.max(1, Math.round(frame.size * .011));
    const pixelHeart = [[-1, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [0, 1]];
    for (const [dx, dy] of pixelHeart) square(frame, x + dx * cell, y + dy * cell, cell, 0);
  }

  const vectorKeys = [[0, 0, 0, 0], [.22, -.028, .011, 0], [.36, .036, -.009, 1], [.49, .057, -.005, .84],
    [.65, .023, .009, .44], [.9, 0, 0, 0], [1.5, 0, 0, 0]];

  function animateVector(scene, frame, base, time, red) {
    const [advance, tilt, speed] = pose(time % 1.5, vectorKeys);
    if (!advance && !tilt) return;
    const { size } = frame;
    const [width, height] = scene.placement.slice(2);
    layer(scene, frame, base, [.067, .435, .676, .34], (x, y) => [x - advance * width * size, y - tilt * height * size],
      { select: red, padding: .074 });
    if (speed < .1) return;
    const trail = nearest(scene, [139, 10, 24]);
    const flash = frame.palette.indexOf(scene.accent);
    for (const [u, v, length] of [[.076, .451, .095], [.123, .485, .13], [.204, .513, .106], [.306, .552, .072]]) {
      const width = length * speed;
      const depth = Math.max(.009, 1 / (size * height));
      patch(scene, frame, [u + advance - width, v + tilt, width, depth], (ink, x) => ink || (x > u + advance - width * .34 ? flash : trail));
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
  const laughKeys = [[0, 0], [.12, -.26], [.27, 1], [.38, -.37], [.51, .89], [.63, -.32],
    [.76, .79], [.91, .12], [1.04, -.20], [1.18, .38], [1.37, 0], [1.5, 0]];

  function animateMarquee(scene, frame, base, time, table) {
    const { size } = frame;
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

    const [laugh] = pose(time % 1.5, laughKeys);
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

  const horseOutline = [[134, 147], [137, 114], [152, 103], [168, 102], [163, 91], [169, 78], [194, 62],
    [215, 62], [241, 80], [244, 113], [261, 106], [274, 112], [274, 138], [261, 158], [256, 184],
    [243, 201], [220, 218], [206, 236], [189, 238], [183, 206], [163, 202], [162, 173], [142, 166]];
  const horseHinge = [.493, .552];
  const rearKeys = [[0, 0], [.19, -.071], [.43, .136], [.62, .108], [.78, -.041], [.98, 0], [1.5, 0]];

  function animateHorse(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [angle] = pose(cycle, rearKeys);
    const { size } = frame;
    if (angle) {
      const outline = horseOutline.map(([x, y]) => point(scene, size, x / 410, y / 410));
      const [x, y] = point(scene, size, .670, .244).map(Math.floor);
      rotate(scene, frame, base, [.330, .145, .352, .435], horseHinge, angle, {
        select: (ink, px, py) => table[ink].light < 64 && insideOutline(outline, px + .5, py + .5),
        background: base[y * size + x],
        padding: .052
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
    // Keep the perimeter of the shield fixed even on the coarsest pixel grid.
    const [, top,, bottom] = bounds(scene, size, [0, .12, 1, .51]);
    for (let y = top; y < bottom; y++) {
      const offset = y * size;
      const row = base.subarray(offset, offset + size);
      const left = row.findIndex(Boolean) + 2;
      const right = Math.max(left, row.findLastIndex(Boolean) - 1);
      frame.pixels.set(row.subarray(0, left), offset);
      frame.pixels.set(row.subarray(right), offset + right);
    }
  }

  const crocTail = [[75, 146], [80, 122], [96, 105], [118, 96], [154, 86], [197, 77], [238, 69],
    [242, 86], [207, 99], [168, 110], [135, 120], [115, 135], [109, 148], [89, 157]];
  const crocJaw = [[238, 161], [249, 156], [272, 159], [287, 165], [305, 169], [332, 171],
    [335, 188], [327, 197], [285, 197], [249, 191], [233, 185]];
  const biteKeys = [[0, 0], [.21, .145], [.32, .113], [.46, -.25], [.60, -.217], [.70, .035], [.89, 0], [1.5, 0]];

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
    const [angle] = pose(cycle, biteKeys);
    const jaw = crocJaw.map(([x, y]) => point(scene, size, x / 410, y / 410));
    if (angle) rotate(scene, frame, base, [.565, .373, .259, .113], [.583, .403], angle, {
      select: (ink, x, y) => ink !== 0 && insideOutline(jaw, x + .5, y + .5), padding: .074
    });
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

  const harpStrings = [[177, 58, 171, 77], [187, 65, 179, 89], [197, 69, 184, 103],
    [208, 72, 191, 121], [219, 76, 198, 140], [231, 77, 205, 159], [242, 80, 214, 166]];

  function animateHarp(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const { size } = frame;
    const white = frame.palette.indexOf('#ffffff');
    const gold = frame.palette.indexOf(scene.accent);
    for (const [index, [x0, y0, x1, y1]] of harpStrings.entries()) {
      const age = (cycle - .05 - index * .078) / .47;
      if (age < 0 || age > 1) continue;
      const [sx, sy] = point(scene, size, x0 / 410, y0 / 410);
      const [ex, ey] = point(scene, size, x1 / 410, y1 / 410);
      const swing = Math.sin(age * tau * 2.7) * (1 - age) ** 1.4 * size * .018;
      const reach = Math.max(.54, size * .0070);
      const string = [(x1 - 4) / 410, (y0 - 2) / 410, (x0 - x1 + 8) / 410, (y1 - y0 + 4) / 410];
      layer(scene, frame, base, string, (x, y) => {
        const fret = Math.max(0, Math.min(1, (y + .5 - sy) / (ey - sy)));
        return [x - swing * Math.sin(Math.PI * fret), y];
      }, {
        select: (ink, x, y) => {
          const fret = (y + .5 - sy) / (ey - sy);
          const [r, g, b] = table[ink].rgb;
          return fret >= 0 && fret <= 1 && r > 90 && g > 60 && r > b * 1.65 &&
            Math.abs(x + .5 - (sx + (ex - sx) * fret)) <= reach;
        }
      });
      const fret = .20 + age * .68;
      const x = sx + (ex - sx) * fret + swing * Math.sin(Math.PI * fret);
      square(frame, x, sy + (ey - sy) * fret, 1, age < .36 ? white : gold);
    }
  }

  const serpentKeys = [[0, 0, 0], [.18, .06, .08], [.38, .66, -.18], [.52, 1, -.51],
    [.63, .91, -.35], [.75, 1, -.52], [.90, .45, -.14], [1.13, 0, 0], [1.5, 0, 0]];

  function animateOuroboros(scene, frame, base, time) {
    const cycle = time % 1.5;
    const phase = cycle * tau / 1.5;
    const spring = Math.sin(phase / 2) ** 2;
    const [pull, bite] = pose(cycle, serpentKeys);
    const { size } = frame;
    const textBounds = scene.text.map(rect => bounds(scene, size, rect));
    const inText = (x, y) => textBounds.some(([left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom);

    // A single continuous warp bends the armor and cables together.
    patch(scene, frame, [0, 0, 1, 1], (ink, u, v, x, y) => {
      if (inText(x, y)) return ink;
      const dx = u - .5, dy = v - .5;
      const around = Math.atan2(dy, dx);
      const room = Math.min(1, Math.min(u, 1 - u, v, 1 - v) * 10);
      const section = (around + Math.PI) * 10 / tau + .22;
      const hinge = Math.sin(Math.PI * (section - Math.floor(section))) ** 2;
      const crank = hinge * Math.sin(phase * 2 - Math.floor(section) * .72);
      const tension = .029 * pull + .067 * spring * crank;
      const twist = .027 * spring * hinge * Math.sin(phase * 2 - Math.floor(section) * .72 - .8);
      let su = u + room * (dx * tension - dy * twist);
      let sv = v + room * (dy * tension + dx * twist);

      const tail = Math.max(0, 1 - ((u - .868) / .144) ** 2 - ((v - .355) / .147) ** 2) ** 2;
      su += pull * .046 * tail;
      sv += pull * .068 * tail;

      const jaw = Math.max(0, 1 - ((u - .737) / .147) ** 2 - ((v - .295) / .137) ** 2) ** 2;
      const angle = bite * jaw * Math.max(0, Math.min(1, (v - .205) / .085));
      const jx = su - .643, jy = sv - .198;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      su = .643 + jx * cos + jy * sin;
      sv = .198 - jx * sin + jy * cos;

      const [sourceX, sourceY] = point(scene, size, su, sv).map(Math.floor);
      if (inText(sourceX, sourceY)) return ink;
      if (sourceX < 0 || sourceX >= size || sourceY < 0 || sourceY >= size) return 0;
      return base[sourceY * size + sourceX];
    });
    // Drop lone cells introduced when thin armor edges round onto a new grid position.
    const neighbors = [-size - 1, -size, -size + 1, -1, 1, size - 1, size, size + 1];
    const { pixels } = frame;
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      const index = y * size + x;
      if (!base[index] && pixels[index] && neighbors.every(offset => !pixels[index + offset])) pixels[index] = 0;
    }
  }

  const markKeys = [[0, 0], [.16, -.10], [.41, .37], [.59, .27], [.77, -.105], [1.02, 0], [1.5, 0]];

  function animateRingMark(scene, frame, base, time, phase) {
    const { size } = frame;
    const [angle] = pose(time % 1.5, markKeys);
    const [cx, cy] = point(scene, size, .496, .352);
    if (angle) rotate(scene, frame, base, [.300, .181, .379, .354], [.496, .352], angle,
      { select: (ink, x, y) => ink !== 0 && Math.hypot(x + .5 - cx, y + .5 - cy) < size * .235, padding: .087 });
    const silver = nearest(scene, [146, 146, 146]);
    patch(scene, frame, [.218, .026, .560, .652], (ink, _u, _v, x, y) => {
      const dx = x + .5 - cx, dy = y + .5 - cy;
      const r = Math.hypot(dx, dy) / size;
      const scan = Math.abs(Math.sin((Math.atan2(dy, dx) - phase * 2) / 2));
      return ink && r > .237 && r < .281 && scan < .117 ? silver : ink;
    });
  }

  function animateRedRoof(scene, frame, time) {
    const { size } = frame;
    const ash = nearest(scene, [108, 108, 108]);
    const smoke = nearest(scene, [76, 76, 76]);
    const soot = nearest(scene, [30, 27, 27]);
    const [, roofEdge] = point(scene, size, 0, .064);
    for (let puff = 0; puff < 22; puff++) {
      const age = (time - puff * .111) / 1.01;
      if (age <= 0 || age >= 1) continue;
      const outlet = puff % 4 - 1.5;
      const direction = Math.sign(outlet);
      const drift = outlet * .051 + direction * age * (.066 + (puff % 3) * .020);
      const curl = .029 * Math.sin(age * 4.4 + puff * 1.37) * age;
      const [x, lift] = point(scene, size, .49 + drift + curl, .060 - age * (.151 + (puff % 3) * .013));
      const cell = Math.max(1, Math.round(size * (.017 + age * .025)));
      const y = Math.min(lift, Math.floor(roofEdge) - cell * 1.55);
      if (age < .82) {
        square(frame, x, y, cell * 2 + 1, age < .57 ? smoke : soot);
        square(frame, x + direction * cell * .55, y - cell * .69, cell + 1, age < .63 ? ash : smoke);
        square(frame, x - direction * cell, y + cell * .36, cell, age < .57 ? smoke : soot);
        square(frame, x + cell * .87, y + cell * .68, cell, soot);
      } else {
        square(frame, x - cell, y, Math.max(1, cell - 1), soot);
        square(frame, x + cell, y - cell, 1, smoke);
      }
    }
  }

  const shoeWing = [[263, 60], [278, 42], [318, 30], [383, 28], [435, 18], [440, 32], [428, 53],
    [406, 67], [378, 79], [350, 86], [322, 107], [293, 117], [282, 133], [268, 126], [266, 102], [264, 84]];
  const shoeKeys = [[0, 0], [.23, .21], [.46, -.15], [.63, .17], [.82, -.10], [1.06, 0], [1.5, 0]];

  function animateWingedShoe(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [angle] = pose(cycle, shoeKeys);
    const { size } = frame;
    const wing = shoeWing.map(([x, y]) => point(scene, size, x / 502, y / 404));
    if (angle) rotate(scene, frame, base, [.519, .037, .360, .303], [.553, .208], angle, {
      select: (ink, x, y) => {
        const [r, g, b] = table[ink].rgb;
        return r > 82 && g > 54 && r > b * 1.55 && insideOutline(wing, x + .5, y + .5);
      }, padding: .087
    });
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

  function animateUmbrella(scene, frame, phase, table) {
    const coral = frame.palette.indexOf('#ff6250');
    const silver = frame.palette.indexOf('#c0bdb6');
    const white = frame.palette.indexOf('#ffffff');
    const [cx, cy] = point(scene, frame.size, .506, .313);
    patch(scene, frame, [.267, .02, .475, .573], (ink, _u, _v, x, y) => {
      const dx = x + .5 - cx, dy = y + .5 - cy;
      const { rgb: [r, g, b], light } = table[ink];
      if (Math.hypot(dx, dy) < frame.size * .046 || r < 104) return ink;
      const red = r > g * 1.50 && r > b * 1.43;
      const glow = Math.cos(Math.atan2(dy, dx) - phase * 2);
      if (glow > .92) return red ? coral : light > 158 ? white : ink;
      if (glow < -.62 && light > 180) return silver;
      return ink;
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
    const head = .12 + cycle * .54;
    patch(scene, frame, [.079, .914, .806, .064], (ink, u) => ink === pink && Math.abs(u - head) < .025 ? white : ink);
  }
  function restoreText(scene,frame,base){
    for(const rect of scene.text){
      const [left,top,right,bottom]=bounds(scene,frame.size,rect);
      for(let y=top;y<bottom;y++)frame.pixels.set(base.subarray(y*frame.size+left,y*frame.size+right),y*frame.size+left);
    }
  }
  function animate(scene,frame,time){
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
      case 'tongue':
        animateTongue(scene,frame,base,t);
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
        break;
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
        animateRingMark(scene, frame, base, t, phase);
        break;
      case 'red-roof':
        animateRedRoof(scene, frame, t);
        break;
      case 'winged-shoe':
        animateWingedShoe(scene, frame, base, t, table);
        break;
      case 'flame-type':
        animateFlameType(scene, frame, base, t, phase, table);
        break;
      case 'green-eye':
        animateGreenEye(scene, frame, base, t, table);
        break;
      case 'umbrella':
        animateUmbrella(scene, frame, phase, table);
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
        animateVector(scene, frame, base, t, red);
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
    restoreText(scene,frame,base);
  }
  function addLettering(frame,detail){
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
        pixels.set(ink.subarray(offset,offset+patch.width),(patch.top+row)*size+patch.left);
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
    if(scene.motion==='eye')animateEye(scene,frame,time);
    else animate(scene,frame,time);
    const detail=lettering&&scene.lettering?.[size];
    return detail?addLettering(frame,detail):frame;
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
