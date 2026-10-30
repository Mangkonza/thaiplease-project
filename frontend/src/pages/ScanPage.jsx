import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import api, { getErrorMessage } from '../api';
import { parseShopIdFromQr } from '../utils/payment-links';

const NOT_OUR_QR = 'QR นี้ไม่ใช่ QR รับเงินของร้านในระบบ ThaiPlease';

function decodeCanvas(canvas, source, width, height) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, width, height);
  const code = jsQR(context.getImageData(0, 0, width, height).data, width, height);
  return code ? code.data : null;
}

export default function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState('');
  const [shops, setShops] = useState([]);
  const [mockShopId, setMockShopId] = useState('');

  useEffect(() => {
    api.get('/shops')
      .then(({ data }) => {
        setShops(data.shops);
        setMockShopId(data.shops[0]?.shop_id || '');
      })
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  // อ่าน QR จากกล้องทีละเฟรมจนเจอ แล้วปิดกล้องเมื่อออกจากหน้าหรือกดหยุด
  useEffect(() => {
    if (!cameraOn) return undefined;
    let stream;
    let frame;
    let stopped = false;
    const scan = () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const text = decodeCanvas(canvasRef.current, video, video.videoWidth, video.videoHeight);
        if (text) {
          const shopId = parseShopIdFromQr(text);
          if (shopId) {
            navigate(`/checkout/${shopId}`);
            return;
          }
          setError(NOT_OUR_QR);
        }
      }
      frame = requestAnimationFrame(scan);
    };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((media) => {
        stream = media;
        if (stopped) return media.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = media;
        return videoRef.current.play().then(scan);
      })
      .catch((cameraError) => {
        console.error('Open camera failed:', cameraError);
        setError(cameraError.name === 'NotAllowedError'
          ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง ลองอัปโหลดรูป QR หรือใช้การจำลองแทน'
          : 'เปิดกล้องไม่ได้ (กล้องใช้ได้เฉพาะ localhost หรือ https) ลองอัปโหลดรูป QR หรือใช้การจำลองแทน');
        setCameraOn(false);
      });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraOn, navigate]);

  function readImage(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const text = decodeCanvas(canvasRef.current, image, image.naturalWidth, image.naturalHeight);
      const shopId = parseShopIdFromQr(text);
      if (shopId) navigate(`/checkout/${shopId}`);
      else setError(text ? NOT_OUR_QR : 'ไม่พบ QR ในรูปนี้ ลองใช้รูปที่เห็น QR ชัดๆ');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError('เปิดไฟล์รูปนี้ไม่ได้');
    };
    image.src = url;
  }

  return (
    <div className="content-stack narrow-page">
      <div><span className="eyebrow">SCAN TO PAY</span><h1>สแกนจ่าย</h1><p className="muted">สแกน QR รับเงินที่หน้าร้าน แล้วระบุยอดซื้อ</p></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      <section className="card scan-card">
        <div className={cameraOn ? 'scan-viewport active' : 'scan-viewport'}>
          <video ref={videoRef} muted playsInline aria-label="ภาพจากกล้อง" />
          {!cameraOn && <span className="scan-placeholder">▣</span>}
          <span className="scan-frame" aria-hidden="true" />
        </div>
        <canvas ref={canvasRef} hidden />
        <div className="button-row">
          <button className="button button-primary" type="button" onClick={() => { setError(''); setCameraOn((on) => !on); }}>
            {cameraOn ? 'ปิดกล้อง' : 'เปิดกล้องสแกน'}
          </button>
          <label className="button button-outline file-button">อัปโหลดรูป QR<input type="file" accept="image/*" onChange={readImage} /></label>
        </div>
      </section>

      <section className="card form-stack">
        <span className="eyebrow">DEMO</span>
        <h2>จำลองการสแกน</h2>
        <p className="muted">สำหรับทดสอบเมื่อไม่มีกล้องหรือไม่มี QR ของร้าน: เลือกร้านแล้วไปหน้าจ่ายเงินเหมือนสแกนสำเร็จ</p>
        <label>ร้านค้า
          <select value={mockShopId} onChange={(event) => setMockShopId(event.target.value)}>
            {shops.map((shop) => <option key={shop.shop_id} value={shop.shop_id}>{shop.name}</option>)}
          </select>
        </label>
        <button className="button button-outline" type="button" disabled={!mockShopId} onClick={() => navigate(`/checkout/${mockShopId}`)}>จำลองสแกนร้านนี้</button>
      </section>
    </div>
  );
}
