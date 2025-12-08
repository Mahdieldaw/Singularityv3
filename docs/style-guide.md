# Singularity Style Guide & Assets

Official Singularity branding assets with sizing guidelines for the UI.

All assets are located in: `ui/assets/logos/`

---

## 📦 Available Assets

| Variant | Files | Use Case |
|---------|-------|----------|
| **Full Lockup** | `logo-full.svg/png` | Orb + "SINGULARITY AI" |
| **Wordmark** | `logo-name.svg/png` | "SINGULARITY AI" text only |
| **Icon** | `logo-icon.svg/png` | Orb only |

Each comes in **two sizes**:
- **Regular** (`logo-*.svg/png`) - ~512px, optimized
- **Large** (`logo-*-large.svg/png`) - ~1024px, high-res

**Prefer SVG** for UI elements (scales perfectly). Use PNG only for raster contexts.

---

## 🎯 Sizing Guide by Context

### 1. **Full Lockup** (Orb + "SINGULARITY AI")
*"This is the product" moment*

#### **Welcome / Empty State Screen**
```tsx
import logoFull from '../assets/logos/logo-full.svg';
<img src={logoFull} alt="Singularity AI" className="h-32 w-auto" />
// Size: 128px height (h-32)
```

#### **About / Settings Modal Header**
```tsx
<img src={logoFull} alt="Singularity AI" className="h-10 w-auto" />
// Size: 40px height (h-10)
```

#### **Marketing / Landing Page**
```tsx
<img src={logoFull} alt="Singularity AI" className="h-48 md:h-64 w-auto" />
// Size: 192-256px height (h-48 to h-64)
```

**Don't spam it** - Use sparingly for impact.

---

### 2. **Wordmark** ("SINGULARITY AI" text)
*Your everyday app identity*

#### **Top-Left App Bar** (Header)
```tsx
import logoName from '../assets/logos/logo-name.svg';

// Desktop - with small orb
<div className="flex items-center gap-2">
  <img src={logoIcon} alt="" className="h-5 w-5" />  {/* 20px orb */}
  <img src={logoName} alt="Singularity AI" className="h-6 w-auto" />  {/* 24px text */}
</div>

// Mobile/Compact - text only
<img src={logoName} alt="Singularity AI" className="h-5 w-auto" />
// Size: 20px height (h-5)
```

#### **Dialog / Modal Headers**
```tsx
<img src={logoName} alt="Singularity AI" className="h-4 w-auto opacity-60" />
// Size: 16px height (h-4), subtle
```

**Tip:** You can use just "Singularity" (drop "AI") in nav if cleaner. Keep full "SINGULARITY AI" for welcome/marketing.

---

### 3. **Icon Only** (Orb)
*Square / tiny / chrome-y contexts*

#### **Extension Manifest Icons**
Use PNG for extension icons (Chrome requirement):
```json
"icons": {
  "16": "icons/icon16.png",   // from logo-icon, resized
  "32": "icons/icon32.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

#### **Favicon**
```html
<link rel="icon" href="/icons/icon16.png" />
```

#### **Collapsed Nav / Mobile**
```tsx
<img src={logoIcon} alt="Singularity" className="h-8 w-8" />
// Size: 32px square (h-8 w-8)
```

#### **Loading Spinner / Micro-Brand**
```tsx
<img src={logoIcon} alt="" className="h-6 w-6 animate-pulse" />
// Size: 24px square (h-6 w-6)
```

**Don't overuse** - Once or twice per view is enough.

---

## 💡 Integration Tips

### **Dark UI Compatibility**
Your teal/white orb pops nicely on dark backgrounds. Just ensure:
- ✅ Padding around logos (don't jam against edges)
- ✅ Don't place bright orb on bright highlight panels
- ✅ Use `opacity-60` or `opacity-80` for subtle branding moments

### **Font Matching**
If the wordmark uses a specific font/weight:
- Keep SVG wordmark as-is for the logo
- Match nav "Singularity" text weight/letter-spacing as closely as practical

### **Responsive Behavior**
```tsx
// Desktop
<img src={logoFull} className="h-10 w-auto" />

// Mobile - switch to icon only
<img src={logoIcon} className="h-8 w-8 md:hidden" />
<img src={logoFull} className="hidden md:block h-10 w-auto" />
```

---

## 📏 Quick Size Reference

| Context | Asset | Tailwind Class | Pixels |
|---------|-------|----------------|--------|
| Welcome hero | `logo-full.svg` | `h-32` | 128px |
| Header (desktop) | `logo-name.svg` | `h-6` | 24px |
| Header icon | `logo-icon.svg` | `h-5 w-5` | 20px |
| Modal header | `logo-name.svg` | `h-4` | 16px |
| Nav collapsed | `logo-icon.svg` | `h-8 w-8` | 32px |
| Loading spinner | `logo-icon.svg` | `h-6 w-6` | 24px |
| Extension icon | `icon*.png` | - | 16/32/48/128 |
