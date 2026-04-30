const express = require('express');
const { getVpnConfig } = require('../controllers/vpnController');

const router = express.Router();

router.get('/config', getVpnConfig);
router.get('/config/:serverId', getVpnConfig);

module.exports = router;
