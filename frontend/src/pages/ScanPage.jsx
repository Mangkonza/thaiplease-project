import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { parsePaymentRequestIdFromQr } from '../utils/payment-links';

const NOT_OUR_QR = 'QR นี้ไม่ใช่ QR รับเงินของร้านในระบบ ThaiPlease';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const [pasted, setPasted] = useState('');

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
          const requestId = parsePaymentRequestIdFromQr(text);
          if (requestId) {
            navigate(`/checkout/${requestId}`);
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
      const requestId = parsePaymentRequestIdFromQr(text);
      if (requestId) navigate(`/checkout/${requestId}`);
      else setError(text ? NOT_OUR_QR : 'ไม่พบ QR ในรูปนี้ ลองใช้รูปที่เห็น QR ชัดๆ');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError('เปิดไฟล์รูปนี้ไม่ได้');
    };
    image.src = url;
  }

  // demo บนเครื่องเดียว: วางลิงก์ใต้ QR ในหน้ารับเงินของร้านแทนการสแกน
  function openPasted(event) {
    event.preventDefault();
    const text = pasted.trim();
    const requestId = parsePaymentRequestIdFromQr(text) || (UUID.test(text) ? text.toLowerCase() : null);
    if (requestId) navigate(`/checkout/${requestId}`);
    else setError(NOT_OUR_QR);
  }

  return (
    <div className="content-stack narrow-page">
      <div><span className="eyebrow">SCAN TO PAY</span><h1>สแกนจ่าย</h1><p className="muted">สแกน QR ที่ร้านสร้างให้ ยอดเงินมาจากร้าน คุณแค่ตรวจยอดแล้วใส่ PIN (QR ใช้ได้ 5 นาที)</p></div>
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

      <form className="card form-stack" onSubmit={openPasted}>
        <span className="eyebrow">DEMO</span>
        <h2>จำลองการสแกน</h2>
        <p className="muted">สำหรับทดสอบเมื่อไม่มีกล้อง: คัดลอกลิงก์ใต้ QR ในหน้ารับเงินของร้านมาวางที่นี่</p>
        <label>ลิงก์ QR รับเงิน<input value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="http://…/pay/…" /></label>
        <button className="button button-outline" disabled={!pasted.trim()}>เปิดหน้าจ่ายเงิน</button>
      </form>
    </div>
  );
}
