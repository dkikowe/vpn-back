const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const SALT_ROUNDS = 10;

/**
 * Формирует JWT с идентификатором пользователя.
 */
function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET не задан в .env');
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ sub: userId.toString() }, secret, { expiresIn });
}

/**
 * POST /api/auth/register — регистрация и выдача JWT.
 */
async function register(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Укажите email и password',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Пользователь с таким email уже зарегистрирован',
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      email: email.toLowerCase().trim(),
      password: passwordHash,
    });

    const token = signToken(user._id);

    return res.status(201).json({
      success: true,
      message: 'Регистрация успешна',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/login — проверка учётных данных и выдача JWT.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Укажите email и password',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
      '+password'
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Неверный email или пароль',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Неверный email или пароль',
      });
    }

    const token = signToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Вход выполнен',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/me — текущий пользователь по JWT (без пароля).
 */
async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
  getMe,
};
