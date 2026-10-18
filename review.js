import * as THREE from 'three';
import { MAX_COMMENTS, MAX_REVIEW_BYTES, parseReview, serializeReview, mergeReviews, validateComment } from './review-data.js';

const STORAGE_KEY = 'hozblock-architect-review-v1';
const labels = { west: 'Стеллаж вдоль дальней стены', north: 'Стеллаж рядом с подвесами', return: 'Повёрнутый стеллаж',
  bins: 'Секции с ящиками', mowers: 'Стойка Makita и Greenworks', bike: 'Велосипед на подвесе', barrow: 'Тачка на подвесе',
  ladder: 'Лестница', tools: 'Стойка садового инструмента' };

export function createReviewer({ canvas, camera, roots, modelVersion, variant, getView, restoreView, capturePreview, pause, requestRender }) {
  const el = id => document.getElementById(id);
  const panel = el('review-panel'), editor = el('review-editor'), list = el('review-list'), markers = el('review-markers');
  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let comments = [], selected = '', pending = null, picking = false, down = null, deleted = null, storageAvailable = true;
  let markerEntries = [];

  function message(text, error = false) {
    el('review-message').textContent = text;
    el('review-message').dataset.error = String(error);
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) comments = parseReview(saved);
  } catch {
    storageAvailable = false;
    message('Не удалось прочитать локальное сохранение. Оно не перезаписано. Новые замечания можно скачать файлом.', true);
  }
  function persist() {
    if (!storageAvailable) { message('Автосохранение недоступно. Скачайте замечания файлом перед закрытием страницы.', true); return false; }
    try { localStorage.setItem(STORAGE_KEY, serializeReview(comments)); return true; }
    catch { message('Браузер не сохранил изменения. Скачайте замечания файлом перед закрытием страницы.', true); return false; }
  }
  function openPanel(open) {
    panel.hidden = !open;
    document.querySelector('.sidebar').inert = open;
    el('review-toggle').setAttribute('aria-expanded', String(open));
  }
  function setPicking(value) {
    picking = value; down = null;
    document.body.dataset.reviewPicking = String(value);
    el('review-pick-hint').hidden = !value;
    if (value) { pause(); openPanel(false); canvas.focus({ preventScroll: true }); }
  }
  function resolve(c) {
    if (c.modelVersion !== modelVersion) return null;
    let object = roots[c.anchor.root];
    for (const index of c.anchor.path) object = object?.children[index];
    return object?.isMesh ? object : null;
  }
  function worldPoint(c) {
    const object = resolve(c);
    return object ? object.localToWorld(new THREE.Vector3(...c.anchor.point)) : new THREE.Vector3(...c.anchor.world);
  }
  function visible(object) {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return true;
  }
  function go(c) {
    setPicking(false);
    if (c.view.variant !== variant) {
      const url = new URL(location.href);
      if (c.view.variant === 'mono') url.searchParams.set('roof', 'mono'); else url.searchParams.delete('roof');
      url.searchParams.set('review', c.id);
      url.hash = c.view.mode === 'inside' ? 'interior' : '';
      if (!persist()) { openPanel(true); message('Перед сменой кровли скачайте замечания: браузер не смог сохранить их автоматически.', true); return; }
      location.assign(url); return;
    }
    pause();
    const restored = restoreView(c.view);
    selected = c.id; openPanel(true); drawList(); requestRender();
    if (!resolve(c) || !restored) message('Модель или расстановка изменилась. Сверьте ориентировочную метку с сохранённым снимком.', true);
    else message(`Замечание №${comments.indexOf(c) + 1}: восстановлен сохранённый ракурс.`);
  }
  function button(text, action, label) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', action); return b;
  }
  function edit(c) {
    pending = c;
    el('review-editor-title').textContent = comments.some(row => row.id === c.id) ? 'Изменить замечание' : 'Новое замечание';
    el('review-element').textContent = c.element;
    el('review-author').value = c.author;
    el('review-text').value = c.text;
    el('review-editor-error').textContent = '';
    editor.showModal(); el('review-text').focus();
  }
  function drawList() {
    if (deleted && comments.some(c => c.id === deleted.comment.id)) deleted = null;
    el('review-undo').hidden = !deleted;
    list.replaceChildren(); markers.replaceChildren(); markerEntries = [];
    el('review-count').textContent = comments.length;
    el('review-empty').hidden = comments.length > 0;
    el('review-export').disabled = !comments.length;
    el('review-add').disabled = comments.length >= MAX_COMMENTS;
    comments.forEach((c, i) => {
      const li = document.createElement('li'); li.dataset.selected = String(selected === c.id);
      const title = document.createElement('h3'); title.textContent = `${i + 1}. ${c.element}`;
      const author = document.createElement('small');
      author.textContent = `${c.author || 'Без имени'} · ${new Date(c.updatedAt).toLocaleString('ru-RU')}`;
      const text = document.createElement('p'); text.textContent = c.text;
      li.append(title, author, text);
      if (c.preview) { const image = document.createElement('img'); image.src = c.preview; image.alt = `Сохранённый вид для замечания ${i + 1}`; image.loading = 'lazy'; li.append(image); }
      if (c.modelVersion !== modelVersion) { const warning = document.createElement('p'); warning.textContent = 'Замечание к другой редакции модели. Сверяйте снимок.'; li.append(warning); }
      const actions = document.createElement('div'); actions.className = 'review-card-actions';
      actions.append(button('Показать', () => go(c), `Показать замечание ${i + 1}`),
        button('Изменить', () => edit(c), `Изменить замечание ${i + 1}`),
        button('Удалить', () => {
          deleted = { comment: c, index: i }; comments.splice(i, 1); persist(); drawList(); requestRender();
          el('review-undo').hidden = false; message('Замечание удалено. Удаление можно отменить.');
        }, `Удалить замечание ${i + 1}`));
      li.append(actions); list.append(li);
      const pin = button(String(i + 1), () => go(c), `Замечание ${i + 1}: ${c.element}`);
      pin.className = 'review-marker'; pin.setAttribute('aria-pressed', String(c.id === selected)); pin.hidden = true;
      pin.title = c.text; markers.append(pin); markerEntries.push({ comment: c, pin });
    });
  }
  function pointAnchor(object, point) {
    for (const [root, parent] of Object.entries(roots)) {
      const path = [];
      for (let node = object; node && node !== parent; node = node.parent) {
        if (!node.parent) break;
        path.unshift(node.parent.children.indexOf(node));
        if (node.parent === parent) return { root, path, point: object.worldToLocal(point.clone()).toArray(), world: point.toArray() };
      }
      if (object === parent) return { root, path: [], point: object.worldToLocal(point.clone()).toArray(), world: point.toArray() };
    }
    return null;
  }
  function elementName(object, root) {
    for (let node = object; node; node = node.parent) {
      if (labels[node.name]) return labels[node.name];
      if (root === 'car' && /Sotra|Turtle/.test(node.name)) return node.name;
    }
    if (root === 'car') return 'Geely Monjaro';
    if (root === 'paving') return 'Мощение площадки';
    if (root === 'street') return 'Улица перед въездом';
    return object.name || object.parent?.name || 'Элемент модели';
  }
  canvas.addEventListener('pointerdown', event => {
    if (!picking || event.button !== 0) return;
    event.stopImmediatePropagation(); down = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, true);
  canvas.addEventListener('pointerup', event => {
    if (!picking || down?.id !== event.pointerId) return;
    event.stopImmediatePropagation();
    const start = down; down = null;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
    const rect = canvas.getBoundingClientRect();
    mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld(); Object.values(roots).forEach(root => root.updateMatrixWorld(true));
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(Object.values(roots), true).find(h => h.object.isMesh && visible(h.object));
    if (!hit) { el('review-pick-hint').querySelector('span').textContent = 'Выберите конструкцию, мебель, машину или мощение.'; return; }
    const anchor = pointAnchor(hit.object, hit.point);
    if (!anchor) return;
    const view = getView();
    let preview = '';
    try { preview = capturePreview(hit.point); } catch { /* Текст, точка и ракурс сохранятся и без миниатюры. */ }
    const date = new Date().toISOString();
    let author = '';
    try { author = localStorage.getItem(STORAGE_KEY + '-author') || ''; } catch { /* Имя можно ввести в форме. */ }
    setPicking(false);
    const id = crypto.randomUUID?.() ?? [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
    edit({ id, element: elementName(hit.object, anchor.root), author, text: '',
      createdAt: date, updatedAt: date, modelVersion, anchor, view, preview });
  }, true);
  el('review-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const comment = validateComment({ ...pending, author: el('review-author').value.trim(), text: el('review-text').value.trim(), updatedAt: new Date().toISOString() });
      const next = [...comments], index = next.findIndex(c => c.id === comment.id);
      if (index < 0) { if (next.length >= MAX_COMMENTS) throw new Error('Можно сохранить до 200 замечаний.'); next.push(comment); } else next[index] = comment;
      comments = next; selected = comment.id; const saved = persist();
      try { localStorage.setItem(STORAGE_KEY + '-author', comment.author); } catch { /* На сохранение текста не влияет. */ }
      editor.close(); openPanel(true); drawList(); requestRender();
      if (saved) message('Замечание сохранено в этом браузере. Для передачи скачайте файл.');
    } catch (error) { el('review-editor-error').textContent = error.message; }
  });
  el('review-cancel').addEventListener('click', () => { editor.close(); openPanel(true); });
  editor.addEventListener('cancel', () => openPanel(true));
  el('review-toggle').addEventListener('click', () => { setPicking(false); openPanel(panel.hidden); });
  el('review-close').addEventListener('click', () => { openPanel(false); el('review-toggle').focus(); });
  el('review-add').addEventListener('click', () => { el('review-pick-hint').querySelector('span').textContent = 'Нажмите на элемент модели для замечания'; setPicking(true); });
  el('review-pick-cancel').addEventListener('click', () => { setPicking(false); openPanel(true); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && picking) { setPicking(false); openPanel(true); } });
  el('review-undo').addEventListener('click', () => {
    if (!deleted || comments.length >= MAX_COMMENTS) return;
    comments.splice(deleted.index, 0, deleted.comment); deleted = null; el('review-undo').hidden = true;
    persist(); drawList(); requestRender(); message('Замечание восстановлено.');
  });
  el('review-export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([serializeReview(comments)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `hozblock-comments-${new Date().toISOString().slice(0, 10)}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); message('Файл замечаний скачан. Его можно передать вместе со ссылкой на модель.');
  });
  el('review-import').addEventListener('click', () => el('review-file').click());
  el('review-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > MAX_REVIEW_BYTES) throw new Error('Файл больше 15 МБ.');
      const incoming = parseReview(await file.text());
      comments = mergeReviews(comments, incoming); const saved = persist(); drawList(); requestRender();
      if (saved) message(`Файл загружен. Всего замечаний: ${comments.length}. Совпадающие метки объединены по дате изменения.`);
    } catch (error) { message(error.message, true); }
    finally { event.target.value = ''; }
  });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { comments = parseReview(event.newValue); drawList(); requestRender(); }
    catch { message('Не удалось прочитать изменения из другой вкладки.', true); }
  });
  drawList();
  return {
    ready() {
      const requested = new URLSearchParams(location.search).get('review');
      const comment = comments.find(c => c.id === requested);
      if (comment) go(comment);
    },
    update() {
      const viewMode = document.body.dataset.mode, rect = canvas.getBoundingClientRect();
      for (const { comment: c, pin } of markerEntries) {
        const object = resolve(c);
        if (c.view.mode !== viewMode || c.view.variant !== variant || (object && !visible(object))) { pin.hidden = true; continue; }
        const point = worldPoint(c), projected = point.clone().project(camera);
        if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) { pin.hidden = true; continue; }
        const direction = point.clone().sub(camera.position), distance = direction.length();
        raycaster.set(camera.position, direction.normalize());
        const obstruction = raycaster.intersectObjects(Object.values(roots), true).find(h => h.object.isMesh && visible(h.object));
        pin.hidden = Boolean(obstruction && obstruction.distance < distance - 0.035);
        pin.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
        pin.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
      }
    },
  };
}
