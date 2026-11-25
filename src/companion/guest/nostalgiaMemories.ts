export type NostalgiaMemory = {
  id: string;
  person: 'Anand' | 'Susmita';
  title: string;
  caption: string;
  alt: string;
  width: number;
  height: number;
};

// Album order is editorial, not a dated timeline. Captions describe the pictures;
// the family has not supplied dates, ages or the names of other people pictured.
export const nostalgiaMemories: NostalgiaMemory[] = [
  { id: 'anand-little-gentleman', person: 'Anand', title: 'The little gentleman',
    caption: 'A tiny suit. A very serious pose.',
    alt: 'A childhood studio portrait of Anand in a suit, standing beside a vase of red flowers.', width: 1045, height: 1506 },
  { id: 'anand-birthday', person: 'Anand', title: 'A birthday to keep',
    caption: 'Cake, company and a whole lot of happiness.',
    alt: 'Anand as a small child at a birthday celebration, surrounded by other children and a birthday cake.', width: 1536, height: 1024 },
  { id: 'anand-kitchen', person: 'Anand', title: 'Right at home',
    caption: 'Little feet in the middle of everyday family life.',
    alt: 'A toddler standing with family in a kitchen with a red floor and shelves of utensils.', width: 1031, height: 1526 },
  { id: 'anand-family', person: 'Anand', title: 'All together',
    caption: 'Everyone in place for the family photograph.',
    alt: 'A family studio portrait with young Anand between two adults against a teal backdrop.', width: 1571, height: 1001 },
  { id: 'anand-home', person: 'Anand', title: 'The ordinary, lovely days',
    caption: 'The kind of moment a family album keeps forever.',
    alt: 'A candid family photograph in a kitchen, with women and small children near the doorway.', width: 1086, height: 1448 },
  { id: 'anand-school', person: 'Anand', title: 'A moment of pride',
    caption: 'A school celebration, saved for the years ahead.',
    alt: 'Anand receiving a school award from a group of adults gathered behind a table.', width: 1600, height: 1027 },
  { id: 'susmita-flowers', person: 'Susmita', title: 'A little flower girl',
    caption: 'Dressed up, with flowers close at hand.',
    alt: 'Young Susmita in a maroon dress, posing beside a tall stand of flowers.', width: 1086, height: 1448 },
  { id: 'susmita-terrace', person: 'Susmita', title: 'Small steps, sunny days',
    caption: 'A sunny terrace and a little world to explore.',
    alt: 'Susmita as a toddler wearing a sun hat and grey dress on a bright terrace.', width: 1218, height: 1292 },
  { id: 'susmita-festive', person: 'Susmita', title: 'Dressed for the album',
    caption: 'Three little faces, all ready for their photograph.',
    alt: 'Three children in festive clothes, standing together for a studio portrait against a blue backdrop.', width: 1086, height: 1448 },
  { id: 'susmita-balcony', person: 'Susmita', title: 'A balcony kind of afternoon',
    caption: 'A maroon dress and a garden of green.',
    alt: 'Young Susmita in a maroon dress, standing on a balcony among potted plants.', width: 1086, height: 1448 },
  { id: 'susmita-yellow', person: 'Susmita', title: 'A little sunshine',
    caption: 'Yellow, a little sparkle and a picture to treasure.',
    alt: 'Young Susmita seated in a bright yellow dress, holding a sheer veil against a blue studio backdrop.', width: 1448, height: 1086 },
  { id: 'susmita-puppy', person: 'Susmita', title: 'A small, furry friend',
    caption: 'Childhood company, with a puppy in the picture.',
    alt: 'A toddler seated on a chair beside an older child holding a small black-and-white puppy.', width: 1364, height: 1153 },
  { id: 'susmita-singing', person: 'Susmita', title: 'Her moment at the mic',
    caption: 'A microphone, a pink dress and a room to sing to.',
    alt: 'Young Susmita in a pink dress singing into a microphone at a gathering, with seated adults behind her.', width: 1448, height: 1086 },
];

export const nostalgiaAlbums = [
  { person: 'Anand', number: '01', eyebrow: 'Before he was the groom', description: 'Birthday candles, family days and a little suit with a lot of character.' },
  { person: 'Susmita', number: '02', eyebrow: 'Before she was the bride', description: 'Sunny afternoons, dress-up days and a little voice finding its song.' },
] as const;

export const memoryImage = (memory: NostalgiaMemory, size?: 480 | 960) => `/images/nostalgia/${memory.id}${size ? `-${size}` : ''}.jpg`;
export const memorySrcSet = (memory: NostalgiaMemory) => `${memoryImage(memory, 480)} 480w, ${memoryImage(memory, 960)} 960w`;
