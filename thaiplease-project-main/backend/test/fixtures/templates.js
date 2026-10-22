// อ่าน promotion_templates ทั้ง 10 แบบจาก docker/postgres/init.sql เพื่อให้ test ใช้ schema ตัวจริงเสมอ
const fs = require('fs');
const path = require('path');

const INIT_SQL = path.join(__dirname, '..', '..', '..', 'docker', 'postgres', 'init.sql');
const ROW_PATTERN = /\((\d+), '([A-Z_]+)', '([^']*)', '([^']*)', '([^']*)',\s*\n\s*'(\{.*?\})'\)/g;

function loadTemplatesFromInitSql() {
  const sql = fs.readFileSync(INIT_SQL, 'utf8');
  const templates = [...sql.matchAll(ROW_PATTERN)].map((m) => ({
    template_id: Number(m[1]),
    code: m[2],
    name: m[3],
    description: m[4],
    target_kpi: m[5],
    parameter_schema: JSON.parse(m[6]),
  }));
  if (templates.length !== 10) {
    throw new Error(`Expected 10 promotion templates in ${INIT_SQL}, found ${templates.length}`);
  }
  return templates;
}

module.exports = { loadTemplatesFromInitSql };
