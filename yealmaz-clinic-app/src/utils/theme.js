export const Colors = {
  // Brand
  navy:       '#0B1D3A',
  navyMid:    '#142850',
  blue:       '#1565C0',
  blueMid:    '#1976D2',
  blueLight:  '#42A5F5',
  accent:     '#00BFA5',
  accentDim:  'rgba(0,191,165,0.12)',
  gold:       '#FFB300',

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
  bg:         '#F4F6FA',
  surface:    '#FFFFFF',
  surface2:   '#EEF2F8',
  border:     '#DDE3EE',
  border2:    '#C5CFDF',

  // Text
  text1:      '#0B1D3A',
  text2:      '#4A5568',
  text3:      '#8896A8',
  textWhite:  '#FFFFFF',
};

export const Typography = {
  // Display
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: Colors.text1 },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: Colors.text1 },
  h3: { fontSize: 18, fontWeight: '700', color: Colors.text1 },
  h4: { fontSize: 16, fontWeight: '600', color: Colors.text1 },

  // Body
  body:  { fontSize: 14, fontWeight: '400', color: Colors.text2, lineHeight: 21 },
  bodyM: { fontSize: 14, fontWeight: '500', color: Colors.text1 },
  bodyS: { fontSize: 13, fontWeight: '400', color: Colors.text2 },
  caption: { fontSize: 11, fontWeight: '600', color: Colors.text3, letterSpacing: 0.5 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.text3, letterSpacing: 0.8, textTransform: 'uppercase' },
  mono:  { fontSize: 12, fontFamily: 'monospace', color: Colors.text3 },
};

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const Radius = {
  sm: 8, md: 12, lg: 16, xl: 20, full: 999,
};

export const Shadow = {
  sm: {
    shadowColor: '#0B1D3A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#0B1D3A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0B1D3A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
};

// Stage config
export const STAGES = {
  // Case received
  CASE_ACCEPTED:             { label: 'Case Accepted',              color: '#3949AB', icon: '📥', step: 0  },
  // Model preparation
  PLASTER_DEPARTMENT:        { label: 'Plaster Department',         color: '#6A1B9A', icon: '🏺', step: 1  },
  MARGIN_DEPARTMENT:         { label: 'Margin Department',          color: '#7B1FA2', icon: '✂️', step: 2  },
  // CAD/CAM
  SCANNING:                  { label: 'Scanning',                   color: '#1565C0', icon: '🔬', step: 3  },
  DESIGNING:                 { label: 'Designing',                  color: '#0277BD', icon: '🖥️', step: 4  },
  // Manufacturing
  MILLING_SINTERING:         { label: 'Milling / Sintering',        color: '#E65100', icon: '⚙️', step: 5  },
  RESIN_3D_PRINTING:         { label: 'Resin 3D Printing',          color: '#BF360C', icon: '🖨️', step: 5  },
  METAL_3D_PRINTING:         { label: 'Metal 3D Printing',          color: '#4E342E', icon: '🔩', step: 5  },
  // Ceramic & finishing
  METAL_FINISHING:           { label: 'Metal Finishing',            color: '#795548', icon: '🔨', step: 6  },
  OPAQUE_APPLICATION:        { label: 'Opaque Application',         color: '#F57F17', icon: '🎨', step: 7  },
  CERAMIC_LAYERING:          { label: 'Ceramic Layering',           color: '#D84315', icon: '🏛️', step: 8  },
  ZIRCONIA_FITTING_FINISHING:{ label: 'Zirconia Fitting',           color: '#00695C', icon: '💎', step: 8  },
  GLAZING:                   { label: 'Glazing',                    color: '#00838F', icon: '✨', step: 9  },
  THERMO_PRESS:              { label: 'Thermo Press',               color: '#C62828', icon: '🔥', step: 9  },
  TRIMMING:                  { label: 'Trimming',                   color: '#558B2F', icon: '✂️', step: 10 },
  // Finalization
  QUALITY_CHECK:             { label: 'Quality Check',              color: '#2E7D32', icon: '🔍', step: 11 },
  PAYMENT_INVOICING:         { label: 'Payment / Invoicing',        color: '#00695C', icon: '💰', step: 12 },
  // Dispatch
  READY_TO_DISPATCH:         { label: 'Ready to Dispatch',          color: '#00897B', icon: '📦', step: 13 },
  OUT_FOR_DELIVERY:          { label: 'Out for Delivery',           color: '#EF6C00', icon: '🚚', step: 14 },
  DELIVERED:                 { label: 'Delivered',                  color: '#1B5E20', icon: '✅', step: 15 },
  // Exceptions
  ON_HOLD:                   { label: 'On Hold',                    color: '#B71C1C', icon: '⏸️', step: -1 },
  REMAKE:                    { label: 'Remake',                     color: '#6A1B9A', icon: '🔄', step: -2 },
  CANCELLED:                 { label: 'Cancelled',                  color: '#424242', icon: '❌', step: -3 },
};

export const PAYMENT_STATUS = {
  PENDING:             { label: 'No Request Yet',    color: Colors.text3, bg: Colors.surface2 },
  PAYMENT_REQUESTED:   { label: 'Payment Requested', color: Colors.blue,  bg: 'rgba(21,101,192,0.10)' },
  SCREENSHOT_UPLOADED: { label: 'Awaiting Review',   color: Colors.amber, bg: Colors.amberDim },
  VERIFIED:            { label: 'Payment Verified',  color: Colors.green, bg: Colors.greenDim },
  REJECTED:            { label: 'Payment Rejected',  color: Colors.red,   bg: Colors.redDim },
};
