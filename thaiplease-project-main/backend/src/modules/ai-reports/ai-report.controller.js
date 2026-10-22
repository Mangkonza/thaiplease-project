const { resolvePeriod } = require('../analytics/analytics.period');
const analyticsService = require('../analytics/analytics.service');
const aiReportService = require('./ai-report.service');
const { AiUnavailableError } = require('./ai.client');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');

// body ตาม SRS 3.5.1: {period_type, period_start, period_end} ต้องเป็นสัปดาห์ (จันทร์-อาทิตย์) หรือเดือนเต็ม
// ไม่ส่ง period_start = ช่วงล่าสุดที่จบไปแล้ว
function resolveReportPeriod(body = {}) {
  const { period_type: periodType = 'WEEK', period_start: start, period_end: end } = body;
  const { period, error } = resolvePeriod(periodType, start);
  if (error) return { error: error.replace(/^period/, 'period_type').replace(/^date/, 'period_start') };
  if (start !== undefined && start !== period.start) {
    return { error: `period_start must be the first day of the ${period.type} (expected ${period.start})` };
  }
  if (end !== undefined && end !== period.end) {
    return { error: `period_end must be the last day of the ${period.type} (expected ${period.end})` };
  }
  return { period };
}

// POST /api/v1/shops/:shopId/ai-reports (FR-06, UC-03)
const createReport = async (req, res) => {
  const { period, error } = resolveReportPeriod(req.body);
  if (error) return res.status(400).json({ success: false, message: error });
  const { shopId } = req.params;

  try {
    if (!(await analyticsService.shopExists(shopId))) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    const { report } = await aiReportService.generateReport(shopId, period);
    return res.status(201).json({ success: true, report });
  } catch (err) {
    if (err instanceof aiReportService.InsufficientDataError) {
      return res.status(422).json({
        success: false,
        reason: 'INSUFFICIENT_DATA',
        message: 'Not enough data in this period to generate recommendations',
        period: err.dashboard.period,
        metrics: err.dashboard.metrics,
        comparison: err.dashboard.comparison,
      });
    }
    if (err instanceof AiUnavailableError) {
      console.error(`AI report unavailable for shop ${shopId}:`, err.message);
      return res.status(503).json({
        success: false,
        reason: err.reason,
        message: err.reason === 'AI_NOT_CONFIGURED'
          ? 'AI service is not configured on the server'
          : 'AI report is not available right now. Please try again later.',
      });
    }
    if (err instanceof aiReportService.AiInvalidOutputError) {
      console.error(`AI report rejected for shop ${shopId}:`, err.message);
      return res.status(502).json({
        success: false,
        reason: 'AI_INVALID_OUTPUT',
        message: 'AI returned an invalid report, so nothing was saved. Please try again.',
      });
    }
    console.error('Create AI report error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while creating AI report' });
  }
};

// GET /api/v1/shops/:shopId/ai-reports?period_type=WEEK&period_start=YYYY-MM-DD
// กรองตามช่วงเวลาเมื่อส่ง period_start มาเท่านั้น
const listReports = async (req, res) => {
  let period = null;
  if (req.query.period_start !== undefined) {
    const resolved = resolveReportPeriod({ period_type: req.query.period_type, period_start: req.query.period_start });
    if (resolved.error) return res.status(400).json({ success: false, message: resolved.error });
    period = resolved.period;
  }

  try {
    const reports = await aiReportService.listReports(req.params.shopId, period);
    return res.status(200).json({ success: true, reports });
  } catch (err) {
    console.error('List AI reports error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while listing AI reports' });
  }
};

// GET /api/v1/ai-reports/:reportId (เจ้าของร้านหรือ Admin)
const getReport = async (req, res) => {
  const { reportId } = req.params;
  if (!UUID_PATTERN.test(reportId)) {
    return res.status(400).json({ success: false, message: 'Report ID must be a valid UUID' });
  }

  try {
    const found = await aiReportService.getReportById(reportId);
    if (!found) {
      return res.status(404).json({ success: false, message: 'AI report not found' });
    }
    if (req.user.role !== 'ADMIN' && found.owner_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You are not the owner of this shop' });
    }
    return res.status(200).json({ success: true, report: found.report });
  } catch (err) {
    console.error('Get AI report error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while reading AI report' });
  }
};

// GET /api/v1/promotion-templates (FR-07)
const getTemplates = async (req, res) => {
  try {
    const templates = await aiReportService.listTemplates();
    return res.status(200).json({ success: true, templates });
  } catch (err) {
    console.error('List promotion templates error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while listing promotion templates' });
  }
};

module.exports = {
  createReport,
  listReports,
  getReport,
  getTemplates,
  resolveReportPeriod,
};
