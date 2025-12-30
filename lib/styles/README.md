# Centralized Styling System

This directory contains centralized style utilities and constants for the LitigatorsAI application. This helps maintain consistency across the codebase and makes it easier to update styles globally.

## Structure

- `colors.ts` - Color constants and mappings (citation status, types, risk levels)
- `components.ts` - Reusable component style utilities (buttons, forms, cards, badges)
- `index.ts` - Main export file

## Usage

### Import Styles

```typescript
import { citationStatusColors, getCitationStatusColor } from "@/lib/styles";
import { buttonStyles, inputStyles, cn } from "@/lib/styles";
```

### Citation Status Colors

```tsx
import { getCitationStatusColor } from "@/lib/styles";

// In your component
const statusColor = getCitationStatusColor("valid"); // Returns "bg-green-100 text-green-800 border-green-300"

<span className={`px-2 py-1 rounded ${statusColor}`}>
  Valid
</span>
```

### Button Styles

```tsx
import { buttonStyles } from "@/lib/styles";

<button className={buttonStyles.primary}>
  Primary Button
</button>

<button className={buttonStyles.secondary}>
  Secondary Button
</button>
```

### Form Inputs

```tsx
import { inputStyles, labelStyles } from "@/lib/styles";

<label className={labelStyles.required}>
  Email <span className="text-red-500">*</span>
</label>
<input className={inputStyles.base} type="email" />
```

### Combining Classes

```tsx
import { cn } from "@/lib/styles";

<div className={cn("base-class", condition && "conditional-class", className)}>
  Content
</div>
```

## Color Constants

### Citation Status Colors
- `valid` - Green (bg-green-100 text-green-800)
- `invalid` - Red (bg-red-100 text-red-800)
- `uncertain` - Yellow (bg-yellow-100 text-yellow-800)
- `needs-review` - Orange (bg-orange-100 text-orange-800)

### Citation Type Colors
- `case` - Blue
- `statute` - Green
- `regulation` - Purple
- `rule` - Orange
- `unknown` - Gray

### Risk Level Colors
- `low` - Green
- `moderate` - Yellow
- `high` - Orange
- `needs-review` - Red

## Component Styles

### Button Variants
- `primary` - Indigo background, white text
- `secondary` - White background, gray border
- `danger` - Red background, white text
- `link` - Text link style
- `ghost` - Minimal button style

### Alert Variants
- `success` - Green background
- `error` - Red background
- `warning` - Yellow background
- `info` - Blue background

## Migration Guide

When updating existing components to use centralized styles:

1. **Replace hardcoded color objects:**
   ```tsx
   // Before
   const statusColors = {
     valid: "bg-green-100 text-green-800",
     // ...
   }
   
   // After
   import { citationStatusColors } from "@/lib/styles";
   ```

2. **Replace button classes:**
   ```tsx
   // Before
   <button className="px-4 py-2 bg-indigo-600 text-white...">
   
   // After
   <button className={buttonStyles.primary}>
   ```

3. **Use the cn() helper for conditional classes:**
   ```tsx
   // Before
   className={`base ${condition ? "extra" : ""} ${otherClass}`}
   
   // After
   className={cn("base", condition && "extra", otherClass)}
   ```

## Tailwind Theme

The Tailwind config has been extended with:
- Semantic color palette (primary, success, warning, error)
- Consistent font family
- Custom spacing and shadows (ready for extension)

You can use semantic colors directly in Tailwind classes:
```tsx
<div className="bg-primary-600 text-white">Primary color</div>
<div className="bg-success-100 text-success-800">Success color</div>
```

