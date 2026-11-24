const porthole = document.querySelector("#porthole");
const caption = document.querySelector("#caption");
const life = document.querySelector("#life");
const zs = document.querySelector("#zs");
const log = document.querySelector("#log");
const bones = document.querySelector("#bones");
const gossip = document.querySelector("#gossip");
const yard = document.querySelector("#yard");
const guestForm = document.querySelector("#guest");
const loginForm = document.querySelector("#login");
const leave = document.querySelector("#leave");
const alertBox = document.querySelector("#alert");
const clock = document.querySelector("#clock");
const hurt = document.querySelector("#hurt");

const visitorThread = [];
let lastCount = 0;

function showError(text) {
  alertBox.hidden = !text;
  alertBox.textContent = text || "";
}

function madridClock(date) {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return text.replace(/^24:/, "00:");
}

function renderList(node, items, emptyText, map) {
  node.replaceChildren();
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = emptyText;
    node.append(li);
    return;
  }
  for (const item of items) node.append(map(item));
}

function render(state) {
  porthole.dataset.mood = state.mood;
  caption.textContent = state.caption;
  life.textContent = state.life === "puppy" ? "Puppy" : "Grown";
  life.hidden = state.caption === life.textContent;
  zs.hidden = state.mood !== "dreaming";
  yard.hidden = !state.owner;
  gossip.hidden = !state.owner;
  guestForm.hidden = state.owner;
  loginForm.hidden = state.owner;
  leave.hidden = !state.owner;
  hurt.hidden = !state.hurt;
  hurt.textContent = state.hurt ? "You restored an older copy of me." : "";

  if (!state.owner && visitorThread.length === 0 && state.greeting) {
    visitorThread.push({ role: "gos", content: state.greeting });
  }
  const shown = state.owner ? state.messages : visitorThread;
  renderList(log, shown, "No messages.", (message) => {
    const li = document.createElement("li");
    li.className = message.role === "gos" ? "gos" : "user";
    li.textContent = message.content;
    return li;
  });
  if (shown.length > lastCount) {
    porthole.classList.remove("wag");
    void porthole.offsetWidth;
    porthole.classList.add("wag");
  }
  lastCount = shown.length;

  renderList(bones, state.bones, "No bones.", (bone) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = bone.note;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Delete";
    button.addEventListener("click", () => removeBone(bone.id));
    li.append(span, button);
    return li;
  });

  renderList(gossip, state.gossip, "No visitors.", (line) => {
    const li = document.createElement("li");
    li.textContent = line;
    return li;
  });
}

async function refresh() {
  const response = await fetch("/api/state");
  if (!response.ok) {
    showError("Could not load Gos. Try again.");
    return;
  }
  showError("");
  render(await response.json());
}

async function sendJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not do that. Try again.");
  return body;
}

document.querySelector("#chat").addEventListener("submit", async (event) => {
  event.preventDefault();
  const field = document.querySelector("#msg");
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    const sent = field.value;
    const state = await sendJson("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: sent }),
    });
    field.value = "";
    if (!state.owner) {
      visitorThread.push({ role: "user", content: sent });
      if (state.reply) visitorThread.push({ role: "gos", content: state.reply });
    }
    render(state);
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#bury").addEventListener("submit", async (event) => {
  event.preventDefault();
  const field = document.querySelector("#note");
  try {
    await sendJson("/api/bones", { method: "POST", body: JSON.stringify({ note: field.value }) });
    field.value = "";
    await refresh();
  } catch (error) {
    showError(error.message);
  }
});

async function removeBone(id) {
  try {
    await sendJson(`/api/bones/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
    await refresh();
  } catch (error) {
    showError(error.message);
  }
}

document.querySelector("#guest").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#gname").value;
  const note = document.querySelector("#gnote").value;
  try {
    await sendJson("/api/guestbook", { method: "POST", body: JSON.stringify({ name, note }) });
    document.querySelector("#gname").value = "";
    document.querySelector("#gnote").value = "";
    showError("");
    visitorThread.push({ role: "gos", content: "Signed." });
    const done = document.createElement("li");
    done.className = "gos";
    done.textContent = "Signed.";
    log.querySelector(".empty")?.remove();
    log.append(done);
  } catch (error) {
    showError(error.message);
  }
});

document.querySelector("#login").addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = document.querySelector("#token").value;
  try {
    await sendJson("/api/login", { method: "POST", body: JSON.stringify({ token }) });
    document.querySelector("#token").value = "";
    await refresh();
  } catch (error) {
    showError(error.message);
  }
});

leave.addEventListener("click", async () => {
  await sendJson("/api/logout", { method: "POST", body: "{}" });
  await refresh();
});

function tick() {
  clock.textContent = `${madridClock(new Date())} Madrid`;
}
tick();
setInterval(tick, 30_000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});

refresh();
