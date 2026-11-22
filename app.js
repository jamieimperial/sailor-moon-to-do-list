const STORAGE_KEY = "daymark.tasks.v1";
const COMPLETE_DELAY = 470;

const activeList = document.querySelector("#active-list");
const completedList = document.querySelector("#completed-list");
const addForm = document.querySelector("#add-form");
const taskInput = document.querySelector("#new-task");
const emptyState = document.querySelector("#empty-state");
const completedSection = document.querySelector("#completed-section");
const completedToggle = document.querySelector("#completed-toggle");
const announcer = document.querySelector("#announcer");
const soundToggle = document.querySelector("#sound-toggle");
const SOUND_STORAGE_KEY = "daymark.sound.v1";

const initialTasks = [
  { id: makeId(), text: "Take a few minutes to plan the day", done: false },
  { id: makeId(), text: "Make space for a proper lunch break", done: false },
  { id: makeId(), text: "Step outside for a little fresh air", done: false },
];

let tasks = loadTasks();
const pendingCompletion = new Set();
let audioContext;
let soundEnabled = loadSoundPreference();

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved.filter((task) => task && typeof task.id === "string" && typeof task.text === "string").map((task) => ({ ...task, done: Boolean(task.done) }));
  } catch {
    // Start with a useful example list when storage is unavailable or empty.
  }
  return initialTasks;
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // The list still works for this visit when browser storage is disabled.
  }
}

function loadSoundPreference() {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function updateSoundToggle() {
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  const label = soundEnabled ? "Turn sound off" : "Turn sound on";
  soundToggle.setAttribute("aria-label", label);
  soundToggle.title = label;
}

function playCompletionSound() {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ??= new AudioContextClass();
    const play = () => {
      const now = audioContext.currentTime;

      const playNote = (frequency, start, duration, volume, type = "triangle") => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency * 0.96, start);
        oscillator.frequency.exponentialRampToValueAtTime(frequency, start + 0.025);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.01);
      };

      // A tiny, rounded pop gives the chime a cheerful button-like start.
      const pop = audioContext.createOscillator();
      const popGain = audioContext.createGain();
      pop.type = "sine";
      pop.frequency.setValueAtTime(230, now);
      pop.frequency.exponentialRampToValueAtTime(355, now + 0.055);
      popGain.gain.setValueAtTime(0.0001, now);
      popGain.gain.exponentialRampToValueAtTime(0.09, now + 0.007);
      popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      pop.connect(popGain).connect(audioContext.destination);
      pop.start(now);
      pop.stop(now + 0.1);

      // A bright major lift followed by a little high sparkle.
      playNote(659.25, now + 0.018, 0.14, 0.085);
      playNote(783.99, now + 0.105, 0.2, 0.07);
      playNote(1318.51, now + 0.155, 0.24, 0.035, "sine");
      playNote(1567.98, now + 0.215, 0.18, 0.018, "sine");
    };

    if (audioContext.state === "suspended") {
      void audioContext.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch {
    // The visual completion effect still works if audio is unavailable.
  }
}

function addPartyBurst(item) {
  const burst = document.createElement("span");
  burst.className = "party-burst";
  burst.setAttribute("aria-hidden", "true");
  burst.innerHTML = '<i class="party-main">🌙</i><i class="party-side">✨</i><i class="party-side">💖</i><i class="party-side">✦</i>';
  item.append(burst);
}

function makeTaskElement(task) {
  const item = document.createElement("article");
  item.className = `task-item${task.done ? " is-complete" : ""}`;
  item.dataset.id = task.id;

  const check = document.createElement("button");
  check.className = "check-button";
  check.type = "button";
  check.setAttribute("aria-label", task.done ? `Mark ${task.text} as not done` : `Mark ${task.text} as done`);
  check.setAttribute("aria-pressed", String(task.done));
  check.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.2 2.8 2.8 6.2-6.3" /></svg><span class="sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  check.addEventListener("click", () => toggleTask(task.id, item));

  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = task.text;

  const meta = document.createElement("span");
  meta.className = "task-meta";
  meta.textContent = task.done ? "Done" : "";

  const remove = document.createElement("button");
  remove.className = "delete-button";
  remove.type = "button";
  remove.setAttribute("aria-label", `Delete ${task.text}`);
  remove.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 4.5h9M6 4.5V3h4v1.5m1.5 0-.5 8h-6l-.5-8M6.5 7v3.5m3-3.5v3.5" /></svg>';
  remove.addEventListener("click", () => deleteTask(task.id, item));

  item.append(check, text, meta, remove);
  return item;
}

function render({ animateNew = false } = {}) {
  const active = tasks.filter((task) => !task.done);
  const completed = tasks.filter((task) => task.done);
  activeList.replaceChildren(...active.map(makeTaskElement));
  completedList.replaceChildren(...completed.map(makeTaskElement));
  emptyState.hidden = active.length !== 0;
  completedSection.hidden = completed.length === 0;
  document.querySelector("#task-count").textContent = String(active.length);
  document.querySelector("#completed-count").textContent = String(completed.length);

  const total = tasks.length;
  const done = completed.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  document.querySelector("#progress-percent").textContent = `${percent}%`;
  document.querySelector("#progress-ring").setAttribute("aria-label", `${percent}% complete`);
  document.querySelector(".ring-value").style.strokeDashoffset = String(125.66 * (1 - percent / 100));
  document.querySelector("#progress-fill").style.width = `${percent}%`;

  const title = document.querySelector("#progress-title");
  const subtitle = document.querySelector("#progress-subtitle");
  if (total === 0) {
    title.textContent = "A fresh start.";
    subtitle.textContent = "Small steps add up. Pick one to begin.";
  } else if (done === total) {
    title.textContent = "You did it. Nice work!";
    subtitle.textContent = "Everything on your list is complete.";
  } else if (done > 0) {
    title.textContent = "You’re finding your rhythm.";
    subtitle.textContent = `${done} of ${total} ${total === 1 ? "task" : "tasks"} complete. Keep it gentle.`;
  } else {
    title.textContent = "A fresh start.";
    subtitle.textContent = "Small steps add up. Pick one to begin.";
  }

  if (animateNew) activeList.lastElementChild?.animate(
    [{ opacity: 0, transform: "translateY(8px) scale(.99)" }, { opacity: 1, transform: "translateY(0) scale(1)" }],
    { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
}

function toggleTask(id, item) {
  if (pendingCompletion.has(id)) return;
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  if (task.done) {
    task.done = false;
    saveTasks();
    render();
    announcer.textContent = `Task marked not done: ${task.text}`;
    return;
  }

  pendingCompletion.add(id);
  item.classList.add("completing");
  addPartyBurst(item);
  playCompletionSound();
  const check = item.querySelector(".check-button");
  check.setAttribute("aria-pressed", "true");
  check.setAttribute("aria-label", `Mark ${task.text} as not done`);
  window.setTimeout(() => {
    task.done = true;
    pendingCompletion.delete(id);
    saveTasks();
    render();
    announcer.textContent = `Nice work. Completed: ${task.text}`;
  }, COMPLETE_DELAY);
}

function deleteTask(id, item) {
  item.animate([{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(12px)" }], { duration: 170, easing: "ease-in", fill: "forwards" }).onfinish = () => {
    tasks = tasks.filter((task) => task.id !== id);
    saveTasks();
    render();
    announcer.textContent = "Task deleted.";
  };
}

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    taskInput.focus();
    return;
  }
  const task = { id: makeId(), text, done: false };
  tasks.push(task);
  saveTasks();
  render({ animateNew: true });
  taskInput.value = "";
  taskInput.focus();
  announcer.textContent = `Added task: ${text}`;
});

completedToggle.addEventListener("click", () => {
  const expanded = completedToggle.getAttribute("aria-expanded") === "true";
  completedToggle.setAttribute("aria-expanded", String(!expanded));
  completedList.hidden = expanded;
});

soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, String(soundEnabled));
  } catch {
    // The sound setting still applies for this visit when storage is disabled.
  }
  updateSoundToggle();
  announcer.textContent = soundEnabled ? "Completion sound on." : "Completion sound off.";
});

const today = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
document.querySelector("#date-line").textContent = today;

updateSoundToggle();
render();
