// Rasterizes PDF pages to JPEG data URLs on-device, so a scanned/exported
// PDF receipt can go through the exact same AI vision path as a photo.
// Imported dynamically (only when a PDF is actually picked) to keep pdfjs
// out of the main bundle for everyone who just uses the camera.
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const MAX_PAGES = 5; // receipts are rarely longer than this; bounds worst-case cost/time

export async function pdfToImages(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const images = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return images;
}
