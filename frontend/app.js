const app = document.getElementById("app");
let currentUser = null;

// ---------- helpers ----------
// h() builds elements with textContent only, so user data can never run as HTML (prevents XSS)
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  kids.flat().forEach((c) => el.append(c instanceof Node ? c : document.createTextNode(c ?? "")));
  return el;
}

async function api(path, method = "GET", body) {
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error("Unable to connect to backend. Please run 'npm start' in terminal.");
  }

  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (location.port === "5500" || location.port === "5501") {
      throw new Error("Live Server cannot run the backend API. Please run 'npm start' in the terminal and open http://localhost:5000 (or the port displayed in your terminal).");
    }
    throw new Error(data.error || "Something went wrong");
  }
  return data;
}

let toastTimer;
function toast(msg, type = "ok") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = type;
  t.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.display = "none"), 3000);
}

const money = (n) => "₹" + Number(n).toFixed(2);
const fmtDate = (d) => new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
function toLocalInput(iso) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// ---------- navigation ----------
function renderNav() {
  const nav = document.getElementById("nav");
  const cur = location.hash || "#/events";
  const link = (href, text, cls = "") =>
    h("a", { href, class: (cls + (cur === href ? " active" : "")).trim() }, text);
  nav.replaceChildren(link("#/events", "Events"));
  if (currentUser) {
    nav.append(link("#/bookings", "My Bookings"));
    if (currentUser.role === "admin") nav.append(link("#/admin", "Admin"));
    nav.append(h("span", { class: "user-chip" }, "👤 " + currentUser.name),
      h("button", { onclick: logout }, "Logout"));
  } else {
    nav.append(link("#/login", "Login"), link("#/register", "Register", "cta"));
  }
}

async function logout() {
  await api("/auth/logout", "POST").catch(() => {});
  currentUser = null;
  location.hash = "#/events";
  route();
}

// ---------- views ----------
async function viewEvents() {
  const search = h("input", { type: "search", placeholder: "Search events or venues...", "aria-label": "Search events" });
  const grid = h("div", { class: "grid" });
  const statEvents = h("strong", {}, "–");
  const statSeats = h("strong", {}, "–");
  let timer;

  async function load() {
    grid.replaceChildren(h("div", { class: "state" }, h("span", { class: "big" }, "⏳"), "Loading events..."));
    try {
      const { events } = await api("/events?search=" + encodeURIComponent(search.value));
      statEvents.textContent = String(events.length);
      statSeats.textContent = String(events.filter((e) => new Date(e.event_date) > new Date()).reduce((n, e) => n + e.available_seats, 0));
      if (!events.length) return grid.replaceChildren(
        h("div", { class: "state" }, h("span", { class: "big" }, "🎭"), "No events found. Try another search."));
      grid.replaceChildren(...events.map((ev) => eventCard(ev, load)));
    } catch (e) {
      grid.replaceChildren(h("div", { class: "state error" }, h("span", { class: "big" }, "⚠️"), e.message));
    }
  }
  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  load();

  return h("div", {},
    h("section", { class: "hero" },
      h("span", { class: "pill" }, "Bookings open"),
      h("h1", {}, "Find your next unforgettable event"),
      h("p", {}, "Browse concerts, fests and talks, and book your seats in seconds."),
      h("div", { class: "search" }, search),
      h("div", { class: "stats" },
        h("div", { class: "stat" }, statEvents, h("span", {}, "Events")),
        h("div", { class: "stat" }, statSeats, h("span", {}, "Seats open")),
        h("div", { class: "stat" }, h("strong", {}, "10"), h("span", {}, "Max per booking")))),
    h("div", { class: "section-title" }, h("h2", {}, "Upcoming events")),
    grid,
    h("div", { class: "section-title", style: "margin-top:34px" }, h("h2", {}, "How it works")),
    h("div", { class: "how" },
      h("div", {}, h("div", { class: "n" }, "🔎"), h("h4", {}, "1. Discover"), h("p", {}, "Search events by name or venue.")),
      h("div", {}, h("div", { class: "n" }, "🎟"), h("h4", {}, "2. Book"), h("p", {}, "Pick 1 to 10 tickets and confirm.")),
      h("div", {}, h("div", { class: "n" }, "✅"), h("h4", {}, "3. Manage"), h("p", {}, "View or cancel in My Bookings.")))); 
}

const GRADIENTS = [
  "linear-gradient(135deg,#1db954,#0b3d20)", "linear-gradient(135deg,#509bf5,#1e3264)",
  "linear-gradient(135deg,#e8115b,#5c0a24)", "linear-gradient(135deg,#f59b23,#5a3a05)",
  "linear-gradient(135deg,#af2896,#3b0f35)", "linear-gradient(135deg,#8d67ab,#2d1e3e)",
];
const EMOJIS = ["🎵", "🎤", "🎭", "🎬", "💡", "🏆"];
function pick(title) {
  let n = 0;
  for (const ch of title) n = (n * 31 + ch.charCodeAt(0)) % 997;
  return n % GRADIENTS.length;
}

function eventCard(ev, reload) {
  const ended = new Date(ev.event_date) <= new Date();
  const soldOut = ev.available_seats === 0;
  const qty = h("input", { type: "number", min: "1", max: "10", value: "1", "aria-label": "Number of tickets" });
  const d = new Date(ev.event_date);
  const i = pick(ev.title);

  async function book() {
    if (!currentUser) { location.hash = "#/login"; return; }
    try {
      await api("/bookings", "POST", { eventId: ev.id, quantity: Number(qty.value) });
      toast("Booking confirmed! 🎉");
      reload();
    } catch (e) { toast(e.message, "err"); }
  }

  const status = ended ? h("span", { class: "badge bad" }, "Ended")
    : soldOut ? h("span", { class: "badge bad" }, "Sold out")
    : h("span", { class: "badge good" }, ev.available_seats + " seats left");

  return h("article", { class: "event" + (ended || soldOut ? " soldout" : "") },
    h("div", { class: "banner", style: "background:" + GRADIENTS[i] },
      h("div", { class: "date-badge" },
        h("strong", {}, String(d.getDate())),
        h("span", {}, d.toLocaleString([], { month: "short" }).toUpperCase())),
      h("span", { class: "emoji" }, EMOJIS[i])),
    h("div", { class: "body" },
      h("h3", {}, ev.title),
      h("div", { class: "meta" }, "📍 " + ev.venue),
      h("div", { class: "meta" }, "🕒 " + fmtDate(ev.event_date)),
      h("p", { class: "desc" }, ev.description),
      h("div", { class: "foot" },
        h("span", { class: "price" + (ev.price > 0 ? "" : " free") }, ev.price > 0 ? money(ev.price) : "Free"),
        status),
      ended || soldOut ? "" : h("div", { class: "book-row" }, qty,
        h("button", { class: "btn", onclick: book }, currentUser ? "Book now" : "Login to book"))));
}

function authForm(isRegister) {
  const name = h("input", { id: "name", autocomplete: "name" });
  const email = h("input", { id: "email", type: "email", autocomplete: "email" });
  const pass = h("input", { id: "password", type: "password", autocomplete: isRegister ? "new-password" : "current-password" });
  const msg = h("p", { class: "error" });

  async function submit(e) {
    e.preventDefault();
    msg.textContent = "";
    try {
      const body = { email: email.value, password: pass.value };
      if (isRegister) body.name = name.value;
      const { user } = await api(isRegister ? "/auth/register" : "/auth/login", "POST", body);
      currentUser = user;
      toast("Welcome, " + user.name + "!");
      location.hash = "#/events";
    } catch (err) { msg.textContent = err.message; }
  }

  return h("div", { class: "panel form-narrow" },
    h("div", { class: "auth-icon" }, isRegister ? "✨" : "🔐"),
    h("h2", {}, isRegister ? "Create account" : "Welcome back"),
    h("form", { onsubmit: submit },
      isRegister ? [h("label", { for: "name" }, "Full name"), name] : "",
      h("label", { for: "email" }, "Email"), email,
      h("label", { for: "password" }, "Password" + (isRegister ? " (min 8 characters)" : "")), pass,
      msg,
      h("div", { class: "row" }, h("button", { class: "btn", type: "submit" }, isRegister ? "Register" : "Login"))));
}
const viewLogin = async () => authForm(false);
const viewRegister = async () => authForm(true);

async function viewBookings() {
  const box = h("div", {}, h("h1", {}, "My Bookings"));
  async function load() {
    try {
      const { bookings } = await api("/bookings/mine");
      if (!bookings.length) return box.append(h("div", { class: "state" }, h("span", { class: "big" }, "🎟"), "You have no bookings yet."));
      const rows = bookings.map((b) => {
        const ev = Array.isArray(b.events) ? b.events[0] : b.events;
        return h("tr", {},
          h("td", {}, ev ? ev.title : "–"), h("td", {}, ev && ev.event_date ? fmtDate(ev.event_date) : "–"),
          h("td", {}, String(b.quantity)), h("td", {}, money(b.total_amount)),
          h("td", {}, h("span", { class: "badge " + (b.status === "confirmed" ? "good" : "bad") }, b.status)),
          h("td", {}, b.status === "confirmed" ? h("button", { class: "btn danger", onclick: async () => {
            if (!confirm("Cancel this booking?")) return;
            try { await api(`/bookings/${b.id}/cancel`, "POST"); toast("Booking cancelled"); box.replaceChildren(h("h1", {}, "My Bookings")); load(); }
            catch (e) { toast(e.message, "err"); }
          } }, "Cancel") : ""));
      });
      box.append(h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Event", "Date", "Tickets", "Total", "Status", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, rows))));
    } catch (e) { box.append(h("p", { class: "error" }, e.message)); }
  }
  load();
  return box;
}

async function viewAdmin() {
  const box = h("div", {}, h("h1", {}, "Admin Dashboard"));
  let editingId = null;

  const f = {
    title: h("input", { id: "t", maxlength: "120" }),
    venue: h("input", { id: "v", maxlength: "120" }),
    date: h("input", { id: "d", type: "datetime-local" }),
    price: h("input", { id: "p", type: "number", min: "0", step: "0.01", value: "0" }),
    seats: h("input", { id: "s", type: "number", min: "1", value: "50" }),
    desc: h("textarea", { id: "ds", rows: "3", maxlength: "1000" }),
  };
  const formTitle = h("h2", {}, "Create event");
  const msg = h("p", { class: "error" });
  const listBox = h("div", {});
  const bookBox = h("div", {});

  function resetForm() {
    editingId = null; formTitle.textContent = "Create event";
    f.title.value = f.venue.value = f.date.value = f.desc.value = "";
    f.price.value = "0"; f.seats.value = "50";
  }

  async function save(e) {
    e.preventDefault(); msg.textContent = "";
    const body = {
      title: f.title.value, venue: f.venue.value, description: f.desc.value,
      eventDate: f.date.value ? new Date(f.date.value).toISOString() : "",
      price: f.price.value, totalSeats: f.seats.value,
    };
    try {
      if (editingId) await api("/events/" + editingId, "PUT", body);
      else await api("/events", "POST", body);
      toast(editingId ? "Event updated" : "Event created");
      resetForm(); loadAll();
    } catch (err) { msg.textContent = err.message; }
  }

  async function loadAll() {
    try {
      const { events } = await api("/events");
      listBox.replaceChildren(h("div", { class: "section-title" }, h("h2", {}, "All events")), h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Title", "Date", "Price", "Seats left", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, events.map((ev) => h("tr", {},
          h("td", {}, ev.title), h("td", {}, fmtDate(ev.event_date)), h("td", {}, money(ev.price)),
          h("td", {}, ev.available_seats + " / " + ev.total_seats),
          h("td", {},
            h("button", { class: "btn light", onclick: () => {
              editingId = ev.id; formTitle.textContent = "Edit event";
              f.title.value = ev.title; f.venue.value = ev.venue; f.desc.value = ev.description;
              f.date.value = toLocalInput(ev.event_date); f.price.value = ev.price; f.seats.value = ev.total_seats;
              window.scrollTo({ top: 0, behavior: "smooth" });
            } }, "Edit"), " ",
            h("button", { class: "btn danger", onclick: async () => {
              if (!confirm("Delete this event?")) return;
              try { await api("/events/" + ev.id, "DELETE"); toast("Event deleted"); loadAll(); }
              catch (er) { toast(er.message, "err"); }
            } }, "Delete"))))))));
      const { bookings } = await api("/bookings");
      bookBox.replaceChildren(h("div", { class: "section-title" }, h("h2", {}, "All bookings")),
        bookings.length ? h("div", { class: "table-wrap" }, h("table", {},
          h("thead", {}, h("tr", {}, ["User", "Email", "Event", "Tickets", "Total", "Status"].map((t) => h("th", {}, t)))),
          h("tbody", {}, bookings.map((b) => {
            const u = Array.isArray(b.users) ? b.users[0] : b.users;
            const ev = Array.isArray(b.events) ? b.events[0] : b.events;
            return h("tr", {},
              h("td", {}, u ? u.name : "–"), h("td", {}, u ? u.email : "–"), h("td", {}, ev ? ev.title : "–"),
              h("td", {}, String(b.quantity)), h("td", {}, money(b.total_amount)), h("td", {}, h("span", { class: "badge " + (b.status === "confirmed" ? "good" : "bad") }, b.status)));
          }))))
        : h("p", { class: "muted" }, "No bookings yet."));
    } catch (er) { listBox.replaceChildren(h("p", { class: "error" }, er.message)); }
  }

  const field = (id, text, input, full) => h("div", { class: full ? "full" : "" }, h("label", { for: id }, text), input);
  box.append(h("div", { class: "panel" }, formTitle, h("form", { onsubmit: save },
    h("div", { class: "admin-grid" },
      field("t", "Title", f.title), field("v", "Venue", f.venue),
      field("d", "Date and time", f.date), field("p", "Price (₹, 0 = free)", f.price),
      field("s", "Total seats", f.seats), field("ds", "Description", f.desc)),
    msg,
    h("div", { class: "row" },
      h("button", { class: "btn", type: "submit" }, "Save"),
      h("button", { class: "btn light", type: "button", onclick: resetForm }, "Clear")))),
    listBox, bookBox);
  loadAll();
  return box;
}

// ---------- router ----------
const routes = { "#/events": viewEvents, "#/login": viewLogin, "#/register": viewRegister, "#/bookings": viewBookings, "#/admin": viewAdmin };

async function route() {
  let hash = location.hash || "#/events";
  if (hash === "#/bookings" && !currentUser) hash = "#/login";
  if (hash === "#/admin" && (!currentUser || currentUser.role !== "admin")) hash = "#/events";
  renderNav();
  app.replaceChildren(await (routes[hash] || viewEvents)());
}

window.addEventListener("hashchange", route);
(async () => {
  try { currentUser = (await api("/auth/me")).user; } catch { currentUser = null; }
  route();
})();
