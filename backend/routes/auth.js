const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const supabase = require("../supabase");
const wrap = require("../utils/wrap");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,
  message: { error: "Too many attempts. Try again in 15 minutes." } });

function setCookie(res, id) {
  const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 2 * 60 * 60 * 1000,
  });
}

// POST /api/auth/register  body: {name, email, password}  -> 201 {user}
router.post("/register", limiter, wrap(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Name must be 2-80 characters" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email" });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: "Password must be 8-72 characters" });

  const password_hash = await bcrypt.hash(password, 10);
  // role is NOT read from the request: everyone starts as 'user'
  const { data, error } = await supabase.from("users")
    .insert({ name, email, password_hash }).select("id,name,email,role").single();

  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Email already registered" });
    throw error;
  }
  setCookie(res, data.id);
  res.status(201).json({ user: data });
}));

// POST /api/auth/login  body: {email, password} -> 200 {user}
router.post("/login", limiter, wrap(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const { data: u } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  const ok = u && (await bcrypt.compare(password, u.password_hash));
  if (!ok) return res.status(401).json({ error: "Wrong email or password" });

  setCookie(res, u.id);
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
}));

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

// GET /api/auth/me (login required)
router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;
