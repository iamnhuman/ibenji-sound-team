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
  function blink(scene,frame,base,rect,center,open){
    const [,cy]=point(scene,frame.size,...center),table=colorTable(scene);
    layer(scene,frame,base,rect,(x,y)=>[x,cy+(y-cy)/Math.max(.12,open)],{select:ink=>ink!==0&&table[ink].neutral});
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

  function animateDisc(scene, frame, base, phase) {
    const { size } = frame;
    const white = frame.palette.indexOf('#ffffff');
    const cyan = frame.palette.indexOf(scene.accent);
    const lit = shadeMap(scene, .23);
    const star = (u, v) => {
      const x = Math.abs(u - .345), y = Math.abs(v - .254);
      return x / .033 + y / .035 < 1 || x < .008 && y < .10 || y < .007 && x < .118;
    };
    const cx = .505, cy = .359, rx = .207, ry = .190;
    patch(scene, frame, [.292, .163, .423, .255], (ink, u, v) => {
      const x = (u - cx) / rx, y = (v - cy) / ry;
      const radius = Math.hypot(x, y);
      if (!ink || radius > .987 || radius < .348 || star(u, v)) return ink;
      const turn = Math.atan2(y, x) - phase * 2;
      const reflection = Math.abs(Math.sin((turn - .63) / 2));
      if (radius > .943) return reflection < .080 ? white : ink;
      // Reuse the visible upper sectors of the CD for the sectors behind the title.
      const face = Math.max(-3.01, Math.min(-.014, -Math.acos(Math.cos(turn))));
      let su = cx + Math.cos(face) * rx * radius;
      let sv = cy + Math.sin(face) * ry * radius;
      if (star(su, sv) || (su < .417 && sv > .347)) {
        const clear = face < -Math.PI / 2 ? face + .36 : face - .36;
        su = cx + Math.cos(clear) * rx * radius;
        sv = cy + Math.sin(clear) * ry * radius;
      }
      const [sx, sy] = point(scene, size, su, sv).map(Math.floor);
      const texture = base[sy * size + sx] || ink;
      if (radius > .55 && reflection < .034) return radius > .87 ? white : cyan;
      if (radius > .38 && reflection < .094) return lit[texture];
      return texture;
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
        const cheekLine = y > 306 && y < 316 && x > 226 && x < 320;
        return cheekLine ? shade : cranium || x > 300 && y > 473 ? edge : temple ? shade : bone;
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

  function animateStreamDisc(scene, frame, base, time, table) {
    const { size } = frame;
    const phase = time * tau / 1.5;
    const lime = frame.palette.indexOf(scene.accent);
    const shadow = nearest(scene, [21, 107, 45]);
    const green = ink => {
      const [r, g, b] = table[ink].rgb;
      return g > 63 && g > r * 1.55 && g > b * 1.25;
    };
    patch(scene, frame, [.325, .235, .353, .225], (ink, u, v, x, y) => {
      const width = (u - .503) / .176;
      const taper = Math.max(0, 1 - width ** 2);
      if (v > .458 || v < .242 || !taper) return ink;
      const shift = Math.round(size * .023 * taper * Math.sin(phase * 2 - (v - .242) * 13));
      return base[(y - shift) * size + x];
    });
    layer(scene, frame, base, [.647, .122, .202, .391], (x, y) => [x - size * .022 * Math.sin(phase), y + size * .014 * Math.sin(phase * 2)], {
      select: (ink, x, y) => green(ink) && (((x + .5) / size - .499) / .216) ** 2 + (((y + .5) / size - .349) / .218) ** 2 > 1.02,
      padding: .035
    });
    const cycle = time % 1.5;
    for (let bit = 0; bit < 9; bit++) {
      const age = (cycle - bit * .079) / .68;
      if (age < 0 || age > 1) continue;
      const [x, y] = point(scene, size, .692 + age * (.089 + bit % 3 * .026), .177 + bit * .035 + Math.sin(phase + bit) * age * .024);
      const side = Math.max(1, Math.round(size * .012 * (1 - age * .48)));
      square(frame, x, y, side, age > .67 ? shadow : lime);
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
    patch(scene, frame, [.355, .375, .284, .157], (ink, u, v, x, y) => {
      const start = .394 + (u - .494) * .10;
      const height = (v - start) / (.532 - start);
      const width = (u - .496) / .147;
      if (height < 0 || height > 1 || Math.abs(width) >= 1) return ink;
      // The lips hold at the corners while the lower teeth and cheek stretch together.
      const drop = laugh * .045 * Math.sin(height * Math.PI) * height ** .80 * (1 - width ** 2);
      return base[Math.round(y - drop * size) * size + x];
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

  // The inner field of the crest keeps the black horse separate from the shield outline.
  const shieldField = [[119, 95], [158, 74], [194, 60], [230, 61], [267, 75], [293, 92], [290, 143],
    [273, 184], [246, 220], [205, 252], [168, 220], [146, 187], [127, 145]];
  const rearKeys = [[0, 0], [.19, -.071], [.43, .136], [.62, .108], [.78, -.041], [.98, 0], [1.5, 0]];

  function animateHorse(scene, frame, base, time, table) {
    const cycle = time % 1.5;
    const [angle] = pose(cycle, rearKeys);
    const { size } = frame;
    if (angle) {
      const outline = shieldField.map(([x, y]) => point(scene, size, x / 410, y / 410));
      const [x, y] = point(scene, size, .670, .244).map(Math.floor);
      rotate(scene, frame, base, [.330, .145, .352, .435], [.493, .552], angle, {
        select: (ink, px, py) => table[ink].light < 64 && insideOutline(outline, px + .5, py + .5),
        background: base[y * size + x],
        padding: .052
      });
    }
    const green = frame.palette.indexOf('#98c04d');
    const pale = frame.palette.indexOf('#cbd96d');
    const shade = frame.palette.indexOf('#557929');
    for (let puff = 0; puff < 3; puff++) {
      const age = (cycle - .39 - puff * .11) / .56;
      if (age < 0 || age > 1) continue;
      const [x, y] = point(scene, size, .567 + age * (.227 + puff * .024), .397 - age * (.063 + puff * .026));
      const cell = Math.max(1, Math.round(size * (.012 + Math.sin(Math.PI * age) * .013)));
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

  function animateReactor(scene, frame, base, phase) {
    const { size } = frame;
    const cosine = Math.cos(phase), sine = Math.sin(phase);
    patch(scene, frame, [.353, .135, .294, .294], (ink, u, v) => {
      const dx = u - .5, dy = v - .283;
      if (dx ** 2 + dy ** 2 > .132 ** 2) return ink;
      const [x, y] = point(scene, size, .5 + dx * cosine + dy * sine, .283 + dy * cosine - dx * sine).map(Math.floor);
      return base[y * size + x];
    });
  }

  const ouroborosGears = [[466, 194, 35], [211, 394, 37], [273, 1001, 39], [807, 1114, 39], [891, 233, 36]];

  function animateOuroboros(scene, frame, base, phase, table) {
    const { size } = frame;
    const silver = frame.palette.indexOf('#bfccd8');
    const steel = frame.palette.indexOf('#8795a6');
    const white = frame.palette.indexOf('#ffffff');
    patch(scene, frame, [.011, .013, .977, .973], (ink, u, v) => {
      if (!ink || table[ink].light < 110) return ink;
      const dx = u - .5, dy = v - .51;
      const radius = dx ** 2 + dy ** 2;
      if (radius < .33 ** 2 || radius > .52 ** 2) return ink;
      const distance = Math.abs(Math.sin((Math.atan2(dy, dx) - phase) / 2));
      return distance < .035 ? white : distance < .122 ? silver : ink;
    });
    for (const [index, [rawX, rawY, rawRadius]] of ouroborosGears.entries()) {
      const u = rawX / 1254, v = rawY / 1254, r = rawRadius / 1254;
      const turn = phase * (index % 2 ? -2 : 2);
      const cosine = Math.cos(turn), sine = Math.sin(turn);
      patch(scene, frame, [u - r, v - r, r * 2, r * 2], (ink, x, y) => {
        const dx = x - u, dy = y - v;
        const distance = Math.hypot(dx, dy);
        if (distance > r) return ink;
        const spoke = Math.abs(Math.sin((Math.atan2(dy, dx) - turn) * 2));
        if (distance < r * .67 && distance > r * .14 && spoke < .21) return steel;
        const [sx, sy] = point(scene, size, u + dx * cosine + dy * sine, v + dy * cosine - dx * sine).map(Math.floor);
        return base[sy * size + sx];
      });
    }
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
    patch(scene, frame, [.105, .920, .765, .047], (ink, u) => ink === pink && Math.abs(u - head) < .025 ? white : ink);
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
    const blinkOpen=1-.9*Math.max(0,1-Math.abs(t-.46)/.24);
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
      case 'moon':
        blink(scene,frame,base,[.46,.36,.12,.08],[.52,.40],blinkOpen);
        patch(scene,frame,[.59,.09,.18,.18],ink=>ink?light[ink]:ink);
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
      case 'reactor':
        animateReactor(scene, frame, base, phase);
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
        animateOuroboros(scene, frame, base, phase, table);
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
        const flex = .13 * Math.sin(phase * 2);
        const edges = { select: neutral, padding: .045 };
        rotate(scene, frame, base, [.035, .44, .145, .51], [.18, .52], flex, edges);
        rotate(scene, frame, base, [.82, .44, .145, .51], [.82, .52], -flex, edges);
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
