import { createScene } from "./scene.js";

const caption = document.querySelector("#caption");
const life = document.querySelector("#life");
const hurt = document.querySelector("#hurt");
const clock = document.querySelector("#clock");
const log = document.querySelector("#log");
const bones = document.querySelector("#bones");
const gossip = document.querySelector("#gossip");
const yard = document.querySelector("#yard");
const door = document.querySelector("#door");
const guestForm = document.querySelector("#guest");
const loginForm = document.querySelector("#login");
const leave = document.querySelector("#leave");
const alertBox = document.querySelector("#alert");
const yardButton = document.querySelector("#open-yard");
const doorButton = document.querySelector("#open-door");
const canvas = document.querySelector("#view");

const visitorThread = [];
let panel = null;

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
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = emptyText;
    node.append(item);
    return;
  }
  for (const item of items) node.append(map(item));
}

function setPanel(next) {
  panel = panel === next ? null : next;
  yard.hidden = panel !== "yard";
  door.hidden = panel !== "door";
  document.querySelector(".app").classList.toggle("panel-open", panel !== null);
  yardButton.setAttribute("aria-expanded", String(panel === "yard"));
  doorButton.setAttribute("aria-expanded", String(panel === "door"));
}

function render(state) {
  caption.textContent = state.caption;
  life.textContent = state.life === "puppy" ? "Puppy" : "Grown";
  life.hidden = state.caption === life.textContent;
  hurt.hidden = !state.hurt;
  hurt.textContent = state.hurt ? "You restored an older copy of me." : "";
  yardButton.hidden = !state.owner;
  if (!state.owner && panel === "yard") setPanel(null);
  guestForm.hidden = state.owner;
  gossip.hidden = !state.owner;
  loginForm.hidden = state.owner;
  leave.hidden = !state.owner;

  if (!state.owner && visitorThread.length === 0 && state.greeting) {
    visitorThread.push({ role: "gos", content: state.greeting });
  }
  const shown = state.owner ? state.messages : visitorThread;
  renderList(log, shown, "No messages.", (message) => {
    const item = document.createElement("li");
    item.className = message.role === "gos" ? "gos" : "user";
    item.textContent = message.content;
    return item;
  });
  log.scrollTop = log.scrollHeight;

  renderList(bones, state.bones, "No bones.", (bone) => {
    const item = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = bone.note;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Delete";
    button.addEventListener("click", () => removeBone(bone.id));
    item.append(span, button);
    return item;
  });
  renderList(gossip, state.gossip, "No visitors.", (line) => {
    const item = document.createElement("li");
    item.textContent = line;
    return item;
  });
  const shownLine = state.owner
    ? lastGos(state.messages)
    : lastGos(visitorThread) || state.reply || state.greeting || "";
  scene.setSpeech(shownLine);
  scene.setState(state);
}

function lastGos(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "gos") return messages[index].content;
  }
  return "";
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

async function refresh() {
  const response = await fetch("/api/state");
  if (!response.ok) {
    showError("Could not load Gos. Try again.");
    return;
  }
  showError("");
  render(await response.json());
}

const scene = await createScene(canvas).catch((error) => {
  showError("The scene did not start. Try again.");
  throw error;
});

document.querySelector("#chat").addEventListener("submit", async (event) => {
  event.preventDefault();
  const field = document.querySelector("#msg");
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    const sent = field.value;
    const state = await sendJson("/api/chat", { method: "POST", body: JSON.stringify({ message: sent }) });
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
  try {
    await sendJson("/api/guestbook", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#gname").value,
        note: document.querySelector("#gnote").value,
      }),
    });
    document.querySelector("#gname").value = "";
    document.querySelector("#gnote").value = "";
    visitorThread.push({ role: "gos", content: "Signed." });
    await refresh();
  } catch (error) {
    showError(error.message);
  }
});

document.querySelector("#login").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await sendJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ token: document.querySelector("#token").value }),
    });
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

yardButton.addEventListener("click", () => setPanel("yard"));
doorButton.addEventListener("click", () => setPanel("door"));

function tickClock() {
  clock.textContent = `${madridClock(new Date())} Madrid`;
}
tickClock();
setInterval(tickClock, 30_000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});

await refresh();
