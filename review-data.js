export const MAX_REVIEW_BYTES = 15 * 1024 * 1024;
export const MAX_COMMENTS = 200;

const fail = () => { throw new Error('Некорректный файл замечаний. Нужен JSON, скачанный из этой модели.'); };
const string = (v, max, required = false) => {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail();
  return v;
};
const number = (v, min, max) => { if (!Number.isFinite(v) || v < min || v > max) fail(); return v; };
const bool = v => { if (typeof v !== 'boolean') fail(); return v; };
const choice = (v, choices) => { if (!choices.includes(v)) fail(); return v; };
const vector = v => {
  if (!Array.isArray(v) || v.length !== 3) fail();
  return v.map(n => number(n, -200, 200));
};
const date = v => { string(v, 30, true); if (!Number.isFinite(Date.parse(v))) fail(); return v; };

export function validateComment(c) {
  if (!c || !/^[\w-]{1,80}$/.test(c.id)) fail();
  const a = c.anchor, v = c.view, s = v?.scene, w = v?.walker, camera = v?.camera;
  if (!a || !v || !s || !w || !camera || !Array.isArray(a.path) || a.path.length > 16
    || a.path.some(i => !Number.isInteger(i) || i < 0 || i > 10000)) fail();
  const position = vector(camera.position), target = vector(camera.target);
  if (Math.hypot(...position.map((n, i) => n - target[i])) < 0.01) fail();
  const preview = string(c.preview ?? '', 600000);
  if (preview && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(preview)) fail();
  return {
    id: c.id, element: string(c.element, 160, true), author: string(c.author, 80), text: string(c.text, 3000, true),
    createdAt: date(c.createdAt), updatedAt: date(c.updatedAt), modelVersion: string(c.modelVersion, 100, true),
    anchor: { root: choice(a.root, ['building', 'site', 'car', 'paving', 'street', 'interior']),
      path: [...a.path], point: vector(a.point), world: vector(a.world) },
    view: {
      variant: choice(v.variant, ['mono', 'flat']), mode: choice(v.mode, ['inside', 'outside']), plan: bool(v.plan),
      walker: { x: number(w.x, 0.299, 5.701), z: number(w.z, 5.399, 8.801), yaw: number(w.yaw, -100000, 100000), pitch: number(w.pitch, -1.2, 1.2) },
      camera: { position, target, fov: number(camera.fov, 35, 85) },
      scene: { route: choice(s.route, ['canopy', 'outside', 'hidden']), box: bool(s.box),
        mountLift: number(s.mountLift, 0, 200), time: number(s.time, 0, 60), lid: choice(s.lid, ['closed', 'left', 'right']),
        entrance: bool(s.entrance), roof: bool(s.roof), fascia: bool(s.fascia), dimensions: bool(s.dimensions), routes: bool(s.routes) },
    }, preview,
  };
}

export function serializeReview(comments) {
  return JSON.stringify({ format: 'hozblock-architect-review', version: 1, comments }, null, 2);
}

export function parseReview(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_REVIEW_BYTES) fail();
  let doc;
  try { doc = JSON.parse(text); } catch { fail(); }
  if (doc?.format !== 'hozblock-architect-review' || doc.version !== 1 || !Array.isArray(doc.comments) || doc.comments.length > MAX_COMMENTS) fail();
  const comments = doc.comments.map(validateComment);
  if (new Set(comments.map(c => c.id)).size !== comments.length) fail();
  return comments;
}

export function mergeReviews(existing, incoming) {
  const merged = new Map(existing.map(c => [c.id, c]));
  for (const comment of incoming) {
    const previous = merged.get(comment.id);
    if (!previous || Date.parse(comment.updatedAt) > Date.parse(previous.updatedAt)) merged.set(comment.id, comment);
  }
  if (merged.size > MAX_COMMENTS) throw new Error('В одном наборе может быть не больше 200 замечаний.');
  return [...merged.values()];
}
