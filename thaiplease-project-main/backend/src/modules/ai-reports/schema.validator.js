// ตัวตรวจ JSON Schema แบบย่อ รองรับเฉพาะ keyword ที่ promotion_templates.parameter_schema ใช้อยู่
// ถ้าเจอ keyword อื่นจะ throw แทนการปล่อยผ่านเงียบ ๆ เพื่อให้รู้ทันทีว่าต้องเพิ่มการรองรับ
const SUPPORTED_KEYWORDS = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'minimum', 'maximum']);

const TYPE_CHECKS = {
  object: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
};

/**
 * @returns {string[]} รายการข้อผิดพลาด (ว่าง = ผ่าน)
 */
function validateSchema(value, schema, path = '$') {
  const unsupported = Object.keys(schema).filter((key) => !SUPPORTED_KEYWORDS.has(key));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported JSON Schema keyword(s) at ${path}: ${unsupported.join(', ')}`);
  }

  if (schema.type) {
    const check = TYPE_CHECKS[schema.type];
    if (!check) throw new Error(`Unsupported JSON Schema type "${schema.type}" at ${path}`);
    if (!check(value)) return [`${path} must be ${schema.type}`];
  }

  const errors = [];

  if (TYPE_CHECKS.object(value)) {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`${path}.${key} is required`);
    }
    const properties = schema.properties || {};
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) {
        errors.push(...validateSchema(child, properties[key], `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key} is not allowed`);
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => errors.push(...validateSchema(item, schema.items, `${path}[${index}]`)));
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`);
  }

  return errors;
}

module.exports = { validateSchema };
