const $ = (id) => document.getElementById(id);
const SUPABASE_URL = "https://lfdmbkzghnwvsapxypvt.supabase.co";
const KEY = "sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1";
const SESSION = "movida-geiger-session", ATTEMPTS = "movida-geiger-attempts";
const state = { mode: "guided", mission: "presence", step: 0, powered: false, audio: false, light: false, hold: false, unit: "\xB5Sv/h", range: "AUTO", inspected: false, background: null, gross: null, scanStarted: false, scanComplete: false, hotspot: false, confirmed: false, distance: 100, speed: 5, scenario: "lab", surfaceDose: null, oneMeterDose: null, transportDone: false, guideComplete: false, unitConfirmed: false, lastReading: null, maxReading: 0, timer: null };
const scenarios = { lab: { background: 36, gross: 184, dose: 0.42, surfaceDose: 74, oneMeterDose: 3.4, label: "Mes\xF3n de radiois\xF3topos" }, nuclear: { background: 44, gross: 328, dose: 1.18, surfaceDose: 286, oneMeterDose: 8.7, label: "\xC1rea de medicina nuclear" }, waste: { background: 29, gross: 112, dose: 0.31, surfaceDose: 4.2, oneMeterDose: 0.34, label: "Almac\xE9n de residuos" }, gauge: { background: 34, gross: 486, dose: 2.4, surfaceDose: 740, oneMeterDose: 13.2, label: "Medidor nuclear industrial" }, scrap: { background: 31, gross: 690, dose: 4.8, surfaceDose: 1280, oneMeterDose: 22.5, label: "Patio de chatarra" } };
const commonInspect = {
  title: "Selecciona e inspecciona el detector",
  text: "La configuración cambia según la misión. Revisa carcasa, cable, conector, ventana y vigencia de calibración antes de usarla.",
  why: "una sonda inadecuada o dañada puede responder, pero entregar una magnitud que no sirve para decidir.",
  observe: "la tarjeta “Detector seleccionado” debe coincidir con el objetivo de la misión.",
  target: "probeTarget", action: "Inspeccionar detector", done: () => state.inspected, run: inspectProbe
};
const commonPower = {
  title: "Enciende y comprueba el instrumento",
  text: "Pulsa ON/OFF y espera la autocomprobación de batería, pantalla, audio y estado del detector.",
  why: "una lectura solo es defendible si el sistema está operativo antes de entrar al área.",
  observe: "LED verde, batería suficiente y pantalla sin mensajes de falla.",
  target: "powerBtn", action: "Encender equipo", done: () => state.powered, run: () => togglePower(true)
};
const commonAudio = {
  title: "Activa la respuesta audible",
  text: "Activa AUDIO para reconocer cambios de la tasa mientras mantienes la vista en el recorrido.",
  why: "la cadencia de pulsos ayuda a advertir un gradiente sin fijar la mirada en la pantalla.",
  observe: "el indicador AUDIO queda activo; más pulsos significan mayor respuesta, no identificación del radionucleido.",
  target: "audioBtn", action: "Activar audio", done: () => state.audio, run: () => toggleAudio(true)
};
const doseBackgroundStep = {
  title: "Establece la tasa de fondo",
  text: "Mide 60 s en una zona representativa, lejos del objeto o punto sospechoso, manteniendo la misma unidad.",
  why: "el fondo es la referencia para reconocer un incremento y documentar la condición inicial.",
  observe: "una lectura estable en µSv/h; no restes automáticamente el fondo para comparar una tasa de dosis calibrada.",
  target: "backgroundBtn", action: "Medir fondo 60 s", done: () => state.background !== null, run: measureBackground
};
const contaminationBackgroundStep = {
  title: "Mide el conteo de fondo",
  text: "Con la pancake alejada de la superficie, cuenta durante 60 s y registra el resultado en CPM.",
  why: "la contaminación se decide comparando el conteo bruto con la variabilidad del fondo.",
  observe: "CPM de fondo y el mismo tiempo de conteo que documentarás en el registro.",
  target: "backgroundBtn", action: "Medir fondo en CPM", done: () => state.background !== null, run: measureBackground
};
const presenceSteps = [
  commonInspect, commonPower,
  { title: "Confirma la magnitud correcta", text: "Usa la lectura principal Ḣ*(10) en µSv/h del detector compensado. CPM/CPS quedan como diagnóstico interno.", why: "la tasa de conteo no equivale universalmente a tasa de dosis.", observe: "la pantalla indica µSv/h y “TASA DE DOSIS H*(10)”.", target: "unitsBtn", action: "Confirmar µSv/h", done: () => state.unitConfirmed && state.unit === "µSv/h", run: ensureDoseUnit },
  doseBackgroundStep, commonAudio,
  { title: "Inicia a distancia prudente", text: "Ubica la sonda aproximadamente a 1 m antes de aproximarte. Mantén una geometría repetible.", why: "tiempo, distancia y blindaje reducen la exposición durante el reconocimiento.", observe: "el control de distancia muestra 1,0 m.", target: "distance", action: "Ubicar a 1 metro", done: () => state.distance >= 100, run: () => setDistanceAndAdvance(100) },
  { title: "Reconoce el área sistemáticamente", text: "Recorre el área lentamente, observa la tendencia y retrocede si la tasa aumenta con rapidez.", why: "el objetivo es caracterizar el campo sin exponerte innecesariamente.", observe: "un incremento sostenido respecto al fondo y no un pulso aislado.", target: "startScan", action: "Iniciar reconocimiento", done: () => state.scanComplete, run: startScanning },
  { title: "Confirma la tasa en un punto definido", text: "Mantén fija la geometría y confirma durante 30 s.", why: "una lectura estable y reproducible permite interpretar y registrar.", observe: "tasa confirmada, valor máximo y unidad µSv/h.", target: "confirmBtn", action: "Confirmar 30 s", done: () => state.confirmed, run: confirmHotspot },
  { title: "Interpreta tasa, tiempo y control", text: "Revisa la tasa indicada, la proyección ilustrativa para 8 h y el nivel de investigación del ejercicio.", why: "µSv/h es rapidez de acumulación; la dosis depende del tiempo real de permanencia.", observe: "el resultado distingue detección, nivel operativo y dosis proyectada; no lo llama límite legal universal.", target: "verdict", action: "Revisar interpretación", done: () => state.confirmed, run: () => advanceSoon() },
  { title: "Registra y comunica", text: "Documenta detector, calibración, ubicación, fondo, geometría, tasa máxima, tiempo y controles aplicados.", why: "la trazabilidad permite repetir la medición y justificar la decisión ocupacional.", observe: "un cierre completo; si hay incremento relevante, controla el área y comunica al responsable de protección radiológica.", target: "powerBtn", action: "Apagar desde el equipo", done: () => state.confirmed && !state.powered, run: () => pointTo("powerBtn") }
];
const sourceSteps = [
  commonInspect, commonPower, commonAudio, doseBackgroundStep,
  { title: "Comienza sin acercarte al objeto", text: "Inicia aproximadamente a 1 m y nunca recojas ni manipules el objeto sospechoso.", why: "una fuente huérfana puede producir un gradiente desconocido; primero protege a las personas.", observe: "ruta de retirada disponible y distancia marcada en 1,0 m.", target: "distance", action: "Comenzar a 1 metro", done: () => state.distance >= 100, run: () => setDistanceAndAdvance(100) },
  { title: "Busca el gradiente, no el objeto", text: "Haz un recorrido lento y ordenado. Si la tasa crece rápidamente, retrocede y delimita.", why: "localizar no significa aproximarse hasta tocar; la seguridad manda sobre la precisión.", observe: "aumento sostenido de µSv/h y de la señal audible al cambiar de posición.", target: "startScan", action: "Iniciar búsqueda segura", done: () => state.scanComplete, run: startScanning },
  { title: "Confirma desde una posición segura", text: "Conserva distancia y orientación, realiza una lectura fija de 30 s y no manipules la fuente.", why: "confirmar el gradiente aporta evidencia sin aumentar innecesariamente la exposición.", observe: "tasa reproducible por encima del fondo.", target: "confirmBtn", action: "Confirmar incremento", done: () => state.confirmed, run: confirmHotspot },
  { title: "Toma la decisión ocupacional", text: "Interrumpe el acceso, aumenta la distancia y notifica al responsable radiológico; no intentes identificar el radionucleido con este equipo.", why: "un GM localiza radiación, pero no realiza espectrometría ni identifica la fuente.", observe: "el veredicto indica no tocar, aislar y comunicar.", target: "verdict", action: "Revisar respuesta", done: () => state.confirmed, run: () => advanceSoon() },
  { title: "Registra el hallazgo", text: "Anota croquis, posiciones, distancias, tasas, hora, instrumento y personas notificadas.", why: "el registro facilita una intervención radiológica especializada.", observe: "la ubicación se describe sin mover el objeto.", target: "verdict", action: "Registrar hallazgo", done: () => state.confirmed, run: () => advanceSoon() },
  { title: "Cierra sin manipular", text: "Mantén el área controlada y entrega la gestión a personal autorizado.", why: "el cierre seguro evita exposición secundaria o pérdida de trazabilidad.", observe: "práctica finalizada con el área aislada.", target: "powerBtn", action: "Apagar desde el equipo", done: () => state.confirmed && !state.powered, run: () => pointTo("powerBtn") }
];
const contaminationSteps = [
  commonInspect, commonPower,
  { title: "Selecciona CPM", text: "La sonda pancake informa tasa de conteo. Usa CPM para fondo, barrido y confirmación.", why: "sin eficiencia y radionucleido conocidos, CPM no debe presentarse como µSv/h ni como actividad superficial.", observe: "la pantalla y los resultados muestran CPM.", target: "unitsBtn", action: "Confirmar CPM", done: () => state.unitConfirmed && state.unit === "CPM", run: ensureCountUnit },
  contaminationBackgroundStep, commonAudio,
  { title: "Ajusta distancia y orientación", text: "Mantén la ventana paralela a 0,3–0,6 cm, sin tocar la superficie.", why: "la distancia modifica mucho la eficiencia y el contacto puede romper o contaminar la ventana.", observe: "0,5 cm y cara sensible paralela a la superficie.", target: "distance", action: "Ajustar a 0,5 cm", done: () => state.distance >= 0.3 && state.distance <= 0.6, run: () => setDistanceAndAdvance(0.5) },
  { title: "Ajusta la velocidad de barrido", text: "Selecciona 3–6 cm/s y utiliza pasadas paralelas ligeramente solapadas.", why: "un barrido rápido reduce el tiempo sobre una zona activa y puede omitir contaminación.", observe: "5 cm/s y cobertura completa, sin huecos.", target: "scanSpeed", action: "Ajustar a 5 cm/s", done: () => state.speed >= 3 && state.speed <= 6, run: () => { setSpeed(5); $("scanSpeed").value=5; advanceSoon(); } },
  { title: "Barre toda la superficie", text: "Inicia el patrón ordenado y usa el audio para localizar la máxima respuesta.", why: "el barrido sirve para localizar; todavía no es la medición confirmatoria.", observe: "aumento de CPM en una zona y recorrido completo.", target: "startScan", action: "Iniciar barrido", done: () => state.scanComplete, run: startScanning },
  { title: "Confirma en posición fija", text: "Detén la sonda sobre el máximo y cuenta 30 s conservando la geometría.", why: "el conteo fijo permite calcular tasa neta y evaluar la señal frente al fondo.", observe: "conteo bruto, tasa neta, umbral de decisión e intervalo de cobertura.", target: "confirmBtn", action: "Confirmar 30 s", done: () => state.confirmed, run: confirmHotspot },
  { title: "Interpreta sin inventar actividad", text: "Decide si el efecto está demostrado sobre el fondo. No conviertas a Bq/cm² sin eficiencia, área y radionucleido.", why: "una tasa neta detectada no equivale por sí sola a actividad superficial.", observe: "el veredicto dice detectado/no demostrado y conserva CPM.", target: "powerBtn", action: "Apagar desde el equipo", done: () => state.confirmed && !state.powered, run: () => pointTo("powerBtn") }
];
const transportSteps = [
  commonInspect, commonPower,
  { title: "Confirma el medidor de tasa de dosis", text: "Para esta misión usa el detector calibrado que indica Ḣ*(10) en µSv/h.", why: "el índice de transporte se basa en la tasa máxima a 1 m, no en CPM.", observe: "unidad µSv/h y configuración de tasa de dosis.", target: "unitsBtn", action: "Confirmar µSv/h", done: () => state.unitConfirmed && state.unit === "µSv/h", run: ensureDoseUnit },
  doseBackgroundStep,
  { title: "Localiza el máximo superficial", text: "Sin manipular innecesariamente el bulto, recorre sus caras y registra la tasa máxima en la superficie.", why: "la categoría de etiqueta también depende del máximo superficial.", observe: "máximo superficial en µSv/h y condición física del bulto.", target: "surfaceDoseBtn", action: "Medir máximo superficial", done: () => state.surfaceDose !== null, run: measureSurfaceDose },
  { title: "Mide exactamente a 1 metro", text: "Desde el punto de la superficie externa donde obtuviste el máximo, establece 1 m y mide la tasa máxima.", why: "el IT se calcula con la tasa a 1 m de la superficie externa, no del centro.", observe: "lectura a 1 m expresada en µSv/h.", target: "oneMeterBtn", action: "Medir a 1 metro", done: () => state.oneMeterDose !== null, run: measureOneMeterDose },
  { title: "Calcula el índice de transporte", text: "Convierte µSv/h a mSv/h, multiplica por 100 y aplica el redondeo correspondiente.", why: "esa operación produce el número adimensional usado para control del transporte.", observe: "por ejemplo, 8,7 µSv/h = 0,0087 mSv/h; ×100 = 0,87, IT mostrado 0,9.", target: "calculateTIBtn", action: "Calcular IT", done: () => state.transportDone, run: calculateTI },
  { title: "Verifica ambos criterios", text: "Revisa simultáneamente IT y máximo superficial para determinar la categoría simulada.", why: "la etiqueta no se decide únicamente con el IT.", observe: "I‑BLANCA, II‑AMARILLA, III‑AMARILLA o fuera del alcance ordinario.", target: "tiResult", action: "Revisar categoría", done: () => state.transportDone, run: () => advanceSoon() },
  { title: "No confundas IT con CSI", text: "El IT se relaciona con exposición externa; el índice de seguridad con respecto a la criticidad aplica a material fisible.", why: "son controles diferentes aunque ambos puedan aparecer en documentación de transporte.", observe: "el resultado permanece identificado como índice de transporte.", target: "tiResult", action: "Comprendí la diferencia", done: () => state.transportDone, run: () => advanceSoon() },
  { title: "Registra la verificación", text: "Documenta instrumento, calibración, fondo, máximos, distancia, IT, categoría, fecha y responsable.", why: "la trazabilidad forma parte del control del bulto y de la comunicación del riesgo.", observe: "verificación finalizada con todos los datos esenciales.", target: "powerBtn", action: "Apagar desde el equipo", done: () => state.transportDone && !state.powered, run: () => pointTo("powerBtn") }
];
function activeSteps() {
  return ({ presence: presenceSteps, source: sourceSteps, contamination: contaminationSteps, transport: transportSteps })[state.mission];
}
function ensureDoseUnit() {
  if (!state.powered) { toast("Primero enciende el instrumento."); pointTo("powerBtn"); return; }
  state.unit = "µSv/h"; state.unitConfirmed = true; state.hold = false; updateDisplay(state.background); renderGuide();
  toast("Magnitud confirmada: tasa de equivalente de dosis ambiental Ḣ*(10)");
  advanceSoon();
}
function ensureCountUnit() {
  if (!state.powered) { toast("Primero enciende el instrumento."); pointTo("powerBtn"); return; }
  state.unit = "CPM"; state.unitConfirmed = true; state.hold = false; updateDisplay(state.background); renderGuide();
  toast("Magnitud confirmada: tasa de conteo en CPM");
  advanceSoon();
}
function setDistanceAndAdvance(value) {
  $("distance").value = value; setDistance(value); advanceSoon();
}
function finishGuide() {
  state.guideComplete = true;
  renderGuide();
  toast("Misión completada · revisa el resumen y registra el resultado");
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
  const currentGuideStep = state.mode === "guided" ? activeSteps()[state.step] : null;
  if (currentGuideStep?.target === "unitsBtn" && !currentGuideStep.done()) {
    if (state.mission === "contamination") ensureCountUnit();
    else ensureDoseUnit();
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
  $("guideObserve").textContent = s.observe;
  $("guideAction").textContent = state.step === flow.length - 1 ? "Señalar botón ON/OFF" : "Señalar control en el equipo";
  $("guideBar").style.width = `${(state.step + 1) / flow.length * 100}%`;
  $("guidePrev").disabled = state.step === 0;
  $("guideNext").textContent = state.guideComplete ? "Misión completada ✓" : "Siguiente →";
  $("guideNext").disabled = !s.done() || state.step === flow.length - 1;
  if (state.step === flow.length - 1 && s.done()) state.guideComplete = true;
  $("guideCard").classList.toggle("complete", state.guideComplete);
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
  Object.assign(state, { mission, step: 0, advancing: false, inspected: false, powered: false, audio: false, guideComplete: false, unitConfirmed: false, unit: mission === "contamination" ? "CPM" : "\xB5Sv/h", lastReading: null, maxReading: 0 });
  document.querySelectorAll(".mission").forEach((b) => b.classList.toggle("active", b.dataset.mission === mission));
  $("transportPanel").hidden = mission !== "transport";
  const contamination = mission === "contamination";
  const configs = {
    presence: ["Detector GM compensado para gamma", "Ḣ*(10) · µSv/h", "Reconocimiento del campo y tasa de equivalente de dosis ambiental. No sustituye el dosímetro personal."],
    source: ["Detector GM compensado para gamma", "Ḣ*(10) · µSv/h", "Búsqueda por gradiente desde una distancia segura. No identifica radionucleidos."],
    contamination: ["Sonda GM pancake de ventana delgada", "Tasa de conteo · CPM/CPS", "Barrido y confirmación de contaminación. CPM no se convierte universalmente en dosis ni Bq/cm²."],
    transport: ["Detector de tasa de dosis calibrado", "Ḣ*(10) · µSv/h", "Máximo superficial y máximo a 1 m para verificar el índice de transporte."]
  };
  [$("activeProbe").textContent, $("activeQuantity").textContent, $("activeUse").textContent] = configs[mission];
  $("meterLabel").textContent = contamination ? "MONITOR DE CONTAMINACIÓN · SONDA PANCAKE" : "MEDIDOR DE TASA DE DOSIS · RESPUESTA CALIBRADA";
  document.querySelector(".instrument-stage").classList.toggle("dose-probe", !contamination);
  $("probeTypeLabel").textContent = contamination ? "α · β · γ" : "H*(10) · γ";
  $("probeSerial").textContent = contamination ? "GM‑P45" : "GM‑D10";
  $("techniqueTitle").textContent = contamination ? "Técnica de barrido superficial" : "Técnica de reconocimiento radiológico";
  $("techniqueList").innerHTML = contamination
    ? "<li><b>Distancia:</b> 0,3–0,6 cm, sin tocar.</li><li><b>Velocidad:</b> 3–6 cm/s en este ejercicio.</li><li><b>Trayectoria:</b> pasadas paralelas ligeramente solapadas.</li><li><b>Resultado:</b> CPM bruto y neto; Bq/cm² exige calibración adicional.</li>"
    : "<li><b>Inicio:</b> desde una distancia prudente y con ruta de retirada.</li><li><b>Lectura:</b> Ḣ*(10) en µSv/h con detector apropiado.</li><li><b>Tendencia:</b> observa el gradiente y retrocede ante aumentos rápidos.</li><li><b>Control:</b> tiempo, distancia, blindaje y comunicación.</li>";
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
  Object.assign(state, { scenario: value, background: null, gross: null, scanStarted: false, scanComplete: false, hotspot: false, confirmed: false, surfaceDose: null, oneMeterDose: null, transportDone: false, guideComplete: false, unitConfirmed: false, lastReading: null, maxReading: 0 });
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
$("guideAction").addEventListener("click", () => pointTo(activeSteps()[state.step].target));
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
