// ============================================================
//  server.js — Evans Kioko Graduation Invite · Full Backend
// ============================================================
'use strict';

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const nodemailer   = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

// ── CONFIG ────────────────────────────────────────────────────
const PORT      = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'evans2026admin';   // change this!

// ── SUPABASE SETUP (free persistent cloud database) ──────────
// Sign up free at https://supabase.com → create project → grab URL + service_role key
const supabase = createClient(
  process.env.SUPABASE_URL,          // e.g. https://xxxx.supabase.co
  process.env.SUPABASE_KEY           // service_role key (Settings → API)
);

// ── EMAIL CONFIG (Brevo free SMTP — 300 emails/day, no domain required) ──
// Sign up free at https://app.brevo.com → Settings → SMTP & API → Generate SMTP key
const EMAIL_ENABLED = !!(process.env.BREVO_USER && process.env.BREVO_KEY);
const NOTIFY_EMAIL  = process.env.NOTIFY_EMAIL || process.env.BREVO_USER;
const SMTP_CONFIG   = {
  host:   'smtp-relay.brevo.com',
  port:    587,
  secure:  false,
  auth: {
    user: process.env.BREVO_USER,   // your Brevo login email
    pass: process.env.BREVO_KEY,    // your Brevo SMTP key (NOT your account password)
  },
};

// ── SEED DEFAULT MESSAGE (runs once on first deploy) ─────────
async function seedDefaultMessage() {
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true });

  if (error) { console.warn('Seed check failed:', error.message); return; }

  if (count === 0) {
    await supabase.from('messages').insert({
      name:         'kobbir',
      relationship: 'cuz',
      message:      'Evans, you have shown us all what it means to dream big and work hard. Engineer is not just a title — it is who you are. So proud of you.',
      approved:     true,
    });
    console.log('Default message seeded.');
  }
}

// ── EMAIL HELPER ──────────────────────────────────────────────
let transporter = null;
if (EMAIL_ENABLED) {
  transporter = nodemailer.createTransport(SMTP_CONFIG);
  transporter.verify().then(() => {
    console.log('Email transporter ready (Brevo)');
  }).catch(err => {
    console.warn('Email setup failed:', err.message);
  });
} else {
  console.log('Email disabled — set BREVO_USER and BREVO_KEY to enable');
}

async function sendRsvpNotification(rsvp) {
  if (!transporter || !NOTIFY_EMAIL) return;
  try {
    await transporter.sendMail({
      from:    `"Evans Graduation Invite" <${process.env.BREVO_USER}>`,
      to:      NOTIFY_EMAIL,
      subject: `New RSVP from ${rsvp.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#c8961a;">New RSVP Received</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;font-weight:bold;">Name</td><td>${rsvp.name}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Email</td><td>${rsvp.email}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Phone</td><td>${rsvp.phone||'—'}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Guests</td><td>${rsvp.guests}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Attending</td><td>${rsvp.attending}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Message</td><td>${rsvp.message||'—'}</td></tr>
          </table>
        </div>
      `,
    });
  } catch (e) {
    console.error('RSVP notification failed:', e.message);
  }
}

async function sendConfirmationEmail(rsvp) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from:    `"Evans Kioko Graduation" <${process.env.BREVO_USER}>`,
      to:      rsvp.email,
      subject: 'Your RSVP is Confirmed — Evans Kioko Graduation 2026',
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fdf8f0;padding:40px;border-radius:12px;">
          <h1 style="color:#c8961a;font-size:2rem;margin-bottom:8px;">You are confirmed!</h1>
          <p style="color:#2d1a08;">Dear <strong>${rsvp.name}</strong>,</p>
          <p style="color:#5a4030;line-height:1.7;">Thank you for confirming your attendance at Evans Kioko's graduation celebration. We cannot wait to celebrate together!</p>
          <div style="background:#fff;border:1px solid #f0d8a0;border-radius:8px;padding:24px;margin:24px 0;">
            <p style="margin:0 0 8px;"><strong>Date:</strong> Friday, 3rd April 2026</p>
            <p style="margin:0 0 8px;"><strong>Time:</strong> 11:00 AM — 3:00 PM</p>
            <p style="margin:0;"><strong>Venue:</strong> Benuru Group of Schools, 620 Plaza, Old Mombasa Road, Mlolongo</p>
          </div>
          <p style="color:#9a7d5a;font-size:.85rem;">We look forward to celebrating this milestone with you. See you there!</p>
          <p style="color:#c8961a;font-style:italic;">— Evans Kioko &amp; Family</p>
        </div>
      `,
    });
  } catch (e) {
    console.error('Confirmation email failed:', e.message);
  }
}

// ── EXPRESS APP ───────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MIDDLEWARE: input sanitiser ───────────────────────────────
function sanitise(str) {
  if (!str) return '';
  return String(str).trim().replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 1000);
}

// ── MIDDLEWARE: admin auth ────────────────────────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorised — invalid admin key' });
  }
  next();
}

// ── PUBLIC ROUTES ─────────────────────────────────────────────

// GET /api/messages — fetch all approved messages (public)
app.get('/api/messages', async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, name, relationship, message, created_at')
      .eq('approved', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ ok: true, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Could not load messages' });
  }
});

// POST /api/messages — submit a new guest message
app.post('/api/messages', async (req, res) => {
  const { name, relationship, message } = req.body;

  if (!message || message.trim().length < 3) {
    return res.status(400).json({ ok: false, error: 'Message is too short' });
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        name:         sanitise(name) || 'A Well-Wisher',
        relationship: sanitise(relationship) || '',
        message:      sanitise(message),
        approved:     true,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, message: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Could not save message' });
  }
});

// POST /api/rsvp — submit an RSVP
app.post('/api/rsvp', async (req, res) => {
  const { name, email, phone, guests, attending, message } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ ok: false, error: 'Name is required' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Valid email is required' });
  }

  // Check for duplicate RSVP
  const { data: existing } = await supabase
    .from('rsvps')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ ok: false, error: "This email has already RSVP'd. Thank you!" });
  }

  try {
    const rsvpData = {
      name:      sanitise(name),
      email:     email.trim().toLowerCase(),
      phone:     sanitise(phone),
      guests:    sanitise(guests) || '1',
      attending: sanitise(attending) || 'both',
      message:   sanitise(message),
    };

    const { data: rsvp, error } = await supabase
      .from('rsvps')
      .insert(rsvpData)
      .select()
      .single();

    if (error) throw error;

    // If guest left a message, auto-add to messages wall
    if (message && message.trim().length > 3) {
      await supabase.from('messages').insert({
        name:         rsvp.name,
        relationship: 'Guest',
        message:      rsvp.message,
        approved:     true,
      });
    }

    // Fire-and-forget emails
    sendRsvpNotification(rsvp);
    sendConfirmationEmail(rsvp);

    res.status(201).json({ ok: true, rsvp: { id: rsvp.id, name: rsvp.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Could not save RSVP' });
  }
});

// ── ADMIN ROUTES (protected by x-admin-key header) ───────────

// GET /admin/rsvps — view all RSVPs
app.get('/admin/rsvps', requireAdmin, async (req, res) => {
  try {
    const { data: rsvps, error } = await supabase
      .from('rsvps')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const total       = rsvps.length;
    const totalGuests = rsvps.reduce((sum, r) => sum + (parseInt(r.guests, 10) || 1), 0);

    res.json({ ok: true, stats: { total, totalGuests }, rsvps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Could not load RSVPs' });
  }
});

// GET /admin/messages — view all messages (including unapproved)
app.get('/admin/messages', requireAdmin, async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Could not load messages' });
  }
});

// PATCH /admin/messages/:id/approve
app.patch('/admin/messages/:id/approve', requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('messages')
    .update({ approved: true })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// DELETE /admin/messages/:id
app.delete('/admin/messages/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// GET /admin — serve admin dashboard HTML
app.get('/admin', requireAdmin, (req, res) => {
  res.send(adminDashboardHTML());
});

// ── CATCH-ALL: serve index.html for SPA routing ───────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, async () => {
  await seedDefaultMessage();
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   Evans Kioko Graduation Invite — Server Ready   ║
  ╠══════════════════════════════════════════════════╣
  ║  URL:   http://localhost:${PORT}                     ║
  ║  Admin: http://localhost:${PORT}/admin?key=${ADMIN_KEY.slice(0,6)}...  ║
  ║  DB:    Supabase (cloud — persistent)            ║
  ║  Email: ${EMAIL_ENABLED ? 'ENABLED ✓ (Brevo SMTP)           ' : 'DISABLED (set BREVO_USER + BREVO_KEY)'}  ║
  ╚══════════════════════════════════════════════════╝
  `);
});

// ── ADMIN DASHBOARD HTML (inline, no extra files needed) ─────
function adminDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin — Evans Kioko Graduation</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:system-ui,sans-serif;background:#0f0c08;color:#f0e8d8;min-height:100vh;}
  header{background:#1a1208;border-bottom:1px solid rgba(200,150,26,.2);padding:20px 40px;display:flex;align-items:center;justify-content:space-between;}
  header h1{font-size:1.2rem;color:#c8961a;}
  header p{font-size:.78rem;color:#9a7d5a;}
  main{max-width:1100px;margin:0 auto;padding:40px 24px;}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:40px;}
  .stat-box{background:#1a1208;border:1px solid rgba(200,150,26,.18);border-radius:10px;padding:24px;text-align:center;}
  .stat-num{font-size:2.6rem;font-weight:700;color:#c8961a;display:block;}
  .stat-lbl{font-size:.7rem;letter-spacing:.15em;text-transform:uppercase;color:#9a7d5a;margin-top:4px;}
  h2{font-size:1.1rem;color:#c8961a;margin-bottom:16px;letter-spacing:.06em;text-transform:uppercase;}
  section{margin-bottom:48px;}
  table{width:100%;border-collapse:collapse;font-size:.85rem;}
  th{text-align:left;padding:10px 14px;background:#1a1208;color:#c8961a;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;border-bottom:1px solid rgba(200,150,26,.2);}
  td{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.05);color:#d0c4b0;vertical-align:top;max-width:280px;word-break:break-word;}
  tr:hover td{background:rgba(200,150,26,.04);}
  .tag{display:inline-block;padding:2px 10px;border-radius:20px;font-size:.65rem;font-weight:600;letter-spacing:.08em;}
  .tag-yes{background:rgba(40,180,80,.15);color:#4ecf7a;}
  .tag-no{background:rgba(200,80,80,.15);color:#e07070;}
  .btn-del{background:rgba(200,50,50,.15);color:#e07070;border:1px solid rgba(200,50,50,.3);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:.75rem;}
  .btn-del:hover{background:rgba(200,50,50,.3);}
  .btn-apr{background:rgba(40,180,80,.15);color:#4ecf7a;border:1px solid rgba(40,180,80,.3);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:.75rem;margin-right:6px;}
  .btn-apr:hover{background:rgba(40,180,80,.3);}
  .loading{color:#9a7d5a;font-style:italic;font-size:.9rem;}
  .export-btn{background:#c8961a;color:#0f0c08;border:none;padding:10px 22px;border-radius:4px;cursor:pointer;font-weight:700;font-size:.82rem;letter-spacing:.06em;margin-bottom:20px;}
  .export-btn:hover{background:#f0c040;}
</style>
</head>
<body>
<header>
  <div>
    <h1>Evans Kioko · Graduation Admin Dashboard</h1>
    <p>Manage RSVPs and guest messages</p>
  </div>
  <button class="export-btn" onclick="exportCSV()">Export RSVPs as CSV</button>
</header>
<main>
  <div class="stats" id="stats"><p class="loading">Loading stats...</p></div>
  <section>
    <h2>RSVPs</h2>
    <table>
      <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>Guests</th><th>Attending</th><th>Message</th><th>Date</th></tr></thead>
      <tbody id="rsvpBody"><tr><td colspan="8" class="loading">Loading...</td></tr></tbody>
    </table>
  </section>
  <section>
    <h2>Guest Messages</h2>
    <table>
      <thead><tr><th>#</th><th>Name</th><th>Relationship</th><th>Message</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody id="msgBody"><tr><td colspan="7" class="loading">Loading...</td></tr></tbody>
    </table>
  </section>
</main>
<script>
  const KEY = new URLSearchParams(location.search).get('key');
  const H = {'x-admin-key': KEY};
  let rsvpData = [];

  async function load() {
    const [r1, r2] = await Promise.all([
      fetch('/admin/rsvps',    {headers:H}).then(r=>r.json()),
      fetch('/admin/messages', {headers:H}).then(r=>r.json()),
    ]);

    // Stats
    if (r1.ok) {
      rsvpData = r1.rsvps;
      document.getElementById('stats').innerHTML = \`
        <div class="stat-box"><span class="stat-num">\${r1.stats.total||0}</span><span class="stat-lbl">Total RSVPs</span></div>
        <div class="stat-box"><span class="stat-num">\${r1.stats.totalGuests||0}</span><span class="stat-lbl">Total Guests</span></div>
        <div class="stat-box"><span class="stat-num">\${r2.ok ? r2.messages.filter(m=>m.approved).length : 0}</span><span class="stat-lbl">Approved Messages</span></div>
      \`;
      document.getElementById('rsvpBody').innerHTML = r1.rsvps.length
        ? r1.rsvps.map(v=>\`<tr>
            <td>\${v.id}</td><td>\${v.name}</td><td>\${v.email}</td>
            <td>\${v.phone||'—'}</td><td>\${v.guests}</td>
            <td><span class="tag tag-yes">\${v.attending}</span></td>
            <td>\${v.message||'—'}</td><td>\${v.created_at}</td>
          </tr>\`).join('')
        : '<tr><td colspan="8" style="color:#9a7d5a;padding:20px;">No RSVPs yet.</td></tr>';
    }

    // Messages
    if (r2.ok) {
      document.getElementById('msgBody').innerHTML = r2.messages.length
        ? r2.messages.map(m=>\`<tr>
            <td>\${m.id}</td><td>\${m.name}</td><td>\${m.relationship||'—'}</td>
            <td>\${m.message}</td>
            <td><span class="tag \${m.approved ? 'tag-yes':'tag-no'}">\${m.approved?'Approved':'Pending'}</span></td>
            <td>\${m.created_at}</td>
            <td>
              \${!m.approved ? \`<button class="btn-apr" onclick="approve(\${m.id})">Approve</button>\` : ''}
              <button class="btn-del" onclick="del(\${m.id})">Delete</button>
            </td>
          </tr>\`).join('')
        : '<tr><td colspan="7" style="color:#9a7d5a;padding:20px;">No messages yet.</td></tr>';
    }
  }

  async function approve(id) {
    await fetch(\`/admin/messages/\${id}/approve\`, {method:'PATCH',headers:H});
    load();
  }
  async function del(id) {
    if(!confirm('Delete this message?')) return;
    await fetch(\`/admin/messages/\${id}\`, {method:'DELETE',headers:H});
    load();
  }

  function exportCSV() {
    if (!rsvpData.length) return alert('No RSVPs to export');
    const cols = ['id','name','email','phone','guests','attending','message','created_at'];
    const rows = [cols.join(','), ...rsvpData.map(r => cols.map(c => JSON.stringify(r[c]||'')).join(','))];
    const blob = new Blob([rows.join('\\n')], {type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'evans_kioko_rsvps.csv'; a.click();
  }

  load();
</script>
</body>
</html>`;
}
