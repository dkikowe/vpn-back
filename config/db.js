const mongoose = require('mongoose');

/**
 * Подключает приложение к MongoDB по строке из process.env.MONGODB_URI.
 * Имя базы задаётся в самом URI (например, .../vpn?...).
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI не задан в переменных окружения (.env)');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri);
  console.log('MongoDB: подключение установлено');
}

module.exports = { connectDB };
