const { VITE_CSP, CSP_REPORT_URL } = process.env;

export const cspReportUrl = CSP_REPORT_URL || '/csp-report';
export const cspEnabled = VITE_CSP === 'block' || VITE_CSP === 'report';
export const reportOnly = VITE_CSP === 'report';

export default {
  cspReportUrl,
  cspEnabled,
  reportOnly,
};
