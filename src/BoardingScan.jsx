import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useSheetDrag } from './sheet.jsx';

const FORMATS = ['PDF417', 'Aztec', 'QRCode', 'DataMatrix']; // what airlines print and show in their apps

// The barcode reader (ZXing, compiled to WebAssembly) loads on first use, from the app itself: never from the internet.
let reader;
const loadReader = () => (reader ||= Promise.all([import('zxing-wasm/reader'), import('zxing-wasm/reader/zxing_reader.wasm?url')])
  .then(([zx, { default: wasmUrl }]) => {
    zx.prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
    return zx;
  }));

// PDFs (e-tickets, airline emails saved as PDF): pdf.js (legacy build: older phone WebViews lack the newest JS), also bundled, draws each page; the reader scans the picture.
const MAX_PAGES = 10;
async function pdfCodes(file, zx) {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.min.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  const pdf = await task.promise;
  const texts = new Set();
  for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 3 }); // barcodes need resolution; ~1800 px wide for an A4 page
    const canvas = Object.assign(document.createElement('canvas'), { width: viewport.width, height: viewport.height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    const hits = await zx.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), { formats: FORMATS, tryHarder: true, maxNumberOfSymbols: 4 });
    hits.forEach(h => h.text && texts.add(h.text));
  }
  task.destroy();
  return [...texts];
}

// Camera view that reads a boarding pass barcode; a screenshot or photo of one works too.
// onCode(text) resolves with a message to show, or rejects (not a boarding pass) and scanning carries on.
export default function BoardingScan({ onCode, onClose }) {
  const drag = useSheetDrag(onClose);
  const video = useRef(null);
  const fileRef = useRef(null);
  const busy = useRef(false);
  const [status, setStatus] = useState('Point the camera at the barcode on your boarding pass.');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  async function found(text) {
    busy.current = true;
    try {
      setDone(await onCode(text));
    } catch (e) {
      setError(e.message);
      setTimeout(() => { busy.current = false; }, 1500); // let the person move the camera off the wrong code
    }
  }

  useEffect(() => {
    if (done) return;
    let stream, timer, stopped = false;
    const canvas = document.createElement('canvas');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
      } catch {
        setStatus('The camera is not available. Use a screenshot, photo or PDF of the boarding pass instead.');
        return;
      }
      if (stopped) return stream.getTracks().forEach(t => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      const zx = await loadReader();
      const tick = async () => {
        if (stopped) return;
        const v = video.current;
        if (!busy.current && v?.videoWidth) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(v, 0, 0);
          const [hit] = await zx.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), { formats: FORMATS, tryHarder: true, maxNumberOfSymbols: 1 });
          if (hit?.text && !stopped) await found(hit.text);
        }
        timer = setTimeout(tick, 150);
      };
      tick();
    })();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [done]);

  async function fromFile(file) {
    setError('');
    const zx = await loadReader();
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      busy.current = true;
      setStatus('Reading the PDF…');
      let texts;
      try {
        texts = await pdfCodes(file, zx);
      } catch {
        texts = null;
      }
      // A family e-ticket can hold one pass per person; the same flights are only suggested once.
      const messages = [];
      for (const t of texts || []) {
        try { messages.push(await onCode(t)); } catch { /* another kind of code on the page */ }
      }
      setStatus('Point the camera at the barcode on your boarding pass.');
      if (messages.length) return setDone(messages.join(' '));
      busy.current = false;
      return setError(texts ? 'No boarding pass barcode found in that PDF.' : "That PDF can't be opened.");
    }
    const [hit] = await zx.readBarcodes(file, { formats: FORMATS, tryHarder: true, maxNumberOfSymbols: 1 });
    if (hit?.text) await found(hit.text);
    else setError('No barcode found in that picture. Crop it closer to the barcode and try again.');
  }

  return (
    <motion.div className="sheet scan-sheet" {...drag.sheet} role="dialog" aria-label="Scan a boarding pass"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
      {drag.handle}
      <div className="sheet-head">
        <h1 className="title small">Scan a boarding pass</h1>
        <button className="text-button" onClick={onClose}>Done</button>
      </div>
      {done ? (
        <div className="inbox-empty">
          <p>{done}</p>
          <button className="secondary" onClick={() => { setError(''); busy.current = false; setDone(null); }}>Scan another</button>
          <button className="primary" onClick={onClose}>Check the places</button>
        </div>
      ) : (
        <>
          <div className="viewfinder"><video ref={video} muted playsInline /></div>
          <p className="hint">{status}</p>
          {error && <p className="warn" role="alert">{error}</p>}
          <p className="hint">Only the airports, flight and date are kept. Your name and booking reference are not saved.</p>
          <button className="primary" onClick={() => fileRef.current.click()}>Use a screenshot, photo or PDF</button>
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" hidden
        onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) fromFile(f); }} />
    </motion.div>
  );
}
