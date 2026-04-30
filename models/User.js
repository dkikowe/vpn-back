const mongoose = require('mongoose');

/**
 * Схема пользователя. Документы сохраняются в коллекцию `vpn` (требование проекта).
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email обязателен'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Пароль обязателен'],
      minlength: [6, 'Пароль не короче 6 символов'],
      select: false,
    },
    vpnIp: {
      type: String,
      unique: true,
      sparse: true,
    },
    vpnPublicKey: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'vpn',
  }
);

module.exports = mongoose.model('User', userSchema);
