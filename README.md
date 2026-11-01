# Event Ticket Booking and Management System

A full-stack web app where users browse events and book tickets, and admins manage events and see all bookings. It prevents overbooking with an atomic database function.

## Roles and features
- **User:** register/login, search events, book 1-10 tickets, view and cancel own bookings.
- **Admin:** create, edit and delete events, view all bookings.
- Not included: online payments, email tickets, QR codes.

## Tech stack
HTML, CSS, Vanilla JavaScript (frontend); Node.js + Express (backend); Supabase PostgreSQL (database).

## Folder structure
```
event-ticket-booking-system/
├── frontend/   (index.html, styles.css, app.js)
├── backend/    (server.js, supabase.js, routes/, middleware/, utils/, package.json, .env.example)
├── database/   (schema.sql)
├── .gitignore
└── README.md
```

## Setup
1. Install VS Code, Node.js LTS and Git.
2. Create a Supabase project, then run `database/schema.sql` in the SQL Editor.
3. `cd backend`, then `npm install`.
4. Copy `backend/.env.example` to `backend/.env` and fill in your own values
   (generate JWT_SECRET with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
5. `npm start`, then open http://localhost:5000.
6. Make an admin: register on the site, then run in the Supabase SQL Editor:
   `update users set role = 'admin' where email = 'you@example.com';`

## API
| Method | Path | Access |
|---|---|---|
| GET | /api/health | Public |
| POST | /api/auth/register, /login, /logout | Public |
| GET | /api/auth/me | Logged in |
| GET | /api/events?search= | Public |
| POST / PUT / DELETE | /api/events, /api/events/:id | Admin |
| POST | /api/bookings | Logged in |
| GET | /api/bookings/mine | Logged in (own data only) |
| GET | /api/bookings | Admin |
| POST | /api/bookings/:id/cancel | Owner or admin |

## Security
Passwords hashed with bcrypt; JWT in an httpOnly SameSite=Strict cookie; role read from the database on every request; service-role key only on the server; RLS enabled; helmet headers; login rate limit; all rendering uses textContent (no XSS).

## Limitations
No payments, no email, no password reset, no automated tests. Possible future work: QR tickets, payment gateway, event images.
