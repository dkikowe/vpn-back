require('dotenv').config();

const express = require('express');
const { connectDB } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);

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
