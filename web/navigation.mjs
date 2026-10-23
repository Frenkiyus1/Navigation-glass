export const COMMAND = Object.freeze({ OFF: 0, LEFT: 1, RIGHT: 2, STRAIGHT: 3, UTURN: 4 });
export const COMMAND_LABEL = ['Tắt đèn', 'Rẽ trái', 'Rẽ phải', 'Đi thẳng', 'Quay đầu'];
export const MODES = Object.freeze({
  bike: { label: 'Xe đạp', profile: 'bike', backend: 'routed-bike', speed: 4.5 },
  foot: { label: 'Đi bộ', profile: 'foot', backend: 'routed-foot', speed: 1.4 },
  car: { label: 'Ô tô', profile: 'driving', backend: 'routed-car', speed: 8.3 }
});
const RAD = Math.PI / 180;

export function validPoint(p) {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
}

// Application coordinates are [latitude, longitude]; OSRM uses [longitude, latitude].
export function distance(a, b) {
  const p = (b[0] - a[0]) * RAD, q = (b[1] - a[1]) * RAD;
  const h = Math.sin(p / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(q / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  return meters < 1000 ? `${Math.max(0, Math.round(meters / 5) * 5)} m` : `${(meters / 1000).toFixed(1)} km`;
}
export function formatDuration(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}
export function parseCoordinates(text) {
  const match = String(text).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const point = [Number(match[1]), Number(match[2])];
  return validPoint(point) ? point : null;
}
export function maneuverCommand(maneuver = {}) {
  if (maneuver.type === 'arrive') return COMMAND.OFF;
  const modifier = String(maneuver.modifier || '').toLowerCase();
  if (modifier.includes('uturn') || modifier.includes('u-turn')) return COMMAND.UTURN;
  if (modifier.includes('left')) return COMMAND.LEFT;
  if (modifier.includes('right')) return COMMAND.RIGHT;
  if (modifier === 'straight' || maneuver.type === 'depart') return COMMAND.STRAIGHT;
  return COMMAND.OFF;
}
export function instruction(step) {
  const maneuver = step.maneuver || {};
  const name = step.name ? ` vào ${step.name}` : '';
  if (maneuver.type === 'arrive') return 'Đến điểm đến';
  if (maneuver.type === 'depart') return step.name ? `Xuất phát theo ${step.name}` : 'Bắt đầu hành trình';
  if (maneuver.type === 'roundabout' || maneuver.type === 'rotary') {
    return maneuver.exit ? `Vào vòng xuyến, đi lối ra ${maneuver.exit}` : 'Đi vào vòng xuyến';
  }
  const command = maneuverCommand(maneuver);
  return command === COMMAND.OFF ? (step.name ? `Tiếp tục theo ${step.name}` : 'Tiếp tục theo tuyến đường') : `${COMMAND_LABEL[command]}${name}`;
}

export function prepareRoute(response) {
  const raw = response?.routes?.[0];
  if (response?.code !== 'Ok' || !raw?.geometry?.coordinates?.length || !raw?.legs?.length) {
    throw new Error('Không tìm được tuyến phù hợp. Hãy chọn điểm gần đường hơn.');
  }
  const coordinates = raw.geometry.coordinates.map(p => [p[1], p[0]]);
  if (coordinates.length < 2 || !coordinates.every(validPoint)) throw new Error('Dữ liệu tuyến đường không hợp lệ.');
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i++) cumulative.push(cumulative[i - 1] + distance(coordinates[i - 1], coordinates[i]));
  if (cumulative.at(-1) < 1) throw new Error('Hai điểm quá gần nhau. Hãy chọn điểm đến khác.');
  let cursor = 0;
  const steps = raw.legs.flatMap(leg => leg.steps || []).map(step => {
    if (!step.maneuver?.location) throw new Error('Tuyến đường thiếu chỉ dẫn rẽ.');
    const point = [step.maneuver.location[1], step.maneuver.location[0]];
    let best = Infinity, index = cursor;
    for (let i = cursor; i < coordinates.length; i++) {
      const d = distance(point, coordinates[i]);
      if (d < best) { best = d; index = i; }
      if (d < 0.25) break;
    }
    cursor = index;
    return { ...step, point, at: cumulative[index], command: maneuverCommand(step.maneuver), text: instruction(step) };
  });
  if (steps.length < 2) throw new Error('Tuyến đường chưa có đủ chỉ dẫn.');
  return { coordinates, cumulative, steps, length: cumulative.at(-1), distance: raw.distance, duration: raw.duration };
}

export function projectOnRoute(route, point, previous = 0, maxAdvance = Infinity) {
  let best = { distance: Infinity, progress: previous, segment: 0, point: route.coordinates[0] };
  let score = Infinity;
  const scaleX = 111320 * Math.cos(point[0] * RAD), scaleY = 111320;
  for (let i = 0; i < route.coordinates.length - 1; i++) {
    if (route.cumulative[i + 1] < previous - 25 || route.cumulative[i] > previous + maxAdvance) continue;
    const a = route.coordinates[i], b = route.coordinates[i + 1];
    const ax = (a[1] - point[1]) * scaleX, ay = (a[0] - point[0]) * scaleY;
    const dx = (b[1] - a[1]) * scaleX, dy = (b[0] - a[0]) * scaleY;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    const progress = route.cumulative[i] + t * (route.cumulative[i + 1] - route.cumulative[i]);
    // Prefer the earlier segment at crossings to avoid jumping across route loops.
    const candidate = d + Math.max(0, progress - previous) * 0.0001;
    if (candidate < score) {
      score = candidate;
      best = { distance: d, progress: Math.max(previous, progress), segment: i,
        point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] };
    }
  }
  return best;
}
export function pointAt(route, progress) {
  const target = Math.max(0, Math.min(route.length, progress));
  let i = route.cumulative.findIndex(value => value >= target);
  if (i <= 0) return [...route.coordinates[0]];
  const t = (target - route.cumulative[i - 1]) / (route.cumulative[i] - route.cumulative[i - 1] || 1);
  return route.coordinates[i - 1].map((v, axis) => v + t * (route.coordinates[i][axis] - v));
}
export function guidanceAt(route, progress, alertDistance = 180) {
  const stepIndex = route.steps.findIndex((step, index) => index > 0 && step.at >= progress - 8);
  const index = stepIndex < 0 ? route.steps.length - 1 : stepIndex;
  const step = route.steps[index];
  const remaining = Math.max(0, route.length - progress);
  const untilTurn = Math.max(0, step.at - progress);
  return { step, index, remaining, untilTurn, command: untilTurn <= alertDistance ? step.command : COMMAND.OFF };
}
export function usableFix(fix, now = Date.now()) {
  return Boolean(fix && validPoint(fix.point) && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 &&
    fix.accuracy <= 50 && Number.isFinite(fix.timestamp) && now - fix.timestamp >= -1000 && now - fix.timestamp <= 15000);
}
export function safeGuidanceCommand({ active, visible, simulated, fix, offRoute, guidance }, now = Date.now()) {
  if (!active || !visible || offRoute || !guidance || (!simulated && !usableFix(fix, now))) return COMMAND.OFF;
  return guidance.command;
}
