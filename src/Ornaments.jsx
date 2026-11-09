import React from 'react';

export function Icon({ name, size = 20, ...props }) {
  const paths = {
    arrow: <path d="M4 12h15M13 6l6 6-6 6" />,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M16 3v4M8 3v4M4 11h16M8 15h2M14 15h2" /></>,
    pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    download: <path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" />,
    menu: <path d="M4 8h16M4 16h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    external: <path d="M14 4h6v6m0-6L10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export function Monogram({ className = '' }) {
  return <img className={`monogram ${className}`} src="/images/as-monogram.svg" alt="Anand and Susmita monogram" width="150" height="150" />;
}

export function TextileBorder({ className = '' }) {
  return <div className={`textile-border ${className}`} aria-hidden="true" />;
}

export function Kolam({ className = '' }) {
  return <svg className={`kolam ${className}`} viewBox="0 0 110 110" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round">
    <path d="m55 7 48 48-48 48L7 55Z" /><path d="m55 19 36 36-36 36-36-36Z" />
    <path d="m55 31 24 24-24 24-24-24Z" /><path d="m55 43 12 12-12 12-12-12Z" />
    <path d="M43 19c-12-13-25 1-12 12l48 48c13 13 26-1 12-12L43 19ZM19 43c-13-12 1-25 12-12l48 48c13 13-1 26-12 12L19 43Z" />
    <path d="M67 19c12-13 25 1 12 12L31 79c-13 13-26-1-12-12l48-48ZM91 43c13-12-1-25-12-12L31 79c-13 13 1 26 12 12l48-48Z" />
  </g><g fill="currentColor">{[[55,7],[31,31],[55,31],[79,31],[7,55],[31,55],[55,55],[79,55],[103,55],[31,79],[55,79],[79,79],[55,103]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" />)}</g></svg>;
}

export function Divider() {
  return <div className="ornament-divider" aria-hidden="true"><span /><Kolam /><span /></div>;
}

export function Ganesha() {
  return <svg className="ganesha" viewBox="0 0 88 90" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M32 25c-1-12 25-12 24 0M29 22l6-11 9-6 9 6 6 11M35 13h18M29 30c-20-14-29 16-13 26 4 2 10-1 12-8M59 30c20-14 29 16 13 26-4 2-10-1-12-8M30 30c-4 11 2 22 11 23v14c0 13 19 11 17-1-1-5-7-5-7-1M58 30c4 11-2 22-11 23M35 37h2m14 0h2M32 56c-12 4-15 17-8 22h40c7-5 4-18-8-22M25 67l-9 11M63 67l9 11M20 83h48" /><path d="m42 27 2 4 2-4" /></g></svg>;
}

export function Temple() {
  return <svg className="temple" viewBox="0 0 400 350" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M56 307h288M72 295h256M88 281h224M110 278V146m180 132V146M101 146h198M95 132h210M88 120h224M110 120l90-86 90 86M133 98h134M156 76h88M178 55h44M200 34V14m-7 6h14M126 146v132m148-132v132M112 163h14m148 0h16M112 254h14m148 0h16M149 278v-79c0-41 51-55 51-55s51 14 51 55v79M159 278v-77c0-32 41-46 41-46s41 14 41 46v77M174 278v-69c0-22 26-35 26-35s26 13 26 35v69M187 278v-48h26v48M101 139h198" /><path d="M49 281v-57m-12 15c-7-21 1-37 12-43 11 6 19 22 12 43m-12-2c-21-2-28-17-26-29 14-3 25 8 26 29Zm0 0c21-2 28-17 26-29-14-3-25 8-26 29ZM351 281v-57m-12 15c-7-21 1-37 12-43 11 6 19 22 12 43m-12-2c-21-2-28-17-26-29 14-3 25 8 26 29Zm0 0c21-2 28-17 26-29-14-3-25 8-26 29Z" /><circle cx="200" cy="109" r="7" /><path d="M153 131v12m23-12v17m24-17v20m24-20v17m23-17v12M78 320h244" /></g></svg>;
}
