const $ = (id) => document.getElementById(id);
const SUPABASE_URL = "https://lfdmbkzghnwvsapxypvt.supabase.co";
const KEY = "sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1";
const SESSION = "movida-geiger-session", ATTEMPTS = "movida-geiger-attempts";
const state = { mode: "guided", mission: "presence", step: 0, powered: false, audio: false, light: false, hold: false, unit: "\xB5Sv/h", range: "AUTO", inspected: false, background: null, gross: null, scanStarted: false, scanComplete: false, hotspot: false, confirmed: false, distance: 100, speed: 5, scenario: "lab", surfaceDose: null, oneMeterDose: null, transportDone: false, lastReading: null, maxReading: 0, timer: null };
const scenarios = { lab: { background: 36, gross: 184, dose: 0.42, surfaceDose: 74, oneMeterDose: 3.4, label: "Mes\xF3n de radiois\xF3topos" }, nuclear: { background: 44, gross: 328, dose: 1.18, surfaceDose: 286, oneMeterDose: 8.7, label: "\xC1rea de medicina nuclear" }, waste: { background: 29, gross: 112, dose: 0.31, surfaceDose: 4.2, oneMeterDose: 0.34, label: "Almac\xE9n de residuos" }, gauge: { background: 34, gross: 486, dose: 2.4, surfaceDose: 740, oneMeterDose: 13.2, label: "Medidor nuclear industrial" }, scrap: { background: 31, gross: 690, dose: 4.8, surfaceDose: 1280, oneMeterDose: 22.5, label: "Patio de chatarra" } };
const steps = [
  { title: "Inspecciona el sistema", text: "Toca la sonda para revisar carcasa, cable, conector y la delicada ventana; la gu\xEDa avanzar\xE1 al completar la inspecci\xF3n.", why: "una ventana da\xF1ada o contaminada invalida la medici\xF3n.", target: "probeTarget", action: "Inspeccionar sonda ahora", done: () => state.inspected, run: inspectProbe },
  { title: "Enciende el instrumento", text: "Pulsa el bot\xF3n de encendido y espera la comprobaci\xF3n inicial.", why: "el equipo debe estabilizarse antes de medir.", target: "powerBtn", action: "Encender equipo", done: () => state.powered, run: () => togglePower(true) },
  { title: "Activa la respuesta audible", text: "Activa el audio para reconocer cambios peque\xF1os mientras barres.", why: "los pulsos ayudan a localizar un incremento sin dejar de mirar la superficie.", target: "audioBtn", action: "Activar audio", done: () => state.audio, run: () => toggleAudio(true) },
  { title: "Mide el fondo", text: "Obt\xE9n un conteo de fondo de 60 segundos, alejado del punto sospechoso.", why: "la lectura bruta incluye radiaci\xF3n ambiental; el resultado \xFAtil es el neto.", target: "backgroundBtn", action: "Medir fondo 60 s", done: () => state.background !== null, run: measureBackground },
  { title: "Ajusta la geometr\xEDa", text: "Coloca la ventana paralela a 0,3\u20130,6 cm de la superficie, sin tocarla.", why: "la eficiencia cambia con la distancia y el contacto puede da\xF1ar o contaminar la mica.", target: "distance", action: "Usar distancia correcta", done: () => state.distance >= 0.3 && state.distance <= 0.6, run: () => {
    $("distance").value = 0.5;
    setDistance(0.5);
    advanceSoon();
  } },
  { title: "Prepara el barrido", text: "Usa aproximadamente un ancho de sonda por segundo: entre 3 y 6 cm/s en este ejercicio.", why: "si avanzas muy r\xE1pido, el detector permanece poco tiempo sobre una zona activa.", target: "scanSpeed", action: "Ajustar a 5 cm/s", done: () => state.speed >= 3 && state.speed <= 6, run: () => {
    $("scanSpeed").value = 5;
    setSpeed(5);
    advanceSoon();
  } },
  { title: "Barre toda la superficie", text: "Inicia pasadas paralelas y solapadas. Escucha el cambio de pulsos.", why: "un recorrido ordenado reduce zonas omitidas y permite encontrar puntos elevados.", target: "startScan", action: "Iniciar barrido", done: () => state.scanComplete, run: startScanning },
  { title: "Confirma el punto", text: "Det\xE9n la sonda sobre la m\xE1xima respuesta y realiza un conteo fijo de 30 segundos.", why: "el barrido localiza; la medici\xF3n estacionaria produce el dato que se interpreta.", target: "confirmBtn", action: "Confirmar 30 s", done: () => state.confirmed, run: confirmHotspot },
  { title: "Interpreta el resultado", text: "Compara la tasa neta con el umbral de decisi\xF3n y revisa el l\xEDmite de detecci\xF3n.", why: "estar sobre el fondo no basta; la decisi\xF3n debe considerar la variabilidad del conteo.", target: "verdict", action: "Revisar interpretaci\xF3n", done: () => state.confirmed, run: () => advanceSoon() },
  { title: "Cierra y registra", text: "Documenta fondo, tiempo, distancia, velocidad, resultado y condiciones del escenario.", why: "sin trazabilidad no puede defenderse una conclusi\xF3n de medici\xF3n.", target: "verdict", action: "Finalizar pr\xE1ctica", done: () => state.confirmed, run: () => {
    toast("Pr\xE1ctica completada correctamente");
    renderGuide();
  } }
];
const doseBackgroundStep = { title: "Mide la tasa de dosis de fondo", text: "Registra durante 60 segundos la tasa de dosis ambiental en \xB5Sv/h, lejos del punto sospechoso.", why: "el fondo permite reconocer incrementos reales y documentar la condici\xF3n radiol\xF3gica inicial.", target: "backgroundBtn", action: "Medir fondo en \xB5Sv/h", done: () => state.background !== null, run: measureBackground };
const transportSteps = [
  steps[0],
  steps[1],
  steps[2],
  doseBackgroundStep,
  { title: "Inspecciona el bulto", text: "Sin manipularlo innecesariamente, revisa integridad, etiquetas y geometr\xEDa; identifica d\xF3nde buscar el m\xE1ximo superficial.", why: "el \xEDndice de transporte no sustituye la inspecci\xF3n del bulto ni se obtiene en un punto arbitrario.", target: "surfaceDoseBtn", action: "Medir m\xE1ximo superficial", done: () => state.surfaceDose !== null, run: measureSurfaceDose },
  { title: "Establece exactamente 1 metro", text: "Mide desde la superficie externa del bulto, no desde su centro, y conserva la geometr\xEDa del punto m\xE1ximo.", why: "el \xEDndice de transporte se determina con la tasa m\xE1xima a 1 m de la superficie externa.", target: "oneMeterBtn", action: "Medir m\xE1ximo a 1 m", done: () => state.oneMeterDose !== null, run: measureOneMeterDose },
  { title: "Calcula el \xEDndice de transporte", text: "Convierte la lectura a mSv/h, multipl\xEDcala por 100 y redondea hacia arriba a la primera cifra decimal.", why: "esa regla normaliza el control radiol\xF3gico y la segregaci\xF3n durante el transporte.", target: "calculateTIBtn", action: "Calcular IT", done: () => state.transportDone, run: calculateTI },
  { title: "Verifica la categor\xEDa", text: "Compara simult\xE1neamente el m\xE1ximo superficial y el IT con la categor\xEDa de etiqueta aplicable.", why: "la categor\xEDa no depende solamente del \xEDndice de transporte.", target: "guideAction", action: "Comprend\xED la categor\xEDa", done: () => state.transportDone, run: () => advanceSoon() },
  { title: "Diferencia IT de CSI", text: "El IT controla la exposici\xF3n externa; el \xEDndice de seguridad con respecto a la criticidad es otro dato para material fisible.", why: "ambos \xEDndices pueden figurar en un transporte, pero responden a peligros diferentes.", target: "guideAction", action: "Comprend\xED la diferencia", done: () => state.transportDone, run: () => advanceSoon() },
  { title: "Registra la verificaci\xF3n", text: "Documenta instrumento, calibraci\xF3n, fondo, superficie, lectura a 1 m, IT, categor\xEDa, fecha y responsable.", why: "el resultado debe ser trazable y formar parte de los controles del remitente.", target: "transportPanel", action: "Finalizar verificaci\xF3n", done: () => state.transportDone, run: () => toast("Verificaci\xF3n del \xEDndice de transporte completada") }
];
const fieldSteps = [
  steps[0],
  steps[1],
  steps[2],
  doseBackgroundStep,
  { title: "Comienza desde una distancia segura", text: "Inicia el reconocimiento sin aproximarte innecesariamente y observa si existe un gradiente respecto del fondo.", why: "la distancia reduce la exposici\xF3n y evita avanzar hacia un campo que a\xFAn no conoces.", target: "distance", action: "Comenzar a 1 metro", done: () => state.distance >= 30, run: () => {
    $("distance").value = 100;
    setDistance(100);
    advanceSoon();
  } },
  { title: "Planifica un recorrido sistem\xE1tico", text: "Define una trayectoria ordenada y un ritmo constante; no persigas impulsos aislados.", why: "un patr\xF3n reproducible permite distinguir un gradiente real de la fluctuaci\xF3n estad\xEDstica.", target: "scanSpeed", action: "Ajustar recorrido", done: () => state.speed >= 3 && state.speed <= 6, run: () => {
    $("scanSpeed").value = 5;
    setSpeed(5);
    advanceSoon();
  } },
  { title: "Busca cambios respecto del fondo", text: "Recorre el \xE1rea escuchando los pulsos y observando la tendencia. Retrocede si la respuesta aumenta r\xE1pidamente.", why: "la finalidad inicial es detectar y localizar manteniendo la exposici\xF3n tan baja como sea razonablemente posible.", target: "startScan", action: "Iniciar reconocimiento", done: () => state.scanComplete, run: startScanning },
  { title: "Confirma desde una posici\xF3n segura", text: "Mant\xE9n una geometr\xEDa definida y realiza un conteo fijo; no toques ni recojas un objeto sospechoso.", why: "la confirmaci\xF3n debe mejorar la informaci\xF3n sin aumentar innecesariamente la dosis.", target: "confirmBtn", action: "Confirmar incremento", done: () => state.confirmed, run: confirmHotspot },
  steps[8],
  steps[9]
];
function activeSteps() {
  return state.mission === "transport" ? transportSteps : state.mission === "presence" || state.mission === "source" ? fieldSteps : steps;
}
function setLogin(text) {
  $("loginMessage").textContent = text;
}
function openApp(member, persist = true) {
  const name = [member?.nombres, member?.apellidos].filter(Boolean).join(" ") || member?.name || "integrante";
  const expiresAt = member?.expiresAt || Date.now() + 20 * 6e4;
  if (persist) sessionStorage.setItem(SESSION, JSON.stringify({ name, expiresAt }));
  $("memberName").textContent = name;
  $("loginGate").hidden = true;
  $("appShell").hidden = false;
  document.body.classList.remove("auth-locked");
  renderGuide();
  updateDisplay();
  setTimeout(() => logout(true), Math.max(0, expiresAt - Date.now()));
}
function logout(expired = false) {
  sessionStorage.removeItem(SESSION);
  clearInterval(state.timer);
  location.reload();
  if (expired) sessionStorage.setItem("movida-session-message", "La sesi\xF3n finaliz\xF3 por seguridad.");
}
async function login(e) {
  e.preventDefault();
  const cedula = $("memberId").value.replace(/\D/g, ""), codigo = $("memberPassword").value.trim();
  if (!cedula || !codigo) {
    setLogin("Escribe tu c\xE9dula y tu clave para continuar.");
    return;
  }
  const blocked = JSON.parse(localStorage.getItem(ATTEMPTS) || '{"count":0,"until":0}');
  if (blocked.until > Date.now()) {
    setLogin("Demasiados intentos. Espera unos minutos.");
    return;
  }
  const btn = $("loginSubmit");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Verificando\u2026";
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/acceso_geiger`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_cedula: cedula, p_codigo: codigo }) });
    if (!r.ok) {
      const error = await r.json().catch(() => ({}));
      if (r.status === 429 || error?.code === "GEIGER_RATE_LIMIT") {
        setLogin("Demasiados intentos. Espera 15 minutos antes de volver a probar.");
        return;
      }
      throw Error(String(r.status));
    }
    const p = await r.json(), m = Array.isArray(p) ? p[0] : p;
    if (!m) {
      const count = (blocked.count || 0) + 1, lock = count >= 5;
      localStorage.setItem(ATTEMPTS, JSON.stringify({ count: lock ? 0 : count, until: lock ? Date.now() + 15 * 6e4 : 0 }));
      setLogin(lock ? "Cinco intentos fallidos. Acceso pausado por 15 minutos." : `Datos no validados. Revisa c\xE9dula y clave; quedan ${5 - count} intentos.`);
      return;
    }
    localStorage.removeItem(ATTEMPTS);
    openApp(m);
    toast("Acceso validado");
  } catch (err) {
    console.error(err);
    setLogin("El servicio de acceso no est\xE1 disponible. Intenta nuevamente en unos minutos.");
  } finally {
    btn.disabled = false;
    btn.querySelector("span").textContent = "Abrir simulador";
  }
}
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2800);
}
function inspectProbe() {
  if (state.inspected) {
    toast("La inspecci\xF3n ya fue registrada.");
    return;
  }
  state.inspected = true;
  renderGuide();
  toast("Paso completado \xB7 sonda, cable y ventana inspeccionados");
  advanceSoon();
}
function randomAround(value, spread = 5) {
  return Math.max(0, Math.round(value + (Math.random() - 0.5) * spread * 2));
}
function doseFromCpm(cpm) {
  return cpm * (scenarios[state.scenario].dose / scenarios[state.scenario].gross);
}
function formatInstrument(cpm, unit = state.unit) {
  if (cpm === null || cpm === void 0) return "\u2014";
  if (unit === "\xB5Sv/h") return doseFromCpm(cpm).toFixed(2);
  if (unit === "CPS") return (cpm / 60).toFixed(2);
  return Math.round(cpm);
}
function updateDisplay(value) {
  const cpm = value ?? (state.powered ? state.background ?? randomAround(scenarios[state.scenario].background, 2) : null);
  $("meter").classList.toggle("on", state.powered);
  $("screen").classList.toggle("lit", state.light);
  $("holdBtn").classList.toggle("active", state.hold);
  $("lightBtn").classList.toggle("active", state.light);
  if (state.hold && state.lastReading !== null) return;
  const shown = cpm === null ? "----" : formatInstrument(cpm);
  state.lastReading = shown;
  if (typeof cpm === "number") state.maxReading = Math.max(state.maxReading, cpm);
  $("reading").textContent = shown;
  $("unitLabel").textContent = state.unit;
  $("avgValue").textContent = state.background === null ? "\u2014" : formatInstrument(state.background);
  $("maxValue").textContent = state.maxReading ? formatInstrument(state.maxReading) : "\u2014";
  $("screenRange").textContent = state.range;
  $("screenMode").textContent = state.powered ? state.scanStarted && !state.scanComplete ? "RECONOCIMIENTO EN CURSO" : state.confirmed ? "MEDICI\xD3N CONFIRMADA" : state.unit === "\xB5Sv/h" ? "TASA DE DOSIS H*(10)" : "TASA DE CONTEO" : "EQUIPO APAGADO";
  $("audioBtn").classList.toggle("active", state.audio);
  $("audioIcon").style.opacity = state.audio ? 1 : 0.25;
  $("scaleBar").style.width = cpm === null ? "0%" : `${Math.min(100, cpm / 4)}%`;
}
function cycleUnits() {
  if (!state.powered) {
    toast("Primero enciende el instrumento.");
    return;
  }
  const allowed = state.mission === "contamination" ? ["CPM", "CPS"] : ["\xB5Sv/h", "CPM", "CPS"];
  state.unit = allowed[(allowed.indexOf(state.unit) + 1) % allowed.length];
  state.hold = false;
  updateDisplay(state.gross ?? state.background);
  toast(state.unit === "\xB5Sv/h" ? "Unidad profesional: tasa de dosis en \xB5Sv/h" : "Unidad t\xE9cnica secundaria: " + state.unit);
}
function cycleRange() {
  const ranges = ["AUTO", "LOW", "HIGH"];
  state.range = ranges[(ranges.indexOf(state.range) + 1) % ranges.length];
  $("rangeBtn").querySelector("small").textContent = state.range;
  updateDisplay();
  toast("Rango: " + state.range);
}
function toggleLight() {
  state.light = !state.light;
  $("meter").classList.toggle("lit", state.light);
  updateDisplay();
  toast(state.light ? "Iluminaci\xF3n activada" : "Iluminaci\xF3n desactivada");
}
function toggleHold() {
  state.hold = !state.hold;
  if (!state.hold) state.lastReading = null;
  updateDisplay(state.gross ?? state.background);
  toast(state.hold ? "Lectura retenida" : "Retenci\xF3n liberada");
}
function togglePower(force) {
  state.powered = force ?? !state.powered;
  if (!state.powered) {
    state.audio = false;
    clearInterval(state.timer);
  }
  updateDisplay();
  renderGuide();
  if (state.powered) {
    toast("Autocomprobaci\xF3n correcta \xB7 bater\xEDa 92 %");
    advanceSoon();
  }
}
function toggleAudio(force) {
  if (!state.powered) {
    toast("Primero enciende el instrumento.");
    pointTo("powerBtn");
    return;
  }
  state.audio = force ?? !state.audio;
  updateDisplay();
  renderGuide();
  toast(state.audio ? "Respuesta audible activada" : "Respuesta audible desactivada");
  if (state.audio) advanceSoon();
}
function simulateCount(button, duration, onDone, label) {
  if (!state.powered) {
    toast("El equipo est\xE1 apagado.");
    pointTo("powerBtn");
    return;
  }
  if (button.disabled) return;
  button.disabled = true;
  let left = duration;
  const original = button.textContent;
  button.textContent = `${label} ${left} s`;
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    left -= 5;
    button.textContent = `${label} ${Math.max(0, left)} s`;
    if (left <= 0) {
      clearInterval(state.timer);
      button.disabled = false;
      button.textContent = original;
      onDone();
    }
  }, 180);
}
function measureBackground() {
  simulateCount($("backgroundBtn"), 60, () => {
    state.background = randomAround(scenarios[state.scenario].background, 3);
    $("backgroundResult").textContent = state.mission === "contamination" ? state.background : doseFromCpm(state.background).toFixed(2);
    updateDisplay(state.background);
    renderGuide();
    toast(`Fondo registrado: ${state.mission === "contamination" ? state.background + " CPM" : doseFromCpm(state.background).toFixed(2) + " \xB5Sv/h"}`);
    advanceSoon();
  }, "Midiendo");
}
function setDistance(value) {
  state.distance = Number(value);
  $("distanceValue").textContent = state.distance >= 100 ? "1,0 m" : `${state.distance.toFixed(1).replace(".", ",")} cm`;
  renderGuide();
  if (state.mission === "contamination") {
    if (state.distance === 0) toast("No apoyes la ventana sobre la superficie.");
    else if (state.distance > 0.6) toast("Acerca la sonda: esta distancia reduce la respuesta.");
  } else if (state.mission !== "transport" && state.distance < 30) toast("Evita aproximarte antes de conocer el gradiente del campo.");
}
function setSpeed(value) {
  state.speed = Number(value);
  $("speedValue").textContent = `${state.speed} cm/s`;
  renderGuide();
  if (state.speed > 6) toast("Demasiado r\xE1pido: podr\xEDas pasar sobre un punto sin reconocerlo.");
}
function startScanning() {
  if (!state.powered || !state.audio || state.background === null) {
    toast(!state.powered ? "Primero enciende el equipo." : !state.audio ? "Activa el audio antes de barrer." : "Primero mide el fondo.");
    return;
  }
  const surfaceMission = state.mission === "contamination";
  if (surfaceMission && (state.distance < 0.3 || state.distance > 0.6)) {
    toast(state.distance < 0.3 ? "Evita el contacto con la superficie." : "Mant\xE9n la sonda entre 0,3 y 0,6 cm.");
    pointTo("distance");
    return;
  }
  if (!surfaceMission && state.distance < 30) {
    toast("Comienza el reconocimiento desde una distancia prudente.");
    pointTo("distance");
    return;
  }
  if (state.speed < 3 || state.speed > 6) {
    toast(surfaceMission ? "Ajusta la velocidad entre 3 y 6 cm/s." : "Ajusta un ritmo de recorrido lento y constante.");
    pointTo("scanSpeed");
    return;
  }
  if (state.scanStarted && !state.scanComplete) return;
  state.scanStarted = true;
  state.scanComplete = false;
  state.hotspot = false;
  $("startScan").disabled = true;
  $("scanState").textContent = surfaceMission ? "Barrido en curso" : "Reconocimiento en curso";
  const area = $("scanArea"), cursor = $("probeCursor");
  let tick = 0;
  const rows = 4, maxX = area.clientWidth - 66, maxY = area.clientHeight - 78;
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    tick++;
    const progress = Math.min(1, tick / 80), row = Math.min(rows - 1, Math.floor(progress * rows)), rowProgress = progress * rows - row;
    const x = (row % 2 ? 1 - rowProgress : rowProgress) * maxX, y = 12 + row * (maxY / (rows - 1));
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    const hot = progress > 0.58 && progress < 0.72;
    cursor.classList.toggle("hot", hot);
    if (hot) {
      state.hotspot = true;
      const count = randomAround(scenarios[state.scenario].gross, 15);
      updateDisplay(count);
      $("scanState").textContent = "Incremento localizado";
      if (state.audio) clickSound();
    } else updateDisplay(randomAround(scenarios[state.scenario].background, 5));
    if (progress >= 1) {
      clearInterval(state.timer);
      state.scanComplete = true;
      $("startScan").disabled = false;
      $("startScan").textContent = "Repetir recorrido";
      $("scanState").textContent = "Incremento marcado \xB7 confirma con seguridad";
      renderGuide();
      toast(state.mission === "source" ? "Posible fuente localizada: no la manipules." : "Incremento localizado. Ahora confirma el punto.");
      advanceSoon();
    }
  }, 55);
}
function clickSound() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = new C(), osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = 950;
    gain.gain.value = 0.035;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.025);
  } catch {
  }
}
function confirmHotspot() {
  if (!state.scanComplete || !state.hotspot) {
    toast("Primero completa el barrido y localiza el incremento.");
    pointTo("startScan");
    return;
  }
  simulateCount($("confirmBtn"), 30, () => {
    state.gross = randomAround(scenarios[state.scenario].gross, 7);
    state.confirmed = true;
    $("grossResult").textContent = state.mission === "contamination" ? state.gross : doseFromCpm(state.gross).toFixed(2);
    calculateResults();
    updateDisplay(state.gross);
    renderGuide();
    toast(state.mission === "contamination" ? "Conteo estacionario completado" : "Tasa de dosis confirmada");
    advanceSoon();
  }, "Midiendo");
}
function calculateResults() {
  const b = state.background, g = state.gross, tb = 60, tg = 30;
  const net = g - b;
  const ub = Math.sqrt(b / (tb / 60)) / Math.sqrt(tb / 60);
  const ug = Math.sqrt(g / (tg / 60)) / Math.sqrt(tg / 60);
  const uNet = Math.sqrt(ug ** 2 + ub ** 2);
  const decision = 1.645 * Math.sqrt(b * 60 / tg + b * 60 / tb);
  const detection = decision + 1.645 * Math.sqrt(Math.max(1, b + detectionSeed(decision, b)));
  const low = Math.max(0, net - 1.96 * uNet), high = net + 1.96 * uNet;
  const dose = doseFromCpm(g), netDose = doseFromCpm(net);
  $("netResult").textContent = state.mission === "contamination" ? `${net.toFixed(1)} CPM` : `${netDose.toFixed(2)} \xB5Sv/h`;
  $("doseResult").textContent = state.mission === "contamination" ? "No aplicable" : `${dose.toFixed(2)} \xB5Sv/h`;
  $("projectionResult").textContent = state.mission === "contamination" ? "No aplicable" : `${(dose * 8).toFixed(1)} \xB5Sv`;
  $("thresholdResult").textContent = `${decision.toFixed(1)} CPM`;
  $("detectionResult").textContent = `${detection.toFixed(1)} CPM`;
  $("coverageResult").textContent = `${low.toFixed(0)}\u2013${high.toFixed(0)} CPM`;
  const v = $("verdict");
  if (net > decision) {
    v.className = "verdict detected";
    v.innerHTML = state.mission === "source" ? "<b>Gradiente compatible con una fuente</b><span>No la toques. Al\xE9jate, controla el \xE1rea y comunica al responsable de protecci\xF3n radiol\xF3gica.</span>" : state.mission === "presence" ? dose >= 2.5 ? "<b>Supera el nivel de investigaci\xF3n del ejercicio</b><span>Controla el \xE1rea y eval\xFAa tiempo, distancia, blindaje, duraci\xF3n real y dosimetr\xEDa personal. No confundas este nivel operativo con un l\xEDmite legal universal.</span>" : "<b>Radiaci\xF3n detectada sobre el fondo</b><span>La tasa permanece bajo el nivel de investigaci\xF3n del ejercicio. Registra el resultado y conserva los controles radiol\xF3gicos.</span>" : "<b>Efecto neto detectado</b><span>La tasa neta supera el umbral de decisi\xF3n. Delimita el \xE1rea y aplica el procedimiento radiol\xF3gico autorizado.</span>";
  } else {
    v.className = "verdict clear";
    v.innerHTML = "<b>No demostrado sobre el fondo</b><span>El resultado no supera el umbral. Esto no demuestra ausencia absoluta de radiaci\xF3n.</span>";
  }
}
function detectionSeed(decision, b) {
  return Math.max(0, decision + b);
}
function measureSurfaceDose() {
  if (!state.powered) {
    toast("Primero enciende el instrumento.");
    pointTo("powerBtn");
    return;
  }
  simulateCount($("surfaceDoseBtn"), 30, () => {
    state.surfaceDose = Number((scenarios[state.scenario].surfaceDose + (Math.random() - 0.5) * 4).toFixed(1));
    $("surfaceDose").textContent = `${state.surfaceDose} \xB5Sv/h`;
    renderGuide();
    toast("M\xE1ximo superficial registrado");
    advanceSoon();
  }, "Midiendo");
}
function measureOneMeterDose() {
  if (state.surfaceDose === null) {
    toast("Primero identifica el m\xE1ximo en la superficie.");
    pointTo("surfaceDoseBtn");
    return;
  }
  simulateCount($("oneMeterBtn"), 30, () => {
    state.oneMeterDose = Number((scenarios[state.scenario].oneMeterDose + (Math.random() - 0.5) * 0.4).toFixed(2));
    $("oneMeterDose").textContent = `${state.oneMeterDose} \xB5Sv/h`;
    renderGuide();
    toast("M\xE1ximo a 1 metro registrado");
    advanceSoon();
  }, "Midiendo");
}
function calculateTI() {
  if (state.oneMeterDose === null) {
    toast("Falta la medici\xF3n a 1 metro.");
    pointTo("oneMeterBtn");
    return;
  }
  const raw = state.oneMeterDose / 10;
  const ti = raw <= 0.05 ? 0 : Math.ceil(raw * 10) / 10;
  state.transportDone = true;
  $("tiResult").textContent = ti.toFixed(ti === 0 ? 0 : 1);
  let category;
  if (state.surfaceDose <= 5 && ti === 0) category = "Categor\xEDa I-BLANCA";
  else if (state.surfaceDose <= 500 && ti <= 1) category = "Categor\xEDa II-AMARILLA";
  else if (state.surfaceDose <= 2e3 && ti <= 10) category = "Categor\xEDa III-AMARILLA";
  else category = "Fuera de los l\xEDmites ordinarios simulados";
  $("tiCategory").textContent = category;
  renderGuide();
  toast(`\xCDndice de transporte: ${ti}`);
  advanceSoon();
}
function renderGuide() {
  const guided = state.mode === "guided", flow = activeSteps();
  $("guideCard").hidden = !guided;
  $("coach").hidden = !guided;
  if (!guided) return;
  const s = flow[state.step];
  $("guideCount").textContent = `PASO ${state.step + 1} DE ${flow.length}`;
  $("guideNumber").textContent = String(state.step + 1).padStart(2, "0");
  $("guideTitle").textContent = s.title;
  $("guideText").textContent = s.text;
  $("guideWhy").textContent = s.why;
  $("guideAction").textContent = s.action;
  $("guideBar").style.width = `${(state.step + 1) / flow.length * 100}%`;
  $("guidePrev").disabled = state.step === 0;
  $("guideNext").textContent = "Siguiente \u2192";
  $("guideNext").disabled = !s.done() || state.step === flow.length - 1;
  $("coachStep").textContent = `SIGUIENTE \xB7 PASO ${state.step + 1} DE ${flow.length}`;
  $("coachTitle").textContent = s.title;
  $("coachHint").textContent = `Te llevar\xE9 al control exacto: ${s.action.toLowerCase()}`;
  clearTargets();
}
function goStep(delta) {
  const flow = activeSteps(), next = Math.max(0, Math.min(flow.length - 1, state.step + delta));
  if (delta > 0 && !flow[state.step].done()) {
    toast("Completa la acci\xF3n indicada antes de avanzar.");
    pointTo(flow[state.step].target);
    return;
  }
  state.step = next;
  renderGuide();
  $("guideCard").scrollIntoView({ behavior: "smooth", block: "start" });
}
function advanceSoon() {
  const flow = activeSteps(), completedStep = state.step;
  if (state.mode !== "guided" || state.advancing || !flow[completedStep].done() || completedStep === flow.length - 1) return;
  state.advancing = true;
  $("guideNext").disabled = true;
  $("guideNext").textContent = "Paso completado \u2713";
  state.advanceTimer = setTimeout(() => {
    state.advancing = false;
    if (state.step === completedStep && activeSteps()[completedStep].done()) {
      state.step = completedStep + 1;
      renderGuide();
      $("guideCard").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, 700);
}
function clearTargets() {
  document.querySelectorAll(".coach-target").forEach((el) => el.classList.remove("coach-target"));
}
function pointTo(id) {
  clearTargets();
  let el = $(id);
  if (!el) return;
  const actionable = el.matches('button,input,select,[role="button"]');
  if (!actionable) el = $("guideAction");
  el.classList.add("coach-target");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (el.focus) el.focus({ preventScroll: true });
  setTimeout(() => el.classList.remove("coach-target"), 4500);
}
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("simulationView").hidden = mode === "concepts";
  $("conceptsView").hidden = mode !== "concepts";
  renderGuide();
  if (mode !== "concepts") window.scrollTo({ top: 70, behavior: "smooth" });
}
function setMission(mission) {
  clearTimeout(state.advanceTimer);
  clearInterval(state.timer);
  Object.assign(state, { mission, step: 0, advancing: false, inspected: false, powered: false, audio: false, unit: mission === "contamination" ? "CPM" : "\xB5Sv/h", lastReading: null, maxReading: 0 });
  document.querySelectorAll(".mission").forEach((b) => b.classList.toggle("active", b.dataset.mission === mission));
  $("transportPanel").hidden = mission !== "transport";
  const contamination = mission === "contamination";
  $("doseRow").hidden = contamination || mission === "transport";
  $("criterionRow").hidden = contamination || mission === "transport";
  $("projectionRow").hidden = contamination || mission === "transport";
  $("doseNote").hidden = mission === "transport";
  document.querySelector(".surface-panel").hidden = mission === "transport";
  $("backgroundLabel").textContent = contamination ? "Conteo de fondo" : "Tasa de dosis de fondo";
  $("grossLabel").textContent = contamination ? "Conteo bruto confirmado" : "Tasa de dosis confirmada";
  $("backgroundUnit").textContent = contamination ? "CPM" : "\xB5Sv/h";
  $("grossUnit").textContent = contamination ? "CPM" : "\xB5Sv/h";
  $("netLabel").firstChild.textContent = contamination ? "Tasa neta " : "Incremento sobre el fondo ";
  $("thresholdRow").hidden = !contamination;
  $("detectionRow").hidden = !contamination;
  $("coverageRow").hidden = !contamination;
  $("distance").max = contamination ? 5 : 200;
  $("distance").step = contamination ? 0.5 : 10;
  const scanLabel = document.querySelector(".scan-controls label");
  scanLabel.innerHTML = contamination ? 'Velocidad <b id="speedValue">5 cm/s</b>' : 'Ritmo de recorrido <b id="speedValue">lento</b>';
  if (contamination) {
    setDistance(0.5);
    $("distance").value = 0.5;
  } else if (mission !== "transport") {
    setDistance(100);
    $("distance").value = 100;
  }
  resetScenario(state.scenario);
  renderGuide();
  toast({ contamination: "Misi\xF3n t\xE9cnica: contaminaci\xF3n en CPM", presence: "Misi\xF3n principal: tasa de dosis en \xB5Sv/h", source: "Misi\xF3n: b\xFAsqueda de fuente en \xB5Sv/h", transport: "Misi\xF3n: \xEDndice de transporte" }[mission]);
}
function resetScenario(value) {
  clearInterval(state.timer);
  Object.assign(state, { scenario: value, background: null, gross: null, scanStarted: false, scanComplete: false, hotspot: false, confirmed: false, surfaceDose: null, oneMeterDose: null, transportDone: false, lastReading: null, maxReading: 0 });
  $("backgroundResult").textContent = "\u2014";
  $("grossResult").textContent = "\u2014";
  $("netResult").textContent = state.mission === "contamination" ? "\u2014 CPM" : "\u2014 \xB5Sv/h";
  $("doseResult").textContent = "\u2014 \xB5Sv/h";
  $("projectionResult").textContent = "\u2014 \xB5Sv";
  $("thresholdResult").textContent = "\u2014 CPM";
  $("detectionResult").textContent = "\u2014 CPM";
  $("coverageResult").textContent = "\u2014";
  $("surfaceDose").textContent = "\u2014 \xB5Sv/h";
  $("oneMeterDose").textContent = "\u2014 \xB5Sv/h";
  $("tiResult").textContent = "\u2014";
  $("tiCategory").textContent = "Pendiente de medici\xF3n";
  $("scanState").textContent = "Lista para inspecci\xF3n";
  $("startScan").textContent = state.mission === "contamination" ? "Iniciar barrido" : "Iniciar reconocimiento";
  $("startScan").disabled = false;
  $("verdict").className = "verdict neutral";
  $("verdict").innerHTML = "<b>A\xFAn sin resultado</b><span>Completa el fondo, el recorrido y la confirmaci\xF3n.</span>";
  updateDisplay();
}
$("loginForm").addEventListener("submit", login);
$("togglePassword").addEventListener("click", () => {
  const i = $("memberPassword"), show = i.type === "password";
  i.type = show ? "text" : "password";
  $("togglePassword").textContent = show ? "Ocultar" : "Mostrar";
});
$("logoutBtn").addEventListener("click", () => logout());
$("lightBtn").addEventListener("click", toggleLight);
$("unitsBtn").addEventListener("click", cycleUnits);
$("rangeBtn").addEventListener("click", cycleRange);
$("avgBtn").addEventListener("click", () => toast("AVG muestra el promedio estabilizado del periodo activo."));
$("holdBtn").addEventListener("click", toggleHold);
$("resetBtn").addEventListener("click", () => {
  resetScenario(state.scenario);
  state.maxReading = 0;
  state.lastReading = null;
  updateDisplay();
  renderGuide();
  toast("Lecturas reiniciadas");
});
$("upBtn").addEventListener("click", () => toast("Navegaci\xF3n superior"));
$("downBtn").addEventListener("click", () => toast("Navegaci\xF3n inferior"));
$("menuBtn").addEventListener("click", () => toast("Configuraci\xF3n: unidades, rango, promedio y alarmas"));
document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
document.querySelectorAll(".mission").forEach((b) => b.addEventListener("click", () => setMission(b.dataset.mission)));
$("probeTarget").addEventListener("click", (e) => {
  if (e.target.id !== "distance") inspectProbe();
});
$("probeTarget").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    inspectProbe();
  }
});
$("powerBtn").addEventListener("click", () => togglePower());
$("audioBtn").addEventListener("click", () => toggleAudio());
$("backgroundBtn").addEventListener("click", measureBackground);
$("distance").addEventListener("input", (e) => setDistance(e.target.value));
$("scanSpeed").addEventListener("input", (e) => setSpeed(e.target.value));
$("startScan").addEventListener("click", startScanning);
$("confirmBtn").addEventListener("click", confirmHotspot);
$("surfaceDoseBtn").addEventListener("click", measureSurfaceDose);
$("oneMeterBtn").addEventListener("click", measureOneMeterDose);
$("calculateTIBtn").addEventListener("click", calculateTI);
$("scenario").addEventListener("change", (e) => {
  resetScenario(e.target.value);
  renderGuide();
  toast(`Escenario cargado: ${scenarios[e.target.value].label}`);
});
$("guideAction").addEventListener("click", () => activeSteps()[state.step].run());
$("guidePrev").addEventListener("click", () => goStep(-1));
$("guideNext").addEventListener("click", () => goStep(1));
$("coachShow").addEventListener("click", () => pointTo(activeSteps()[state.step].target));
$("modeBtn").addEventListener("click", () => toast("CPM localiza incrementos; \xB5Sv/h exige una calibraci\xF3n adecuada."));
$("countBtn").addEventListener("click", confirmHotspot);
const saved = JSON.parse(sessionStorage.getItem(SESSION) || "null");
if (saved?.expiresAt > Date.now()) openApp(saved, false);
else {
  sessionStorage.removeItem(SESSION);
  const msg = sessionStorage.getItem("movida-session-message");
  if (msg) {
    setLogin(msg);
    sessionStorage.removeItem("movida-session-message");
  }
}
