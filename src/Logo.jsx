import logo from './public/ccglogo.png';

// Shared brand mark — logo image + "HR" wordmark, used on the login screen,
// the set-password screen, the initial "checking session" loading screen,
// and the main dashboard header. Expects the logo file to already exist at
// src/public/ccglogo.png (Vite bundles images imported from anywhere under
// src/, not just the root public/ folder, so this works without any extra
// config).
export default function Logo({ height = 28 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <img src={logo} alt="CCG" style={{ height, display: 'block' }} />
      <span style={{ fontWeight: 700, fontSize: Math.round(height * 0.7) }}>HR</span>
    </div>
  );
}
