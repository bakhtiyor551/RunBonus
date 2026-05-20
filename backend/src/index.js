import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import shoesRoutes from './routes/shoes.js';
import workoutRoutes from './routes/workouts.js';
import bonusRoutes from './routes/bonus.js';
import adminRoutes from './routes/admin.js';
import withdrawalRoutes from './routes/withdrawal.js';
import adminWithdrawalsRoutes from './routes/adminWithdrawals.js';
import { isWithdrawalSchemaReady } from './services/withdrawalService.js';

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
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  let withdrawals = false;
  try {
    withdrawals = await isWithdrawalSchemaReady();
  } catch {
    withdrawals = false;
  }
  res.json({ ok: true, service: 'runbonus-api', withdrawals });
});

app.use('/api/auth', authRoutes);
app.use('/api/shoes', shoesRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/bonus', bonusRoutes);
app.use('/api/withdrawal', withdrawalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/withdrawals', adminWithdrawalsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`API: http://localhost:${config.port} (доступен в сети по IP ПК:${config.port})`);
});
