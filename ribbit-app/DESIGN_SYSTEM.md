# Apex Trading - Design System Implementation

## Overview
Your Figma mockup styling has been successfully applied to your entire Angular application. The design uses a modern dark theme with a lime green accent color, professional typography, and a sophisticated trading platform aesthetic.

## Color Palette

### Primary Colors
- **Background**: `#090b0a` - Deep dark background
- **Surface**: `#121613` - Slightly lighter surface for cards/components
- **Accent**: `#c1ff39` - Lime green for interactive elements
- **Accent Light**: `#d0ff6a` - Lighter accent for hover states

### Text Colors
- **Text**: `#f4f7f4` - Primary text color (off-white)
- **Muted**: `#949f97` - Muted text for secondary information
- **Subtle**: `#79867d` - Subtle text for tertiary information

### Structural
- **Border**: `#2a302c` - Subtle borders
- **Error**: `#ff9b9b` - Error/destructive actions

## CSS Variables
All colors are available as CSS custom properties in the `:root` selector:

```scss
--background: #090b0a;
--surface: #121613;
--accent: #c1ff39;
--text: #f4f7f4;
--muted: #949f97;
--subtle: #79867d;
--border: #2a302c;
--accent-light: #d0ff6a;
--error: #ff9b9b;
```

## Files Updated

### 1. **app.scss** - Global Design System
- CSS custom properties for the entire color system
- Global typography styles
- Base element styles (buttons, inputs, links)
- App wrapper and main layout
- Custom scrollbar styling
- Utility classes for text colors and backgrounds

### 2. **header.scss** - Navigation Header
- Professional header with logo and user menu
- Apex branding with SVG logo
- User information display
- Dropdown menu styling with animations
- Dark theme with accent color accents
- Responsive design for mobile

### 3. **sidebar.scss** - Navigation Sidebar
- Modern sidebar navigation with smooth transitions
- Active state indicators with left border accent
- Badge support for notifications/counts
- Collapse/expand functionality
- Monospace font for section titles (IBM Plex Mono)
- Hover effects with subtle accent backgrounds

### 4. **page-container.scss** - Page Headers
- Gradient background headers with accent color
- Large, bold page titles with letter spacing
- Description text in muted color
- Subtle styling for page organization

### 5. **global-components.scss** - Reusable Components
A comprehensive library of component styles ready to use:

#### Buttons
- `.btn` - Base button styles
- `.btn-primary` - Accent colored button
- `.btn-secondary` - Border button
- `.btn-ghost` - Text-only button
- `.btn-danger` - Error/destructive button
- `.btn-sm`, `.btn-lg`, `.btn-block` - Size variants

#### Forms
- `.form` - Form container
- `.form-group` - Group wrapper
- `.form-label` - Label styling
- `.form-field` - Input/textarea styling
- `.form-error` - Error message styling
- `.form-help` - Helper text styling
- `.form-checkbox`, `.form-radio` - Checkbox/radio styling

#### Cards
- `.card` - Card container
- `.card-header` - Header with title
- `.card-title`, `.card-subtitle` - Title variants
- `.card-body` - Content area
- `.card-footer` - Footer area with borders

#### Alerts
- `.alert` - Base alert
- `.alert-info` - Accent colored info
- `.alert-success` - Green success
- `.alert-warning` - Yellow warning
- `.alert-error` - Red error

#### Badges
- `.badge` - Base badge
- `.badge-primary` - Accent badge
- `.badge-secondary` - Neutral badge
- `.badge-success` - Green success
- `.badge-error` - Red error

#### Tables
- `.table` - Base table styling with hover effects

#### Utilities
- **Spacing**: `.gap-*`, `.p-*`, `.m-*` (xs, sm, md, lg, xl)
- **Text**: `.text-*` (alignment, size, weight, transform)
- **Layout**: `.flex`, `.flex-col`, `.grid`, etc.
- **States**: `.disabled`, `.active`, `.pending`

## Header Branding
The header has been updated with the Apex Trading branding:
- **Logo**: SVG mark in lime green
- **Brand Name**: "apex" in primary text
- **Subtitle**: "TRADING" in muted color
- Professional styling matching the login mockup

## Usage Examples

### Using Buttons
```html
<!-- Primary button -->
<button class="btn btn-primary">Sign in</button>

<!-- Secondary button -->
<button class="btn btn-secondary">Cancel</button>

<!-- Large full-width button -->
<button class="btn btn-primary btn-lg btn-block">Save</button>
```

### Using Form Fields
```html
<div class="form-group">
  <label class="form-label">Email</label>
  <input class="form-field" type="email" placeholder="Enter email">
</div>
```

### Using Cards
```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Account Summary</h3>
  </div>
  <div class="card-body">
    <!-- Content here -->
  </div>
</div>
```

### Using Alerts
```html
<div class="alert alert-info">
  <svg><!-- icon --></svg>
  <span>Operation completed successfully</span>
</div>
```

## Typography

### Font Stack
```
'Inter', 'IBM Plex Mono', system-ui, sans-serif
```

### Heading Sizes
- `h1` - 44px (1.12 line-height)
- `h2` - 36px (1.2 line-height)
- `h3` - 28px (1.3 line-height)
- `h4` - 20px (1.4 line-height)
- `h5` - 16px (1.5 line-height)
- `h6` - 14px (1.5 line-height)

All headings have:
- Font weight: 600
- Letter spacing: -0.5px
- No margin (0)

## Responsive Design

### Breakpoints
- **Mobile**: Max-width 768px
- **Tablet**: Max-width 1150px
- **Desktop**: 1150px+

Each component includes responsive behavior:
- Header adapts height and hides user info on mobile
- Sidebar collapses to icon-only view on mobile
- Forms and cards stack properly on smaller screens

## Transitions and Animations

### Default Timing
- Standard transition: `0.15s ease`
- UI feedback: `0.3s ease`

### Predefined Animations
- `fadeIn` - Fade in effect (0.3s)
- `slideDown` - Slide down effect (0.3s)
- `slideUp` - Slide up effect (0.3s)
- `pulse` - Pulsing effect (2s infinite)

Use with `.animate-fade-in`, `.animate-slide-down`, etc.

## Accessibility Features

- All interactive elements have proper focus states with accent outline
- Color contrast meets WCAG AA standards
- Form validation styling with aria attributes
- Semantic HTML structure
- Icon-only buttons have aria-labels
- Menu animations for UX

## Customization

### Adding New Colors
Update the `:root` CSS variables in `app.scss`:

```scss
:root {
  --custom-color: #hexcode;
}
```

Then use throughout:
```scss
.my-element {
  color: var(--custom-color);
}
```

### Creating New Components
Use the existing component styles in `global-components.scss` as a template:

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">My Component</h3>
  </div>
  <div class="card-body">
    <p>Content here</p>
  </div>
</div>
```

## Next Steps

1. **Test the styling** - Run your Angular app and verify the design looks correct
2. **Apply to pages** - Use the component classes in your page templates
3. **Connect endpoints** - Once styling is finalized, connect your API endpoints
4. **Customize** - Adjust colors, spacing, or add new components as needed

## Notes

- The design maintains the professional trading platform aesthetic from your Figma mockup
- No endpoints are connected yet; focus on styling first
- All styling uses CSS custom properties for easy theme customization
- The design system is flexible and extendable for future features

---

Built with the Apex Trading design system
