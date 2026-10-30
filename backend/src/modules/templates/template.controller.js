const db = require('../../config/db');
const { writeAudit } = require('../shared/audit');
const { MECHANICS, MIN_ACTIVE_TEMPLATES, mechanicLimits, buildParameterSchema, validateTemplateInput } = require('./template.service');

const TEMPLATE_COLUMNS = `t.template_id, t.code, t.mechanic, t.name, t.description, t.target_kpi, t.parameter_schema,
  t.active, t.archived_at, t.created_at, t.updated_at`;

const fail = (status, message) => Object.assign(new Error(message), { status });

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id < 32768 ? id : null;
}

// ป้องกันไม่ให้เหลือแม่แบบที่เปิดน้อยกว่า 3 แบบ (ต้องเรียกใน transaction ที่ล็อกตารางแล้ว)
async function assertEnoughActive(client, excludingId) {
  const result = await client.query(
    'SELECT COUNT(*)::integer AS count FROM promotion_templates WHERE active AND archived_at IS NULL AND template_id <> $1',
    [excludingId]
  );
  if (result.rows[0].count < MIN_ACTIVE_TEMPLATES) {
    throw fail(409, `At least ${MIN_ACTIVE_TEMPLATES} templates must stay active because the AI proposes ${MIN_ACTIVE_TEMPLATES} options`);
  }
}

async function inTransaction(res, label, work) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // ล็อกตารางแม่แบบ ให้การนับจำนวนที่เปิดอยู่กับการแก้ไขไม่ชนกันระหว่าง Admin หลายคน
    await client.query('LOCK TABLE promotion_templates IN SHARE ROW EXCLUSIVE MODE');
    const result = await work(client);
    await client.query('COMMIT');
    return res.status(result.status || 200).json({ success: true, ...result.body });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'A template with this code already exists' });
    console.error(`${label} error:`, error);
    return res.status(500).json({ success: false, message: `Unable to ${label.toLowerCase()}` });
  } finally {
    client.release();
  }
}

async function adminListTemplates(req, res) {
  try {
    const result = await db.query(
      `SELECT ${TEMPLATE_COLUMNS},
         (SELECT COUNT(*) FROM campaigns c WHERE c.template_id = t.template_id)::integer AS campaign_count,
         (SELECT COUNT(*) FROM ai_suggestions s WHERE s.template_id = t.template_id)::integer AS suggestion_count
       FROM promotion_templates t
       ORDER BY t.archived_at IS NOT NULL, t.template_id`
    );
    const mechanics = Object.entries(MECHANICS).map(([code, mechanic]) => ({ code, label: mechanic.label, limits: mechanicLimits(code) }));
    return res.json({ success: true, templates: result.rows, mechanics, min_active: MIN_ACTIVE_TEMPLATES });
  } catch (error) {
    console.error('Admin list templates error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load promotion templates' });
  }
}

function adminCreateTemplate(req, res) {
  const errors = validateTemplateInput(req.body, { creating: true });
  const built = errors.length ? { errors: [] } : buildParameterSchema(req.body.mechanic, req.body.limits || {});
  const all = [...errors, ...built.errors];
  if (all.length) return res.status(400).json({ success: false, message: all.join('; ') });
  const input = req.body;
  return inTransaction(res, 'Create template', async (client) => {
    const inserted = await client.query(
      `INSERT INTO promotion_templates AS t (code, mechanic, name, description, target_kpi, parameter_schema, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${TEMPLATE_COLUMNS}`,
      [input.code, input.mechanic, input.name.trim(), input.description?.trim() || null, input.target_kpi.trim(),
        JSON.stringify(built.schema), input.active ?? true]
    );
    const template = inserted.rows[0];
    await writeAudit(client, {
      actorId: req.user.user_id, action: 'TEMPLATE_CREATED', entityType: 'promotion_template', entityId: null,
      detail: { template_id: template.template_id, code: template.code, mechanic: template.mechanic },
    });
    return { status: 201, body: { template } };
  });
}

// แก้ชื่อ คำอธิบาย KPI ช่วงค่า และเปิด/ปิด กลไกและรหัสแก้ไม่ได้ เพราะแคมเปญเก่าอ้างอยู่
function adminUpdateTemplate(req, res) {
  const id = parseId(req.params.templateId);
  if (!id) return res.status(400).json({ success: false, message: 'templateId must be a positive integer' });
  const errors = validateTemplateInput(req.body, { creating: false });
  if (errors.length) return res.status(400).json({ success: false, message: errors.join('; ') });
  const input = req.body;
  return inTransaction(res, 'Update template', async (client) => {
    const current = await client.query(`SELECT ${TEMPLATE_COLUMNS} FROM promotion_templates t WHERE t.template_id = $1`, [id]);
    if (!current.rows.length) throw fail(404, 'Template not found');
    const template = current.rows[0];
    if (template.archived_at) throw fail(409, 'Archived templates cannot be edited');
    let schema = template.parameter_schema;
    if (input.limits !== undefined) {
      const built = buildParameterSchema(template.mechanic, input.limits);
      if (built.errors.length) throw fail(400, built.errors.join('; '));
      schema = built.schema;
    }
    if (input.active === false && template.active) await assertEnoughActive(client, id);
    const updated = await client.query(
      `UPDATE promotion_templates AS t
       SET name = $2, description = $3, target_kpi = $4, parameter_schema = $5, active = $6, updated_at = now()
       WHERE t.template_id = $1 RETURNING ${TEMPLATE_COLUMNS}`,
      [id, input.name?.trim() ?? template.name, input.description === undefined ? template.description : (input.description?.trim() || null),
        input.target_kpi?.trim() ?? template.target_kpi, JSON.stringify(schema), input.active ?? template.active]
    );
    await writeAudit(client, {
      actorId: req.user.user_id, action: 'TEMPLATE_UPDATED', entityType: 'promotion_template', entityId: null,
      detail: { template_id: id, changes: input },
    });
    return { body: { template: updated.rows[0] } };
  });
}

// ลบจริงได้เฉพาะแม่แบบที่ไม่เคยถูกใช้ ถ้าเคยมีข้อเสนอ AI หรือแคมเปญอ้างอยู่ จะเก็บเข้าคลังแทน
function adminDeleteTemplate(req, res) {
  const id = parseId(req.params.templateId);
  if (!id) return res.status(400).json({ success: false, message: 'templateId must be a positive integer' });
  return inTransaction(res, 'Delete template', async (client) => {
    const current = await client.query('SELECT template_id, code, active, archived_at FROM promotion_templates WHERE template_id = $1', [id]);
    if (!current.rows.length) throw fail(404, 'Template not found');
    const template = current.rows[0];
    if (template.archived_at) throw fail(409, 'Template is already archived');
    if (template.active) await assertEnoughActive(client, id);
    const usage = await client.query(
      `SELECT (SELECT COUNT(*) FROM campaigns WHERE template_id = $1) + (SELECT COUNT(*) FROM ai_suggestions WHERE template_id = $1) AS used`,
      [id]
    );
    const used = Number(usage.rows[0].used) > 0;
    if (used) {
      await client.query('UPDATE promotion_templates SET active = FALSE, archived_at = now(), updated_at = now() WHERE template_id = $1', [id]);
    } else {
      await client.query('DELETE FROM promotion_templates WHERE template_id = $1', [id]);
    }
    await writeAudit(client, {
      actorId: req.user.user_id, action: used ? 'TEMPLATE_ARCHIVED' : 'TEMPLATE_DELETED', entityType: 'promotion_template', entityId: null,
      detail: { template_id: id, code: template.code },
    });
    return { body: { result: used ? 'ARCHIVED' : 'DELETED' } };
  });
}

module.exports = { adminListTemplates, adminCreateTemplate, adminUpdateTemplate, adminDeleteTemplate };
