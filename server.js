require('dotenv').config();

const express = require('express');
const { connectDB } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const vpnRoutes = require('./routes/vpnRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/privacy-policy', (req, res) => {
  const appName = escapeHtml(process.env.APP_PUBLIC_NAME || 'VPN');
  const supportEmail = escapeHtml(process.env.SUPPORT_EMAIL || 'support@example.com');

  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${appName} Privacy Policy</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:760px;margin:0 auto;padding:32px 20px;line-height:1.6;color:#111827;background:#fff}
    h1{font-size:28px;line-height:1.2}
    h2{font-size:18px;margin-top:28px}
    p,li{font-size:15px}
  </style>
</head>
<body>
  <h1>${appName} Privacy Policy</h1>
  <p>Last updated: May 17, 2026</p>
  <p>${appName} provides VPN connectivity. The app does not require account registration, login, or in-app subscriptions.</p>
  <h2>Data we process</h2>
  <p>To provide the VPN service, our servers may process technical network data such as IP address, connection time, server selection, diagnostics, and traffic metadata needed to route and secure the connection.</p>
  <h2>Data we do not sell</h2>
  <p>We do not sell personal data. We do not use VPN traffic data for advertising or tracking.</p>
  <h2>Retention</h2>
  <p>Technical logs, if collected, are kept only for security, abuse prevention, and service reliability needs, then deleted or aggregated.</p>
  <h2>Contact</h2>
  <p>For privacy requests, contact us at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
</body>
</html>`);
});

app.use('/api/auth', authRoutes);
app.use('/api/vpn', vpnRoutes);

app.use(errorHandler);

/**
 * Запуск сервера после успешного подключения к БД.
 */
async function bootstrap() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Сервер слушает порт ${PORT}`);
    });
  } catch (err) {
    console.error('Не удалось запустить приложение:', err);
    process.exit(1);
  }
}

bootstrap();
