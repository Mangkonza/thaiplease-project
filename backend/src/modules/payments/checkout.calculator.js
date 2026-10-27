// คำนวณยอดตาม D-12: ยอดเต็ม → ส่วนลดแคมเปญ (ร้านออก) → คูปอง (รัฐออก) → รัฐช่วยจ่าย → ประชาชนจ่าย
// เป็น pure function เพื่อ test ได้โดยไม่ต้องมี DB

const TIME_ZONE = 'Asia/Bangkok';

const toSatang = (baht) => Math.round(Number(baht) * 100);
const toBaht = (satang) => satang / 100;

function bangkokDate(date) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}

function isWithinProgram(policy, paidAt) {
  const day = bangkokDate(paidAt);
  const start = typeof policy.program_start === 'string' ? policy.program_start.slice(0, 10) : bangkokDate(policy.program_start);
  const end = typeof policy.program_end === 'string' ? policy.program_end.slice(0, 10) : bangkokDate(policy.program_end);
  return day >= start && day <= end;
}

/**
 * @param {object} input
 * @param {number} input.grossAmount ยอดเต็ม
 * @param {number} input.campaignDiscount ส่วนลดแคมเปญร้าน
 * @param {number} [input.couponDiscount] ส่วนลดคูปอง
 * @param {object|null} input.policy แถวจาก project_policies ที่ใช้อยู่
 * @param {{ today: number, month: number, total: number }} input.usage ยอดรัฐช่วยจ่ายที่ใช้ไปแล้ว
 * @param {Date} input.paidAt
 */
function calculateCheckout({ grossAmount, campaignDiscount = 0, couponDiscount = 0, policy, usage, paidAt }) {
  const gross = toSatang(grossAmount);
  const campaign = Math.min(gross, Math.max(0, toSatang(campaignDiscount)));
  const shopReceives = gross - campaign;
  const coupon = Math.min(shopReceives, Math.max(0, toSatang(couponDiscount)));
  const afterCoupon = shopReceives - coupon;

  let subsidy = 0;
  let remaining = null;
  let subsidyReason = 'NO_POLICY';
  if (policy) {
    remaining = {
      today: Math.max(0, toSatang(policy.daily_cap) - toSatang(usage.today)),
      month: Math.max(0, toSatang(policy.monthly_cap) - toSatang(usage.month)),
      total: Math.max(0, toSatang(policy.lifetime_cap) - toSatang(usage.total)),
    };
    if (!isWithinProgram(policy, paidAt)) {
      subsidyReason = 'OUTSIDE_PROGRAM';
    } else {
      const wanted = Math.round(afterCoupon * Number(policy.copay_percent) / 100);
      const capLeft = Math.min(remaining.today, remaining.month, remaining.total);
      subsidy = Math.min(wanted, capLeft);
      subsidyReason = subsidy < wanted ? 'CAP_REACHED' : 'APPLIED';
    }
  }

  return {
    gross_amount: toBaht(gross),
    campaign_discount: toBaht(campaign),
    shop_receives: toBaht(shopReceives),
    coupon_discount: toBaht(coupon),
    government_subsidy: toBaht(subsidy),
    citizen_paid: toBaht(afterCoupon - subsidy),
    policy_version: policy ? policy.policy_version : null,
    subsidy_status: subsidyReason,
    subsidy_remaining: remaining && {
      today: toBaht(remaining.today - subsidy),
      month: toBaht(remaining.month - subsidy),
      total: toBaht(remaining.total - subsidy),
    },
  };
}

module.exports = { calculateCheckout, bangkokDate, isWithinProgram };
