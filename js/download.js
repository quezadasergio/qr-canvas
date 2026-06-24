/*
 * Export utilities: save the rendered QR canvas as a raster image.
 * Supports PNG (lossless, transparent-capable) and JPG (compressed).
 */
(function (global) {
  "use strict";

  /**
   * Trigger a download of the given canvas in the requested format.
   * @param {HTMLCanvasElement} canvas
   * @param {string} format      "png" | "jpg"
   * @param {Object} [opts]
   *   - filename {string}  base filename without extension
   *   - background {string} solid color used to flatten JPG (no alpha)
   *   - quality {number}    JPG quality 0..1
   */
  function downloadCanvas(canvas, format, opts) {
    opts = opts || {};
    format = (format || "png").toLowerCase();
    var filename = opts.filename || "qr-code";

    var mime, ext, exportCanvas;

    if (format === "jpg" || format === "jpeg") {
      mime = "image/jpeg";
      ext = "jpg";
      // JPEG has no alpha channel, so flatten onto a solid background.
      exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      var ctx = exportCanvas.getContext("2d");
      ctx.fillStyle = opts.background || "#ffffff";
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      ctx.drawImage(canvas, 0, 0);
    } else {
      mime = "image/png";
      ext = "png";
      exportCanvas = canvas;
    }

    var quality = opts.quality == null ? 0.92 : opts.quality;
    var dataUrl = exportCanvas.toDataURL(mime, quality);

    var link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename + "." + ext;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  global.QRDownload = { downloadCanvas: downloadCanvas };
})(typeof window !== "undefined" ? window : this);
