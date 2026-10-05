const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
process.env.UV_THREADPOOL_SIZE = 128;

const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');
const selfsigned = require('selfsigned');

// Load non-secret app config plus ignored local backend secrets if present.
// Production should provide secrets through the hosting environment.
const projectRoot = path.join(__dirname, '..');
require('./loadEnv');

// Qdrant database decommissioned — pure Walrus Memory protocol used
// const qdrantService = require('./services/qdrantService');
// qdrantService.init();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const soulRouter = require('./routes/soul');
const recommendRouter = require('./routes/recommend');
const onboardingRouter = require('./routes/onboarding');
const matchRouter = require('./routes/match');
const detectRouter = require('./routes/detect');
const chatRouter = require('./routes/chat');
const visualizeRouter = require('./routes/visualize');
const enrichRouter = require('./routes/enrich');
const memoryRouter = require('./routes/memory');

// Mounting Routes
app.use('/api/soul', soulRouter);
app.use('/api/recommend', recommendRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/match', matchRouter);
app.use('/api/detect', detectRouter);
app.use('/api/chat', chatRouter);
app.use('/api/visualize', visualizeRouter);
app.use('/api/enrich', enrichRouter);
app.use('/api/memory', memoryRouter);
app.use('/share', detectRouter); // Mount PWA share target at root /share

// Serve static Flutter web files
const webBuildPath = path.join(projectRoot, 'build', 'web');
app.use(express.static(webBuildPath));

// UptimeRobot endpoint to keep Render Web Service awake
app.get('/ping', (req, res) => {
  res.status(200).json({ status: "awake" });
});

// Fallback to index.html for SPA routing (or JSON status if files don't exist)
app.use((req, res) => {
  const indexPath = path.join(webBuildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).json({
      status: "online",
      message: "Coda Backend API is live.",
      frontendInfo: "Host the compiled web frontend on Cloudflare Pages to view the application UI."
    });
  }
});

// ── HTTP server (localhost dev / Render Web Service) ────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Coda Backend (HTTP)  → http://0.0.0.0:${PORT}`);
  
  // ── Launch Background Worker (Decommissioned with Qdrant) ──
  // require('./worker');
});

// ── HTTPS server (LAN microphone access) ─────────────────────────────────────
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const certsDir = path.join(__dirname, 'certs');
const certFile = path.join(certsDir, 'selfsigned.pem');
const keyFile  = path.join(certsDir, 'selfsigned.key');

async function loadOrGenerateCert() {
  // Return cached certs if they already exist on disk
  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    console.log('HTTPS: loading cached self-signed certificate from backend/certs/');
    return {
      cert: fs.readFileSync(certFile, 'utf8'),
      key:  fs.readFileSync(keyFile,  'utf8'),
    };
  }

  // Generate a new self-signed cert and cache it
  console.log('HTTPS: generating new self-signed certificate (CN=coda.local)…');
  const attrs = [{ name: 'commonName', value: 'coda.local' }];
  const opts  = { days: 3650, keySize: 2048, algorithm: 'sha256' };
  const pems  = await selfsigned.generate(attrs, opts);

  fs.mkdirSync(certsDir, { recursive: true });
  fs.writeFileSync(certFile, pems.cert, { mode: 0o600 });
  fs.writeFileSync(keyFile,  pems.private, { mode: 0o600 });
  console.log(`HTTPS: certificate cached to ${certsDir}`);

  return { cert: pems.cert, key: pems.private };
}

if (!process.env.RENDER) {
  (async () => {
    try {
      const { cert, key } = await loadOrGenerateCert();
      https.createServer({ cert, key }, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`Coda Backend (HTTPS) → https://0.0.0.0:${HTTPS_PORT}`);
      });
    } catch (err) {
      console.error('HTTPS: Failed to start server:', err);
    }
  })();
}
