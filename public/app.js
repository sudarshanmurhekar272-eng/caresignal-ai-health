const state = { token: localStorage.getItem("caresignal_token"), user: null, symptoms: [], selected: [], predictions: [], route: "landing" };
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
async function api(path, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers, body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(text) { const node = $("toast"); node.textContent = text; node.classList.remove("hidden"); setTimeout(() => node.classList.add("hidden"), 2600); }
function navigate(route) {
  state.route = route;
  const authenticated = ["dashboard", "predict", "result", "history", "care", "profile"].includes(route);
  $("landing-view").classList.toggle("hidden", route !== "landing");
  $("auth-view").classList.toggle("hidden", !["login", "register"].includes(route));
  $("app-view").classList.toggle("hidden", !authenticated);
  $("public-nav").classList.toggle("hidden", authenticated || ["login", "register"].includes(route));
  $("user-nav").classList.toggle("hidden", !authenticated);
  if (route === "login" || route === "register") renderAuth(route);
  if (authenticated && !state.user) return navigate("login");
  if (authenticated) renderSubpage(route);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderAuth(route) {
  const register = route === "register";
  $("auth-eyebrow").textContent = register ? "Get started" : "Welcome back";
  $("auth-title").textContent = register ? "Create your account" : "Sign in to CareSignal";
  $("auth-subtitle").textContent = register ? "Your information stays yours. This is an educational prototype." : "Continue your private health insights journey.";
  $("register-fields").classList.toggle("hidden", !register);
  $("auth-submit").textContent = register ? "Create account" : "Sign in securely";
  $("auth-switch").innerHTML = register ? 'Already registered? <button class="text-btn" data-route="login">Sign in</button>' : 'New to CareSignal? <button class="text-btn" data-route="register">Create an account</button>';
  $("auth-form").dataset.mode = register ? "register" : "login";
  $("auth-error").classList.add("hidden");
}
async function submitAuth(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const mode = event.target.dataset.mode;
  const payload = Object.fromEntries(form.entries());
  try {
    const data = await api(`/api/auth/${mode}`, { method: "POST", body: payload });
    state.token = data.token; state.user = data.user; localStorage.setItem("caresignal_token", state.token);
    toast(mode === "register" ? "Account created" : "Welcome back");
    navigate("dashboard");
  } catch (error) { $("auth-error").textContent = error.message; $("auth-error").classList.remove("hidden"); }
}
function renderSubpage(route) {
  document.querySelectorAll(".subpage").forEach((node) => node.classList.add("hidden"));
  const target = $(`${route}-page`); if (target) target.classList.remove("hidden");
  document.querySelectorAll(".side-link").forEach((button) => button.classList.toggle("active", button.dataset.route === route));
  if (route === "dashboard") renderDashboard();
  if (route === "predict") renderPredict();
  if (route === "history") renderHistory();
  if (route === "care") renderCare();
  if (route === "profile") renderProfile();
}
async function loadData() {
  if (!state.token) return;
  try { const [profile, symptoms, predictions] = await Promise.all([api("/api/user/profile"), api("/api/symptoms"), api("/api/predictions")]); state.user = profile.user; state.symptoms = symptoms.symptoms; state.predictions = predictions.predictions; }
  catch { state.token = null; localStorage.removeItem("caresignal_token"); }
}
function renderDashboard() {
  const latest = state.predictions[0];
  $("dashboard-page").innerHTML = `<div class="dash-head"><div><p class="muted">Today · ${new Date().toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric" })}</p><h2>Good morning, ${escapeHtml(state.user.name.split(" ")[0])} ✦</h2><p class="muted">A little more clarity can be a helpful first step.</p></div><button class="btn primary" data-route="predict">+ New prediction</button></div><div class="stats"><div class="card stat"><div class="stat-top">Total predictions <span>⌁</span></div><div class="stat-value">${state.predictions.length}</div><div class="green">Stored privately</div></div><div class="card stat"><div class="stat-top">Latest insight <span>◷</span></div><div class="stat-value" style="font-size:19px">${escapeHtml(latest?.prediction || "None yet")}</div><div class="muted small">${latest ? new Date(latest.createdAt).toLocaleDateString() : "Start your first one"}</div></div><div class="card stat"><div class="stat-top">Profile <span>♙</span></div><div class="stat-value">100%</div><div class="green">Complete</div></div><div class="card stat"><div class="stat-top">Safety first <span>♡</span></div><div class="stat-value">24/7</div><div class="muted small">Emergency guidance</div></div></div><div class="dash-grid"><div class="card panel"><div class="panel-head"><h3>Recent predictions</h3><button class="btn soft" data-route="history">View all</button></div>${state.predictions.length ? state.predictions.slice(0,4).map(predictionRow).join("") : `<p class="muted">No predictions yet. Start by recording your symptoms.</p>`}</div><div class="card panel"><div class="panel-head"><h3>Health guidance</h3><span class="green">♡</span></div><div class="health-list"><div class="health-item"><b>✓</b><span>Rest and hydrate when your body asks for it.</span></div><div class="health-item"><b>✓</b><span>Track changes instead of relying on a single moment.</span></div><div class="health-item"><b>✓</b><span>Talk to a professional if symptoms persist or worsen.</span></div></div><button class="btn primary full" data-route="predict">Start a new prediction →</button></div></div>`;
}
function predictionRow(item) { return `<div class="prediction-row"><div><div class="prediction-name">${escapeHtml(item.prediction)}</div><div class="prediction-date">${escapeHtml(item.symptoms.join(" · "))} · ${new Date(item.createdAt).toLocaleDateString()}</div></div><span class="pill ${item.urgent ? "red" : "green"}">${item.urgent ? "Urgent" : "Saved"}</span></div>`; }
function historyRow(item) { return `<div class="prediction-row" data-history="${escapeHtml(`${item.prediction} ${item.symptoms.join(" ")}`.toLowerCase())}"><div><div class="prediction-name">${escapeHtml(item.prediction)}</div><div class="prediction-date">${escapeHtml(item.symptoms.join(" · "))} · ${new Date(item.createdAt).toLocaleDateString()}</div></div><button class="btn soft delete-pred" data-id="${item.id}">Delete</button></div>`; }
function renderPredict() {
  state.selected = [];
  $("predict-page").innerHTML = `<div class="card prediction-card"><span class="eyebrow">Step 1 of 2 · Symptom check</span><h1 class="page-title">What are you experiencing?</h1><p class="muted">Select all symptoms that apply. More context helps organize your information.</p><div class="search-wrap"><span>⌕</span><input class="search" id="symptom-search" placeholder="Search symptoms..."></div><div class="symptoms" id="symptom-list"></div><div class="selected" id="selected-list">No symptoms selected yet</div><div class="fields"><label>Age<input id="predict-age" type="number" value="${escapeHtml(state.user.age || "")}"></label><label>How long?<select id="predict-duration"><option>Today</option><option>2–3 days</option><option>About a week</option><option>More than a week</option></select></label><label>Severity<select id="predict-severity"><option>Mild</option><option>Moderate</option><option>Severe</option></select></label></div><div id="urgent-alert"></div><div class="alert info">ⓘ <span>Please enter accurate information. This tool provides an AI-based preliminary prediction and does not replace professional medical advice.</span></div><button class="btn primary full" id="predict-submit">Generate preliminary result →</button></div>`;
  renderSymptomList(); $("symptom-search").addEventListener("input", renderSymptomList); $("predict-submit").addEventListener("click", submitPrediction);
}
function renderSymptomList() {
  const query = ($("symptom-search")?.value || "").toLowerCase();
  $("symptom-list").innerHTML = state.symptoms.filter((item) => item.includes(query)).map((item) => `<button class="symptom ${state.selected.includes(item) ? "selected" : ""}" data-symptom="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("");
  $("selected-list").textContent = state.selected.length ? `${state.selected.length} selected: ${state.selected.join(", ")}` : "No symptoms selected yet";
  document.querySelectorAll("[data-symptom]").forEach((button) => button.addEventListener("click", () => { const value = button.dataset.symptom; state.selected = state.selected.includes(value) ? state.selected.filter((item) => item !== value) : [...state.selected, value]; renderSymptomList(); updateUrgent(); }));
  updateUrgent();
}
function updateUrgent() { const urgent = state.selected.filter((item) => ["chest pain", "shortness of breath", "loss of consciousness"].includes(item)); $("urgent-alert").innerHTML = urgent.length ? `<div class="alert danger">⚠ <span><b>Urgent symptoms detected.</b><br>Contact your local emergency service or seek immediate medical care. Do not wait for an AI prediction.</span></div>` : ""; }
async function submitPrediction() {
  if (!state.selected.length) return toast("Select at least one symptom first");
  if (document.getElementById("urgent-alert").textContent) return toast("Please seek urgent medical care");
  try { const data = await api("/api/predict", { method: "POST", body: { symptoms: state.selected, age: $("predict-age").value, duration: $("predict-duration").value, severity: $("predict-severity").value } }); state.predictions.unshift(data.prediction); renderResult(data.prediction); navigate("result"); } catch (error) { toast(error.message); }
}
function renderResult(prediction) {
  $("result-page").innerHTML = `<div class="card panel"><div class="result-hero"><div><span class="eyebrow">Preliminary model result</span><div class="result-name">${escapeHtml(prediction.prediction)}</div><p class="muted">Based on the information provided, this is one possible explanation to discuss with a professional.</p></div><div class="score"><b>—</b><span>No score claimed</span></div></div><div class="notice" style="margin-top:20px"><b>Not a diagnosis:</b> This result is generated for informational purposes only. Please consult a qualified healthcare professional for medical evaluation.</div>${prediction.urgent ? `<div class="alert danger">⚠ <span><b>Urgent symptoms were included.</b> Seek immediate medical care.</span></div>` : ""}<div class="result-grid"><div class="info-box"><h3>Symptoms considered</h3><p>${escapeHtml(prediction.symptoms.join(", "))}</p></div><div class="info-box"><h3>General description</h3><p>${escapeHtml(prediction.description)}</p></div><div class="info-box"><h3>General self-care</h3><ul>${prediction.selfCare.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><div class="info-box"><h3>Prevention ideas</h3><p>${escapeHtml(prediction.prevention || "Discuss prevention with a qualified healthcare professional.")}</p></div><div class="info-box"><h3>When to seek care</h3><p>${escapeHtml(prediction.contactDoctor)}</p><p><b>Emergency signs:</b> ${escapeHtml(prediction.emergencySigns.join(", "))}</p></div></div><div class="actions"><button class="btn primary" data-route="history">View saved history</button><button class="btn soft" data-route="care">Find nearby care</button><button class="btn soft" onclick="window.print()">Print result</button><button class="btn link-btn" data-route="predict">Try again</button></div></div>`;
}
function renderHistory() {
  $("history-page").innerHTML = `<div class="dash-head"><div><span class="eyebrow">Your records</span><h1 class="page-title">Prediction history</h1><p class="muted">Only the minimum information needed is stored in this prototype.</p></div><button class="btn primary" data-route="predict">+ New prediction</button></div><div class="card panel"><div class="panel-head"><h3>Recent activity</h3><input class="search" style="max-width:220px;padding:9px" placeholder="Search history..." id="history-search"></div><div id="history-list">${state.predictions.length ? state.predictions.map(historyRow).join("") : `<p class="muted">No saved predictions yet.</p>`}</div></div><div class="notice" style="margin-top:18px">Privacy note: production should provide export and deletion controls, explain retention clearly, and never expose health information unnecessarily.</div>`;
  $("history-search")?.addEventListener("input", (event) => document.querySelectorAll("[data-history]").forEach((row) => row.classList.toggle("hidden", !row.dataset.history.includes(event.target.value.toLowerCase()))));
  document.querySelectorAll(".delete-pred").forEach((button) => button.addEventListener("click", async () => { if (!confirm("Delete this prediction history item?")) return; await api(`/api/predictions/${button.dataset.id}`, { method:"DELETE" }); state.predictions = state.predictions.filter((item) => item.id !== button.dataset.id); renderHistory(); toast("History item deleted"); }));
}
function renderCare() {
  $("care-page").innerHTML = `<div class="care-intro"><div><span class="eyebrow">Local support</span><h1 class="page-title">Find nearby care</h1><p class="muted">Use your location or enter a city/pincode to find nearby hospitals, clinics, and doctors. CareSignal does not save your coordinates.</p></div><button class="btn primary" id="find-care">⌖ Use my location</button></div><div class="care-search"><input id="care-query" placeholder="Search by city or pincode, e.g. Nagpur 440001"><button class="btn soft" id="search-care">Search location</button></div><div class="notice">For severe chest pain, severe breathing difficulty, loss of consciousness, severe bleeding, or stroke-like symptoms, contact your local emergency service immediately instead of waiting for search results.</div><div id="care-status" class="empty-care" style="margin-top:18px">Choose a search method to find care within about 5 km.</div><div id="care-results" class="care-grid" style="margin-top:18px"></div>`;
  $("find-care").addEventListener("click", findNearbyCare);
  $("search-care").addEventListener("click", searchCareByText);
  $("care-query").addEventListener("keydown", (event) => { if (event.key === "Enter") searchCareByText(); });
}
function renderCareProviders(data, label) {
  const status = $("care-status");
  const results = $("care-results");
  results.innerHTML = data.providers.length ? data.providers.map((provider) => `<article class="card care-card"><span class="care-type">${escapeHtml(provider.type)}</span><h3>${escapeHtml(provider.name)}</h3><div class="care-meta"><span>⌖ ${escapeHtml(provider.address)}</span><span>◉ ${provider.distanceKm} km away</span>${provider.phone ? `<span>☎ ${escapeHtml(provider.phone)}</span>` : ""}</div><div class="care-links">${provider.phone ? `<a class="btn soft" href="tel:${escapeHtml(provider.phone)}">Call</a>` : ""}${provider.website ? `<a class="btn soft" href="${escapeHtml(provider.website)}" target="_blank" rel="noopener">Website</a>` : ""}<a class="btn primary" href="${escapeHtml(provider.mapUrl)}" target="_blank" rel="noopener">Open map</a></div></article>`).join("") : `<div class="empty-care">No nearby providers were listed. Try a wider-area city or pincode search.</div>`;
  status.textContent = data.providers.length ? `Found ${data.providers.length} nearby care options${label ? ` near ${label}` : ""}.` : "No nearby providers were listed.";
}
async function findNearbyCare() {
  const status = $("care-status");
  if (!navigator.geolocation) { status.textContent = "Location is not available in this browser. Search your local health service directly."; return; }
  status.textContent = "Requesting your location…";
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const data = await api(`/api/doctors/nearby?lat=${position.coords.latitude}&lon=${position.coords.longitude}`);
      renderCareProviders(data);
    } catch (error) { status.textContent = error.message; }
  }, () => { status.textContent = "Location permission was not granted. You can search a local hospital or doctor directly instead."; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}
async function searchCareByText() {
  const query = $("care-query").value.trim();
  const status = $("care-status");
  if (query.length < 3) { status.textContent = "Enter at least 3 characters for a city or pincode."; return; }
  status.textContent = "Searching that location…";
  try {
    const data = await api(`/api/doctors/search?q=${encodeURIComponent(query)}`);
    renderCareProviders(data, data.location);
  } catch (error) { status.textContent = error.message; }
}
function renderProfile() { $("profile-page").innerHTML = `<div class="card panel profile-form"><span class="eyebrow">Account settings</span><h1 class="page-title">My profile</h1><p class="muted">Keep your basic information up to date.</p><div class="cols"><label>Full name<input id="profile-name" value="${escapeHtml(state.user.name)}"></label><label>Email<input value="${escapeHtml(state.user.email)}" disabled></label><label>Mobile number<input id="profile-mobile" value="${escapeHtml(state.user.mobile)}"></label><label>Age<input id="profile-age" type="number" value="${escapeHtml(state.user.age || "")}"></label><label>Gender<select id="profile-gender"><option ${state.user.gender === "" ? "selected" : ""}>Select</option><option ${state.user.gender === "Female" ? "selected" : ""}>Female</option><option ${state.user.gender === "Male" ? "selected" : ""}>Male</option><option ${state.user.gender === "Other" ? "selected" : ""}>Other</option></select></label></div><button class="btn primary" id="save-profile">Save profile changes</button></div>`; $("save-profile").addEventListener("click", async () => { const data = await api("/api/user/profile", { method:"PUT", body:{ name:$("profile-name").value, mobile:$("profile-mobile").value, age:$("profile-age").value, gender:$("profile-gender").value } }); state.user = data.user; toast("Profile changes saved"); }); }
async function sendChat(event) { event.preventDefault(); const input = $("chat-input"); const text = input.value.trim(); if (!text) return; const messages = $("chat-messages"); messages.insertAdjacentHTML("beforeend", `<div class="bubble user">${escapeHtml(text)}</div>`); input.value = ""; try { const data = await api("/api/chat", { method:"POST", body:{ message:text } }); messages.insertAdjacentHTML("beforeend", `<div class="bubble bot">${escapeHtml(data.reply)}</div>`); messages.scrollTop = messages.scrollHeight; } catch { toast("Chat service unavailable"); } }
document.addEventListener("click", (event) => { const route = event.target.closest("[data-route]")?.dataset.route; if (route) navigate(route); });
(function setupTheme() {
  const saved = localStorage.getItem("caresignal_theme");
  if (saved === "dark") document.body.classList.add("dark");
  const update = () => {
    const icon = document.body.classList.contains("dark") ? "☀" : "☾";
    $("theme-toggle").textContent = icon;
    $("theme-toggle-app").textContent = icon;
  };
  const toggle = () => { document.body.classList.toggle("dark"); localStorage.setItem("caresignal_theme", document.body.classList.contains("dark") ? "dark" : "light"); update(); };
  $("theme-toggle").addEventListener("click", toggle);
  $("theme-toggle-app").addEventListener("click", toggle);
  update();
})();
$("auth-form").addEventListener("submit", submitAuth); $("chat-form").addEventListener("submit", sendChat); $("chat-toggle").addEventListener("click", () => $("chat-panel").classList.toggle("hidden")); $("logout").addEventListener("click", async () => { await api("/api/auth/logout", { method:"POST" }).catch(() => {}); state.token = null; state.user = null; localStorage.removeItem("caresignal_token"); navigate("landing"); toast("You have been logged out"); });
(async () => { await loadData(); navigate(state.user ? "dashboard" : "landing"); })();