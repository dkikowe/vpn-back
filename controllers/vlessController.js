const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { XuiService } = require("../services/xuiService");

const DEFAULT_INBOUND_ID = Number(process.env.XUI_INBOUND_ID) || 1;
const SALT_ROUNDS = 10;

/**
 * С JWT — пользователь из БД; без токена — новый гостевой пользователь (как у WireGuard).
 */
async function resolveUserForVless(req) {
  const userId = req.user?.id;
  if (userId) {
    return User.findById(userId);
  }

  const randomSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const guestEmail = `guest-${randomSuffix}@vpn.local`;
  const guestPasswordHash = await bcrypt.hash(
    `guest-${randomSuffix}`,
    SALT_ROUNDS,
  );

  return User.create({
    email: guestEmail,
    password: guestPasswordHash,
  });
}

async function getVlessConfig(req, res, next) {
  try {
    const user = await resolveUserForVless(req);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Пользователь не найден",
      });
    }

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: "У пользователя отсутствует email",
      });
    }

    const xuiService = new XuiService();
    const { uuid } = await xuiService.addClient(DEFAULT_INBOUND_ID, user.email);
    const vlessUrl = xuiService.buildVlessLink(uuid, user.email);

    return res.status(200).json({
      success: true,
      protocol: "vless",
      vlessUrl,
      xrayConfig: xuiService.buildXrayJson(uuid),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getVlessConfig };
