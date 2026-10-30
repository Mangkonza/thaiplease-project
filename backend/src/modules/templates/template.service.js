// กลไกโปรโมชัน 10 แบบที่ระบบคำนวณได้ (campaign.service.js และ campaign.metrics.js อ่านค่านี้)
// แม่แบบที่ Admin สร้างเลือกกลไกได้ 1 แบบ และบีบช่วงค่าให้แคบลงได้ แต่ขยายเกินขอบเขตของกลไกไม่ได้
const MECHANICS = {
  PERCENT_DISCOUNT: { label: 'ลดเป็นเปอร์เซ็นต์เมื่อถึงยอดขั้นต่ำ', schema: { type: 'object', properties: { discount_percent: { type: 'number', minimum: 1, maximum: 100 }, min_spend: { type: 'number', minimum: 0 } }, required: ['discount_percent', 'min_spend'] } },
  FIXED_DISCOUNT: { label: 'ลดเงินคงที่เมื่อถึงยอดขั้นต่ำ', schema: { type: 'object', properties: { discount_amount: { type: 'number', minimum: 1 }, min_spend: { type: 'number', minimum: 0 } }, required: ['discount_amount', 'min_spend'] } },
  BONUS_COIN: { label: 'ครบยอดแล้วรับเหรียญเพิ่ม', schema: { type: 'object', properties: { bonus_coin: { type: 'integer', minimum: 1 }, min_spend: { type: 'number', minimum: 0 } }, required: ['bonus_coin', 'min_spend'] } },
  COIN_MULTIPLIER: { label: 'คูณเหรียญสะสม', schema: { type: 'object', properties: { multiplier: { type: 'number', minimum: 1.1, maximum: 10 } }, required: ['multiplier'] } },
  MIN_SPEND_REWARD: { label: 'ครบยอดแล้วรับส่วนลด', schema: { type: 'object', properties: { min_spend: { type: 'number', minimum: 1 }, reward_value: { type: 'number', minimum: 1 } }, required: ['min_spend', 'reward_value'] } },
  COMEBACK_REWARD: { label: 'ส่วนลดดึงลูกค้าที่หายไปกลับมา', schema: { type: 'object', properties: { inactive_days: { type: 'integer', minimum: 7 }, discount_amount: { type: 'number', minimum: 1 } }, required: ['inactive_days', 'discount_amount'] } },
  FREQUENCY_REWARD: { label: 'ซื้อครบจำนวนครั้งรับเหรียญ', schema: { type: 'object', properties: { required_orders: { type: 'integer', minimum: 2 }, reward_coins: { type: 'integer', minimum: 1 } }, required: ['required_orders', 'reward_coins'] } },
  TIME_BASED: { label: 'ลดเฉพาะช่วงเวลา', schema: { type: 'object', properties: { start_time: { type: 'string' }, end_time: { type: 'string' }, discount_percent: { type: 'number' } }, required: ['start_time', 'end_time', 'discount_percent'] } },
  DAY_BASED: { label: 'ลดเฉพาะวันที่กำหนด', schema: { type: 'object', properties: { target_days: { type: 'array', items: { type: 'string' } }, discount_percent: { type: 'number' } }, required: ['target_days', 'discount_percent'] } },
  NEW_CUSTOMER: { label: 'ส่วนลดลูกค้าใหม่ของร้าน', schema: { type: 'object', properties: { discount_percent: { type: 'number', minimum: 1, maximum: 100 }, max_discount: { type: 'number' } }, required: ['discount_percent'] } },
};

// เปิดใช้อย่างน้อย 3 แบบ เพราะ AI ต้องเสนอ 3 ทางเลือกจากแม่แบบต่างกัน
const MIN_ACTIVE_TEMPLATES = 3;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,49}$/;

const isNumericProperty = (property) => property.type === 'number' || property.type === 'integer';

// ช่องตัวเลขของกลไกที่ Admin ตั้งช่วงค่าได้
function mechanicLimits(mechanic) {
  const { properties } = MECHANICS[mechanic].schema;
  return Object.entries(properties).filter(([, property]) => isNumericProperty(property))
    .map(([key, property]) => ({ key, type: property.type, minimum: property.minimum ?? null, maximum: property.maximum ?? null }));
}

/**
 * สร้าง parameter_schema จากกลไก + ช่วงค่าที่ Admin ตั้ง
 * @param {Record<string, {minimum?: number|null, maximum?: number|null}>} limits
 * @returns {{ schema?: object, errors: string[] }}
 */
function buildParameterSchema(mechanic, limits = {}) {
  const base = MECHANICS[mechanic];
  if (!base) return { errors: [`mechanic must be one of ${Object.keys(MECHANICS).join(', ')}`] };
  if (limits === null || typeof limits !== 'object' || Array.isArray(limits)) return { errors: ['limits must be an object'] };
  const schema = structuredClone(base.schema);
  const errors = [];
  for (const [key, limit] of Object.entries(limits)) {
    const property = schema.properties[key];
    if (!property || !isNumericProperty(property)) {
      errors.push(`limits.${key} is not a numeric parameter of ${mechanic}`);
      continue;
    }
    if (limit === null || typeof limit !== 'object') {
      errors.push(`limits.${key} must be an object`);
      continue;
    }
    for (const bound of ['minimum', 'maximum']) {
      const value = limit[bound];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || (property.type === 'integer' && !Number.isInteger(value))) {
        errors.push(`limits.${key}.${bound} must be a ${property.type}`);
        continue;
      }
      const baseMin = base.schema.properties[key].minimum;
      const baseMax = base.schema.properties[key].maximum;
      if ((baseMin !== undefined && value < baseMin) || (baseMax !== undefined && value > baseMax)) {
        errors.push(`limits.${key}.${bound} must stay within ${baseMin ?? '-∞'}..${baseMax ?? '∞'}`);
        continue;
      }
      property[bound] = value;
    }
    if (property.minimum !== undefined && property.maximum !== undefined && property.minimum > property.maximum) {
      errors.push(`limits.${key}.minimum must not be greater than maximum`);
    }
  }
  return errors.length ? { errors } : { schema, errors: [] };
}

const isText = (value, max, required = false) => (value === undefined || value === null
  ? !required
  : typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max);

// ตรวจข้อมูลแม่แบบ creating = true ตอนสร้างใหม่ (ต้องมี code และ mechanic)
function validateTemplateInput(input, { creating }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['body must be an object'];
  const errors = [];
  if (creating) {
    if (typeof input.code !== 'string' || !CODE_PATTERN.test(input.code)) {
      errors.push('code must be 3-50 characters of A-Z, 0-9 or _ and start with a letter');
    }
    if (!MECHANICS[input.mechanic]) errors.push(`mechanic must be one of ${Object.keys(MECHANICS).join(', ')}`);
  }
  if (!isText(input.name, 120, creating)) errors.push('name must be text up to 120 characters');
  if (!isText(input.target_kpi, 80, creating)) errors.push('target_kpi must be text up to 80 characters');
  if (input.description !== undefined && input.description !== null && (typeof input.description !== 'string' || input.description.length > 500)) {
    errors.push('description must be text up to 500 characters');
  }
  if (input.active !== undefined && typeof input.active !== 'boolean') errors.push('active must be true or false');
  return errors;
}

module.exports = { MECHANICS, MIN_ACTIVE_TEMPLATES, mechanicLimits, buildParameterSchema, validateTemplateInput };
