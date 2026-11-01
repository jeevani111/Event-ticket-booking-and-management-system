const express = require("express");
const supabase = require("../supabase");
const wrap = require("../utils/wrap");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

function validate(b) {
  const title = String(b.title || "").trim();
  const venue = String(b.venue || "").trim();
  const description = String(b.description || "").trim();
  const date = new Date(b.eventDate);
  const price = Number(b.price);
  const seats = Number(b.totalSeats);

  if (!title || title.length > 120) return { error: "Title is required (max 120 characters)" };
  if (!venue || venue.length > 120) return { error: "Venue is required (max 120 characters)" };
  if (description.length > 1000) return { error: "Description is too long (max 1000)" };
  if (isNaN(date.getTime())) return { error: "Enter a valid date and time" };
  if (!Number.isFinite(price) || price < 0 || price > 100000) return { error: "Price must be 0 to 100000" };
  if (!Number.isInteger(seats) || seats < 1 || seats > 100000) return { error: "Seats must be a whole number from 1 to 100000" };
  return { value: { title, venue, description, event_date: date.toISOString(), price, total_seats: seats } };
}

// GET /api/events?search=text  (public) -> {events: [...]}
router.get("/", wrap(async (req, res) => {
  const search = String(req.query.search || "").replace(/[^\w\s-]/g, "").trim().slice(0, 50);
  let q = supabase.from("events").select("*").order("event_date", { ascending: true });
  if (search) q = q.or(`title.ilike.%${search}%,venue.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  res.json({ events: data });
}));

// POST /api/events (admin) body: {title, description, venue, eventDate, price, totalSeats}
router.post("/", requireAuth, requireAdmin, wrap(async (req, res) => {
  const { value, error: msg } = validate(req.body);
  if (msg) return res.status(400).json({ error: msg });
  if (new Date(value.event_date) <= new Date()) return res.status(400).json({ error: "Event date must be in the future" });

  const { data, error } = await supabase.from("events")
    .insert({ ...value, available_seats: value.total_seats }).select().single();
  if (error) throw error;
  res.status(201).json({ event: data });
}));

// PUT /api/events/:id (admin) same body as POST
router.put("/:id", requireAuth, requireAdmin, wrap(async (req, res) => {
  const { value, error: msg } = validate(req.body);
  if (msg) return res.status(400).json({ error: msg });

  const { data: old } = await supabase.from("events").select("*").eq("id", req.params.id).maybeSingle();
  if (!old) return res.status(404).json({ error: "Event not found" });

  const booked = old.total_seats - old.available_seats;
  if (value.total_seats < booked) return res.status(400).json({ error: `Cannot go below ${booked} seats already booked` });

  const { data, error } = await supabase.from("events")
    .update({ ...value, available_seats: value.total_seats - booked })
    .eq("id", req.params.id).select().single();
  if (error) throw error;
  res.json({ event: data });
}));

// DELETE /api/events/:id (admin). Blocked if any booking exists.
router.delete("/:id", requireAuth, requireAdmin, wrap(async (req, res) => {
  const { error } = await supabase.from("events").delete().eq("id", req.params.id);
  if (error) {
    if (error.code === "23503") return res.status(409).json({ error: "Event has bookings and cannot be deleted" });
    if (error.code === "22P02") return res.status(400).json({ error: "Invalid event id" });
    throw error;
  }
  res.json({ message: "Event deleted" });
}));

module.exports = router;
