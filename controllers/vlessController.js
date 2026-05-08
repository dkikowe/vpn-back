const User = require('../models/User');
const { XuiService } = require('../services/xuiService');

const DEFAULT_INBOUND_ID = Number(process.env.XUI_INBOUND_ID) || 1;

async function getVlessConfig(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Требуется авторизация',
      });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: 'У пользователя отсутствует email',
      });
    }

    const xuiService = new XuiService();
    const { uuid } = await xuiService.addClient(DEFAULT_INBOUND_ID, user.email);
    const vlessUrl = xuiService.buildVlessLink(uuid, user.email);

    return res.status(200).json({
      success: true,
      protocol: 'vless',
      vlessUrl,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getVlessConfig };
