/**
 * Централизованный обработчик ошибок Express (последний middleware).
 * Обрабатывает дубликат ключа MongoDB (email) и прочие ошибки.
 */
function errorHandler(err, req, res, _next) {
  // Дубликат уникального индекса (код 11000 в MongoDB)
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Пользователь с таким email уже зарегистрирован',
    });
  }

  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    const message = first?.message || 'Ошибка валидации';
    return res.status(400).json({
      success: false,
      message,
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Некорректный идентификатор',
    });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : err.message,
  });
}

module.exports = { errorHandler };
