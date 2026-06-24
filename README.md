# QR Canvas

**QR Canvas** is a lightweight, fast, and fully client-side web application for generating QR codes, engineered from the ground up using **pure HTML** and **vanilla JavaScript**, with **zero external frameworks, libraries, or runtime dependencies**.

The primary goal of this project is to provide an intuitive, friction-free tool that empowers anyone to create, customize, and export QR codes in a matter of seconds, directly from the browser and without the need to install software, sign up for an account, or rely on any third-party service. Everything happens locally on the user's machine.

## Overview

A QR (Quick Response) code is a two-dimensional matrix barcode capable of encoding arbitrary data—plain text, URLs, contact information, Wi-Fi credentials, geographic coordinates, and more—in a compact, machine-readable format that can be decoded by virtually any modern smartphone camera. QR Canvas focuses on making the *creation* side of that workflow as simple, transparent, and customizable as possible.

Rather than abstracting the QR generation behind a heavyweight dependency, QR Canvas is built directly on top of the browser's native primitives. The encoding logic, rendering pipeline, and export functionality are all implemented in plain JavaScript and rendered through the **HTML5 Canvas API**, which keeps the footprint minimal, the load times near-instant, and the entire codebase easy to read, audit, and maintain.

## Key Features

- **Instant Generation**: Produce a QR code in real time from text, URLs, email addresses, phone numbers, and other arbitrary payloads. The output updates immediately as the input changes.
- **Full Customization**: Fine-tune the visual appearance of each code, including the foreground (module) color, the background color, the overall size in pixels, the quiet-zone margin, and the **error-correction level** (L, M, Q, H), which controls how much of the code can be damaged or obscured while remaining scannable.
- **Multi-Format Export**: Save the generated QR code as an image in several formats, including **PNG** (lossless raster), **JPG** (compressed raster), and **SVG** (infinitely scalable vector), so it can be used everywhere from printed media to high-resolution digital assets.
- **100% Client-Side Processing**: All computation—encoding, rendering, and exporting—runs entirely in the browser. No data is ever transmitted to a server, which guarantees user privacy and eliminates network latency.
- **Dependency-Free Architecture**: Built exclusively with native web technologies. There is no build step, no package manager requirement, and no bundle to ship—just open the file and run.
- **Responsive Design**: The interface adapts gracefully to desktop, tablet, and mobile viewports, providing a consistent experience across screen sizes.

## How It Works

QR Canvas implements the QR code generation pipeline in a series of well-defined, observable stages:

1. **Input Capture**: The user-provided string is read from the input field and validated. The application determines the optimal encoding mode (numeric, alphanumeric, or byte) based on the character set of the payload.
2. **Data Encoding**: The payload is converted into a bit stream according to the QR specification, including the mode indicator, character-count indicator, and the data itself, followed by the required padding.
3. **Error Correction**: Reed–Solomon error-correction codewords are computed and appended based on the selected error-correction level, allowing the resulting code to remain readable even if partially damaged.
4. **Matrix Construction**: The final bit stream is placed into the QR matrix alongside the mandatory function patterns (finder patterns, alignment patterns, timing patterns, and format information). A masking pattern is applied to optimize scannability.
5. **Rendering**: The completed matrix is drawn module-by-module onto an HTML5 `<canvas>` element, honoring the user's chosen colors, dimensions, and margin.
6. **Export**: On demand, the canvas contents are serialized into the requested image format and offered to the user as a downloadable file.

## Tech Stack

- **HTML5** — Provides the semantic document structure and the `<canvas>` rendering surface.
- **CSS3** — Handles the styling, layout, and responsive behavior of the interface.
- **Vanilla JavaScript (ES6+)** — Implements the complete QR encoding algorithm, customization logic, and user interaction handling, with no transpilation or framework involved.
- **Canvas API** — Powers the pixel-level rendering of the QR matrix and the conversion of that rendered output into exportable image formats.

## Getting Started

Because QR Canvas has no dependencies and no build step, running it locally is trivial.

1. Clone the repository:

```bash
git clone https://github.com/SergioQuezada/qr-canvas.git
cd qr-canvas
```

2. Open the application in your browser. You can simply double-click `index.html`, or, for a more production-like environment, serve the directory with any static file server:

```bash
# Using Python's built-in HTTP server
python3 -m http.server 8000

# Or using the Node.js "serve" package
npx serve .
```

3. Navigate to the served URL (e.g. `http://localhost:8000`), enter the content you want to encode, customize the appearance of your QR code, and download it in the format of your choice.

> No dependency installation and no server are strictly required—opening the file directly in a browser is enough for full functionality.

## URL Parameters (Deep Linking)

QR Canvas can be driven entirely through the URL query string. When the page loads with parameters present, the application automatically selects the correct content tab, fills in the matching form fields, applies any design options, and renders the resulting QR code in real time—no manual interaction required. This makes it trivial to share pre-configured links, generate codes programmatically, or embed the generator in other tools.

All parameter names and most values are **case-insensitive**, and values must be **URL-encoded** (for example, `#` becomes `%23` and a space becomes `%20`).

### `type` — Content type

The `type` parameter selects which kind of QR code to generate. Each type accepts several friendly aliases:

| Canonical type | Accepted aliases                                                        |
| -------------- | ----------------------------------------------------------------------- |
| `website`      | `website`, `url`, `web`                                                 |
| `text`         | `text`, `txt`                                                           |
| `vcard`        | `vcard`, `card`, `contact`, `businesscard`, `business-card`, `digital-business-card` |
| `wifi`         | `wifi`, `wi-fi`                                                         |

If `type` is omitted, the relevant fields are still filled, but the default tab (Website) remains active.

### Content parameters

The data parameters depend on the selected type:

**Website**

| Parameter | Description                  |
| --------- | ---------------------------- |
| `url`     | The web address to encode.   |

```
index.html?type=website&url=https%3A%2F%2Fexample.com
```

**Text**

| Parameter | Description                       |
| --------- | --------------------------------- |
| `text`    | Any arbitrary text to encode.     |

```
index.html?type=text&text=Hello%20world
```

**WiFi**

| Parameter    | Description                                                                  |
| ------------ | ---------------------------------------------------------------------------- |
| `ssid`       | The network name.                                                            |
| `password`   | The network password (ignored when encryption is `none`).                    |
| `encryption` | One of `none`/`nopass`/`open`, `wpa`/`wpa2`, or `wep`. Defaults to `WPA`.     |
| `hidden`     | `true`, `1`, or `yes` to mark the network as hidden.                          |

```
index.html?type=wifi&ssid=MyNetwork&password=secret123&encryption=wpa&hidden=true
```

**Digital Business Card (vCard)**

Each field maps to a query parameter of the same name (case-insensitive):

| Parameter   | Description     | Parameter | Description   |
| ----------- | --------------- | --------- | ------------- |
| `fullName`  | Full name       | `street`  | Street        |
| `phone`     | Phone number    | `city`    | City          |
| `email`     | Email address   | `state`   | State         |
| `company`   | Company name    | `country` | Country       |
| `title`     | Work title      | `zip`     | Zip code      |
| `workPhone` | Work phone      | `website` | Website       |
| `fax`       | Fax             |           |               |

```
index.html?type=vcard&fullName=Jane%20Doe&email=jane%40acme.com&company=Acme&title=CEO&phone=555-1234
```

### Design parameters (optional, any type)

These parameters customize the appearance and can be combined with any content type:

| Parameter            | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `color`              | Foreground (QR) color as a hex value, with or without the leading `#` (e.g. `%23D73220`).    |
| `bg` / `background`  | Background color as a hex value, with or without the leading `#`.                            |
| `shape`              | Dot shape: `dots`, `diamond`, `classy`, `rounded`, or `square`.                              |
| `logo`               | Center badge: `none` or `scanme`. (Uploading an image is only available through the UI.)     |

### Full example

The following link opens the WiFi tab, fills in the credentials, sets a diamond dot shape in dark red, and instantly renders the QR code:

```
index.html?type=wifi&ssid=HomeWiFi&password=12345678&encryption=wpa&shape=diamond&color=%2368150A
```

> **Note:** For security reasons, browsers do not allow a file to be uploaded via the URL, so the "Upload a logo" option can only be used through the interface. All other options are fully controllable via parameters.

## Embed Mode (Display-Only)

QR Canvas includes a dedicated **embed mode** designed for displaying a finished QR code inside an `<iframe>` on another website, a dashboard, or any external page. When embed mode is active, the entire editing interface—the header, the content and design panels, the footer, and the download button—is hidden, leaving only the rendered QR code filling 100% of the available viewport. The code cannot be modified in this mode, which makes it ideal for read-only embedding.

### Activating embed mode

Embed mode is enabled with an extra parameter, supplied **alongside** the normal content parameters used to generate the code:

| Parameter | Accepted values                          |
| --------- | ---------------------------------------- |
| `embed`   | `1`, `true`, `yes`, or `only`            |
| `mode`    | `embed`, `display`, `qr`, or `only`      |

```
index.html?embed=1&type=website&url=https%3A%2F%2Fexample.com
index.html?mode=embed&type=wifi&ssid=MyNetwork&password=12345678&encryption=wpa
```

### Behavior

- **Valid parameters** — The QR code is rendered centered and square, scaled to `min(100vw, 100vh)` so it fills the iframe while staying perfectly proportioned. The page background is transparent, so the host page controls the surrounding color.
- **Missing or invalid parameters** — If the supplied parameters do not produce any encodable content, the page shows a centered, full-screen error card ("Unable to generate QR code") with an example of a correct URL, instead of rendering an empty or broken code.

### Example: embedding in another page

```html
<iframe
  src="https://your-domain.com/qr-canvas/index.html?embed=1&type=text&text=Hello%20world"
  width="300"
  height="300"
  frameborder="0"
  title="QR Code">
</iframe>
```

> All design parameters (`color`, `bg`, `shape`, `logo`) work in embed mode as well, so the embedded code can be fully styled to match the host page.

## Share URL

To make deep linking effortless, the interface includes a dedicated **Share URL** window beneath the design panel. It builds the shareable link for you automatically, so you never have to assemble the query string by hand.

The window contains three controls:

- **Read-only URL field** — Displays, in real time, the fully composed URL that reproduces the QR code currently on screen. It is regenerated on every change, capturing the active content type, all filled-in field values, and the selected design options (`color`, `bg`, `shape`, and `logo`) as URL parameters.
- **"Embedded" checkbox** — When checked, the generated URL includes the `embed=1` flag, producing a link ready to drop straight into an `<iframe>` (see [Embed Mode](#embed-mode-display-only)). When unchecked, the link opens the full editor pre-filled with the same data.
- **"Copy" button** — Copies the complete URL to the clipboard with a single click. It uses the modern Clipboard API with a graceful fallback for older browsers, and briefly confirms the action with a "Copied!" state.

This window is part of the editing interface and is therefore hidden automatically when the page is loaded in embed mode.

## Project Structure

```
qr-canvas/
├── index.html        # Main application entry point and markup
├── css/
│   └── styles.css    # Interface styles, color palette, and responsive layout
├── js/
│   ├── qrcode.js     # From-scratch QR encoder (Reed-Solomon, masking, matrix)
│   ├── renderer.js   # Canvas rendering: dot shapes, colors, and logo
│   ├── download.js   # Image export (PNG / JPG)
│   └── app.js        # UI logic, URL parameters, and real-time generation
├── LICENSE           # Project license (MIT)
└── README.md         # Project documentation
```

## Contributing

Contributions are welcome and appreciated. If you would like to propose an enhancement, report a bug, or improve the documentation, please open an *issue* to start a discussion, or submit a *pull request* with your proposed changes. Please try to keep the codebase dependency-free and aligned with the project's vanilla-first philosophy.

## License

This project is distributed under the **MIT License**. See the [LICENSE](LICENSE) file for the full terms and conditions.

---

Developed by **Sergio Quezada**.
