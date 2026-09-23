import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initWebSockets } from './services/wsRouter.js';
import { UPLOADS_ROOT } from './utils/userProfile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import authRoutes from './routes/auth.js';
import shoesRoutes from './routes/shoes.js';
import workoutRoutes from './routes/workouts.js';
import bonusRoutes from './routes/bonus.js';
import adminRoutes from './routes/admin.js';
import meRoutes from './routes/me.js';
import userRoutes from './routes/user.js';
import mobileRoutes from './routes/mobile.js';
import adminShopRoutes from './routes/adminShop.js';
import adminReportsRoutes from './routes/adminReports.js';
import adminAdsRoutes from './routes/adminAds.js';
import rewardsRoutes from './routes/rewards.js';
import adminRewardsRoutes from './routes/adminRewards.js';
import levelsRoutes from './routes/levels.js';
import achievementsRoutes from './routes/achievements.js';
import adminLevelsRoutes from './routes/adminLevels.js';
import adminAchievementsRoutes from './routes/adminAchievements.js';
import { buildDailyTelegramReport } from './services/reportsService.js';
import { sendTelegramMessage } from './services/telegramService.js';

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // Capacitor/WebView: http://localhost, capacitor://localhost, null
      if (!origin || /^https?:\/\/localhost(:\d+)?$/i.test(origin) || /^capacitor:\/\//i.test(origin)) {
        return callback(null, origin || true);
      }
      callback(null, origin);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id'],
  })
);
app.use(express.json({ limit: '12mb' }));
app.use('/uploads', express.static(UPLOADS_ROOT));
app.use('/api/uploads', express.static(UPLOADS_ROOT));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'runbonus-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/shoes', shoesRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/bonus', bonusRoutes);
app.use('/api/me', meRoutes);
app.use('/api/user', userRoutes);
app.use('/api/mobile', mobileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/shop', adminShopRoutes);
app.use('/api/admin/reports', adminReportsRoutes);
app.use('/api/admin/ads', adminAdsRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/admin/rewards', adminRewardsRoutes);
app.use('/api/levels', levelsRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/admin', adminLevelsRoutes);
app.use('/api/admin', adminAchievementsRoutes);

/** Утренний Telegram-отчёт (08:00, один раз в сутки). */
let lastDailyReportKey = '';
setInterval(async () => {
  try {
    const now = new Date();
    if (now.getHours() !== 8 || now.getMinutes() > 1) return;
    const key = now.toISOString().slice(0, 10);
    if (lastDailyReportKey === key) return;
    lastDailyReportKey = key;
    const text = await buildDailyTelegramReport();
    await sendTelegramMessage(text);
  } catch (e) {
    console.error('[daily-report]', e.message);
  }
}, 60_000);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const httpServer = http.createServer(app);
initWebSockets(httpServer);

httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(`API: http://localhost:${config.port} (доступен в сети по IP ПК:${config.port})`);
});
