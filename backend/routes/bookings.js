const express = require("express");
const supabase = require("../supabase");
const wrap = require("../utils/wrap");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const KNOWN = {
  EVENT_NOT_FOUND: [404, "Event not found"],
  EVENT_PASSED: [400, "This event has already started"],
  NOT_ENOUGH_SEATS: [409, "Not enough seats available"],
  BOOKING_NOT_FOUND: [404, "Booking not found"],
  ALREADY_CANCELLED: [409, "Booking is already cancelled"],
};

function dbError(error, res) {
  for (const key in KNOWN) {
    if ((error.message || "").includes(key)) return res.status(KNOWN[key][0]).json({ error: KNOWN[key][1] });
  }
  console.error(error.message); // log on server only
  return res.status(400).json({ error: "Request could not be completed" });
}

// POST /api/bookings  body: {eventId, quantity 1-10}  -> 201 {booking}
router.post("/", wrap(async (req, res) => {
  const qty = Number(req.body.quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) return res.status(400).json({ error: "Quantity must be 1 to 10" });

  const { data, error } = await supabase.rpc("book_tickets",
    { p_user: req.user.id, p_event: String(req.body.eventId || ""), p_qty: qty });
  if (error) return dbError(error, res);
  res.status(201).json({ booking: data });
}));

// GET /api/bookings/mine -> only the logged-in user's bookings
router.get("/mine", wrap(async (req, res) => {
  const { data, error } = await supabase.from("bookings")
    .select("id,quantity,total_amount,status,created_at,events(title,venue,event_date)")
    .eq("user_id", req.user.id).order("created_at", { ascending: false });
  if (error) throw error;
  res.json({ bookings: data });
}));

// GET /api/bookings (admin) -> all bookings
router.get("/", requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from("bookings")
    .select("id,quantity,total_amount,status,created_at,events(title),users(name,email)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  res.json({ bookings: data });
}));

// POST /api/bookings/:id/cancel  (owner, or admin)
router.post("/:id/cancel", wrap(async (req, res) => {
  const { data, error } = await supabase.rpc("cancel_booking",
    { p_user: req.user.id, p_booking: req.params.id, p_admin: req.user.role === "admin" });
  if (error) return dbError(error, res);
  res.json({ booking: data });
}));

module.exports = router;
