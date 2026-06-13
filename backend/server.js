const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
process.env.UV_THREADPOOL_SIZE = 128;

const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const https = require('https');
const fs = require('fs');
const selfsigned = require('selfsigned');

// Load environment variables from the root assets/.env file
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, 'assets', '.env');
dotenv.config({ path: envPath });

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const chatRoute = require('./routes/chat');
const recommendRoute = require('./routes/recommend');
const onboardingRoute = require('./routes/onboarding');
const detectRoute = require('./routes/detect');
app.use('/api/openai', chatRoute);
app.use('/api/recommend', recommendRoute);
app.use('/api/onboarding', onboardingRoute);
app.use('/api/detect', detectRoute);
app.use('/share', detectRoute); // Mount PWA share target at root /share

// Serve static Flutter web files
const webBuildPath = path.join(projectRoot, 'build', 'web');
app.use(express.static(webBuildPath));

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(webBuildPath, 'index.html'));
});

// ── HTTP server (localhost dev) ───────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Coda Backend (HTTP)  → http://0.0.0.0:${PORT}`);
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
