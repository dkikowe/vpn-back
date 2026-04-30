const jwt = require('jsonwebtoken');

/**
 * Проверяет заголовок Authorization: Bearer <JWT> и записывает пользователя в req.user.
 */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Требуется авторизация (Bearer token)',
    });
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Токен не передан',
    });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return next(new Error('JWT_SECRET не задан в .env'));
  }

  try {
    const payload = jwt.verify(token, secret);
    const userId = payload.sub;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Некорректный токен',
      });
    }
    req.user = { id: userId };
    req.userId = userId;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Срок действия токена истёк',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Недействительный токен',
    });
  }
}

module.exports = { authMiddleware };
