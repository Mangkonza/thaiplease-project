const db = require('../../config/db');
const analyticsService = require('../analytics/analytics.service');
const aiClient = require('./ai.client');
const contract = require('./ai-report.contract');

class InsufficientDataError extends Error {
  constructor(dashboard) {
    super('No successful payments in the selected period or the period before it');
    this.name = 'InsufficientDataError';
    this.dashboard = dashboard;
  }
}

class AiInvalidOutputError extends Error {
  constructor(errors, model) {
    super(`AI output failed validation after retry (${model}): ${errors.join('; ')}`);
    this.name = 'AiInvalidOutputError';
    this.errors = errors;
  }
}

async function loadActiveTemplates() {
  const result = await db.query(
    `SELECT template_id, code, name, description, target_kpi, parameter_schema
     FROM promotion_templates WHERE active = TRUE ORDER BY template_id`
  );
  return result.rows;
}

// ขอคำตอบจาก AI แล้วตรวจ; ถ้าไม่ผ่านส่งข้อผิดพลาดกลับไปให้แก้ 1 ครั้ง ถ้ายังไม่ผ่านไม่บันทึกอะไรเลย (AT-09)
async function requestValidReport(payload, templates) {
  const messages = contract.buildMessages(payload);
  const schema = contract.buildResponseSchema(templates);

  const first = await aiClient.chatJson({ messages, schema });
  const firstCheck = contract.validateAiOutput(first.content, templates);
  if (firstCheck.report) return { report: firstCheck.report, model: first.model };

  console.warn(`AI output from ${first.model} failed validation, retrying once:`, firstCheck.errors);
  const second = await aiClient.chatJson({ messages: contract.buildRetryMessages(messages, first.content, firstCheck.errors), schema });
  const secondCheck = contract.validateAiOutput(second.content, templates);
  if (secondCheck.report) return { report: secondCheck.report, model: second.model };

  throw new AiInvalidOutputError(secondCheck.errors, second.model);
}

// บันทึกรายงานและ 3 ข้อเสนอใน transaction เดียว; เรียก AI เสร็จก่อนเปิด transaction เพื่อไม่ให้ค้าง connection
async function saveReport({ shopId, period, model, report, metricsSnapshot }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO ai_reports (shop_id, period_type, period_start, period_end, model_version,
                               summary, problem_summary, possible_causes, metrics_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
       RETURNING report_id`,
      [shopId, period.type, period.start, period.end, model, report.summary, report.problem,
        JSON.stringify(report.possible_causes), JSON.stringify(metricsSnapshot)]
    );
    const reportId = inserted.rows[0].report_id;

    for (const suggestion of report.suggestions) {
      await client.query(
        `INSERT INTO ai_suggestions (report_id, template_id, rank, parameters, reason, target_kpi)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [reportId, suggestion.template_id, suggestion.rank, JSON.stringify(suggestion.parameters),
          suggestion.reason.trim(), suggestion.target_kpi.trim()]
      );
    }

    await client.query('COMMIT');
    return reportId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function generateReport(shopId, period) {
  const dashboard = await analyticsService.getDashboardData(shopId, period);
  if (dashboard.metrics.orders === 0 && dashboard.comparison.metrics.orders === 0) {
    throw new InsufficientDataError(dashboard);
  }

  const templates = await loadActiveTemplates();
  const payload = contract.buildAiPayload(dashboard, templates);
  const { report, model } = await requestValidReport(payload, templates);

  // เก็บเฉพาะตัวเลขที่ส่งให้ AI เพื่อย้อนดูได้ว่ารายงานมาจากข้อมูลชุดไหน (NFR-08)
  const metricsSnapshot = {
    period: payload.period,
    metrics: payload.metrics,
    comparison: payload.comparison,
    change_percent: payload.change_percent,
    allowed_template_ids: templates.map((t) => t.template_id),
  };
  const reportId = await saveReport({ shopId, period, model, report, metricsSnapshot });
  return getReportById(reportId);
}

// คืนรายงานพร้อม owner_id ของร้าน เพื่อให้ controller ตรวจสิทธิ์ได้ (BR-04)
async function getReportById(reportId) {
  const reportResult = await db.query(
    `SELECT r.report_id, r.shop_id, s.owner_id, r.period_type,
            to_char(r.period_start, 'YYYY-MM-DD') AS period_start,
            to_char(r.period_end, 'YYYY-MM-DD') AS period_end,
            r.model_version, r.summary, r.problem_summary, r.possible_causes, r.metrics_snapshot, r.created_at
     FROM ai_reports r JOIN shops s ON s.shop_id = r.shop_id
     WHERE r.report_id = $1`,
    [reportId]
  );
  if (reportResult.rows.length === 0) return null;
  const row = reportResult.rows[0];

  const suggestionResult = await db.query(
    `SELECT g.suggestion_id, g.rank, g.template_id, t.code AS template_code, t.name AS template_name,
            g.parameters, g.reason, g.target_kpi, g.status
     FROM ai_suggestions g JOIN promotion_templates t ON t.template_id = g.template_id
     WHERE g.report_id = $1
     ORDER BY g.rank`,
    [reportId]
  );

  const report = {
    report_id: row.report_id,
    shop_id: row.shop_id,
    period: { type: row.period_type, start: row.period_start, end: row.period_end },
    model_version: row.model_version,
    summary: row.summary,
    problem: row.problem_summary,
    possible_causes: row.possible_causes,
    metrics_snapshot: row.metrics_snapshot,
    created_at: row.created_at,
    suggestions: suggestionResult.rows,
  };
  return { owner_id: row.owner_id, report };
}

// รายงานที่บันทึกไว้ของร้าน ใหม่สุดก่อน; ใช้แสดงรายงานล่าสุดได้ทันทีโดยไม่ต้องเรียก AI ซ้ำ
async function listReports(shopId, period) {
  const params = [shopId];
  let filter = '';
  if (period) {
    params.push(period.type, period.start);
    filter = 'AND period_type = $2 AND period_start = $3';
  }
  const result = await db.query(
    `SELECT report_id, period_type, to_char(period_start, 'YYYY-MM-DD') AS period_start,
            to_char(period_end, 'YYYY-MM-DD') AS period_end, model_version, problem_summary, created_at
     FROM ai_reports
     WHERE shop_id = $1 ${filter}
     ORDER BY created_at DESC
     LIMIT 20`,
    params
  );
  return result.rows.map((row) => ({
    report_id: row.report_id,
    period: { type: row.period_type, start: row.period_start, end: row.period_end },
    model_version: row.model_version,
    problem: row.problem_summary,
    created_at: row.created_at,
  }));
}

async function listTemplates() {
  const result = await db.query(
    `SELECT template_id, code, name, description, target_kpi, parameter_schema, active
     FROM promotion_templates ORDER BY template_id`
  );
  return result.rows;
}

module.exports = {
  generateReport,
  getReportById,
  listReports,
  listTemplates,
  InsufficientDataError,
  AiInvalidOutputError,
};
