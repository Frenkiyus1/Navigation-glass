import { COMMAND, COMMAND_LABEL, MODES, distance, formatDistance, formatDuration, parseCoordinates, validPoint, prepareRoute, projectOnRoute, pointAt, guidanceAt, usableFix, safeGuidanceCommand } from './navigation.mjs';
import { GlassesBluetooth } from './bluetooth.mjs';
const $ = id => document.getElementById(id);
const state = { mode:'bike', origin:null, destination:null, route:null, active:false, simulated:false, progress:0, fix:null, guidance:null, offRoute:false, follow:true, pickTarget:null, manual:null, voice:false, busy:false, alertDistance:180, generation:0, searchGeneration:0 };
let config = { tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', searchUrl:'https://photon.komoot.io/api/', routingBaseUrl:'https://routing.openstreetmap.de' };
let map, routeLayer, originMarker, destinationMarker, userMarker, gpsWatch, simulationTimer, wakeLock;
let routeController, searchController, lastRouteRequest=0, lastSearchRequest=0, toastTimer, lastSpoken='', currentListIndex=-1;
const routeCache = new Map(), searchCache = new Map();
const symbols = ['stop','left','right','arrow','uturn'];
const svg = name => `<svg class="icon small" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const ble = new GlassesBluetooth(navigator.bluetooth, (status, message) => {
  $('connectionPill').className = `connection-pill ${status}`;
  $('connectionLabel').textContent = message;
  $('connectButton').classList.toggle('connected', status === 'connected');
  $('connectButton').querySelector('span').textContent = status === 'connected' ? 'Ngắt kính' : 'Kết nối kính';
  $('connectButton').disabled = status === 'connecting';
  if (status === 'error') toast(message);
  updateHud();
});
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 5500);
}
function banner(message='') { $('statusBanner').hidden = !message; $('statusMessage').textContent = message; }
function errorMessage(error) {
  if (error.name === 'AbortError') return 'Yêu cầu quá lâu. Kiểm tra kết nối Internet rồi thử lại.';
  if (error instanceof TypeError) return 'Không kết nối được dịch vụ. Kiểm tra Internet hoặc chọn điểm trực tiếp trên bản đồ.';
  return error.message || 'Chưa thực hiện được. Hãy thử lại.';
}
async function jsonRequest(url, { signal, timeout=18000 }={}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once:true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(url, { signal:controller.signal });
    if (!response.ok) throw new Error(response.status === 429 ? 'Dịch vụ đang giới hạn lượt truy cập. Hãy chờ một chút rồi thử lại.' : 'Dịch vụ bản đồ tạm thời chưa phản hồi. Hãy thử lại sau.');
    return await response.json();
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
function readRecent() {
  try { return JSON.parse(localStorage.getItem('navi-glass-recent') || '[]').filter(p => validPoint(p.point) && typeof p.name === 'string' && p.name.length < 201).slice(0,3); } catch { return []; }
}
function saveRecent(place) {
  const recent = [place, ...readRecent().filter(p => distance(place.point,p.point)>30)].slice(0,3);
  try { localStorage.setItem('navi-glass-recent', JSON.stringify(recent)); } catch { /* Storage may be disabled. */ }
  renderRecent();
}
function renderRecent() {
  const recent=readRecent();
  const places=recent.length ? recent : [
    { name:'Nhà thờ Đức Bà', point:[10.7798,106.6990], detail:'Công xã Paris, Quận 1' },
    { name:'Dinh Độc Lập', point:[10.7770,106.6953], detail:'Nam Kỳ Khởi Nghĩa, Quận 1' },
    { name:'Chợ Bến Thành', point:[10.7725,106.6980], detail:'Lê Lợi, Quận 1' }
  ];
  $('recentHeading').textContent = recent.length ? 'ĐIỂM ĐẾN GẦN ĐÂY' : 'GỢI Ý TẠI TP. HỒ CHÍ MINH';
  $('recentPlaces').replaceChildren(...places.map(place => {
    const button=document.createElement('button'); button.className='quick-place'; button.type='button';
    button.innerHTML=`<span class="quick-place-icon">${svg('pin')}</span><span><strong></strong><small></small></span>${svg('chevron')}`;
    button.querySelector('strong').textContent=place.name; button.querySelector('small').textContent=place.detail || 'Địa điểm đã chọn';
    button.onclick=() => { setPlace('destination',place); map?.setView(place.point,15); toast('Đã chọn điểm đến. Chọn điểm xuất phát rồi tìm đường.'); };
    return button;
  }));
}
function markerIcon(type) {
  const size = type==='destination'?27:type==='origin'?16:21;
  return L.divIcon({ className:'', html:`<div class="${type==='destination'?'route-end-icon':type==='origin'?'route-start-icon':`user-marker ${state.simulated?'simulating':''}`}"></div>`, iconSize:[size,size], iconAnchor:[size/2,type==='destination'?size:size/2] });
}
function updateMarkers() {
  if (!map) return;
  if (originMarker) map.removeLayer(originMarker);
  if (destinationMarker) map.removeLayer(destinationMarker);
  originMarker = state.origin ? L.marker(state.origin.point,{icon:markerIcon('origin')}).addTo(map).bindTooltip('Điểm xuất phát') : null;
  destinationMarker = state.destination ? L.marker(state.destination.point,{icon:markerIcon('destination')}).addTo(map).bindTooltip('Điểm đến') : null;
}
function updateUser(point) {
  if (!map) return;
  if (!userMarker) userMarker=L.marker(point,{icon:markerIcon('user'),zIndexOffset:500}).addTo(map);
  else userMarker.setLatLng(point).setIcon(markerIcon('user'));
  if (state.follow && state.active) map.panTo(point,{animate:false});
}
function clearRoute() {
  stopNavigation(); state.route=null; state.guidance=null; currentListIndex=-1;
  if (routeLayer && map) map.removeLayer(routeLayer); routeLayer=null;
  $('routeSummary').hidden=true; $('remainingValue').textContent='—';
  $('guidanceCard').classList.remove('active'); $('guidanceEyebrow').textContent='SẴN SÀNG KHÁM PHÁ';
  $('turnInstruction').textContent='Hành trình bắt đầu từ bạn.'; $('turnDistance').textContent='Bật GPS hoặc chọn điểm trên bản đồ';
  $('turnIcon').querySelector('use').setAttribute('href','#i-route');
}
function setPlace(target, place) {
  clearRoute(); state[target] = { name:place.name.slice(0,200), point:place.point, detail:place.detail || '' };
  $(target+'Input').value=state[target].name;
  $('searchResults').hidden=true; state.pickTarget=null;
  $('plannerHint').textContent='Sẵn sàng? Chọn “Tìm đường” để xem lộ trình.';
  $('routeButton').disabled=!(state.origin && state.destination);
  updateMarkers(); if (target==='destination') saveRecent(state.destination);
}
async function searchPlace(target) {
  const input=$(target+'Input'), query=input.value.trim();
  if (query.length<2) { toast('Nhập tên địa điểm hoặc tọa độ dạng 10.77, 106.70.'); return; }
  const coordinates=parseCoordinates(query);
  if (coordinates) { setPlace(target,{name:`${coordinates[0].toFixed(5)}, ${coordinates[1].toFixed(5)}`,point:coordinates}); map?.setView(coordinates,15); return; }
  const generation=++state.searchGeneration;
  searchController?.abort(); searchController=new AbortController();
  const center=map?.getCenter() || {lat:10.7769,lng:106.7009};
  const key=query.toLowerCase()+Math.round(center.lat)+','+Math.round(center.lng);
  $('searchResults').hidden=false; $('searchResults').innerHTML='<div class="search-empty">Đang tìm địa điểm…</div>';
  try {
    let data=searchCache.get(key);
    if (!data) {
      if (Date.now()-lastSearchRequest<1200) throw new Error('Chờ một giây rồi tìm lại nhé.');
      lastSearchRequest=Date.now();
      const url=new URL(config.searchUrl); url.search=new URLSearchParams({q:query,limit:'5',lat:String(center.lat),lon:String(center.lng)});
      data=await jsonRequest(url,{signal:searchController.signal});
      if (searchCache.size>=30) searchCache.delete(searchCache.keys().next().value);
      searchCache.set(key,data);
    }
    if (generation!==state.searchGeneration) return;
    const features=(data.features || []).filter(f => f.geometry?.type==='Point' && validPoint([f.geometry.coordinates[1],f.geometry.coordinates[0]]));
    if (!features.length) { $('searchResults').innerHTML='<div class="search-empty">Chưa tìm thấy. Thử thêm tên thành phố hoặc chọn trên bản đồ.</div>'; return; }
    $('searchResults').replaceChildren(...features.map(feature => {
      const p=feature.properties || {}, point=[feature.geometry.coordinates[1],feature.geometry.coordinates[0]];
      const name=p.name || p.street || 'Địa điểm trên bản đồ';
      const detail=[p.housenumber,p.street,p.district,p.city,p.country].filter(Boolean).join(', ');
      const button=document.createElement('button'); button.className='search-result'; button.type='button';
      button.innerHTML=`${svg('pin')}<span><strong></strong><small></small></span>`;
      button.querySelector('strong').textContent=name; button.querySelector('small').textContent=detail;
      button.onclick=() => { setPlace(target,{name,point,detail}); map?.setView(point,15); };
      return button;
    }));
  } catch(error) { if (generation===state.searchGeneration) { $('searchResults').hidden=true; toast(errorMessage(error)); } }
}
async function fetchRoute(origin,destination,signal) {
  const mode=MODES[state.mode];
  const key=state.mode+':'+[...origin,...destination].map(n=>n.toFixed(5)).join(',');
  if (routeCache.has(key)) return routeCache.get(key);
  const delay=Math.max(0,1200-(Date.now()-lastRouteRequest));
  if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
  if(signal?.aborted) throw new DOMException('Cancelled','AbortError');
  if (distance(origin,destination)<15) throw new Error('Điểm xuất phát và điểm đến quá gần nhau.');
  lastRouteRequest=Date.now();
  const pair=p=>`${p[1].toFixed(6)},${p[0].toFixed(6)}`;
  const url=`${config.routingBaseUrl}/${mode.backend}/route/v1/${mode.profile}/${pair(origin)};${pair(destination)}?overview=full&geometries=geojson&steps=true`;
  const data=await jsonRequest(url,{signal}); const route=prepareRoute(data);
  if ((data.waypoints || []).some(p=>p.distance>250)) throw new Error('Điểm chọn cách đường quá xa. Hãy chọn một điểm gần đường hơn.');
  if (routeCache.size>=8) routeCache.delete(routeCache.keys().next().value);
  routeCache.set(key,route); return route;
}
function installRoute(route) {
  state.route=route; state.progress=0; state.offRoute=false; currentListIndex=-1; lastSpoken='';
  if (routeLayer && map) map.removeLayer(routeLayer);
  if (map) routeLayer=L.layerGroup([L.polyline(route.coordinates,{color:'#fff',weight:9,opacity:.95}),L.polyline(route.coordinates,{color:'#28714e',weight:5.5,opacity:.95})]).addTo(map);
  updateMarkers(); fitRoute();
  $('routeSummary').hidden=false; $('routeDuration').textContent=formatDuration(route.duration); $('routeDistance').textContent=formatDistance(route.distance);
  $('routeModeLabel').textContent=`LỘ TRÌNH ${MODES[state.mode].label.toLocaleUpperCase('vi-VN')}`;
  $('directionsList').replaceChildren(...route.steps.map(step=>{
    const li=document.createElement('li'); li.append(document.createTextNode(step.text));
    const small=document.createElement('small'); small.textContent=formatDistance(step.distance); li.append(small); return li;
  }));
  renderGuidance(); updateControls(); banner();
}
function fitRoute() { if (map && state.route) map.fitBounds(L.latLngBounds(state.route.coordinates),{paddingTopLeft:[35,125],paddingBottomRight:[35,100],maxZoom:16}); }
async function calculateRoute() {
  if (!state.origin || !state.destination) return;
  stopNavigation(); const generation=state.generation; routeController=new AbortController();
  state.busy=true; updateControls();
  try { const route=await fetchRoute(state.origin.point,state.destination.point,routeController.signal); if (generation===state.generation) installRoute(route); }
  catch(error) { if (generation===state.generation) toast(errorMessage(error)); }
  finally { if (generation===state.generation) { state.busy=false; updateControls(); } }
}
function updateControls() {
  $('routeButton').disabled=state.busy || !(state.origin && state.destination);
  $('routeButton').innerHTML=svg('route')+(state.busy?'Đang chuẩn bị…':'Tìm đường<span class="button-arrow">↗</span>');
  $('startButton').disabled=state.busy; $('simulateButton').disabled=state.busy;
  $('routeSummary').hidden=!state.route && !state.busy;
  if(state.busy && !state.route){ $('routeDuration').textContent='Đang tìm tuyến…'; $('routeDistance').textContent='—'; }
  document.querySelector('.directions').hidden=!state.route;
  $('routeActions').hidden=state.active || state.busy; $('stopButton').hidden=!(state.active || state.busy);
  $('simulationPanel').hidden=!state.simulated || !state.active;
  $('recalculateButton').hidden=!state.offRoute || !state.active;
}

function speak(text) {
  if (!state.voice || !window.speechSynthesis || document.hidden) return;
  speechSynthesis.cancel(); const message=new SpeechSynthesisUtterance(text); message.lang='vi-VN'; message.rate=1;
  const voice=speechSynthesis.getVoices().find(v=>v.lang.startsWith('vi')); if (voice) message.voice=voice;
  speechSynthesis.speak(message);
}
function commandNow() {
  if (document.hidden) return COMMAND.OFF;
  if (state.manual && state.manual.until>Date.now() && !state.active) return state.manual.command;
  return safeGuidanceCommand({active:state.active,visible:!document.hidden,simulated:state.simulated,fix:state.fix,offRoute:state.offRoute,guidance:state.guidance});
}
function updateHud() {
  const command=commandNow(); $('deviceHud').dataset.command=String(command);
  $('commandLabel').textContent=COMMAND_LABEL[command]; $('commandByte').textContent=`0x0${command}`;
  $('hudStatus').textContent=ble.connected ? (state.active ? 'Đang gửi chỉ dẫn tới kính' : 'Kính đã kết nối · Sẵn sàng') : 'Bản xem trước · Kính chưa kết nối';
  document.querySelectorAll('.led-tests button').forEach(button=>button.classList.toggle('selected',state.manual?.until>Date.now() && Number(button.dataset.command)===command));
}
function heartbeat() {
  if (state.active) renderGuidance(); else updateHud();
  void ble.send(commandNow()); // Repeated once a second to refresh the ESP32's five-second watchdog.
}
function renderGuidance() {
  if (!state.route) { updateHud(); return; }
  const g=guidanceAt(state.route,state.progress,state.alertDistance); state.guidance=g;
  $('guidanceCard').classList.toggle('active',state.active);
  $('guidanceEyebrow').textContent=state.active ? (state.simulated ? 'ĐANG MÔ PHỎNG · 5×' : 'ĐANG DẪN ĐƯỜNG BẰNG GPS') : 'LỘ TRÌNH ĐÃ SẴN SÀNG';
  $('turnInstruction').textContent=g.step.text;
  $('turnIcon').querySelector('use').setAttribute('href','#i-'+(g.step.maneuver.type==='arrive'?'pin':symbols[g.step.command] || 'route'));
  $('turnDistance').textContent=`${formatDistance(g.untilTurn)} · ${g.step.maneuver.type==='arrive'?'tới điểm đến':'tới điểm rẽ'}`;
  $('remainingValue').textContent=formatDistance(g.remaining);
  if (currentListIndex!==g.index) {
    currentListIndex=g.index;
    [...$('directionsList').children].forEach((li,index)=>li.classList.toggle('current',index===g.index));
  }
  if (state.active) {
    if (document.hidden) banner('Đã tạm dừng tín hiệu kính khi chuyển tab.');
    else if (!state.simulated && !usableFix(state.fix)) banner('Đang chờ GPS chính xác hơn. Tín hiệu kính đã tắt.');
    else if (state.offRoute) banner('Bạn đang ngoài tuyến. Tính lại từ vị trí hiện tại để tiếp tục.');
    else if (!navigator.onLine) banner('Mất Internet. Đang dùng chỉ dẫn của tuyến đã tải.');
    else banner();
    const canSpeak=state.simulated || (usableFix(state.fix) && !state.offRoute);
    const key=`${g.index}:${g.untilTurn<=state.alertDistance?'near':'far'}`;
    if (canSpeak && key!==lastSpoken) { lastSpoken=key; speak(`Còn ${formatDistance(g.untilTurn)}. ${g.step.text}`); }
  }
  updateHud();
}
function locationError(error) {
  return error.code===1 ? 'GPS chưa được cho phép. Bật quyền Vị trí cho trang trong cài đặt trình duyệt.' : error.code===3 ? 'Lấy GPS quá lâu. Hãy ra nơi thoáng hơn rồi thử lại.' : 'Chưa lấy được GPS. Kiểm tra dịch vụ vị trí của điện thoại.';
}
function toFix(position) {
  return { point:[position.coords.latitude,position.coords.longitude], accuracy:position.coords.accuracy, speed:position.coords.speed, timestamp:position.timestamp };
}
async function getPosition() {
  if (!window.isSecureContext) throw new Error('GPS và Bluetooth cần HTTPS. Hãy dùng địa chỉ Cloudflare HTTPS.');
  if (!navigator.geolocation) throw new Error('Trình duyệt chưa hỗ trợ GPS. Bạn vẫn có thể thử mô phỏng.');
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(position=>resolve(toFix(position)),error=>reject(new Error(locationError(error))),{enableHighAccuracy:true,maximumAge:3000,timeout:15000}));
}
function showGPS(fix) {
  $('gpsStatus').textContent=usableFix(fix)?`GPS ±${Math.round(fix.accuracy)} m`:'GPS chưa chính xác';
  $('gpsDot').classList.toggle('live',usableFix(fix));
  $('speedValue').textContent=Number.isFinite(fix?.speed) && fix.speed>=0 ? Math.round(fix.speed*3.6) : '—';
}
async function locate() {
  if (state.simulated && state.active) { toast('Dừng mô phỏng trước khi chuyển sang GPS.'); return; }
  const generation=state.generation;
  $('gpsButton').disabled=true;
  try {
    const fix=await getPosition(); if (generation!==state.generation) return;
    state.fix=fix; showGPS(fix);
    if (!usableFix(fix)) { toast(`GPS đang sai số ±${Math.round(fix.accuracy)} m. Hãy thử lại ở nơi thoáng hơn.`); return; }
    if (!state.active) setPlace('origin',{name:'Vị trí của tôi',point:fix.point});
    updateUser(fix.point); state.follow=true; map?.setView(fix.point,16);
    toast('Đã xác định vị trí. Hãy chọn điểm đến.');
  } catch(error) { if (generation===state.generation) toast(errorMessage(error)); }
  finally { $('gpsButton').disabled=false; }
}
async function acquireWakeLock() {
  try { if (navigator.wakeLock && !document.hidden && state.active) wakeLock=await navigator.wakeLock.request('screen'); } catch { /* Guidance still works while the user keeps the screen awake. */ }
}
function stopNavigation() {
  state.generation++; routeController?.abort();
  if (gpsWatch!==undefined) navigator.geolocation?.clearWatch(gpsWatch); gpsWatch=undefined;
  clearInterval(simulationTimer); simulationTimer=undefined;
  const wasSimulated=state.simulated;
  state.active=false; state.busy=false; state.simulated=false; state.manual=null; state.offRoute=false; state.progress=0;
  window.speechSynthesis?.cancel(); void wakeLock?.release(); wakeLock=null;
  if (wasSimulated) {
    if (state.fix) updateUser(state.fix.point);
    else if (userMarker && map) { map.removeLayer(userMarker); userMarker=null; }
  }
  showGPS(state.fix); updateControls(); banner(); renderGuidance();
  updateHud(); void ble.send(COMMAND.OFF);
}
function arrive() {
  const length=state.route.length; stopNavigation(); state.progress=length; renderGuidance();
  $('turnInstruction').textContent='Bạn đã đến nơi.'; $('turnDistance').textContent='Hành trình hoàn thành. Kính đã tắt đèn.';
  $('guidanceEyebrow').textContent='HẸN GẶP Ở HÀNH TRÌNH TIẾP THEO'; $('remainingValue').textContent='0 m';
  toast('Đã đến điểm đến. Kính đã tắt đèn.'); speak('Bạn đã đến nơi.');
}
function acceptPosition(fix) {
  state.fix=fix; showGPS(fix); updateUser(fix.point);
  if (!usableFix(fix)) { renderGuidance(); void ble.send(COMMAND.OFF); return; }
  const projection=projectOnRoute(state.route,fix.point,state.progress,1500);
  state.offRoute=projection.distance>60;
  if (!state.offRoute) state.progress=Math.min(state.route.length,projection.progress);
  if (!state.offRoute && state.route.length-state.progress<20 && distance(fix.point,state.route.coordinates.at(-1))<25 && fix.accuracy<=35) { arrive(); return; }
  updateControls(); renderGuidance(); void ble.send(commandNow());
}
async function startNavigation() {
  if (!state.route) return;
  stopNavigation(); const generation=state.generation;
  state.busy=true; updateControls();
  try {
    const fix=await getPosition(); if (generation!==state.generation) return;
    if (!usableFix(fix)) throw new Error(`GPS đang sai số ±${Math.round(fix.accuracy)} m. Cần sai số dưới 50 m để chỉ dẫn tới kính.`);
    state.fix=fix;
    if (distance(fix.point,state.origin.point)>60) {
      toast('Đang tính tuyến từ vị trí GPS hiện tại…');
      routeController=new AbortController();
      const route=await fetchRoute(fix.point,state.destination.point,routeController.signal);
      if (generation!==state.generation) return;
      state.origin={name:'Vị trí của tôi',point:fix.point}; $('originInput').value=state.origin.name; installRoute(route);
    }
    if (generation!==state.generation) return;
    state.busy=false; state.active=true; state.simulated=false; state.follow=true; state.manual=null; lastSpoken='';
    updateControls(); void acquireWakeLock(); map?.setView(fix.point,17);
    acceptPosition(fix); if (!state.active) return;
    gpsWatch=navigator.geolocation.watchPosition(position=>{
      if (generation===state.generation && state.active && !state.simulated) acceptPosition(toFix(position));
    },error=>{
      if (generation!==state.generation) return;
      state.fix=null; showGPS(null); renderGuidance(); banner(locationError(error)); toast(locationError(error)); void ble.send(COMMAND.OFF);
    },{enableHighAccuracy:true,maximumAge:1000,timeout:12000});
    toast('Dẫn đường GPS đã bắt đầu. Giữ màn hình và trang này mở.');
  } catch(error) { if (generation===state.generation) toast(errorMessage(error)); }
  finally { if (generation===state.generation) { state.busy=false; updateControls(); } }
}
function beginSimulation() {
  if (!state.route) return;
  stopNavigation(); state.active=true; state.simulated=true; state.follow=true; state.progress=0; lastSpoken='';
  $('simulationProgress').value='0'; $('simulationPercent').textContent='0%';
  $('gpsStatus').textContent='Mô phỏng 5×'; $('gpsDot').classList.add('live');
  $('speedValue').textContent=Math.round(MODES[state.mode].speed*5*3.6);
  updateControls(); updateUser(pointAt(state.route,0)); renderGuidance(); void acquireWakeLock();
  let last=performance.now();
  simulationTimer=setInterval(()=>{
    const now=performance.now(),elapsed=Math.min(2,(now-last)/1000); last=now;
    if (document.hidden) return;
    state.progress=Math.min(state.route.length,state.progress+MODES[state.mode].speed*5*elapsed);
    updateSimulation();
  },250);
  toast('Đang mô phỏng 5×. Dùng thanh tiến độ để thử các điểm rẽ.');
}
function updateSimulation() {
  if (state.progress>=state.route.length) { arrive(); return; }
  $('simulationProgress').value=String(Math.round(state.progress/state.route.length*1000));
  $('simulationPercent').textContent=`${Math.round(state.progress/state.route.length*100)}%`;
  updateUser(pointAt(state.route,state.progress)); renderGuidance(); void ble.send(commandNow());
}
async function loadDemo() {
  clearRoute(); state.mode='bike'; updateModeButtons();
  setPlace('origin',{name:'Chợ Bến Thành',point:[10.7725,106.6980]});
  setPlace('destination',{name:'Nhà thờ Đức Bà',point:[10.7798,106.6990]});
  const generation=state.generation;
  try { const data=await jsonRequest('/data/demo-route.json'); if (generation!==state.generation) return; installRoute(prepareRoute(data)); beginSimulation(); }
  catch(error) { toast(errorMessage(error)); }
}
function updateModeButtons() {
  document.querySelectorAll('[data-mode]').forEach(button=>{const selected=button.dataset.mode===state.mode; button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
}
function bindEvents() {
  document.querySelectorAll('.place-form').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();void searchPlace(form.dataset.place);}));
  for (const target of ['origin','destination']) $(target+'Input').addEventListener('input',()=>{
    if (state[target] && $(target+'Input').value!==state[target].name) { clearRoute();state[target]=null; updateMarkers();updateControls(); }
    state.searchGeneration++;searchController?.abort();$('searchResults').hidden=true;
  });
  document.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{state.pickTarget=button.dataset.pick;toast(`Chạm bản đồ để chọn ${state.pickTarget==='origin'?'điểm xuất phát':'điểm đến'}.`);});
  document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{if(state.mode===button.dataset.mode)return;clearRoute();state.mode=button.dataset.mode;updateModeButtons();toast('Đã đổi phương tiện. Chọn Tìm đường để tính lại.');});
  $('routeButton').onclick=()=>void calculateRoute(); $('startButton').onclick=()=>void startNavigation();
  $('simulateButton').onclick=beginSimulation; $('demoButton').onclick=()=>void loadDemo();
  $('stopButton').onclick=()=>{stopNavigation();toast('Đã dừng hành trình và tắt đèn kính.');};
  $('gpsButton').onclick=()=>void locate();
  $('mapLocationButton').onclick=()=>{ if(state.active){state.follow=true;map?.setView(state.simulated?pointAt(state.route,state.progress):state.fix?.point || state.origin.point,17);}else void locate(); };
  $('fitButton').onclick=()=>{state.follow=false;fitRoute();};
  $('connectButton').onclick=async()=>{try{if(ble.connected)ble.disconnect();else await ble.connect();}catch(error){toast(errorMessage(error));}};
  document.querySelectorAll('.led-tests button').forEach(button=>button.onclick=()=>{
    if(state.active){toast('Dừng hành trình trước khi thử đèn thủ công.');return;}
    state.manual={command:Number(button.dataset.command),until:Date.now()+4000};updateHud();void ble.send(commandNow());
    toast(ble.connected?'Đang thử đèn kính trong 4 giây.':'Đang xem trước đèn. Kết nối kính để thử thiết bị thật.');
  });
  $('alertDistance').onchange=()=>{state.alertDistance=Number($('alertDistance').value);renderGuidance();void ble.send(commandNow());};
  $('voiceButton').onclick=()=>{
    if(!window.speechSynthesis){toast('Trình duyệt chưa hỗ trợ đọc chỉ dẫn.');return;}
    state.voice=!state.voice;$('voiceButton').setAttribute('aria-pressed',String(state.voice));$('voiceButton').setAttribute('aria-label',state.voice?'Tắt đọc chỉ dẫn':'Bật đọc chỉ dẫn');
    if(state.voice)speak(state.guidance?.step.text || 'Đã bật đọc chỉ dẫn.');else speechSynthesis.cancel();
  };
  $('simulationProgress').oninput=()=>{if(!state.active||!state.simulated)return;state.progress=state.route.length*Number($('simulationProgress').value)/1000;lastSpoken='';updateSimulation();};
  $('recalculateButton').onclick=async()=>{if(!state.fix||!usableFix(state.fix)){toast('Cần GPS chính xác để tính lại tuyến.');return;}const point=state.fix.point;setPlace('origin',{name:'Vị trí của tôi',point});await calculateRoute();toast('Đã tính lại tuyến. Bấm Bắt đầu GPS để tiếp tục.');};
  $('helpButton').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
  $('helpDialog').addEventListener('click',event=>{if(event.target===$('helpDialog')){const b=$('helpDialog').getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)$('helpDialog').close();}});
  document.addEventListener('visibilitychange',()=>{state.manual=null;if(document.hidden){window.speechSynthesis?.cancel();void ble.send(COMMAND.OFF);}else if(state.active)void acquireWakeLock();renderGuidance();updateHud();});
  window.addEventListener('pagehide',()=>{stopNavigation();ble.disconnect();});
  window.addEventListener('offline',()=>{banner('Mất Internet. Bản đồ mới và tìm đường cần kết nối mạng.');toast('Bạn đang ngoại tuyến.');});
  window.addEventListener('online',()=>{banner();toast('Đã kết nối Internet trở lại.');});
}
async function init() {
  bindEvents();renderRecent();
  try { config={...config,...await jsonRequest('/config.json',{timeout:4000})}; } catch { /* Defaults work if configuration is temporarily unavailable. */ }
  state.alertDistance=[100,180,250].includes(config.alertDistanceMeters)?config.alertDistanceMeters:180;$('alertDistance').value=String(state.alertDistance);
  if(window.L){
    map=L.map('map',{zoomControl:false,attributionControl:true}).setView([10.7769,106.7009],14);
    L.control.zoom({position:'topright'}).addTo(map);
    L.tileLayer(config.tileUrl,{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Báo lỗi</a>'}).addTo(map);
    map.on('dragstart',()=>{state.follow=false;});
    map.on('click',event=>{if(state.active&&!state.pickTarget)return;const target=state.pickTarget||(!state.origin?'origin':'destination');const point=[event.latlng.lat,event.latlng.lng];setPlace(target,{name:`${point[0].toFixed(5)}, ${point[1].toFixed(5)}`,point});toast(`Đã chọn ${target==='origin'?'điểm xuất phát':'điểm đến'}.`);});
    new ResizeObserver(()=>map.invalidateSize()).observe($('map'));
  } else banner('Không tải được bản đồ. Hãy tải lại trang.');
  if(!navigator.bluetooth)$('connectionLabel').textContent='Mở Chrome Android để kết nối kính';
  setInterval(heartbeat,1000);
  if('serviceWorker' in navigator && location.hostname!=='localhost' && location.hostname!=='127.0.0.1')navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void init(),{once:true});else void init();
