export const Colors = {
  // Brand — healthcare green (deliberately distinct from the status
  // green below, so a primary button never reads as "verified/success")
  primary:      '#0E9F6E',
  primaryDark:  '#0B7A56',
  primaryLight: '#6EE7B7',
  primaryDim:   'rgba(14,159,110,0.12)',
  accent:       '#00BFA5',
  accentDim:    'rgba(0,191,165,0.12)',
  gold:         '#FFB300',

  // Dark neutral — formerly the brand navy, kept for text/shadow tints
  ink:      '#0B1D3A',
  inkMid:   '#142850',
  // Legacy aliases — old brand-navy names, some code/screens still being
  // migrated may reference these; point them at the same ink values.
  navy:     '#0B1D3A',
  navyMid:  '#142850',
  blue:     '#1565C0',
  blueMid:  '#1976D2',
  blueLight:'#42A5F5',

  // Status
  green:      '#2E7D32',
  greenLight: '#4CAF50',
  greenDim:   'rgba(46,125,50,0.12)',
  red:        '#C62828',
  redLight:   '#EF5350',
  redDim:     'rgba(198,40,40,0.10)',
  amber:      '#E65100',
  amberDim:   'rgba(230,81,0,0.10)',

  // Neutral
  bg:         '#F0FAF6',
  surface:    '#FFFFFF',
  surface2:   '#E7F5EF',
  border:     '#D7EAE1',
  border2:    '#BBDCCC',

  // Text
  text1:      '#0B1D3A',
  text2:      '#4A5568',
  text3:      '#8896A8',
  textWhite:  '#FFFFFF',

  // Glassmorphism — translucent panel + border, meant to sit on top of
  // the green gradient background (Gradients.screen below), not flat color
  glassBg:        'rgba(255,255,255,0.55)',
  glassBgStrong:  'rgba(255,255,255,0.72)',
  glassBorder:    'rgba(255,255,255,0.45)',
  glassDark:      'rgba(11,29,58,0.35)',
  glassDarkBorder:'rgba(255,255,255,0.18)',
};

// Backdrop-filter blur radius (px) used by GlassCard on web; native uses
// expo-blur's `intensity` (0-100) instead — see GlassCard.js.
export const GLASS_BLUR_WEB = 20;
export const GLASS_BLUR_NATIVE = 40;

// Soft green gradient screens sit on, so the glass panels have something
// with color/detail behind them to actually blur.
export const Gradients = {
  screen: [Colors.bg, '#DCF3E8', '#F5FBF8'],
  header: [Colors.primary, Colors.primaryDark],
};

// Sora, loaded via @expo-google-fonts/sora in App.js (useFonts) for
// native, and via a Google Fonts <link> + global CSS override in
// public/index.html for the PWA. Both point at these same family names so
// Typography works identically on both.
const FONT_REGULAR  = 'Sora_400Regular';
const FONT_MEDIUM   = 'Sora_500Medium';
const FONT_SEMIBOLD = 'Sora_600SemiBold';
const FONT_BOLD     = 'Sora_700Bold';
const FONT_EXTRABOLD = 'Sora_800ExtraBold';

export const Typography = {
  // Display
  h1: { fontSize: 28, fontFamily: FONT_EXTRABOLD, letterSpacing: -0.5, color: Colors.text1 },
  h2: { fontSize: 22, fontFamily: FONT_BOLD, letterSpacing: -0.3, color: Colors.text1 },
  h3: { fontSize: 18, fontFamily: FONT_BOLD, color: Colors.text1 },
  h4: { fontSize: 16, fontFamily: FONT_SEMIBOLD, color: Colors.text1 },

  // Body
  body:  { fontSize: 14, fontFamily: FONT_REGULAR, color: Colors.text2, lineHeight: 21 },
  bodyM: { fontSize: 14, fontFamily: FONT_MEDIUM, color: Colors.text1 },
  bodyS: { fontSize: 13, fontFamily: FONT_REGULAR, color: Colors.text2 },
  caption: { fontSize: 11, fontFamily: FONT_SEMIBOLD, color: Colors.text3, letterSpacing: 0.5 },
  label: { fontSize: 12, fontFamily: FONT_BOLD, color: Colors.text3, letterSpacing: 0.8, textTransform: 'uppercase' },
  mono:  { fontSize: 12, fontFamily: 'monospace', color: Colors.text3 },
};

// Font family names exported individually too, for spots that build up
// custom text styles inline rather than through the Typography presets.
export const FontFamily = {
  regular: FONT_REGULAR, medium: FONT_MEDIUM, semibold: FONT_SEMIBOLD,
  bold: FONT_BOLD, extrabold: FONT_EXTRABOLD,
};

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const Radius = {
  sm: 8, md: 12, lg: 16, xl: 20, full: 999,
};

export const Shadow = {
  sm: {
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
};

// Stage config — icon is a MaterialCommunityIcons name (see
// @expo/vector-icons), not an emoji, rendered via <StageIcon> /
// <MaterialCommunityIcons name={STAGES[x].icon} />.
export const STAGES = {
  // Intake — pickup flow
  PENDING_PICKUP:            { label: 'Awaiting Pickup',            color: '#546E7A', icon: 'clock-outline',            step: -2 },
  PICKUP_ASSIGNED:           { label: 'Driver En Route',            color: '#1E88E5', icon: 'moped',                    step: -1 },
  // Case received
  CASE_ACCEPTED:             { label: 'Case Accepted',              color: '#3949AB', icon: 'tray-arrow-down',          step: 0  },
  // Model preparation
  PLASTER_DEPARTMENT:        { label: 'Plaster Department',         color: '#6A1B9A', icon: 'pot',                      step: 1  },
  MARGIN_DEPARTMENT:         { label: 'Margin Department',          color: '#7B1FA2', icon: 'content-cut',              step: 2  },
  // CAD/CAM
  SCANNING:                  { label: 'Scanning',                   color: '#1565C0', icon: 'microscope',               step: 3  },
  DESIGNING:                 { label: 'Designing',                  color: '#0277BD', icon: 'monitor',                  step: 4  },
  // Manufacturing
  MILLING_SINTERING:         { label: 'Milling / Sintering',        color: '#E65100', icon: 'cog-outline',              step: 5  },
  RESIN_3D_PRINTING:         { label: 'Resin 3D Printing',          color: '#BF360C', icon: 'printer-3d',               step: 5  },
  METAL_3D_PRINTING:         { label: 'Metal 3D Printing',          color: '#4E342E', icon: 'printer-3d-nozzle',        step: 5  },
  // Ceramic & finishing
  METAL_FINISHING:           { label: 'Metal Finishing',            color: '#795548', icon: 'hammer',                   step: 6  },
  OPAQUE_APPLICATION:        { label: 'Opaque Application',         color: '#F57F17', icon: 'palette-outline',          step: 7  },
  CERAMIC_LAYERING:          { label: 'Ceramic Layering',           color: '#D84315', icon: 'layers-outline',           step: 8  },
  ZIRCONIA_FITTING_FINISHING:{ label: 'Zirconia Fitting',           color: '#00695C', icon: 'diamond-stone',            step: 8  },
  GLAZING:                   { label: 'Glazing',                    color: '#00838F', icon: 'creation',                 step: 9  },
  THERMO_PRESS:              { label: 'Thermo Press',               color: '#C62828', icon: 'fire',                     step: 9  },
  TRIMMING:                  { label: 'Trimming',                   color: '#558B2F', icon: 'box-cutter',               step: 10 },
  // Finalization
  QUALITY_CHECK:             { label: 'Quality Check',              color: '#2E7D32', icon: 'magnify',                  step: 11 },
  PAYMENT_INVOICING:         { label: 'Payment / Invoicing',        color: '#00695C', icon: 'cash-multiple',            step: 12 },
  // Dispatch
  READY_TO_DISPATCH:         { label: 'Ready to Dispatch',          color: '#00897B', icon: 'package-variant-closed',   step: 13 },
  OUT_FOR_DELIVERY:          { label: 'Out for Delivery',           color: '#EF6C00', icon: 'truck-delivery-outline',   step: 14 },
  DELIVERED:                 { label: 'Delivered',                  color: '#1B5E20', icon: 'check-circle-outline',     step: 15 },
  // Exceptions
  ON_HOLD:                   { label: 'On Hold',                    color: '#B71C1C', icon: 'pause-circle-outline',     step: -1 },
  REMAKE:                    { label: 'Remake',                     color: '#6A1B9A', icon: 'restore',                  step: -2 },
  CANCELLED:                 { label: 'Cancelled',                  color: '#424242', icon: 'close-circle-outline',     step: -3 },
  UNDER_REVIEW:               { label: 'Under Review',              color: '#F57C00', icon: 'clipboard-text-outline',   step: -4 },
  REJECTED:                  { label: 'Rejected',                   color: '#B71C1C', icon: 'cancel',                   step: -5 },
};

export const PAYMENT_STATUS = {
  PENDING:             { label: 'No Request Yet',    color: Colors.text3, bg: Colors.surface2, icon: 'timer-sand' },
  PAYMENT_REQUESTED:   { label: 'Payment Requested', color: Colors.primary, bg: Colors.primaryDim, icon: 'receipt-text-outline' },
  SCREENSHOT_UPLOADED: { label: 'Awaiting Review',   color: Colors.amber, bg: Colors.amberDim, icon: 'clock-alert-outline' },
  VERIFIED:            { label: 'Payment Verified',  color: Colors.green, bg: Colors.greenDim, icon: 'check-decagram-outline' },
  REJECTED:            { label: 'Payment Rejected',  color: Colors.red,   bg: Colors.redDim, icon: 'close-octagon-outline' },
};
