const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
process.env.UV_THREADPOOL_SIZE = 128;

const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

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
app.use('/api/openai', chatRoute);
app.use('/api/recommend', recommendRoute);
app.use('/api/onboarding', onboardingRoute);

// Serve static Flutter web files
const webBuildPath = path.join(projectRoot, 'build', 'web');
app.use(express.static(webBuildPath));

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(webBuildPath, 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Coda Backend running on http://0.0.0.0:${PORT}`);
});
