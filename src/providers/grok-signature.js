/**
 *`src/providers/grok-signature.js`
 * HTOS Grok Signature Module
 * - Generates x-statsig-id header for Grok API requests
 * - Port of Python xctid.py (cubic bezier, SVG parsing, matrix math)
 * 
 * Build-phase safe: runs in Service Worker
 */

import { sha256 } from '@noble/hashes/sha256';
import { base64ToBytes, bytesToBase64 } from './grok-crypto.js';

// ═══════════════════════════════════════════════════════════════════════════
// MATH UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map value from byte range to target range
 */
function _h(x, _param, c, isInteger) {
  const f = ((x * (c - _param)) / 255.0) + _param;
  if (isInteger) {
    return Math.floor(f);
  }
  const rounded = Math.round(f * 100) / 100;
  return rounded === 0.0 ? 0.0 : rounded;
}

/**
 * Cubic bezier easing with binary search for t
 */
function cubicBezierEased(t, x1, y1, x2, y2) {
  const bezier = (u) => {
    const omu = 1.0 - u;
    const b1 = 3.0 * omu * omu * u;
    const b2 = 3.0 * omu * u * u;
    const b3 = u * u * u;
    const x = b1 * x1 + b2 * x2 + b3;
    const y = b1 * y1 + b2 * y2 + b3;
    return [x, y];
  };

  // Binary search to find u where bezier(u)[0] ≈ t
  let lo = 0.0;
  let hi = 1.0;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (bezier(mid)[0] < t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const u = 0.5 * (lo + hi);
  return bezier(u)[1];
}

/**
 * Parse SVG path 'd' attribute into numeric arrays
 */
function parseSvgPath(svg) {
  // Skip "M X Y C" prefix (first 9 chars typically "M0 0 0 0 C")
  const substr = svg.substring(9);
  const parts = substr.split('C');
  const out = [];

  for (const part of parts) {
    // Extract all numbers from this segment
    const cleaned = part.replace(/[^\d]+/g, ' ').trim();
    if (cleaned === '') {
      out.push([0]);
    } else {
      const nums = cleaned
        .split(/\s+/)
        .filter((tok) => tok !== '')
        .map((tok) => parseInt(tok, 10));
      out.push(nums);
    }
  }
  return out;
}

/**
 * Convert number to hex string (matching Python tohex)
 */
function toHex(num) {
  const rounded = Math.round(num * 100) / 100;
  if (rounded === 0.0) {
    return '0';
  }

  const sign = Math.sign(rounded) < 0 ? '-' : '';
  const absval = Math.abs(rounded);
  const intpart = Math.floor(absval);
  let frac = absval - intpart;

  if (frac === 0.0) {
    return sign + intpart.toString(16);
  }

  const fracDigits = [];
  for (let i = 0; i < 20; i++) {
    frac *= 16;
    const digit = Math.floor(frac + 1e-12);
    fracDigits.push(digit.toString(16));
    frac -= digit;
    if (Math.abs(frac) < 1e-12) {
      break;
    }
  }

  let fracStr = fracDigits.join('').replace(/0+$/, '');
  if (fracStr === '') {
    return sign + intpart.toString(16);
  }
  return sign + intpart.toString(16) + '.' + fracStr;
}

/**
 * Simulate CSS animation style at given time
 */
function simulateStyle(values, c) {
  const duration = 4096;
  const currentTime = Math.round(c / 10.0) * 10;
  const t = currentTime / duration;

  // Control points from values[7:], alternating between param=0 and param=-1
  const cp = values.slice(7).map((v, i) => 
    _h(v, i % 2 ? -1 : 0, 1, false)
  );

  const easedY = cubicBezierEased(t, cp[0], cp[1], cp[2], cp[3]);

  // RGB interpolation
  const start = values.slice(0, 3).map(Number);
  const end = values.slice(3, 6).map(Number);
  const r = Math.round(start[0] + (end[0] - start[0]) * easedY);
  const g = Math.round(start[1] + (end[1] - start[1]) * easedY);
  const b = Math.round(start[2] + (end[2] - start[2]) * easedY);
  const color = `rgb(${r}, ${g}, ${b})`;

  // Rotation matrix
  const endAngle = _h(values[6], 60, 360, true);
  const angle = endAngle * easedY;
  const rad = (angle * Math.PI) / 180.0;

  const isZero = (val) => Math.abs(val) < 1e-7;
  const isInt = (val) => Math.abs(val - Math.round(val)) < 1e-7;

  const cosv = Math.cos(rad);
  const sinv = Math.sin(rad);

  let a, d;
  if (isZero(cosv)) {
    a = 0;
    d = 0;
  } else if (isInt(cosv)) {
    a = Math.round(cosv);
    d = Math.round(cosv);
  } else {
    a = cosv.toFixed(6);
    d = cosv.toFixed(6);
  }

  let bval, cval;
  if (isZero(sinv)) {
    bval = 0;
    cval = 0;
  } else if (isInt(sinv)) {
    bval = Math.round(sinv);
    cval = Math.round(-sinv);
  } else {
    bval = sinv.toFixed(7);
    cval = (-sinv).toFixed(7);
  }

  const transform = `matrix(${a}, ${bval}, ${cval}, ${d}, 0, 0)`;
  return { color, transform };
}

/**
 * Extract signature data from verification token and SVG
 */
function extractSignatureData(verificationBytes, svg, xValues) {
  const arr = Array.from(verificationBytes);
  const idx = arr[xValues[0]] % 16;
  const c =
    (arr[xValues[1]] % 16) *
    (arr[xValues[2]] % 16) *
    (arr[xValues[3]] % 16);

  const svgParts = parseSvgPath(svg);
  const vals = svgParts[idx];
  const style = simulateStyle(vals, c);

  // Concatenate color and transform, extract numbers, convert to hex
  const concat = style.color + style.transform;
  const matches = concat.match(/[\d.\-]+/g) || [];
  const converted = matches.map((m) => {
    const num = parseFloat(m);
    return toHex(num);
  });
  const joined = converted.join('');
  return joined.replace(/\./g, '').replace(/-/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SIGNATURE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate x-statsig-id signature for Grok API requests
 * 
 * @param {string} path - API endpoint path (e.g., '/rest/app-chat/conversations/new')
 * @param {string} method - HTTP method (e.g., 'POST')
 * @param {string} verificationToken - Base64-encoded verification token from c_request
 * @param {string} svg - SVG path 'd' attribute from page
 * @param {number[]} xValues - Array of 4 indices parsed from xsid script
 * @param {number} [timeN] - Optional timestamp override (for testing)
 * @param {number} [randomFloat] - Optional random override (for testing)
 * @returns {string} Base64-encoded signature (without padding)
 */
export function generateSign(
  path,
  method,
  verificationToken,
  svg,
  xValues,
  timeN = null,
  randomFloat = null
) {
  // Timestamp: seconds since epoch offset
  const n = timeN ?? Math.floor(Date.now() / 1000) - 1682924400;

  // Pack as little-endian 32-bit unsigned integer
  const t = new Uint8Array(4);
  const view = new DataView(t.buffer);
  view.setUint32(0, n, true); // little-endian

  // Decode verification token
  const r = base64ToBytes(verificationToken);

  // Extract signature data from SVG
  const o = extractSignatureData(r, svg, xValues);

  // Build message and hash
  const msg = [method, path, n.toString()].join('!') + 'obfiowerehiring' + o;
  const encoder = new TextEncoder();
  const digest = sha256(encoder.encode(msg)).slice(0, 16);

  // Generate prefix byte (Python uses floor(random() * 256) which is always 0-255)
  const prefixByte = Math.floor((randomFloat ?? Math.random()) * 256);

  // Assemble final array: [prefix, verification, timestamp, digest, 3]
  const assembled = new Uint8Array(1 + r.length + 4 + 16 + 1);
  assembled[0] = prefixByte;
  assembled.set(r, 1);
  assembled.set(t, 1 + r.length);
  assembled.set(digest, 1 + r.length + 4);
  assembled[assembled.length - 1] = 3;

  // XOR transformation: each byte XORed with first byte
  if (assembled.length > 0) {
    const first = assembled[0];
    for (let i = 1; i < assembled.length; i++) {
      assembled[i] = assembled[i] ^ first;
    }
  }

  // Return base64 without padding
  return bytesToBase64(assembled).replace(/=/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSER UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract substring between two delimiters
 */
export function between(haystack, start, end) {
  const s = haystack.indexOf(start);
  if (s === -1) return '';
  const from = s + start.length;
  const e = haystack.indexOf(end, from);
  if (e === -1) return '';
  return haystack.slice(from, e);
}

/**
 * Parse verification token and animation index from HTML
 */
export function parseVerificationToken(html, metaName = 'grok-site-verification') {
  const token = between(html, `"name":"${metaName}","content":"`, '"');
  if (!token) return [null, null];
  
  const decoded = base64ToBytes(token);
  const animIndex = decoded[5] % 4;
  const anim = `loading-x-anim-${animIndex}`;
  
  return [token, anim];
}

/**
 * Extract SVG path data from HTML
 */
export function parseSvgData(html, anim = 'loading-x-anim-0') {
  const dValueRegex = /"d":"(M[^"]{200,})"/g;
  const allDValues = [];
  let match;
  while ((match = dValueRegex.exec(html)) !== null) {
    allDValues.push(match[1]);
  }
  
  const animIndex = parseInt(anim.split('loading-x-anim-')[1], 10);
  return allDValues[animIndex] || null;
}

/**
 * Parse x-values from script content
 */
export function parseXValues(scriptContent) {
  const matches = scriptContent.match(/x\[(\d+)\]\s*,\s*16/g) || [];
  return matches.map((m) => {
    const numMatch = m.match(/x\[(\d+)\]/);
    return numMatch ? parseInt(numMatch[1], 10) : 0;
  });
}
