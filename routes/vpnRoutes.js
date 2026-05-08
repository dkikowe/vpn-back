const express = require('express');
const { getVpnConfig, getAvailableServers } = require('../controllers/vpnController');
const { getVlessConfig } = require('../controllers/vlessController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/config', getVpnConfig);
router.get('/config/:serverId', getVpnConfig);
router.get('/servers', getAvailableServers);
router.get('/vless/config', authMiddleware, getVlessConfig);

module.exports = router;
