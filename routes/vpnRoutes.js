const express = require('express');
const { getVpnConfig, getAvailableServers } = require('../controllers/vpnController');

const router = express.Router();

router.get('/config', getVpnConfig);
router.get('/config/:serverId', getVpnConfig);
router.get('/servers', getAvailableServers);

module.exports = router;
