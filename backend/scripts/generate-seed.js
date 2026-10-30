// สร้าง backend/seed/seed.sql สำหรับพัฒนาและ demo เท่านั้น (ดู backend/seed/README.md)
// ผลลัพธ์ deterministic: ใช้ --end เดิมจะได้ไฟล์เดิมทุกครั้ง
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const SEED_PASSWORD = 'Test1234!';
// salt คงที่เพื่อให้ไฟล์ออกมาเหมือนเดิมทุกครั้ง ห้ามใช้วิธีนี้กับรหัสผ่านจริง
const FIXED_SALT = '$2b$10$ThaiPleaseSeedSaltAbCd';
const WEEKS = 8;

// Story ของร้าน A: ลูกค้าใหม่ราว 4-5 คนต่อสัปดาห์ แล้วเหลือ 1 คนในสัปดาห์ล่าสุด
// และลูกค้าเก่าซื้อน้อยลง ทำให้ยอดขายสัปดาห์ล่าสุดลดลงด้วย
const SHOP_A_NEW_PER_WEEK = [5, 4, 5, 4, 5, 4, 4, 1];
const SHOP_A_REPEAT_PROBABILITY = [0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.3];
const SHOP_B_NEW_PER_WEEK = [3, 3, 3, 3, 3, 3, 3, 3];
const SHOP_B_REPEAT_PROBABILITY = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
const BAHT_PER_COIN = 25; // BR-09
// รัฐช่วยจ่ายย้อนหลังให้รายการตั้งแต่เริ่มโครงการ ตามเพดานโครงการจริง (ดู docker/postgres/09_monthly_cap_only.sql)
const PROGRAM_START = '2026-10-01';
const COPAY_PERCENT = 60;
const DAILY_CAP = 200;
const MONTHLY_CAP = 1000;
const SEED_POLICY_VERSION = 1;

const uuid = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ID = {
  admin: uuid('a', 1),
  merchantA: uuid('a', 2),
  merchantB: uuid('a', 3),
  suspendedCitizen: uuid('a', 4),
  citizen: (i) => uuid('a', 100 + i),
  shopA: uuid('b', 1),
  shopB: uuid('b', 2),
  shopPending: uuid('b', 3),
  shopSuspended: uuid('b', 4),
  // ร้านเพิ่มเติม 8 ร้าน (merchant.c ถึง merchant.j)
  extraMerchant: (i) => uuid('a', 10 + i),
  extraShop: (i) => uuid('b', 4 + i),
};

// หมวดหมู่และพื้นที่ต้องตรงกับตัวเลือกในหน้าค้นหาร้าน (frontend ShopsPage / MerchantShopsPage)
const CATEGORY = {
  drinks: 'อาหารและเครื่องดื่ม',
  cafe: 'คาเฟ่',
  madeToOrder: 'ร้านอาหารตามสั่ง',
  dessert: 'ของหวานและเบเกอรี่',
  goods: 'ของใช้และบริการ',
};
const AREA = { kps: 'กำแพงแสน', city: 'เมืองนครปฐม', bangkhen: 'บางเขน', campus: 'มหาวิทยาลัย' };

// ร้านเพิ่มเติม: ลูกค้าสุ่มจากประชาชนทั้ง 80 คน แต่ละร้านมีแนวโน้มยอดขายต่างกัน
const EXTRA_SHOPS = [
  { owner: 'ลุงหมาย', name: 'ก๋วยเตี๋ยวเรือลุงหมาย', category: CATEGORY.madeToOrder, area: AREA.kps, description: 'ก๋วยเตี๋ยวเรือน้ำตกหมูเนื้อ ชามเล็กชามใหญ่ เปิดทุกวัน', newPerWeek: [3, 3, 3, 3, 3, 3, 3, 3], repeat: 0.5, min: 40, max: 90 },
  { owner: 'น้องฟ้า', name: 'ชานมไข่มุกน้องฟ้า', category: CATEGORY.drinks, area: AREA.campus, description: 'ชานมไข่มุก ชาผลไม้ และโกโก้เย็น หน้ามหาวิทยาลัย', newPerWeek: [1, 2, 2, 3, 3, 4, 4, 5], repeat: 0.45, min: 35, max: 80 },
  { owner: 'ยายเพ็ญ', name: 'ส้มตำยายเพ็ญ', category: CATEGORY.madeToOrder, area: AREA.kps, description: 'ส้มตำ ไก่ย่าง ลาบ น้ำตก รสจัดจ้านแบบอีสาน', newPerWeek: [3, 3, 2, 3, 2, 3, 2, 3], repeat: 0.4, min: 50, max: 150 },
  { owner: 'คุณนิด', name: 'เบเกอรี่บ้านขนมปัง', category: CATEGORY.dessert, area: AREA.city, description: 'ขนมปังอบใหม่ เค้กชิ้น และคุกกี้เนยสด', newPerWeek: [3, 3, 3, 2, 2, 2, 1, 1], repeat: 0.35, min: 60, max: 220 },
  { owner: 'แม่ทองใบ', name: 'ข้าวแกงแม่ทองใบ', category: CATEGORY.madeToOrder, area: AREA.campus, description: 'ข้าวราดแกงกว่า 20 อย่าง ราคานักศึกษา', newPerWeek: [4, 3, 4, 3, 4, 3, 4, 3], repeat: 0.55, min: 40, max: 100 },
  { owner: 'คุณต้น', name: 'คาเฟ่ริมนา', category: CATEGORY.cafe, area: AREA.kps, description: 'กาแฟดริปและเครื่องดื่มเย็น วิวทุ่งนา นั่งชิลได้ทั้งวัน', newPerWeek: [2, 2, 3, 3, 2, 3, 3, 2], repeat: 0.3, min: 70, max: 260 },
  { owner: 'ป้าสมใจ', name: 'ร้านชำป้าสมใจ', category: CATEGORY.goods, area: AREA.bangkhen, description: 'ของใช้ในบ้าน เครื่องปรุง ขนม และน้ำดื่ม', newPerWeek: [2, 2, 2, 2, 2, 2, 2, 2], repeat: 0.5, min: 30, max: 300 },
  { owner: 'พี่บอล', name: 'น้ำปั่นผลไม้สดหน้ามอ', category: CATEGORY.drinks, area: AREA.campus, description: 'น้ำปั่นผลไม้สด สมูทตี้ และน้ำผลไม้คั้นสด', newPerWeek: [2, 2, 3, 2, 3, 2, 3, 2], repeat: 0.4, min: 30, max: 70 },
];

// PRNG แบบ mulberry32 เพื่อให้สุ่มซ้ำได้เหมือนเดิม
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseSunday(endDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error(`--end must be YYYY-MM-DD, got "${endDate}"`);
  }
  const date = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDay() !== 0) {
    throw new Error(`--end must be a Sunday (last day of a Monday-Sunday week), got "${endDate}"`);
  }
  return date;
}

function lastCompletedSunday(today = new Date()) {
  const date = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const daysBack = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};
const isoDate = (date) => date.toISOString().slice(0, 10);
const pad2 = (n) => String(n).padStart(2, '0');

function buildSeedData({ endDate }) {
  const end = parseSunday(endDate);
  const random = createRandom(20261008);
  const pick = (min, max, step = 1) => min + step * Math.floor(random() * ((max - min) / step + 1));

  // week 1 = เก่าสุด, week 8 = สัปดาห์ล่าสุด (จันทร์-อาทิตย์)
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const start = addDays(end, -(WEEKS - 1 - i) * 7 - 6);
    return { number: i + 1, start: isoDate(start), end: isoDate(addDays(start, 6)), startDate: start };
  });

  const passwordHash = bcrypt.hashSync(SEED_PASSWORD, FIXED_SALT);
  const users = [
    { user_id: ID.admin, email: 'admin@thaiplease.test', display_name: 'Admin', role: 'ADMIN', status: 'ACTIVE' },
    { user_id: ID.merchantA, email: 'merchant.a@thaiplease.test', display_name: 'เจ้าของร้านกาแฟบ้านสวน', role: 'MERCHANT', status: 'ACTIVE' },
    { user_id: ID.merchantB, email: 'merchant.b@thaiplease.test', display_name: 'ป้าแดง', role: 'MERCHANT', status: 'ACTIVE' },
    { user_id: ID.suspendedCitizen, email: 'suspended@thaiplease.test', display_name: 'Suspended Citizen', role: 'CITIZEN', status: 'SUSPENDED' },
  ];
  EXTRA_SHOPS.forEach((shop, index) => {
    users.push({ user_id: ID.extraMerchant(index + 1), email: `merchant.${String.fromCharCode(99 + index)}@thaiplease.test`, display_name: shop.owner, role: 'MERCHANT', status: 'ACTIVE' });
  });
  for (let i = 1; i <= 80; i++) {
    users.push({
      user_id: ID.citizen(i),
      email: `citizen${pad2(i)}@thaiplease.test`,
      display_name: `Citizen ${pad2(i)}`,
      role: 'CITIZEN',
      status: 'ACTIVE',
    });
  }
  users.forEach((user) => { user.password_hash = passwordHash; });

  // คำอธิบายร้านแสดงบนหน้าเว็บ จึงเขียนแบบร้านจริง ไม่เฉลย story ของข้อมูลก่อน AI วิเคราะห์
  const shops = [
    // ร้าน story: ลูกค้าใหม่ลดลงในสัปดาห์ล่าสุด
    { shop_id: ID.shopA, owner_id: ID.merchantA, name: 'ร้านกาแฟบ้านสวน', category: CATEGORY.cafe, area: AREA.kps, description: 'กาแฟสดคั่วเองและขนมโฮมเมด บรรยากาศสวน ใกล้มหาวิทยาลัย', status: 'ACTIVE' },
    // ร้านเปรียบเทียบ: ยอดขายคงที่
    { shop_id: ID.shopB, owner_id: ID.merchantB, name: 'ข้าวมันไก่ป้าแดง', category: CATEGORY.madeToOrder, area: AREA.kps, description: 'ข้าวมันไก่ต้มและไก่ทอดสูตรดั้งเดิม เปิดเช้าถึงบ่าย', status: 'ACTIVE' },
    // รอ Admin อนุมัติ (D-10)
    { shop_id: ID.shopPending, owner_id: ID.merchantB, name: 'ขนมไทยแม่ศรี', category: CATEGORY.dessert, area: AREA.city, description: 'ขนมไทยทำสดทุกวัน รับสั่งทำงานบุญ', status: 'PENDING' },
    // ถูกระงับ: ประชาชนต้องค้นหาไม่เจอ (AT-20)
    { shop_id: ID.shopSuspended, owner_id: ID.merchantA, name: 'บ้านสวนเบเกอรี่', category: CATEGORY.dessert, area: AREA.city, description: 'ขนมปังและเค้กอบสดใหม่ทุกเช้า', status: 'SUSPENDED' },
    ...EXTRA_SHOPS.map((shop, index) => ({
      shop_id: ID.extraShop(index + 1), owner_id: ID.extraMerchant(index + 1), name: shop.name, category: shop.category,
      area: shop.area, description: shop.description, status: 'ACTIVE',
    })),
  ];

  const payments = [];
  const timestampIn = (week) => {
    const day = addDays(week.startDate, pick(0, 6));
    return `${isoDate(day)} ${pad2(pick(8, 19))}:${pad2(pick(0, 59))}:00+07`;
  };

  // nextNewCitizen: เลือกลูกค้าใหม่คนถัดไปของร้าน (ร้าน A/B ใช้ลำดับต่อกัน ร้านเพิ่มเติมสุ่มจากทั้ง 80 คน)
  const generateShopPayments = ({ shopId, key, citizenOffset, newPerWeek, repeatProbability, minAmount, maxAmount, nextNewCitizen }) => {
    const customers = []; // citizen index ที่เคยซื้อแล้ว
    let nextCitizen = citizenOffset;
    for (const week of weeks) {
      const orders = [];
      for (const citizen of customers) {
        if (random() < repeatProbability[week.number - 1]) orders.push(citizen);
      }
      for (let n = 0; n < newPerWeek[week.number - 1]; n++) {
        nextCitizen = nextNewCitizen ? nextNewCitizen(customers) : nextCitizen + 1;
        if (nextCitizen === null) break;
        customers.push(nextCitizen);
        orders.push(nextCitizen);
      }
      for (const citizen of orders) {
        const gross = pick(minAmount, maxAmount, 5);
        const paidAt = timestampIn(week);
        payments.push({
          payment_id: null,
          request_key: `seed-${key}-${String(payments.length + 1).padStart(4, '0')}`,
          user_id: ID.citizen(citizen),
          shop_id: shopId,
          gross_amount: gross,
          discount_amount: 0,
          net_amount: gross,
          citizen_paid: gross,
          status: 'SUCCESS',
          paid_at: paidAt,
          created_at: paidAt,
        });
      }
    }
  };

  generateShopPayments({ shopId: ID.shopA, key: 'a', citizenOffset: 0, newPerWeek: SHOP_A_NEW_PER_WEEK, repeatProbability: SHOP_A_REPEAT_PROBABILITY, minAmount: 60, maxAmount: 250 });
  generateShopPayments({ shopId: ID.shopB, key: 'b', citizenOffset: 40, newPerWeek: SHOP_B_NEW_PER_WEEK, repeatProbability: SHOP_B_REPEAT_PROBABILITY, minAmount: 45, maxAmount: 120 });

  // รายการพิเศษสำหรับทดสอบนิยาม Revenue (หักรายการคืนเงิน) และ AT-19
  const shopAPayments = payments.filter((p) => p.shop_id === ID.shopA);
  shopAPayments[10].status = 'REFUNDED';
  shopAPayments[shopAPayments.length - 3].status = 'REFUNDED';
  const failedAt = `${weeks[WEEKS - 1].start} 12:00:00+07`;
  payments.push({
    payment_id: null,
    request_key: `seed-a-failed-0001`,
    user_id: ID.citizen(5),
    shop_id: ID.shopA,
    gross_amount: 150,
    discount_amount: 0,
    net_amount: 150,
    citizen_paid: 150,
    status: 'FAILED',
    paid_at: null,
    created_at: failedAt,
  });

  // ร้านเพิ่มเติมสร้างหลังร้าน A/B เพื่อให้ข้อมูลร้าน A ที่ใช้ demo AI ไม่เปลี่ยน
  const randomNewCitizen = (customers) => {
    const candidates = [];
    for (let i = 1; i <= 80; i++) if (!customers.includes(i)) candidates.push(i);
    return candidates.length ? candidates[Math.floor(random() * candidates.length)] : null;
  };
  EXTRA_SHOPS.forEach((shop, index) => {
    generateShopPayments({
      shopId: ID.extraShop(index + 1), key: `x${index + 1}`, citizenOffset: 0, newPerWeek: shop.newPerWeek,
      repeatProbability: Array(WEEKS).fill(shop.repeat), minAmount: shop.min, maxAmount: shop.max, nextNewCitizen: randomNewCitizen,
    });
  });

  payments.forEach((payment, i) => { payment.payment_id = uuid('c', i + 1); });
  applySubsidy(payments);

  const coinLedger = [];
  for (const payment of payments) {
    if (payment.status === 'FAILED') continue;
    const coins = Math.floor(payment.net_amount / BAHT_PER_COIN);
    if (coins === 0) continue;
    coinLedger.push({ user_id: payment.user_id, payment_id: payment.payment_id, amount: coins, reason: 'PAYMENT_REWARD', created_at: payment.paid_at });
    if (payment.status === 'REFUNDED') {
      // BR-08: แก้ด้วยรายการลบใหม่ ไม่แก้รายการเดิม
      coinLedger.push({ user_id: payment.user_id, payment_id: payment.payment_id, amount: -coins, reason: 'REFUND_REVERSAL', created_at: payment.paid_at });
    }
  }
  coinLedger.forEach((entry, i) => { entry.ledger_id = uuid('d', i + 1); });

  return { endDate, weeks: weeks.map(({ number, start, end: weekEnd }) => ({ number, start, end: weekEnd })), users, shops, payments, coinLedger };
}

// คิดรัฐช่วยจ่ายตามลำดับเวลาของแต่ละคน รายการคืนเงินไม่นับเข้าเพดาน (เหมือน policy.service getSubsidyUsage)
function applySubsidy(payments) {
  const used = new Map();
  // รายการที่ไม่สำเร็จ (ไม่มี paid_at) ต้องมีค่า 0 ด้วย เพราะคอลัมน์เป็น NOT NULL
  payments.forEach((payment) => { payment.government_subsidy = 0; payment.policy_version = null; });
  const ordered = payments.filter((p) => p.paid_at).sort((x, y) => x.paid_at.localeCompare(y.paid_at));
  for (const payment of ordered) {
    payment.government_subsidy = 0;
    payment.policy_version = null;
    const day = payment.paid_at.slice(0, 10);
    if (day < PROGRAM_START) continue;
    const month = day.slice(0, 7);
    const usage = used.get(payment.user_id) || { day: '', today: 0, month: '', thisMonth: 0 };
    if (usage.day !== day) { usage.day = day; usage.today = 0; }
    if (usage.month !== month) { usage.month = month; usage.thisMonth = 0; }
    const wanted = Math.round(payment.net_amount * COPAY_PERCENT) / 100;
    const subsidy = Math.max(0, Math.min(wanted, DAILY_CAP - usage.today, MONTHLY_CAP - usage.thisMonth));
    payment.government_subsidy = subsidy;
    payment.citizen_paid = payment.net_amount - subsidy;
    payment.policy_version = SEED_POLICY_VERSION;
    if (payment.status === 'SUCCESS') {
      usage.today += subsidy;
      usage.thisMonth += subsidy;
    }
    used.set(payment.user_id, usage);
  }
}

// สรุป story รายสัปดาห์ของร้าน: ใช้ทั้งพิมพ์ตอน generate และใน test
function summarizeShopWeeks(data, shopId) {
  const seen = new Set();
  return data.weeks.map((week) => {
    const inWeek = data.payments
      .filter((p) => p.shop_id === shopId && p.status === 'SUCCESS' && p.paid_at.slice(0, 10) >= week.start && p.paid_at.slice(0, 10) <= week.end)
      .sort((x, y) => x.paid_at.localeCompare(y.paid_at));
    let newCustomers = 0;
    for (const p of inWeek) {
      if (!seen.has(p.user_id)) { seen.add(p.user_id); newCustomers += 1; }
    }
    const revenue = inWeek.reduce((sum, p) => sum + p.net_amount, 0);
    return { week: week.number, start: week.start, end: week.end, orders: inWeek.length, newCustomers, revenue };
  });
}

const sqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
};

function insertSql(table, columns, rows) {
  const values = rows.map((row) => `  (${columns.map((c) => sqlValue(row[c])).join(', ')})`).join(',\n');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values};\n`;
}

function renderSql(data) {
  return [
    '-- ThaiPlease seed data สำหรับพัฒนาและ demo เท่านั้น ห้ามใช้กับ production',
    `-- Generated by backend/scripts/generate-seed.js --end ${data.endDate}`,
    `-- Weeks: ${data.weeks[0].start} ถึง ${data.weeks[data.weeks.length - 1].end}`,
    '-- รหัสผ่านของบัญชีทดสอบ: ดู backend/seed/README.md',
    '',
    'BEGIN;',
    '',
    insertSql('users', ['user_id', 'email', 'password_hash', 'display_name', 'role', 'status'], data.users),
    insertSql('shops', ['shop_id', 'owner_id', 'name', 'category', 'area', 'description', 'status'], data.shops),
    insertSql('payments', ['payment_id', 'request_key', 'user_id', 'shop_id', 'gross_amount', 'discount_amount', 'net_amount', 'government_subsidy', 'citizen_paid', 'policy_version', 'status', 'paid_at', 'created_at'], data.payments),
    insertSql('coin_ledger', ['ledger_id', 'user_id', 'payment_id', 'amount', 'reason', 'created_at'], data.coinLedger),
    'COMMIT;',
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--end', '--out'].includes(argv[i])) throw new Error(`Unknown argument "${argv[i]}". Usage: --end YYYY-MM-DD --out path`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const endDate = args.end || lastCompletedSunday();
  const outPath = path.resolve(args.out || path.join(__dirname, '..', 'seed', 'seed.sql'));
  const data = buildSeedData({ endDate });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderSql(data), 'utf8');

  console.log(`Wrote ${outPath}`);
  console.log(`users=${data.users.length} shops=${data.shops.length} payments=${data.payments.length} coin_ledger=${data.coinLedger.length}`);
  console.log('ร้านกาแฟบ้านสวน (shop A) รายสัปดาห์:');
  console.table(summarizeShopWeeks(data, ID.shopA));
}

module.exports = { buildSeedData, renderSql, summarizeShopWeeks, lastCompletedSunday, ID, SEED_PASSWORD, CATEGORY, AREA, DAILY_CAP, MONTHLY_CAP, PROGRAM_START };
