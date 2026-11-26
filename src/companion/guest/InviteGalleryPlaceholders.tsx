import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

// Drawn stand-ins for a visitor who is not signed in: no guest photo or wish leaves the album.
const GOLD = '#D9A441', ROSE = '#A53051', IVORY = '#FFF7EB', DEEP = '#283A2D', CORE = '#C0702A';

function Marigold({ x, y, r, color = GOLD }: { x: number; y: number; r: number; color?: string }) {
  return <g>
    {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={x + r * .55 * Math.cos(i * Math.PI / 4)} cy={y + r * .55 * Math.sin(i * Math.PI / 4)} r={r * .5} fill={color} />)}
    <circle cx={x} cy={y} r={r * .45} fill={CORE} />
  </g>;
}

function Art({ children, background }: { children: ReactNode; background: string }) {
  return <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true" focusable="false"><rect width="100" height="100" fill={background} />{children}</svg>;
}

const side = Array.from({ length: 9 }, (_, i) => 24 + i * 9);
const Mandap = () => <Art background={DEEP}>
  <path d="M18 100V52a32 32 0 0 1 64 0v48" fill="none" stroke={GOLD} strokeWidth="3" />
  <path d="M27 100V54a23 23 0 0 1 46 0v46" fill="none" stroke={GOLD} strokeOpacity=".45" strokeWidth="1.5" />
  {Array.from({ length: 9 }, (_, i) => 6 + i * 11).map(x => <Marigold key={`t${x}`} x={x} y={8 + 6 * Math.sin(x / 100 * Math.PI)} r={4} />)}
  {side.map(y => <Marigold key={`l${y}`} x={18} y={y} r={3} />)}
  {side.map(y => <Marigold key={`r${y}`} x={82} y={y} r={3} />)}
  <circle cx="50" cy="70" r="7" fill={ROSE} opacity=".9" /><path d="M50 58c3 4 3 7 0 9-3-2-3-5 0-9z" fill={GOLD} />
</Art>;
const Rings = () => <Art background="#F3DDE2">
  <circle cx="40" cy="55" r="18" fill="none" stroke={GOLD} strokeWidth="5" /><circle cx="60" cy="55" r="18" fill="none" stroke="#C9A55A" strokeWidth="5" />
  <path d="M40 32l5-6h-10z" fill={ROSE} />
</Art>;
const Diya = () => <Art background="#F6ECDB">
  <path d="M22 60h56c-4 14-16 20-28 20s-24-6-28-20z" fill={CORE} /><path d="M22 60h56" stroke="#8A4A1C" strokeWidth="2" />
  <path d="M50 30c8 10 8 20 0 26-8-6-8-16 0-26z" fill={GOLD} /><path d="M50 40c3 5 3 10 0 13-3-3-3-8 0-13z" fill={IVORY} />
</Art>;
const Flowers = () => <Art background={ROSE}>
  <Marigold x={32} y={36} r={14} /><Marigold x={68} y={62} r={16} color="#E8B54F" /><Marigold x={30} y={78} r={9} color="#F3DDE2" /><Marigold x={76} y={22} r={8} color="#F3DDE2" />
</Art>;

const Lines = ({ widths }: { widths: number[] }) => <div className="invite-wish-lines" aria-hidden="true">{widths.map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}</div>;

export default function InviteGalleryPlaceholders({ feed }: { feed: string }) {
  return <div className="invite-mosaic invite-mosaic-locked">
    <Link to={feed} className="invite-tile p1" aria-label="Photos from the wedding, sign in to see them"><Mandap /><span className="invite-tile-badge">Photos inside</span></Link>
    <Link to={feed} className="invite-tile invite-wish w1" aria-label="Wishes for the couple, sign in to read them"><Icon size={20} d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /><Lines widths={[90, 70, 45]} /><small>Wishes inside</small></Link>
    <Link to={feed} className="invite-tile p2" tabIndex={-1} aria-hidden="true"><Rings /></Link>
    <Link to={feed} className="invite-tile p3" tabIndex={-1} aria-hidden="true"><Diya /></Link>
    <Link to={feed} className="invite-tile invite-wish invite-wish-prompt w2" tabIndex={-1} aria-hidden="true"><Lines widths={[85, 60]} /><small>Sign in to read them</small></Link>
    <Link to={feed} className="invite-tile p4" tabIndex={-1} aria-hidden="true"><Flowers /></Link>
    <Link to={feed} className="invite-tile invite-see-all p5"><Icon size={20} d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />More inside</Link>
  </div>;
}
