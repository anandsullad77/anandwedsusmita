// Shared botanical detail for the main invitation and companion cover.
export default function PortraitSprig({ className = '' }: { className?: string }) {
  return <svg className={`portrait-sprig ${className}`} viewBox="0 0 80 142" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M63 134C28 106 23 63 37 10M42 111C28 97 15 91 5 92M33 83C47 68 59 63 73 64M30 61C18 47 10 34 12 23M33 37C46 30 57 19 58 6" />
      <path d="M35 99C17 99 9 91 5 80C22 81 31 87 35 99ZM31 79C17 74 12 65 13 53C26 59 31 67 31 79ZM31 58C19 49 17 38 21 28C32 38 35 47 31 58ZM34 34C30 21 33 10 40 3C46 17 44 27 34 34ZM34 83C39 68 49 60 61 58C57 73 48 81 34 83ZM37 62C43 47 53 42 65 43C59 56 49 63 37 62ZM43 31C45 17 52 8 62 5C62 18 55 27 43 31Z" fill="currentColor" fillOpacity=".1" />
    </g>
    <g className="portrait-blossoms" fill="currentColor">
      <path d="M10 91C0 82 4 73 12 80C15 67 24 70 20 82C32 79 34 89 22 92C28 102 18 107 15 96C7 105 0 98 10 91Z" />
      <path d="M57 107C49 100 52 94 58 98C60 88 67 90 64 100C74 97 75 104 66 107C71 115 63 118 61 110C55 117 50 112 57 107Z" />
    </g>
    <g fill="var(--ivory)"><circle cx="16" cy="87" r="2" /><circle cx="61" cy="104" r="1.5" /></g>
  </svg>;
}
