(function () {
  'use strict';

  const { render, rgba } = window.PixelArt;
  const { clips, duration, frameAt, frameRate } = window.PixelMotion;
  const { encodePng, encodeGif } = window.PixelExport;
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('artwork');
  const context = canvas.getContext('2d', { alpha: false });
  const gallery = document.getElementById('gallery');
  const galleryArtwork = document.getElementById('gallery-artwork');
  const galleryContext = galleryArtwork.getContext('2d', { alpha: false });
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryToggle = document.getElementById('gallery-toggle');
  const galleryEdit = document.getElementById('gallery-edit');
  const galleryTools = document.getElementById('gallery-tools');
  const galleryRemove = document.getElementById('gallery-remove');
  const galleryCancel = document.getElementById('gallery-cancel');
  const gallerySave = document.getElementById('gallery-save');
  const galleryStatus = document.getElementById('gallery-status');
  const galleryEndpoint = '/__dev/gallery';
  const controls = galleryToggle.closest('.controls');
  const artwork = document.createElement('canvas');
  const artworkContext = artwork.getContext('2d', { alpha: false });
  const playback = document.getElementById('playback');
  const zoomOut = document.getElementById('zoom-out');
  const zoomIn = document.getElementById('zoom-in');
  const resolutionControl = document.getElementById('resolution-control');
  const resolution = document.getElementById('resolution');
  const resolutionOptions = document.getElementById('resolution-options');
  const resolutionValue = document.getElementById('resolution-value');
  const download = document.getElementById('download');
  const gif = document.getElementById('gif');
  const gifControl = document.getElementById('gif-control');
  const gifOptions = document.getElementById('gif-options');
  const gifFull = document.getElementById('gif-full');
  const gifCurrent = document.getElementById('gif-current');
  const gifSize = document.getElementById('gif-size');
  const gifSlide = document.getElementById('gif-slide');
  const exportStatus = document.getElementById('export-status');
  const browserSave = document.getElementById('browser-save');
  const filmstrip = document.getElementById('filmstrip');
  const filmPrev = document.getElementById('film-prev');
  const filmNext = document.getElementById('film-next');
  const thumbnails = clips.map(createThumbnail);
  const gallerySources = new Map(clips.map(({ scene }, index) => [scene.id, index]));
  const gallerySample = 100;
  const sheetColumns = 10;
  const visibleCount = Math.min(4, thumbnails.length);
  const lastWindow = thumbnails.length - visibleCount;
  const gridButtons = [...resolutionOptions.querySelectorAll('button')];
  const launch = new URLSearchParams(location.search);
  const editReturn = history.state?.galleryEditReturn;
  const launchExport = launch.get('export');
  const exportLink = ['png', 'gif-current', 'gif-full'].includes(launchExport);
  const launchTime = launch.has('at') ? Number(launch.get('at')) : NaN;
  const telegramOrigin = 'https://web.telegram.org';
  const telegramPlatform = new URLSearchParams(location.hash.slice(1)).get('tgWebAppPlatform');
  const telegramFrame = window.parent !== window &&
    (document.referrer.startsWith(telegramOrigin + '/') || telegramPlatform?.startsWith('web'));
  const inTelegram = Boolean(window.Telegram?.WebApp?.initData || window.TelegramWebviewProxy?.postEvent ||
    telegramFrame || telegramPlatform || /\bTelegram\b/i.test(navigator.userAgent));
  const initialGrid = gridButtons.find(button => exportLink && button.dataset.size === launch.get('px'))
    ?? gridButtons.find(button => button.getAttribute('aria-pressed') === 'true');
  const initialZoom = .65;
  for (const button of gridButtons) button.setAttribute('aria-pressed', String(button === initialGrid));
  let grid = Number(initialGrid.dataset.size);
  let playing = editReturn?.playing ?? !exportLink;
  const launchPosition = editReturn?.at ?? (exportLink ? launchTime : NaN);
  let playhead = Number.isFinite(launchPosition) && launchPosition >= 0 && launchPosition < duration ? launchPosition : startFromHash();
  let active = -1;
  let animationFrame = 0;
  let previousTimestamp = null;
  let lastStep = -1;
  let zoom = initialZoom;
  let fitCellSize;
  let cellSize;
  let imageData;
  let currentFrame;
  let paintedAt = playhead;
  let wheelTravel = 0;
  let lastWheelTime = -Infinity;
  let firstVisible = 0;
  let gifClip = 0;
  let gallerySheet;
  let galleryColumns = 1;
  let galleryTiles = [];
  let galleryRevision;
  let draft;
  let selected = -1;
  let dragged = -1;
  let dropTile;
  let saving = false;

  function createFrameNumber(number) {
    const label = document.createElement('span');
    label.className = 'frame-number';
    label.dataset.pixelLabel = '';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = String(number);
    return label;
  }

  function createThumbnail({ scene, number }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'frame-button';
    button.dataset.scene = scene.id;
    button.setAttribute('aria-label', `${number}. ${scene.title}`);
    const thumbnail = document.createElement('canvas');
    thumbnail.width = 46;
    thumbnail.height = 46;
    thumbnail.setAttribute('aria-hidden', 'true');
    button.append(thumbnail, createFrameNumber(number));
    filmstrip.append(button);
    return button;
  }

  function createGalleryTile(scene, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gallery-tile';
    button.tabIndex = -1;
    button.dataset.scene = scene.id;
    button.setAttribute('aria-label', `${index + 1}. ${scene.title}`);
    button.style.setProperty('--tile-accent', scene.accent);
    button.append(createFrameNumber(index + 1));
    if (draft) {
      button.draggable = true;
      button.setAttribute('aria-pressed', 'false');
    }
    button.addEventListener('click', () => {
      if (draft) {
        if (!saving) {
          if (selected >= 0 && selected !== index) moveDraft(selected, index);
          else selectDraft(selected === index ? -1 : index);
        }
        return;
      }
      setGallery(false);
      seek(index);
      galleryToggle.focus({ preventScroll: true });
    });
    return button;
  }

  function refreshGallery(focusIndex = active, focus = false) {
    const scenes = draft ?? clips.map(({ scene }) => scene);
    galleryTiles = scenes.map(createGalleryTile);
    galleryGrid.replaceChildren(...galleryTiles);
    drawControlLabels(galleryGrid.querySelectorAll('[data-pixel-label]'));
    const focused = galleryTiles[Math.max(0, Math.min(focusIndex, galleryTiles.length - 1))];
    focused.tabIndex = 0;
    galleryTiles.find(tile => tile.dataset.scene === clips[active]?.scene.id)?.setAttribute('aria-current', 'true');
    if (!gallery.hidden) fitGallery();
    if (focus) focused.focus({ preventScroll: true });
  }

  function createGallerySheet() {
    const sheet = document.createElement('canvas');
    sheet.width = sheetColumns * gallerySample;
    sheet.height = Math.ceil(clips.length / sheetColumns) * gallerySample;
    const sheetContext = sheet.getContext('2d', { alpha: false });
    for (const [index, { scene }] of clips.entries()) {
      const frame = render(scene.id, gallerySample);
      sheetContext.putImageData(new ImageData(rgba(frame), frame.size, frame.size),
        index % sheetColumns * gallerySample, Math.floor(index / sheetColumns) * gallerySample);
    }
    return sheet;
  }

  function fitGallery() {
    const bounds = stage.getBoundingClientRect();
    const density = Math.min(window.devicePixelRatio || 1, 3072 / Math.max(bounds.width, bounds.height, 1));
    const width = Math.floor((bounds.width - 16) * density);
    const height = Math.floor((bounds.height - 8) * density);
    const count = galleryTiles.length;
    let columns = 1, rows = count, tile = 1;
    // Fit the largest square tiles possible in the stage, including the final row.
    for (let across = 1; across <= count; across++) {
      const down = Math.ceil(count / across);
      const size = Math.floor(Math.min(width / across, height / down));
      if (size < tile || (size === tile && across * down >= columns * rows)) continue;
      columns = across;
      rows = down;
      tile = size;
    }
    const compact = tile / density < 52;
    gallery.style.width = `${columns * tile / density}px`;
    gallery.style.height = `${rows * tile / density}px`;
    gallery.style.setProperty('--gallery-columns', columns);
    gallery.style.setProperty('--gallery-rows', rows);
    gallery.classList.toggle('compact', compact);

    const side = Math.max(1, Math.floor(Math.min(tile * .89, tile - (compact ? 11 : 17) * density)));
    const left = Math.floor((tile - side) / 2);
    const top = Math.floor((tile - side) / 4);
    galleryColumns = columns;
    galleryArtwork.width = columns * tile;
    galleryArtwork.height = rows * tile;
    galleryContext.imageSmoothingEnabled = false;
    gallerySheet ??= createGallerySheet();
    for (const [index, button] of galleryTiles.entries()) {
      const source = gallerySources.get(button.dataset.scene);
      galleryContext.drawImage(gallerySheet,
        source % sheetColumns * gallerySample, Math.floor(source / sheetColumns) * gallerySample, gallerySample, gallerySample,
        index % columns * tile + left, Math.floor(index / columns) * tile + top, side, side);
    }
  }

  function fitStage() {
    if (gallery.hidden) fitArtwork();
    else fitGallery();
  }

  function setGallery(open) {
    gallery.hidden = !open;
    canvas.hidden = open;
    stage.dataset.view = controls.dataset.view = open ? 'gallery' : 'slideshow';
    stage.setAttribute('aria-label', open ? 'Все логотипы' : 'Анимация логотипов');
    galleryToggle.setAttribute('aria-pressed', String(open));
    galleryToggle.title = open ? 'Вернуться к анимации' : 'Все логотипы';
    if (open) {
      playhead = paintedAt;
      resetArtworkTouch();
      showResolutionMenu(false);
      showGifMenu(false);
      for (const [index, button] of galleryTiles.entries()) {
        button.tabIndex = index === active ? 0 : -1;
        if (index === active) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      }
    }
    fitStage();
    syncPlayback();
  }

  function syncGalleryEditor(message) {
    galleryEdit.hidden = !galleryRevision || Boolean(draft);
    galleryEdit.disabled = gifFull.disabled;
    galleryToggle.hidden = Boolean(draft);
    galleryTools.hidden = !draft;
    if (draft) gallery.dataset.editing = '';
    else delete gallery.dataset.editing;
    const changed = draft && (draft.length !== clips.length || draft.some((scene, index) => scene !== clips[index].scene));
    gallerySave.disabled = saving || !changed;
    galleryCancel.disabled = saving;
    galleryRemove.disabled = saving || !draft || selected < 0 || draft.length === 1;
    if (message !== undefined) galleryStatus.textContent = message;
  }

  async function enableGalleryEditor() {
    if (exportLink || location.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(location.hostname)) return;
    try {
      const response = await fetch(galleryEndpoint, { cache: 'no-store' });
      if (!response.ok) return;
      const { ids, revision } = await response.json();
      if (typeof revision !== 'string' || !Array.isArray(ids) || ids.length !== clips.length ||
          !ids.every((id, index) => id === clips[index].scene.id)) return;
      galleryRevision = revision;
      syncGalleryEditor();
    } catch {
      // Static servers and file previews do not provide the development editor.
    }
  }

  function selectDraft(index) {
    galleryTiles[selected]?.setAttribute('aria-pressed', 'false');
    selected = index;
    galleryTiles[selected]?.setAttribute('aria-pressed', 'true');
    syncGalleryEditor(index < 0 ? 'Перетащи логотип или выбери две позиции.' : `Выбран №${index + 1}. Укажи новое место или нажми «Удалить».`);
  }

  function moveDraft(from, to) {
    if (!draft || saving || from < 0 || to < 0 || from === to) return;
    const [scene] = draft.splice(from, 1);
    draft.splice(to, 0, scene);
    selected = -1;
    refreshGallery(to, true);
    syncGalleryEditor(`Перемещён с №${from + 1} на №${to + 1}.`);
  }

  function removeDraft(index) {
    if (!draft || saving || draft.length <= 1 || index < 0) return;
    draft.splice(index, 1);
    selected = -1;
    refreshGallery(index, true);
    syncGalleryEditor(`Логотип №${index + 1} убран из черновика.`);
  }

  function clearGalleryDrag() {
    dropTile?.classList.remove('drop-target');
    dropTile = undefined;
    dragged = -1;
  }

  function cancelGalleryEdit() {
    if (saving) return;
    clearGalleryDrag();
    selected = -1;
    draft = undefined;
    syncGalleryEditor('');
    refreshGallery();
    galleryEdit.focus({ preventScroll: true });
  }

  async function saveGalleryEdit() {
    if (gallerySave.disabled) return;
    saving = true;
    syncGalleryEditor('Сохраняю порядок…');
    try {
      const response = await fetch(galleryEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: galleryRevision, ids: draft.map(scene => scene.id) })
      });
      if (!response.ok) {
        throw new Error(response.status === 409 ? 'Галерея изменилась на диске. Обнови страницу.' : 'Не удалось сохранить порядок. Попробуй ещё раз.');
      }
      const clip = clips[active];
      const found = draft.indexOf(clip.scene);
      const next = found >= 0 ? found : Math.min(active, draft.length - 1);
      const elapsed = found >= 0 ? Math.max(0, paintedAt - clip.start) : 0;
      const url = new URL(location.href);
      url.hash = draft[next].id;
      try {
        history.replaceState({ ...history.state, galleryEditReturn: { at: next * (clip.end - clip.start) + elapsed, playing } }, '', url);
      } catch {
        // The saved order also loads if the browser restricts history state.
      }
      location.reload();
    } catch (error) {
      saving = false;
      syncGalleryEditor(error instanceof TypeError ? 'Связь с локальным сервером потеряна. Попробуй ещё раз.' : error.message);
    }
  }

  function showFilmstrip(start) {
    firstVisible = Math.max(0, Math.min(lastWindow, start));
    for (const [index, button] of thumbnails.entries()) {
      button.hidden = index < firstVisible || index >= firstVisible + visibleCount;
    }
    filmPrev.hidden = lastWindow === 0;
    filmNext.hidden = lastWindow === 0;
  }

  function revealClip(index) {
    if (index < firstVisible) showFilmstrip(index);
    else if (index >= firstVisible + visibleCount) showFilmstrip(index - visibleCount + 1);
  }

  function startFromHash() {
    return clips.find(clip => clip.scene.id === location.hash.slice(1))?.start ?? 0;
  }

  function fitArtwork() {
    if (!currentFrame) return;
    const bounds = stage.getBoundingClientRect();
    const density = window.devicePixelRatio || 1;
    const available = Math.floor(Math.min(bounds.width - 12, bounds.height - 8, 860) * density);
    const artworkSize = currentFrame.artworkSize ?? currentFrame.size;
    // Zoom in whole physical pixels per art cell to keep square edges sharp.
    fitCellSize = Math.max(1, Math.floor(available / artworkSize));
    const maxCellSize = fitCellSize * 3;
    cellSize = Math.min(maxCellSize, Math.max(1, Math.round(fitCellSize * zoom)));
    zoomOut.disabled = cellSize === 1;
    zoomIn.disabled = cellSize === maxCellSize;
    const side = artworkSize * cellSize / density;
    canvas.style.width = `${side}px`;
    canvas.style.height = `${side}px`;
    canvas.style.left = `${Math.round((bounds.left + (bounds.width - side) / 2) * density) / density - bounds.left}px`;
    canvas.style.top = `${Math.round((bounds.top + (bounds.height - side) / 2) * density) / density - bounds.top}px`;
    drawArtwork();
  }

  function drawArtwork() {
    // Native canvas saves and the export buttons use the same dimensions.
    if (canvas.width !== grid || canvas.height !== grid) {
      canvas.width = grid;
      canvas.height = grid;
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(artwork, 0, 0, grid, grid);
  }

  function paint() {
    const { frame, index, progress } = frameAt(playhead, grid);
    currentFrame = frame;
    paintedAt = playhead;
    const gridChanged = imageData?.width !== frame.size;
    if (gridChanged) {
      artwork.width = frame.size;
      artwork.height = frame.size;
      imageData = artworkContext.createImageData(frame.size, frame.size);
    }
    rgba(frame, imageData.data);
    artworkContext.putImageData(imageData, 0, 0);
    if (gridChanged) fitArtwork();
    else drawArtwork();

    if (index !== active) {
      const { scene, number } = clips[index];
      thumbnails[active]?.removeAttribute('aria-current');
      thumbnails[index].setAttribute('aria-current', 'true');
      document.documentElement.style.setProperty('--accent', scene.accent ?? scene.palette[2] ?? scene.palette[1]);
      canvas.setAttribute('aria-label', `Пиксельный логотип IBENJI №${number}. ${scene.title}`);
      active = index;
      const focused = document.activeElement;
      revealClip(index);
      if (focused?.hidden && filmstrip.contains(focused)) thumbnails[index].focus({ preventScroll: true });
    }
    thumbnails[index].style.setProperty('--progress', Math.floor(progress * 13) / 13);
  }

  function tick(timestamp) {
    if (previousTimestamp !== null) {
      playhead = (playhead + (timestamp - previousTimestamp) / 1000) % duration;
    }
    previousTimestamp = timestamp;
    const step = Math.floor(timestamp * frameRate / 1000);
    if (step !== lastStep) {
      paint();
      lastStep = step;
    }
    animationFrame = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    cancelAnimationFrame(animationFrame);
    previousTimestamp = null;
    lastStep = -1;
    playback.dataset.playing = String(playing);
    const label = playing ? 'Пауза' : 'Воспроизвести';
    playback.setAttribute('aria-label', label);
    playback.title = label;
    if (playing && gallery.hidden && !document.hidden) animationFrame = requestAnimationFrame(tick);
  }

  function seek(index) {
    const { scene, start } = clips[index];
    revealClip(index);
    playhead = start;
    const hash = `#${scene.id}`;
    if (location.hash !== hash) {
      try { history.replaceState(null, '', hash); }
      catch { location.hash = hash; }
    }
    paint();
    syncPlayback();
  }

  function stepClip(direction) {
    const focusThumbnail = filmstrip.contains(document.activeElement);
    const next = (active + direction + clips.length) % clips.length;
    seek(next);
    if (focusThumbnail) thumbnails[next].focus();
  }

  function drawControlLabels(labels = document.querySelectorAll('[data-pixel-label]')) {
    const glyphs = {
      0: ['111', '101', '101', '101', '111'],
      1: ['010', '110', '010', '010', '111'],
      2: ['111', '001', '111', '100', '111'],
      3: ['111', '001', '111', '001', '111'],
      4: ['101', '101', '111', '001', '001'],
      5: ['111', '100', '111', '001', '111'],
      6: ['111', '100', '111', '101', '111'],
      7: ['111', '001', '010', '010', '010'],
      8: ['111', '101', '111', '101', '111'],
      9: ['111', '101', '111', '001', '111'],
      C: ['011', '100', '100', '100', '011'],
      D: ['110', '101', '101', '101', '110'],
      E: ['111', '100', '110', '100', '111'],
      F: ['111', '100', '110', '100', '100'],
      G: ['111', '100', '101', '101', '111'],
      I: ['111', '010', '010', '010', '111'],
      L: ['100', '100', '100', '100', '111'],
      N: ['101', '111', '111', '101', '101'],
      P: ['110', '101', '110', '100', '100'],
      R: ['110', '101', '110', '101', '101'],
      S: ['111', '100', '111', '001', '111'],
      T: ['111', '010', '010', '010', '010'],
      U: ['101', '101', '101', '101', '111'],
      X: ['101', '101', '010', '101', '101'],
      ' ': ['000', '000', '000', '000', '000']
    };
    const namespace = 'http://www.w3.org/2000/svg';
    for (const label of labels) {
      const value = [...label.textContent.trim()];
      const width = value.length * 4 - 1;
      let squares = '';
      for (const [index, digit] of value.entries()) {
        glyphs[digit].forEach((row, y) => {
          for (let x = 0; x < row.length; x++) {
            if (row[x] === '1') squares += `M${index * 4 + x} ${y}h1v1h-1z`;
          }
        });
      }
      const svg = document.createElementNS(namespace, 'svg');
      svg.setAttribute('viewBox', `0 0 ${width} 5`);
      svg.setAttribute('width', width * 2);
      svg.setAttribute('height', 10);
      const path = document.createElementNS(namespace, 'path');
      path.setAttribute('d', squares);
      svg.append(path);
      label.replaceChildren(svg);
    }
  }

  function changeZoom(step) {
    const next = cellSize + step;
    if (next < 1 || next > fitCellSize * 3) return;
    zoom = next / fitCellSize;
    fitArtwork();
  }

  function zoomWithWheel(event) {
    if (!gallery.hidden || event.ctrlKey || event.metaKey || !event.deltaY) return;
    event.preventDefault();
    const direction = Math.sign(event.deltaY);
    if (event.deltaMode !== 0) {
      changeZoom(-direction);
      return;
    }
    if (event.timeStamp - lastWheelTime > 160 || Math.sign(wheelTravel) !== direction) wheelTravel = 0;
    lastWheelTime = event.timeStamp;
    wheelTravel += event.deltaY;
    if (Math.abs(wheelTravel) >= 40) {
      changeZoom(-direction);
      wheelTravel = 0;
    }
  }

  function enableArtworkTouch() {
    const pointers = new Map();
    const tapDelay = 260;
    const tapSlop = 12;
    let tapStart;
    let pendingTap;
    let pinch;

    function distance(a, b) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    function clearTap() {
      clearTimeout(pendingTap?.timer);
      pendingTap = null;
    }

    function advanceTap() {
      const next = pendingTap.next;
      clearTap();
      if (!document.hidden) seek(next);
    }

    function finishTap(event) {
      if (pendingTap && event.timeStamp - pendingTap.point.timeStamp <= tapDelay &&
          distance(event, pendingTap.point) <= 40) {
        clearTap();
        zoom = zoom > 1 ? initialZoom : 1.55;
        fitArtwork();
        return;
      }
      if (pendingTap) advanceTap();
      pendingTap = { point: event, next: (active + 1) % clips.length, timer: setTimeout(advanceTap, tapDelay) };
    }

    function startPinch() {
      if (pointers.size !== 2) {
        pinch = null;
        return;
      }
      const [first, second] = pointers.values();
      pinch = { distance: Math.max(1, distance(first, second)), zoom: cellSize / fitCellSize };
    }

    stage.addEventListener('pointerdown', event => {
      if (!gallery.hidden || event.pointerType !== 'touch') return;
      const { left, top, right, bottom } = stage.getBoundingClientRect();
      if (event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom) return;
      event.target.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, event);
      tapStart = pointers.size === 1 && resolutionOptions.hidden && gifOptions.hidden ? event : null;
      if (pointers.size > 1) clearTap();
      startPinch();
    });

    stage.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, event);
      if (tapStart && distance(tapStart, event) > tapSlop) tapStart = null;
      if (!pinch) return;
      const [first, second] = pointers.values();
      const next = pinch.zoom * distance(first, second) / pinch.distance;
      zoom = Math.max(1 / fitCellSize, Math.min(3, next));
      if (Math.round(fitCellSize * zoom) !== cellSize) fitArtwork();
    });

    function endTouch(event) {
      if (!pointers.delete(event.pointerId)) return;
      if (event.type === 'pointerup' && tapStart && pointers.size === 0 &&
          event.timeStamp - tapStart.timeStamp <= 320 && distance(tapStart, event) <= tapSlop) finishTap(event);
      tapStart = null;
      startPinch();
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, endTouch);
    return () => {
      clearTap();
      pointers.clear();
      tapStart = null;
      pinch = null;
    };
  }

  function updateExportSize() {
    const size = `${grid} × ${grid} px`;
    download.title = `Скачать PNG ${size}`;
    download.setAttribute('aria-label', download.title);
    gifSize.textContent = size;
    resolution.setAttribute('aria-label', `Разрешение ${grid} на ${grid} пикселей`);
    resolutionValue.textContent = `${grid} PX`;
    drawControlLabels([resolutionValue]);
    if (!browserSave.hidden) browserSave.textContent = `Скачать ${launchExport === 'png' ? 'PNG' : 'GIF'} · ${size}`;
  }

  function showResolutionMenu(open, focus = false) {
    resolutionOptions.hidden = !open;
    resolution.setAttribute('aria-expanded', String(open));
    if (open) {
      showGifMenu(false);
      if (focus) gridButtons.find(button => Number(button.dataset.size) === grid).focus({ preventScroll: true });
    } else if (focus) resolution.focus({ preventScroll: true });
  }

  function showGifMenu(open, focus = false) {
    gifOptions.hidden = !open;
    gif.setAttribute('aria-expanded', String(open));
    if (open) {
      showResolutionMenu(false);
      gifClip = active;
      const { number } = clips[gifClip];
      gifSlide.textContent = `Слайд №${number}`;
      gifCurrent.setAttribute('aria-label', `Current slide. Скачать логотип №${number}`);
      if (focus && !gifFull.disabled) gifFull.focus({ preventScroll: true });
    } else if (focus) gif.focus({ preventScroll: true });
  }

  function saveFile(bytes, type, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function openBrowserExport(format, index, time) {
    const url = new URL(location.href);
    url.search = new URLSearchParams({ export: format, px: grid, at: time });
    url.hash = clips[index].scene.id;
    const eventType = 'web_app_open_link';
    const eventData = { url: url.href };
    try {
      if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url.href);
      else if (window.TelegramWebviewProxy?.postEvent) window.TelegramWebviewProxy.postEvent(eventType, JSON.stringify(eventData));
      else if (telegramFrame) window.parent.postMessage(JSON.stringify({ eventType, eventData }), telegramOrigin);
      else if (window.external?.notify) window.external.notify(JSON.stringify({ eventType, eventData }));
      else window.open(url.href, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(url.href, '_blank', 'noopener,noreferrer');
    }
  }

  function downloadFrame() {
    if (inTelegram) {
      openBrowserExport('png', active, paintedAt);
      return;
    }
    const size = grid;
    saveFile(encodePng(currentFrame, size), 'image/png', `ibenji-${clips[active].number}-${size}x${size}.png`);
    browserSave.hidden = true;
  }

  async function downloadAnimation(clipIndex) {
    if (gifFull.disabled) return;
    if (inTelegram) {
      openBrowserExport(clipIndex === undefined ? 'gif-full' : 'gif-current', clipIndex ?? active,
        clipIndex === undefined ? paintedAt : clips[clipIndex].start);
      showGifMenu(false, true);
      return;
    }
    const size = grid;
    browserSave.hidden = true;
    gifFull.disabled = true;
    gifCurrent.disabled = true;
    syncGalleryEditor();
    gif.dataset.exporting = 'true';
    exportStatus.hidden = false;
    const setProgress = progress => {
      const status = `GIF ${size}×${size} · ${Math.floor(progress * 10) * 10}%`;
      if (exportStatus.textContent !== status) exportStatus.textContent = status;
    };
    setProgress(0);
    try {
      const bytes = await encodeGif(size, { clipIndex, onProgress: setProgress });
      const target = clipIndex === undefined ? 'loop' : clips[clipIndex].number;
      saveFile(bytes, 'image/gif', `ibenji-${target}-${size}x${size}.gif`);
      if (!gifOptions.hidden) showGifMenu(false, true);
      exportStatus.hidden = true;
    } catch (error) {
      console.error(error);
      exportStatus.textContent = 'Не удалось собрать GIF. Попробуй ещё раз.';
    } finally {
      gifFull.disabled = false;
      gifCurrent.disabled = false;
      syncGalleryEditor();
      delete gif.dataset.exporting;
    }
  }

  for (const [index, button] of thumbnails.entries()) {
    const thumbnail = button.querySelector('canvas');
    const thumbnailContext = thumbnail.getContext('2d', { alpha: false });
    const frame = render(clips[index].scene.id, thumbnail.width);
    thumbnailContext.putImageData(new ImageData(rgba(frame), frame.size, frame.size), 0, 0);
    button.addEventListener('click', () => seek(index));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = clips.length - 1;
      else return;
      event.preventDefault();
      seek(next);
      thumbnails[next].focus();
    });
  }

  for (const button of gridButtons) {
    button.addEventListener('click', () => {
      grid = Number(button.dataset.size);
      for (const option of gridButtons) option.setAttribute('aria-pressed', String(option === button));
      updateExportSize();
      showResolutionMenu(false, true);
      paint();
    });
  }

  playback.addEventListener('click', () => {
    playing = !playing;
    if (playing) revealClip(active);
    syncPlayback();
  });
  zoomOut.addEventListener('click', () => changeZoom(-1));
  zoomIn.addEventListener('click', () => changeZoom(1));
  stage.addEventListener('wheel', zoomWithWheel, { passive: false });
  const resetArtworkTouch = enableArtworkTouch();
  galleryToggle.addEventListener('click', event => {
    const open = gallery.hidden;
    setGallery(open);
    if (open && event.detail === 0) galleryTiles[active].focus({ preventScroll: true });
  });
  galleryEdit.addEventListener('click', () => {
    if (!galleryRevision || galleryEdit.disabled || gallery.hidden) return;
    draft = clips.map(({ scene }) => scene);
    syncGalleryEditor('Перетащи логотип или выбери две позиции.');
    refreshGallery(active, true);
  });
  galleryRemove.addEventListener('click', () => removeDraft(selected));
  galleryCancel.addEventListener('click', cancelGalleryEdit);
  gallerySave.addEventListener('click', saveGalleryEdit);
  galleryGrid.addEventListener('dragstart', event => {
    const index = galleryTiles.indexOf(event.target.closest('.gallery-tile'));
    if (!draft || saving || index < 0) {
      event.preventDefault();
      return;
    }
    dragged = index;
    selectDraft(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draft[index].id);
  });
  galleryGrid.addEventListener('dragover', event => {
    if (dragged < 0 || saving) return;
    const tile = event.target.closest('.gallery-tile');
    dropTile?.classList.remove('drop-target');
    dropTile = tile;
    if (!tile || tile === galleryTiles[dragged]) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    tile.classList.add('drop-target');
  });
  galleryGrid.addEventListener('drop', event => {
    if (dragged < 0) return;
    event.preventDefault();
    const from = dragged;
    const to = galleryTiles.indexOf(event.target.closest('.gallery-tile'));
    clearGalleryDrag();
    moveDraft(from, to);
  });
  galleryGrid.addEventListener('dragend', clearGalleryDrag);
  galleryGrid.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const index = galleryTiles.indexOf(event.target);
    if (index < 0) return;
    if (draft && ['Backspace', 'Delete'].includes(event.key)) {
      event.preventDefault();
      removeDraft(index);
      return;
    }
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -galleryColumns, ArrowDown: galleryColumns };
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = galleryTiles.length - 1;
    else if (Object.hasOwn(moves, event.key)) next = Math.max(0, Math.min(galleryTiles.length - 1, index + moves[event.key]));
    else return;
    event.preventDefault();
    galleryTiles[index].tabIndex = -1;
    galleryTiles[next].tabIndex = 0;
    galleryTiles[next].focus({ preventScroll: true });
  });
  filmPrev.addEventListener('click', () => stepClip(-1));
  filmNext.addEventListener('click', () => stepClip(1));
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!gallery.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (draft) cancelGalleryEdit();
        else {
          setGallery(false);
          galleryToggle.focus({ preventScroll: true });
        }
      }
      return;
    }
    if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    stepClip(event.key === 'ArrowRight' ? 1 : -1);
  });
  download.addEventListener('click', downloadFrame);
  resolution.addEventListener('click', event => showResolutionMenu(resolutionOptions.hidden, event.detail === 0));
  gif.addEventListener('click', event => showGifMenu(gifOptions.hidden, event.detail === 0));
  gifFull.addEventListener('click', () => downloadAnimation());
  gifCurrent.addEventListener('click', () => downloadAnimation(gifClip));
  browserSave.addEventListener('click', () => {
    if (launchExport === 'png') {
      downloadFrame();
      download.focus({ preventScroll: true });
    } else {
      showGifMenu(true);
      downloadAnimation(launchExport === 'gif-current' ? gifClip : undefined);
      gif.focus({ preventScroll: true });
    }
  });
  function dismissMenusOutside({ target }) {
    if (!gifOptions.hidden && !gifControl.contains(target)) showGifMenu(false);
    if (!resolutionOptions.hidden && !resolutionControl.contains(target)) showResolutionMenu(false);
  }
  document.addEventListener('pointerdown', dismissMenusOutside);
  // Some WebViews blur a button on tap without giving the next button focus.
  document.addEventListener('focusin', dismissMenusOutside);
  resolutionControl.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !resolutionOptions.hidden) {
      event.preventDefault();
      showResolutionMenu(false, true);
      return;
    }
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    if (resolutionOptions.hidden) showResolutionMenu(true, true);
    else {
      const index = gridButtons.indexOf(document.activeElement);
      const next = (index + direction + gridButtons.length) % gridButtons.length;
      gridButtons[next].focus({ preventScroll: true });
    }
  });
  gifControl.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !gifOptions.hidden) {
      event.preventDefault();
      showGifMenu(false, true);
    }
  });
  document.addEventListener('visibilitychange', syncPlayback);
  window.addEventListener('hashchange', () => {
    if (saving) return;
    if (draft) cancelGalleryEdit();
    if (!gallery.hidden) setGallery(false);
    playhead = startFromHash();
    revealClip(Math.floor(playhead / (clips[0].end - clips[0].start)));
    paint();
    syncPlayback();
  });

  drawControlLabels();
  refreshGallery();
  showFilmstrip(0);
  browserSave.hidden = !exportLink || inTelegram;
  updateExportSize();
  new ResizeObserver(fitStage).observe(stage);
  window.addEventListener('resize', fitStage);
  paint();
  if (editReturn) {
    history.replaceState(null, '', location.href);
    setGallery(true);
  } else syncPlayback();
  enableGalleryEditor();
  if (!browserSave.hidden) browserSave.focus({ preventScroll: true });
})();
