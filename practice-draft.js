const fields = ["hours", "sampleSeconds", "evidenceReading", "learnerIT", "recipient", "message", "decision", "probeChoice", "fitness"];
const outputs = ["surfaceDose", "oneMeterDose", "tiResult", "tiCategory", "backgroundResult", "grossResult", "backgroundUnit", "grossUnit", "decisionFeedback"];

export function readDraft(owner) {
  try {
    const saved = JSON.parse(sessionStorage.getItem("geiger-practice-v1"));
    return saved && saved.owner === owner ? saved : null;
  } catch { return null; }
}

export function discardDraft() {
  sessionStorage.removeItem("geiger-practice-v1");
}

export function saveDraft(owner, state) {
  if (!owner) return;
  const { timer, advanceTimer, advancing, ...progress } = state;
  const values = Object.fromEntries(fields.map(id => [id, document.getElementById(id).value]));
  const readings = Object.fromEntries(outputs.map(id => [id, document.getElementById(id).textContent]));
  try {
    sessionStorage.setItem("geiger-practice-v1", JSON.stringify({owner, progress, values, readings}));
  } catch { /* Session storage may be unavailable in private navigation. */ }
}

export function restoreForm(draft) {
  for (const id of fields) document.getElementById(id).value = draft.values[id] ?? "";
  for (const id of outputs) document.getElementById(id).textContent = draft.readings[id] ?? "";
  document.getElementById("saveReport").hidden = !draft.progress.submission;
}
