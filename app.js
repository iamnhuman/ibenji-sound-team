(function () {
  'use strict';

  const { render, rgba } = window.PixelArt;
  const { clips, duration, frameAt, frameRate } = window.PixelMotion;
  const { encodePng, encodeGif } = window.PixelExport;
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('artwork');
  const context = canvas.getContext('2d', { alpha: false });
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
  const filmstrip = document.getElementById('filmstrip');
  const filmPrev = document.getElementById('film-prev');
  const filmNext = document.getElementById('film-next');
  const thumbnails = clips.map(createThumbnail);
  const visibleCount = Math.min(4, thumbnails.length);
  const lastWindow = thumbnails.length - visibleCount;
  const gridButtons = [...resolutionOptions.querySelectorAll('button')];
  let grid = Number(gridButtons.find(button => button.getAttribute('aria-pressed') === 'true').dataset.size);
  let playing = true;
  let playhead = startFromHash();
  let active = -1;
  let animationFrame = 0;
  let previousTimestamp = null;
  let lastStep = -1;
  let zoom = .65;
  let fitCellSize;
  let cellSize;
  let imageData;
  let currentFrame;
  let wheelTravel = 0;
  let lastWheelTime = -Infinity;
  let firstVisible = 0;
  let gifClip = 0;

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
    const label = document.createElement('span');
    label.className = 'frame-number';
    label.dataset.pixelLabel = '';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = String(number);
    button.append(thumbnail, label);
    filmstrip.append(button);
    return button;
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
    if (playing && !document.hidden) animationFrame = requestAnimationFrame(tick);
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
    if (event.ctrlKey || event.metaKey || !event.deltaY) return;
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

  function updateExportSize() {
    const size = `${grid} × ${grid} px`;
    download.title = `Скачать PNG ${size}`;
    download.setAttribute('aria-label', download.title);
    gifSize.textContent = size;
    resolution.setAttribute('aria-label', `Разрешение ${grid} на ${grid} пикселей`);
    resolutionValue.textContent = `${grid} PX`;
    drawControlLabels([resolutionValue]);
  }

  function showResolutionMenu(open, returnFocus = false) {
    resolutionOptions.hidden = !open;
    resolution.setAttribute('aria-expanded', String(open));
    if (open) {
      showGifMenu(false);
      gridButtons.find(button => Number(button.dataset.size) === grid).focus();
    } else if (returnFocus) resolution.focus();
  }

  function showGifMenu(open, returnFocus = false) {
    gifOptions.hidden = !open;
    gif.setAttribute('aria-expanded', String(open));
    if (open) {
      showResolutionMenu(false);
      gifClip = active;
      const { number } = clips[gifClip];
      gifSlide.textContent = `Слайд №${number}`;
      gifCurrent.setAttribute('aria-label', `Current slide. Скачать логотип №${number}`);
      if (!gifFull.disabled) gifFull.focus();
    } else if (returnFocus) gif.focus();
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

  function downloadFrame() {
    const size = grid;
    saveFile(encodePng(currentFrame, size), 'image/png', `ibenji-${clips[active].number}-${size}x${size}.png`);
  }

  async function downloadAnimation(clipIndex) {
    if (gifFull.disabled) return;
    const size = grid;
    gifFull.disabled = true;
    gifCurrent.disabled = true;
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
  filmPrev.addEventListener('click', () => stepClip(-1));
  filmNext.addEventListener('click', () => stepClip(1));
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    stepClip(event.key === 'ArrowRight' ? 1 : -1);
  });
  download.addEventListener('click', downloadFrame);
  resolution.addEventListener('click', () => showResolutionMenu(resolutionOptions.hidden, true));
  gif.addEventListener('click', () => showGifMenu(gifOptions.hidden, true));
  gifFull.addEventListener('click', () => downloadAnimation());
  gifCurrent.addEventListener('click', () => downloadAnimation(gifClip));
  document.addEventListener('pointerdown', event => {
    if (!gifOptions.hidden && !gifControl.contains(event.target)) showGifMenu(false);
    if (!resolutionOptions.hidden && !resolutionControl.contains(event.target)) showResolutionMenu(false);
  });
  resolutionControl.addEventListener('focusout', event => {
    if (!resolutionOptions.hidden && !resolutionControl.contains(event.relatedTarget)) showResolutionMenu(false);
  });
  resolutionControl.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !resolutionOptions.hidden) {
      event.preventDefault();
      showResolutionMenu(false, true);
      return;
    }
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    if (resolutionOptions.hidden) showResolutionMenu(true);
    else {
      const index = gridButtons.indexOf(document.activeElement);
      const next = (index + direction + gridButtons.length) % gridButtons.length;
      gridButtons[next].focus();
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
    playhead = startFromHash();
    revealClip(Math.floor(playhead / (clips[0].end - clips[0].start)));
    paint();
    syncPlayback();
  });

  drawControlLabels();
  showFilmstrip(0);
  updateExportSize();
  new ResizeObserver(fitArtwork).observe(stage);
  window.addEventListener('resize', fitArtwork);
  paint();
  syncPlayback();
})();
