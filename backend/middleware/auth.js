const jwt = require("jsonwebtoken");
const supabase = require("../supabase");

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Please log in" });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Session expired. Please log in again" });
    }

    // Role always comes from the database, never from the browser
    const { data, error } = await supabase
      .from("users").select("id,name,email,role").eq("id", payload.id).single();
    if (error || !data) return res.status(401).json({ error: "Please log in" });

    req.user = data;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  next();
}

module.exports = { requireAuth, requireAdmin };
