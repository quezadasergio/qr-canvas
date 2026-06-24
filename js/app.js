/*
 * Application controller for QR Canvas.
 *
 * Wires up the UI (content tabs, design tabs, inputs), builds the payload
 * string for the selected content type, regenerates the QR matrix and renders
 * it to the canvas in real time. Also handles the download split-button.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("qr-canvas");

  var state = {
    contentType: "website",
    shape: "dots",
    color: "#1F0062",
    background: "#F9ECE5",
    logoType: "none",
    logoImage: null,
    downloadFormat: "png",
    embed: false,
  };

  // ---------- Tab switching ----------

  function activateTab(navId, tabName) {
    var nav = document.getElementById(navId);
    if (!nav) return false;
    var body = nav.parentElement.querySelector(".window-body");
    var found = false;
    nav.querySelectorAll(".tab").forEach(function (t) {
      var isMatch = t.getAttribute("data-tab") === tabName;
      if (isMatch) found = true;
      t.classList.toggle("is-active", isMatch);
    });
    if (!found) return false;
    body.querySelectorAll(".tab-panel").forEach(function (p) {
      p.classList.toggle("is-active", p.getAttribute("data-panel") === tabName);
    });
    if (navId === "content-tabs") state.contentType = tabName;
    return true;
  }

  function setupTabs(navId) {
    var nav = document.getElementById(navId);
    if (!nav) return;
    nav.addEventListener("click", function (e) {
      var tab = e.target.closest(".tab");
      if (!tab) return;
      activateTab(navId, tab.getAttribute("data-tab"));
      if (navId === "content-tabs") update();
    });
  }

  setupTabs("content-tabs");
  setupTabs("design-tabs");

  // ---------- Payload builders ----------

  function escapeVCard(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  function buildPayload() {
    switch (state.contentType) {
      case "website":
        return document.getElementById("website-url").value.trim();

      case "text":
        return document.getElementById("text-content").value;

      case "vcard":
        return buildVCard();

      case "wifi":
        return buildWifi();

      default:
        return "";
    }
  }

  function getVCardFields() {
    var fields = {};
    document.querySelectorAll("[data-vcard]").forEach(function (el) {
      fields[el.getAttribute("data-vcard")] = el.value.trim();
    });
    return fields;
  }

  function buildVCard() {
    var f = getVCardFields();
    var hasAny = Object.keys(f).some(function (k) {
      return f[k];
    });
    if (!hasAny) return "";

    var lines = ["BEGIN:VCARD", "VERSION:3.0"];
    lines.push("N:" + escapeVCard(f.fullName));
    lines.push("FN:" + escapeVCard(f.fullName));
    if (f.company || f.title) {
      lines.push("ORG:" + escapeVCard(f.company));
      lines.push("TITLE:" + escapeVCard(f.title));
    }
    if (f.phone) lines.push("TEL;TYPE=CELL:" + escapeVCard(f.phone));
    if (f.workPhone) lines.push("TEL;TYPE=WORK:" + escapeVCard(f.workPhone));
    if (f.fax) lines.push("TEL;TYPE=FAX:" + escapeVCard(f.fax));
    if (f.email) lines.push("EMAIL:" + escapeVCard(f.email));
    if (f.street || f.city || f.state || f.zip || f.country) {
      lines.push(
        "ADR;TYPE=WORK:;;" +
          [f.street, f.city, f.state, f.zip, f.country]
            .map(escapeVCard)
            .join(";")
      );
    }
    if (f.website) lines.push("URL:" + escapeVCard(f.website));
    lines.push("END:VCARD");
    return lines.join("\n");
  }

  function buildWifi() {
    var ssid = document.getElementById("wifi-ssid").value.trim();
    if (!ssid) return "";
    var hidden = document.getElementById("wifi-hidden").checked;
    var password = document.getElementById("wifi-password").value;
    var encEl = document.querySelector('input[name="wifi-enc"]:checked');
    var enc = encEl ? encEl.value : "WPA";

    function esc(s) {
      return String(s || "").replace(/([\\;,:"])/g, "\\$1");
    }

    var parts = "WIFI:T:" + (enc === "nopass" ? "nopass" : enc) + ";";
    parts += "S:" + esc(ssid) + ";";
    if (enc !== "nopass") parts += "P:" + esc(password) + ";";
    if (hidden) parts += "H:true;";
    parts += ";";
    return parts;
  }

  // ---------- Render ----------

  function getLogoOption() {
    if (state.logoType === "scanme") {
      return { type: "scanme" };
    }
    if (state.logoType === "upload" && state.logoImage) {
      return { type: "image", image: state.logoImage };
    }
    return null;
  }

  // Higher error-correction when a logo covers the center.
  function chooseEcc() {
    return state.logoType === "none" ? "MEDIUM" : "HIGH";
  }

  function buildShareUrl() {
    var params = new URLSearchParams();
    var type = state.contentType;
    params.set("type", type);

    if (type === "website") {
      var u = document.getElementById("website-url").value.trim();
      if (u) params.set("url", u);
    } else if (type === "text") {
      var t = document.getElementById("text-content").value;
      if (t) params.set("text", t);
    } else if (type === "vcard") {
      document.querySelectorAll("[data-vcard]").forEach(function (el) {
        var v = el.value.trim();
        if (v) params.set(el.getAttribute("data-vcard"), v);
      });
    } else if (type === "wifi") {
      var ssid = document.getElementById("wifi-ssid").value.trim();
      if (ssid) params.set("ssid", ssid);
      var pw = document.getElementById("wifi-password").value;
      if (pw) params.set("password", pw);
      var encEl = document.querySelector('input[name="wifi-enc"]:checked');
      if (encEl) params.set("encryption", encEl.value);
      if (document.getElementById("wifi-hidden").checked)
        params.set("hidden", "true");
    }

    // Design parameters.
    params.set("color", state.color);
    params.set("bg", state.background);
    params.set("shape", state.shape);
    if (state.logoType === "scanme") params.set("logo", "scanme");

    // Embed flag.
    if (document.getElementById("share-embed").checked)
      params.set("embed", "1");

    var base = window.location.href.split(/[?#]/)[0];
    return base + "?" + params.toString();
  }

  function updateShareUrl() {
    var input = document.getElementById("share-url");
    if (input) input.value = buildShareUrl();
  }

  function update() {
    updateShareUrl();
    var payload = buildPayload();
    var ctx = canvas.getContext("2d");

    if (!payload) {
      // Empty state: clear with the background color.
      var dpr = window.devicePixelRatio || 1;
      canvas.width = 480 * dpr;
      canvas.height = 480 * dpr;
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = state.background;
      ctx.fillRect(0, 0, 480, 480);
      return;
    }

    try {
      var qr = QRCode.generate(payload, chooseEcc());
      QRRenderer.render(canvas, qr, {
        color: state.color,
        background: state.background,
        shape: state.shape,
        margin: 4,
        pixelSize: 480,
        logo: getLogoOption(),
      });
      canvas.style.width = "100%";
      canvas.style.height = "auto";
    } catch (err) {
      console.error(err);
    }
  }

  // ---------- Input listeners ----------

  document.querySelectorAll("input, textarea").forEach(function (el) {
    if (el.type === "file") return;
    var evt = el.type === "color" ? "input" : "input";
    el.addEventListener(evt, function () {
      if (el.id === "qr-color") state.color = el.value;
      else if (el.id === "bg-color") state.background = el.value;
      else if (el.name === "logo-type") {
        state.logoType = el.value;
        document
          .getElementById("logo-upload-row")
          .toggleAttribute("hidden", el.value !== "upload");
      }
      update();
    });
  });

  // Shape buttons
  document.getElementById("shape-options").addEventListener("click", function (e) {
    var btn = e.target.closest(".shape-btn");
    if (!btn) return;
    document.querySelectorAll(".shape-btn").forEach(function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    state.shape = btn.getAttribute("data-shape");
    update();
  });

  // Logo upload
  document.getElementById("logo-file").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        state.logoImage = img;
        update();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // ---------- Download split-button ----------

  var downloadBtn = document.getElementById("download-btn");
  var caret = document.getElementById("download-caret");
  var menu = document.getElementById("download-menu");
  var formatLabel = document.getElementById("download-format");

  function toggleMenu(force) {
    var show = force != null ? force : menu.hasAttribute("hidden");
    menu.toggleAttribute("hidden", !show);
    caret.setAttribute("aria-expanded", String(show));
  }

  caret.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleMenu();
  });

  menu.addEventListener("click", function (e) {
    var item = e.target.closest("[data-format]");
    if (!item) return;
    state.downloadFormat = item.getAttribute("data-format");
    formatLabel.textContent = state.downloadFormat.toUpperCase();
    toggleMenu(false);
  });

  document.addEventListener("click", function () {
    toggleMenu(false);
  });

  downloadBtn.addEventListener("click", function () {
    if (!buildPayload()) return;
    QRDownload.downloadCanvas(canvas, state.downloadFormat, {
      filename: "qr-code",
      background: state.background,
    });
  });

  // ---------- URL query parameters ----------
  //
  // Pre-fill the form and generate a QR from the URL, e.g.:
  //   ?type=website&url=https://example.com
  //   ?type=text&text=Hello%20world
  //   ?type=wifi&ssid=MyNet&password=secret&encryption=WPA&hidden=true
  //   ?type=vcard&fullName=Jane%20Doe&email=jane@acme.com&company=Acme
  // Optional design params (any type):
  //   &color=%23D73220&bg=%23F9ECE5&shape=dots&logo=scanme

  var TYPE_ALIASES = {
    website: "website",
    url: "website",
    web: "website",
    text: "text",
    txt: "text",
    vcard: "vcard",
    card: "vcard",
    contact: "vcard",
    businesscard: "vcard",
    "business-card": "vcard",
    "digital-business-card": "vcard",
    wifi: "wifi",
    "wi-fi": "wifi",
  };

  var ENC_ALIASES = {
    none: "nopass",
    nopass: "nopass",
    open: "nopass",
    wpa: "WPA",
    wpa2: "WPA",
    "wpa/wpa2": "WPA",
    wep: "WEP",
  };

  function normalizeColor(value) {
    if (!value) return null;
    value = value.trim();
    if (/^[0-9a-fA-F]{6}$/.test(value)) value = "#" + value;
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
  }

  function setInputValue(el, value) {
    if (el && value != null) el.value = value;
  }

  function applyQueryParams() {
    var params = new URLSearchParams(window.location.search);
    var map = {};
    var hasAny = false;
    params.forEach(function (value, key) {
      map[key.toLowerCase()] = value;
      hasAny = true;
    });
    if (!hasAny) return false;

    // Embed (display-only) mode for iframes: ?embed=1 or ?mode=embed.
    state.embed =
      /^(1|true|yes|only)$/i.test(map.embed || "") ||
      /^(embed|display|qr|only)$/i.test(map.mode || "");

    // Fill website / text fields.
    setInputValue(document.getElementById("website-url"), map.url);
    setInputValue(document.getElementById("text-content"), map.text);

    // Fill vCard fields (case-insensitive match against data-vcard keys).
    document.querySelectorAll("[data-vcard]").forEach(function (el) {
      var key = el.getAttribute("data-vcard").toLowerCase();
      if (map[key] != null) el.value = map[key];
    });

    // Fill WiFi fields.
    setInputValue(document.getElementById("wifi-ssid"), map.ssid);
    setInputValue(document.getElementById("wifi-password"), map.password);
    if (map.hidden != null) {
      document.getElementById("wifi-hidden").checked = /^(true|1|yes)$/i.test(
        map.hidden
      );
    }
    var encKey = (map.encryption || map.enc || "").toLowerCase();
    if (ENC_ALIASES[encKey]) {
      var encRadio = document.querySelector(
        'input[name="wifi-enc"][value="' + ENC_ALIASES[encKey] + '"]'
      );
      if (encRadio) encRadio.checked = true;
    }

    // Design: colors.
    var qrColor = normalizeColor(map.color);
    if (qrColor) {
      state.color = qrColor;
      document.getElementById("qr-color").value = qrColor;
    }
    var bgColor = normalizeColor(map.bg || map.background);
    if (bgColor) {
      state.background = bgColor;
      document.getElementById("bg-color").value = bgColor;
    }

    // Design: dot shape.
    if (map.shape) {
      var shapeBtn = document.querySelector(
        '.shape-btn[data-shape="' + map.shape.toLowerCase() + '"]'
      );
      if (shapeBtn) {
        document.querySelectorAll(".shape-btn").forEach(function (b) {
          b.classList.toggle("is-active", b === shapeBtn);
        });
        state.shape = map.shape.toLowerCase();
      }
    }

    // Design: logo (none | scanme).
    if (map.logo) {
      var logoVal = map.logo.toLowerCase().replace(/[\s-]/g, "");
      var logoType = logoVal === "scanme" ? "scanme" : "none";
      var logoRadio = document.querySelector(
        'input[name="logo-type"][value="' + logoType + '"]'
      );
      if (logoRadio) {
        logoRadio.checked = true;
        state.logoType = logoType;
      }
    }

    // Activate the requested content tab.
    var type = TYPE_ALIASES[(map.type || "").toLowerCase()];
    if (type) activateTab("content-tabs", type);

    return true;
  }

  // ---------- Copy share URL ----------

  var copyBtn = document.getElementById("copy-url-btn");
  copyBtn.addEventListener("click", function () {
    var input = document.getElementById("share-url");
    var url = input.value;

    function feedback() {
      var original = copyBtn.textContent;
      copyBtn.textContent = "Copied!";
      copyBtn.classList.add("is-copied");
      setTimeout(function () {
        copyBtn.textContent = original;
        copyBtn.classList.remove("is-copied");
      }, 1500);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(feedback, function () {
        legacyCopy(input);
        feedback();
      });
    } else {
      legacyCopy(input);
      feedback();
    }
  });

  function legacyCopy(input) {
    input.removeAttribute("readonly");
    input.select();
    input.setSelectionRange(0, input.value.length);
    try {
      document.execCommand("copy");
    } catch (e) {
      /* no-op */
    }
    input.setAttribute("readonly", "readonly");
    window.getSelection().removeAllRanges();
  }

  // ---------- Embed mode ----------

  function showEmbedError() {
    var box = document.createElement("div");
    box.className = "embed-error";
    box.innerHTML =
      '<div class="embed-error-card">' +
      "<h2>Unable to generate QR code</h2>" +
      "<p>The required parameters are missing or invalid. Provide a valid " +
      "<code>type</code> together with its data parameters " +
      "(for example <code>?embed=1&amp;type=website&amp;url=https://example.com</code>).</p>" +
      "</div>";
    document.body.appendChild(box);
  }

  // ---------- Initial paint ----------

  var appliedParams = applyQueryParams();

  if (state.embed) {
    document.body.classList.add("embed-mode");
    if (buildPayload()) {
      update();
    } else {
      showEmbedError();
    }
  } else {
    if (!appliedParams) {
      document.getElementById("website-url").value = "https://github.com";
    }
    update();
  }
})();
