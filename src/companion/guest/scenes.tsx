// Banni world: "Temple hall / Kalyana mantapa" (placeholder art).
// Every fill uses a colour slot class so a world recolours per couple (see banni.css).
const S = { width: '100%', height: '100%', display: 'block' } as const;
const VB = '0 0 390 844';
const PAR = 'xMidYMid slice';

export function OpenArt() {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-sky" width="390" height="844" />
      <circle className="f-gold-l" cx="195" cy="330" r="70" />
      <path className="f-sage" d="M0 420 Q100 340 200 400 T390 380 V844 H0Z" />
      <path className="f-sage2" d="M0 470 Q120 410 240 460 T390 450 V844 H0Z" />
      <rect className="f-card" y="520" width="390" height="324" />
    </svg>
  );
}

export function BlessArt() {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-sand" width="390" height="844" />
      <path className="f-primary" d="M80 480 V240 Q195 70 310 240 V480Z" />
      <path className="f-primary-d" d="M112 480 V252 Q195 120 278 252 V480Z" />
      <g className="f-gold">{[40, 80, 120, 160, 200, 240, 280, 320, 360].map((x, i) => <circle key={x} cx={x} cy={96 + Math.sin((i / 8) * Math.PI) * 25} r="9" />)}</g>
      <g className="sway"><path className="s-primary" d="M100 110 v40 M195 122 v46 M290 112 v40" strokeWidth="3" /><circle className="f-gold-l" cx="100" cy="156" r="7" /><circle className="f-gold-l" cx="195" cy="172" r="7" /><circle className="f-gold-l" cx="290" cy="158" r="7" /></g>
      <path className="f-gold" d="M160 470 h70 c-4 16 -18 24 -35 24 s-31 -8 -35 -24z" />
      <path className="flame f-gold-l" d="M195 420 c8 14 12 22 12 30 a12 12 0 0 1 -24 0 c0 -8 4 -16 12 -30z" />
      <rect className="f-card" y="500" width="390" height="344" />
    </svg>
  );
}

export function CoupleArt({ portrait }: { portrait?: string }) {
  return (
    <div style={{ ...S, position: 'relative', background: 'var(--card)' }} aria-hidden="true">
      <svg viewBox="0 0 390 120" style={{ position: 'absolute', left: 0, top: 30, width: '100%' }}>
        <g className="f-gold">{[70, 100, 135, 175, 215, 255, 290, 320].map((x, i) => <circle key={x} cx={x} cy={[70, 46, 28, 18, 18, 28, 46, 70][i]} r="8" />)}</g>
      </svg>
      <div className="arch-window">{portrait && <img src={portrait} alt="" />}</div>
    </div>
  );
}

export function GateArt({ sign }: { sign: string }) {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-sky" width="390" height="844" />
      <path className="f-sage" d="M0 290 Q100 250 200 280 T390 270 V844 H0Z" />
      <g transform="translate(0,-90)">
        <path className="f-leaf" d="M20 470 q20 -90 10 -170 q30 60 24 170z M40 470 q-10 -70 -36 -130 q46 30 52 130z" />
        <path className="f-leaf" d="M370 470 q-20 -90 -10 -170 q-30 60 -24 170z M350 470 q10 -70 36 -130 q-46 30 -52 130z" />
        <rect className="f-primary" x="74" y="190" width="44" height="300" />
        <rect className="f-primary" x="272" y="190" width="44" height="300" />
        <path className="f-primary-d" d="M62 196 Q195 96 328 196 V226 Q195 136 62 226Z" />
        <rect className="f-paper" x="118" y="120" width="154" height="40" rx="6" />
        <text x="195" y="146" textAnchor="middle" fontSize="13" fontWeight="700" className="f-deep" fontFamily="Noto Sans Kannada, sans-serif">{sign}</text>
        <path className="f-deep" d="M118 490 V250 Q195 186 272 250 V490Z" />
        <g className="sway"><path className="s-gold" d="M118 236 Q195 290 272 236" fill="none" strokeWidth="10" strokeDasharray="1 13" strokeLinecap="round" /></g>
        <rect className="f-card" y="490" width="390" height="460" />
        <path className="f-sand" d="M150 490 L120 520 H270 L240 490Z" />
      </g>
    </svg>
  );
}

export function HallArt() {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-night" width="390" height="844" />
      <path className="f-deep-l" d="M0 0 H390 L250 180 H140Z" />
      <circle className="s-gold" cx="195" cy="70" r="40" fill="none" strokeWidth="3" />
      <circle className="s-primary" cx="195" cy="70" r="22" fill="none" strokeWidth="3" />
      <rect className="f-sky" x="150" y="180" width="90" height="120" />
      <path className="f-deep" d="M0 0 L140 180 V300 L0 520Z" />
      <path className="f-deep" d="M390 0 L250 180 V300 L390 520Z" />
      <g className="f-primary"><rect x="18" y="40" width="22" height="440" /><rect x="78" y="110" width="16" height="290" /><rect x="118" y="160" width="10" height="170" /><rect x="350" y="40" width="22" height="440" /><rect x="296" y="110" width="16" height="290" /><rect x="262" y="160" width="10" height="170" /></g>
      <g className="sway"><path className="s-gold" d="M60 30 v150 M110 60 v110 M280 60 v110 M330 30 v150" strokeWidth="9" strokeDasharray="1 12" strokeLinecap="round" /></g>
      <path className="f-deep-l" d="M140 300 H250 L390 520 V844 H0 V520Z" />
    </svg>
  );
}

export function JourneyArt() {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-sky" width="390" height="844" />
      <circle className="f-gold-l" cx="300" cy="80" r="34" />
      <path className="f-sage" d="M0 200 Q90 150 180 190 T390 170 V844 H0Z" />
      <g className="f-primary"><rect x="30" y="182" width="34" height="14" rx="3" /><rect x="68" y="182" width="34" height="14" rx="3" /><rect x="106" y="182" width="34" height="14" rx="3" /></g>
      <path className="f-primary-d" d="M318 196 l12 -40 l12 40z" />
      <path className="f-sage2" d="M0 240 Q120 200 240 236 T390 226 V844 H0Z" />
      <rect className="f-card" y="270" width="390" height="574" />
    </svg>
  );
}

export function StayArt() {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-night2" width="390" height="844" />
      <g className="f-paper"><circle className="tw" cx="40" cy="60" r="2" /><circle cx="120" cy="40" r="1.5" /><circle className="tw" cx="210" cy="90" r="2" /><circle cx="330" cy="50" r="1.5" /><circle className="tw" cx="280" cy="140" r="2" /><circle cx="70" cy="170" r="1.5" /></g>
      <path className="f-gold-l" d="M320 90 a28 28 0 1 0 22 46 a22 22 0 1 1 -22 -46z" />
      <path className="f-deep" d="M95 330 L195 240 L295 330 V440 H95Z" />
      <path className="s-primary" d="M80 334 L195 230 L310 334" fill="none" strokeWidth="10" strokeLinejoin="round" />
      <rect className="f-gold" x="175" y="370" width="40" height="70" rx="4" />
      <rect className="f-gold-l" x="120" y="356" width="34" height="30" rx="3" />
      <rect className="f-gold-l" x="236" y="356" width="34" height="30" rx="3" />
      <path className="flame f-gold-l" d="M195 330 c5 9 8 14 8 19 a8 8 0 0 1 -16 0 c0 -5 3 -10 8 -19z" />
      <rect className="f-night3" y="440" width="390" height="404" />
    </svg>
  );
}

export function MandapArt() {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-deep" width="390" height="844" />
      <path className="f-primary" d="M0 0 H390 V70 Q370 100 350 70 Q330 100 310 70 Q290 100 270 70 Q250 100 230 70 Q210 100 195 70 Q180 100 160 70 Q140 100 120 70 Q100 100 80 70 Q60 100 40 70 Q20 100 0 70Z" />
      <rect className="f-primary-d" x="22" y="80" width="26" height="764" />
      <rect className="f-primary-d" x="342" y="80" width="26" height="764" />
      <g className="sway"><path className="s-gold" d="M48 96 Q195 200 342 96" fill="none" strokeWidth="12" strokeDasharray="1 15" strokeLinecap="round" /></g>
      <path className="f-leaf" d="M8 844 q14 -140 26 -260 q16 120 6 260z M380 844 q-14 -140 -26 -260 q-16 120 -6 260z" />
    </svg>
  );
}

export function KeepArt() {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-gold-xl" width="390" height="844" />
      <circle className="f-gold" cx="195" cy="170" r="60" />
      <path className="f-sage" d="M0 190 Q100 150 200 180 T390 170 V844 H0Z" />
      <path className="f-primary-d" d="M180 178 v-26 h30 v26z M188 152 l7 -12 l7 12z" />
      <rect className="f-paper" y="230" width="390" height="614" />
    </svg>
  );
}

export function WhoArt() {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-sand" width="390" height="844" />
      <g className="sway">{[30, 70, 110, 150, 195, 240, 280, 320, 360].map((x, i) => <circle key={x} className={i % 2 ? 'f-gold-l' : 'f-gold'} cx={x} cy={70 + Math.sin((i / 8) * Math.PI) * 30} r="10" />)}</g>
      <rect className="f-card" y="150" width="390" height="694" />
    </svg>
  );
}

export function WishArt() {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-sand" width="390" height="844" />
      <path className="f-primary" d="M120 300 V150 Q195 50 270 150 V300Z" />
      <path className="flame f-gold-l" d="M195 230 c8 14 12 22 12 30 a12 12 0 0 1 -24 0 c0 -8 4 -16 12 -30z" />
      <rect className="f-card" y="300" width="390" height="544" />
    </svg>
  );
}

export function LiveArt() {
  return (
    <svg style={S} viewBox={VB} preserveAspectRatio={PAR} aria-hidden="true">
      <rect className="f-deep" width="390" height="844" />
      <g className="f-gold-l"><circle className="tw" cx="60" cy="90" r="2" /><circle cx="140" cy="60" r="1.5" /><circle className="tw" cx="250" cy="110" r="2" /><circle cx="330" cy="70" r="1.5" /></g>
      <path className="f-primary" d="M0 0 H390 V60 Q360 90 330 60 Q300 90 270 60 Q240 90 210 60 Q180 90 150 60 Q120 90 90 60 Q60 90 30 60 Q15 80 0 60Z" />
    </svg>
  );
}
