const { resolvePeriod } = require('./analytics.period');
const analyticsService = require('./analytics.service');

function parsePeriod(req, res) {
  const { period, error } = resolvePeriod(req.query.period, req.query.date);
  if (error) {
    res.status(400).json({ success: false, message: error });
    return null;
  }
  return period;
}

// GET /api/v1/shops/:shopId/metrics?period=week|month&date=YYYY-MM-DD (FR-05, D-03)
const getMetrics = async (req, res) => {
  const period = parsePeriod(req, res);
  if (!period) return;
  const { shopId } = req.params;

  try {
    if (!(await analyticsService.shopExists(shopId))) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    const result = await analyticsService.getAndSaveShopMetrics(shopId, period);
    return res.status(200).json({ success: true, shop_id: shopId, period, ...result });
  } catch (error) {
    console.error('Get shop metrics error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error while calculating shop metrics' });
  }
};

// GET /api/v1/shops/:shopId/dashboard?period=week|month&date=YYYY-MM-DD
const getDashboard = async (req, res) => {
  const period = parsePeriod(req, res);
  if (!period) return;
  const { shopId } = req.params;

  try {
    if (!(await analyticsService.shopExists(shopId))) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    const dashboard = await analyticsService.getDashboardData(shopId, period);
    return res.status(200).json({ success: true, shop_id: shopId, ...dashboard });
  } catch (error) {
    console.error('Get shop dashboard error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error while building shop dashboard' });
  }
};

module.exports = {
  getMetrics,
  getDashboard,
};
