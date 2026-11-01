const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

for (const k of ["SUPABASE_URL", "JWT_SECRET"]) {
  if (!process.env[k]) {
    console.error(`Missing ${k} in backend/.env`);
    process.exit(1);
  }
}

if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
  process.exit(1);
}

const app = express();
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/events", require("./routes/events"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

const frontendPath = [
  path.join(__dirname, "..", "frontend"),
  path.join(__dirname, "..", "..", "frontend"),
  path.join(__dirname, "frontend")
].find((p) => fs.existsSync(p)) || path.join(__dirname, "..", "frontend");

app.use(express.static(frontendPath));

// Central error handler: never leaks stack traces or database details
app.use((err, req, res, next) => {
  if (err.status === 400) return res.status(400).json({ error: "Invalid request" });
  console.error(err.message);
  res.status(500).json({ error: "Something went wrong on the server" });
});

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 5000;

function startServer(port, attempts = 0) {
  const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });

  server.on("error", (err) => {
    if ((err.code === "EADDRINUSE" || err.code === "EACCES") && attempts < 10) {
      const nextPort = port + 1;
      console.warn(`Port ${port} unavailable (${err.code}). Trying port ${nextPort}...`);
      startServer(nextPort, attempts + 1);
    } else {
      console.error("Server failed to start:", err);
      process.exit(1);
    }
  });
}

startServer(DEFAULT_PORT);

