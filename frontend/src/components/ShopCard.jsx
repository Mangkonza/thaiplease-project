import { Link } from 'react-router-dom';
import { Clock, MapPin, Sparkles } from 'lucide-react';
import { imageSrc } from '../api';
import { menuPriceText } from '../utils/shop-info';

export default function ShopCard({ shop, index }) {
  const menu = shop.menu_preview || [];
  const campaign = shop.active_campaign;

  return (
    <Link className={`shop-card shop-color-${index % 4}${campaign ? ' has-campaign' : ''}`} to={`/shops/${shop.shop_id}`}>
      {campaign && (
        <div className="shop-campaign-badge" title="คุณมีสิทธิ์เข้าร่วมแคมเปญร้านนี้">
          <Sparkles size={12} aria-hidden="true" />
          <span>แคมเปญพิเศษสำหรับคุณ</span>
        </div>
      )}
      <div className={shop.image_path ? 'shop-card-art has-image' : 'shop-card-art'}>
        {shop.image_path && <img src={imageSrc(shop.image_path)} alt="" loading="lazy" />}
        <span>{shop.category || 'LOCAL SHOP'}</span>
        {!shop.image_path && <b>{(shop.name || '?').slice(0, 1)}</b>}
      </div>
      <div className="shop-card-body">
        {campaign && (
          <div className="shop-campaign-callout">
            <span className="campaign-chip">แคมเปญ</span>
            <strong>{campaign.benefit_text ? `${campaign.benefit_text} (${campaign.name})` : campaign.name}</strong>
          </div>
        )}
        <span className="eyebrow">{shop.area || 'ใกล้คุณ'}</span>
        <h3>{shop.name}</h3>
        {menu.length > 0 ? (
          <ul className="menu-preview" aria-label="สินค้าแนะนำ">
            {menu.map((item) => <li key={item.name}><span>{item.name}</span><b>{menuPriceText(item.price)}</b></li>)}
          </ul>
        ) : <p>{shop.description || 'ร้านค้าในชุมชน พร้อมต้อนรับคุณ'}</p>}
        {shop.address && <p className="shop-card-meta"><MapPin size={13} aria-hidden="true" /><span>{shop.address}</span></p>}
        {shop.opening_hours && <p className="shop-card-meta"><Clock size={13} aria-hidden="true" /><span>{shop.opening_hours}</span></p>}
        <span className="link-arrow">
          ดูร้านและเมนูทั้งหมด <b>↗</b>
        </span>
      </div>
    </Link>
  );
}
