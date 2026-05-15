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
  RECEIVED:          { label: 'Received',          color: '#5C6BC0', icon: '📥', step: 0 },
  IMPRESSION:        { label: 'Diecutting',         color: '#7B1FA2', icon: '✂️',  step: 1 },
  CASTING:           { label: 'Casting',            color: '#E65100', icon: '🔥', step: 2 },
  FABRICATION:       { label: 'CAD CAM Milling',    color: '#1565C0', icon: '🖥️', step: 3 },
  QUALITY_CHECK:     { label: 'Quality Check',      color: '#2E7D32', icon: '🔍', step: 4 },
  READY_TO_DISPATCH: { label: 'Ready to Dispatch',  color: '#00897B', icon: '📦', step: 5 },
  OUT_FOR_DELIVERY:  { label: 'Out for Delivery',   color: '#F57F17', icon: '🚚', step: 6 },
  DELIVERED:         { label: 'Delivered',           color: '#1B5E20', icon: '✅', step: 7 },
  ON_HOLD:           { label: 'On Hold',            color: '#B71C1C', icon: '⏸️', step: -1 },
};

export const PAYMENT_STATUS = {
  PENDING:             { label: 'Payment Pending',   color: Colors.amber, bg: Colors.amberDim },
  SCREENSHOT_UPLOADED: { label: 'Awaiting Review',   color: Colors.blue,  bg: 'rgba(21,101,192,0.10)' },
  VERIFIED:            { label: 'Payment Verified',  color: Colors.green, bg: Colors.greenDim },
  REJECTED:            { label: 'Payment Rejected',  color: Colors.red,   bg: Colors.redDim },
};
