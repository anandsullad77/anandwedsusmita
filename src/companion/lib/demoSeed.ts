// Seed for the local demo backend: Anand & Susmita's wedding (pilot).
// Names of guests are fictional sample data.
import type { AdminHousehold, EventInfo, Fn } from './types';

export const DEMO_PIN = '291126';

export const demoEvent: EventInfo = {
  id: 'evt-anand-susmita',
  slug: 'anand-susmita',
  title: "Anand & Susmita's wedding",
  coupleA: 'Anand',
  coupleB: 'Susmita',
  startsAt: '2026-11-29T12:28:00+05:30',
  venue: 'Shri Shakambari Mangal Karyalaya, Hosakeri Galli, Sulebhavi, Belagavi',
  mapUrl: 'https://maps.app.goo.gl/CzVGfb7yyeYVoxam6',
  hostWhatsapp: '',
  theme: {
    primary: '#A53051', deep: '#283A2D', paper: '#FFF7EB', card: '#F9F0E0', ink: '#2A2320', muted: '#6B5E57',
    monogram: '/images/as-monogram.svg', portrait: '/images/wedding-couple-pink-green.png', place: 'Sulebhavi',
    travelPoints: { train: 'Belagavi Railway Station', bus: 'Belagavi CBT bus stand', car: 'Driving straight to Sulebhavi', flight: 'Belagavi Airport (Sambra)' }
  }
};

export const demoFunctions: Fn[] = [
  { id: 'fn-muhurta', nameEn: 'Muhurta & Akshate', nameKn: 'ಮುಹೂರ್ತ', startsAt: '2026-11-29T12:28:00+05:30', venue: 'Sulebhavi' }
];

const p = (id: string, name: string, extra: Partial<AdminHousehold['people'][number]> = {}) =>
  ({ id, name, isChild: false, attending: [], addedBy: 'host' as const, relation: null, phone: null, ...extra });

export const demoHouseholds: AdminHousehold[] = [
  {
    id: 'hh-kulkarni', name: 'Kulkarni family', token: 'kulkarni', cap: 6, coming: null, travel: null, stay: null,
    updatedAt: '2026-11-16T09:00:00+05:30', side: 'Groom', invitedBy: 'Hema', inviteStatus: 'sent', source: 'list',
    functionIds: ['fn-muhurta'],
    people: [p('pp-ramesh', 'Ramesh', { phone: '9845012345' }), p('pp-savita', 'Savita'), p('pp-ajji', 'Lakshmamma'),
             p('pp-arjun', 'Arjun', { isChild: true })]
  },
  {
    id: 'hh-hunashyal', name: 'Hunashyal family', token: 'hunashyal', cap: 4, coming: 'yes',
    travel: { mode: 'train', point: 'Belagavi Railway Station', window: 'Sat evening' }, stay: { nights: ['sat'], manage: false },
    updatedAt: '2026-11-15T19:00:00+05:30', side: 'Groom', invitedBy: 'Vishnu', inviteStatus: 'responded', source: 'list',
    functionIds: ['fn-muhurta'],
    people: [p('pp-vinay', 'Vinay', { attending: ['fn-muhurta'], phone: '9900112212' }), p('pp-deepa', 'Deepa', { attending: ['fn-muhurta'] }),
             p('pp-tanu', 'Tanu', { attending: ['fn-muhurta'], isChild: true })]
  },
  {
    id: 'hh-desai', name: 'Desai family', token: 'desai', cap: 4, coming: null, travel: null, stay: null,
    updatedAt: '2026-11-14T10:00:00+05:30', side: 'Bride', invitedBy: 'Poornima', inviteStatus: 'opened', source: 'list',
    functionIds: ['fn-muhurta'], people: [p('pp-meera', 'Meera', { phone: '9741100080' }), p('pp-kiran', 'Kiran')]
  },
  {
    id: 'hh-pitagi', name: 'Pitagi family (Belagavi)', token: 'pitagi', cap: 6, coming: null, travel: null, stay: null,
    updatedAt: '2026-11-14T10:00:00+05:30', side: 'Bride', invitedBy: 'Ramaling', inviteStatus: 'not_sent', source: 'list',
    functionIds: ['fn-muhurta'], people: [p('pp-shankar', 'Shankar', { phone: '9448000033' })]
  }
];
