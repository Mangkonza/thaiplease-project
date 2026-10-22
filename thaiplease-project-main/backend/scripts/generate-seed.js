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
};

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
    { shop_id: ID.shopA, owner_id: ID.merchantA, name: 'ร้านกาแฟบ้านสวน', category: 'คาเฟ่', area: 'กำแพงแสน', description: 'กาแฟสดคั่วเองและขนมโฮมเมด บรรยากาศสวน ใกล้มหาวิทยาลัย', status: 'ACTIVE' },
    // ร้านเปรียบเทียบ: ยอดขายคงที่
    { shop_id: ID.shopB, owner_id: ID.merchantB, name: 'ข้าวมันไก่ป้าแดง', category: 'ร้านอาหาร', area: 'กำแพงแสน', description: 'ข้าวมันไก่ต้มและไก่ทอดสูตรดั้งเดิม เปิดเช้าถึงบ่าย', status: 'ACTIVE' },
    // รอ Admin อนุมัติ (D-10)
    { shop_id: ID.shopPending, owner_id: ID.merchantB, name: 'ขนมไทยแม่ศรี', category: 'ขนม', area: 'นครปฐม', description: 'ขนมไทยทำสดทุกวัน รับสั่งทำงานบุญ', status: 'PENDING' },
    // ถูกระงับ: ประชาชนต้องค้นหาไม่เจอ (AT-20)
    { shop_id: ID.shopSuspended, owner_id: ID.merchantA, name: 'บ้านสวนเบเกอรี่', category: 'เบเกอรี่', area: 'นครปฐม', description: 'ขนมปังและเค้กอบสดใหม่ทุกเช้า', status: 'SUSPENDED' },
  ];

  const payments = [];
  const timestampIn = (week) => {
    const day = addDays(week.startDate, pick(0, 6));
    return `${isoDate(day)} ${pad2(pick(8, 19))}:${pad2(pick(0, 59))}:00+07`;
  };

  const generateShopPayments = ({ shopId, key, citizenOffset, newPerWeek, repeatProbability, minAmount, maxAmount }) => {
    const customers = []; // citizen index ที่เคยซื้อแล้ว
    let nextCitizen = citizenOffset;
    for (const week of weeks) {
      const orders = [];
      for (const citizen of customers) {
        if (random() < repeatProbability[week.number - 1]) orders.push(citizen);
      }
      for (let n = 0; n < newPerWeek[week.number - 1]; n++) {
        nextCitizen += 1;
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
    status: 'FAILED',
    paid_at: null,
    created_at: failedAt,
  });

  payments.forEach((payment, i) => { payment.payment_id = uuid('c', i + 1); });

  const coinLedger = [];
  for (const payment of payments) {
    if (payment.status === 'FAILED') continue;
    const coins = Math.floor(payment.net_amount / BAHT_PER_COIN);
    if (coins === 0) continue;
    coinLedger.push({ user_id: payment.user_id, payment_id: payment.payment_id, amount: coins, reason: 'PURCHASE_REWARD', created_at: payment.paid_at });
    if (payment.status === 'REFUNDED') {
      // BR-08: แก้ด้วยรายการลบใหม่ ไม่แก้รายการเดิม
      coinLedger.push({ user_id: payment.user_id, payment_id: payment.payment_id, amount: -coins, reason: 'REFUND_REVERSAL', created_at: payment.paid_at });
    }
  }
  coinLedger.forEach((entry, i) => { entry.ledger_id = uuid('d', i + 1); });

  return { endDate, weeks: weeks.map(({ number, start, end: weekEnd }) => ({ number, start, end: weekEnd })), users, shops, payments, coinLedger };
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
    insertSql('payments', ['payment_id', 'request_key', 'user_id', 'shop_id', 'gross_amount', 'discount_amount', 'net_amount', 'status', 'paid_at', 'created_at'], data.payments),
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

module.exports = { buildSeedData, renderSql, summarizeShopWeeks, lastCompletedSunday, ID, SEED_PASSWORD };
