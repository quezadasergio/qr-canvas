/*
 * Canvas renderer for QR Code matrices.
 *
 * Takes the boolean module matrix produced by `QRCode.generate` and paints it
 * onto an HTML5 <canvas>, supporting several module ("dot") shapes, custom
 * foreground/background colors, a quiet-zone margin and an optional centered
 * logo (either an uploaded image or a "SCAN ME" badge).
 */
(function (global) {
  "use strict";

  var DOT_SHAPES = {
    SQUARE: "square",
    ROUNDED: "rounded", // squares with slightly rounded corners ("cuadrados pegaditos")
    DOTS: "dots", // round dots
    DIAMOND: "diamond", // rombos
    CLASSY: "classy", // sharp squares ("cuadrado")
  };

  function clearCanvas(ctx, w, h, bg) {
    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawModule(ctx, shape, x, y, size, neighbors) {
    switch (shape) {
      case DOT_SHAPES.DOTS:
        var r = size / 2;
        ctx.beginPath();
        ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
        ctx.fill();
        break;

      case DOT_SHAPES.DIAMOND:
        var c = size / 2;
        ctx.beginPath();
        ctx.moveTo(x + c, y);
        ctx.lineTo(x + size, y + c);
        ctx.lineTo(x + c, y + size);
        ctx.lineTo(x, y + c);
        ctx.closePath();
        ctx.fill();
        break;

      case DOT_SHAPES.ROUNDED:
        // Rounded only on the corners that are not adjacent to another module,
        // which produces the "connected rounded" look.
        roundedConnected(ctx, x, y, size, neighbors);
        break;

      case DOT_SHAPES.CLASSY:
        var rad = size * 0.18;
        roundRect(ctx, x, y, size, size, rad);
        ctx.fill();
        break;

      case DOT_SHAPES.SQUARE:
      default:
        ctx.fillRect(x, y, size + 0.5, size + 0.5);
        break;
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function roundedConnected(ctx, x, y, s, n) {
    var r = s * 0.5;
    ctx.beginPath();
    // top-left
    if (n.up || n.left) ctx.lineTo(x, y);
    else ctx.moveTo(x, y + r), ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x, y);
    // For simplicity and robustness, draw a rounded square but flatten edges
    // that touch a neighbor so adjacent modules visually merge.
    ctx.closePath();
    var tl = !n.up && !n.left ? r : 0;
    var tr = !n.up && !n.right ? r : 0;
    var br = !n.down && !n.right ? r : 0;
    var bl = !n.down && !n.left ? r : 0;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + s - tr, y);
    if (tr) ctx.arcTo(x + s, y, x + s, y + tr, tr);
    ctx.lineTo(x + s, y + s - br);
    if (br) ctx.arcTo(x + s, y + s, x + s - br, y + s, br);
    ctx.lineTo(x + bl, y + s);
    if (bl) ctx.arcTo(x, y + s, x, y + s - bl, bl);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Render a QR matrix to a canvas.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {{size:number, modules:boolean[][]}} qr
   * @param {Object} opts
   *   - color {string}        foreground color
   *   - background {string}   background color
   *   - shape {string}        one of DOT_SHAPES values
   *   - margin {number}       quiet-zone in modules (default 4)
   *   - pixelSize {number}    output canvas edge in px (default 480)
   *   - logo {Object|null}    { type:'image', image:HTMLImageElement } |
   *                           { type:'scanme', text:'SCAN ME', color, bg }
   */
  function render(canvas, qr, opts) {
    opts = opts || {};
    var color = opts.color || "#1F0062";
    var background = opts.background || "#F9ECE5";
    var shape = opts.shape || DOT_SHAPES.SQUARE;
    var margin = opts.margin == null ? 4 : opts.margin;
    var pixelSize = opts.pixelSize || 480;

    var count = qr.size + margin * 2;
    var moduleSize = Math.floor(pixelSize / count);
    var realSize = moduleSize * count;

    var dpr = global.devicePixelRatio || 1;
    canvas.width = realSize * dpr;
    canvas.height = realSize * dpr;
    canvas.style.width = realSize + "px";
    canvas.style.height = realSize + "px";

    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    clearCanvas(ctx, realSize, realSize, background);
    ctx.fillStyle = color;

    var modules = qr.modules;
    var size = qr.size;

    // When a logo is present, clear a centered area so it stays scannable.
    var logoArea = null;
    if (opts.logo) {
      var logoModules = Math.floor(size * 0.22);
      if (logoModules % 2 !== size % 2) logoModules++;
      var start = Math.floor((size - logoModules) / 2);
      logoArea = { start: start, end: start + logoModules };
    }

    function inLogoArea(x, y) {
      return (
        logoArea &&
        x >= logoArea.start &&
        x < logoArea.end &&
        y >= logoArea.start &&
        y < logoArea.end
      );
    }

    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (!modules[y][x]) continue;
        if (inLogoArea(x, y)) continue;
        var px = (x + margin) * moduleSize;
        var py = (y + margin) * moduleSize;
        var neighbors = {
          up: y > 0 && modules[y - 1][x] && !inLogoArea(x, y - 1),
          down: y < size - 1 && modules[y + 1][x] && !inLogoArea(x, y + 1),
          left: x > 0 && modules[y][x - 1] && !inLogoArea(x - 1, y),
          right: x < size - 1 && modules[y][x + 1] && !inLogoArea(x + 1, y),
        };
        drawModule(ctx, shape, px, py, moduleSize, neighbors);
      }
    }

    if (opts.logo) {
      drawLogo(ctx, opts.logo, logoArea, margin, moduleSize, background, color);
    }

    return { moduleSize: moduleSize, realSize: realSize };
  }

  function drawLogo(ctx, logo, area, margin, moduleSize, background, color) {
    var pad = 1; // modules of padding around the logo box
    var x = (area.start + margin - pad) * moduleSize;
    var y = (area.start + margin - pad) * moduleSize;
    var box = (area.end - area.start + pad * 2) * moduleSize;

    if (logo.type === "image" && logo.image) {
      ctx.save();
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, x, y, box, box, box * 0.18);
      ctx.fill();
      var pad2 = box * 0.12;
      var imgBox = box - pad2 * 2;
      var img = logo.image;
      var ratio = Math.min(imgBox / img.width, imgBox / img.height);
      var w = img.width * ratio;
      var h = img.height * ratio;
      ctx.drawImage(img, x + (box - w) / 2, y + (box - h) / 2, w, h);
      ctx.restore();
    } else if (logo.type === "scanme") {
      ctx.save();
      ctx.fillStyle = color;
      roundRect(ctx, x, y, box, box, box * 0.2);
      ctx.fill();
      ctx.fillStyle = background;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var fontSize = box * 0.18;
      ctx.font = "700 " + fontSize + "px system-ui, sans-serif";
      ctx.fillText("SCAN", x + box / 2, y + box * 0.4);
      ctx.fillText("ME", x + box / 2, y + box * 0.62);
      ctx.restore();
    }
  }

  global.QRRenderer = { render: render, DOT_SHAPES: DOT_SHAPES };
})(typeof window !== "undefined" ? window : this);
