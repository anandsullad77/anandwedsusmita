export const DUEL_QUESTIONS = [
  "Who is more likely to plan a trekking adventure?",
  "Who is more likely to have peanuts in their bag?",
  "Who would experiment with chocolate inside a roti for breakfast?",
  "Who would travel across the city just for Naturals ice cream?",
  "Who would turn a random question into a full research project?",
  "Who would turn a small disagreement into a courtroom drama?",
  "Who would travel to Antarctica just to meet a penguin?",
  "Who would call a six-hour trek a relaxing weekend?",
  "Who would choose a holiday destination based on its local food?",
  "Who would plan the next vacation before returning from the current one?",
  "Who would create an Excel sheet to settle a household argument?",
  "Who would randomly start discussing their retirement plans at midnight?"
] as const;

export const QUIZ_QUESTIONS = [
  {
    "question": "Anand and Susmita share a funny childhood memory involving pencils, paper and a little creativity. Which competition was it?",
    "options": ["Singing", "Drawing", "Dancing", "Running"]
  },
  {
    "question": "Despite their different eating habits, they both agree that nothing beats this round, homemade Indian staple. What is it?",
    "options": ["Pizza", "Biryani", "Roti", "Dosa"]
  },
  {
    "question": "Susmita's favourite fruit comes with its own natural packaging — no knife, no preparation, just peel and enjoy. Which fruit is it?",
    "options": ["Mango", "Watermelon", "Banana", "Pineapple"]
  },
  {
    "question": "Susmita's dream adventure involves going beneath the waves and getting surprisingly close to some of the ocean's most feared creatures. What is it?",
    "options": ["Skydiving", "Scuba diving with sharks", "Desert safari", "Bungee jumping"]
  },
  {
    "question": "For Susmita, the adventure isn't just about reaching the destination. It's about experiencing the journey by land, air and water. What makes a trip particularly exciting for her?",
    "options": ["Luxury hotels", "Shopping malls", "Different modes of transport", "Room service"]
  },
  {
    "question": "Susmita loves an animal that wears a natural tuxedo, waddles around and cannot fly. Which one?",
    "options": ["Panda", "Penguin", "Dolphin", "Rabbit"]
  },
  {
    "question": "For Anand, the perfect weekend morning involves no alarms, no plans and absolutely no rush. What is his favourite morning activity?",
    "options": ["Going for a run", "Making breakfast", "Sleeping until noon", "Reading the newspaper"]
  },
  {
    "question": "Anand loves experimenting with food, even if it means breaking a few culinary rules. Which unusual combination could he happily try?",
    "options": ["Chocolate roti", "Ice cream biryani", "Coffee dosa", "Banana pizza"]
  },
  {
    "question": "Anand's idea of an adventure involves challenging trails, tired legs and breathtaking views. What is his favourite outdoor activity?",
    "options": ["Fishing", "Trekking", "Cycling", "Surfing"]
  }
] as const;

// Real answer keys stay in PostgreSQL. Vite removes these local demo keys from production builds.
export const DEMO_QUIZ_ANSWERS = import.meta.env.DEV ? [1, 2, 2, 1, 2, 1, 2, 0, 1] as const : null;

export const PREDICTION_QUESTIONS = [
  {
    "question": "Which adventure will they tick off their bucket list first?",
    "options": ["Meghalaya", "Andaman scuba diving", "Himalayan trek", "Penguin spotting"]
  },
  {
    "question": "What will be their most frequent food debate?",
    "options": ["Mixing food", "What to order", "Roti vs chapati", "Which ice cream flavour"]
  },
  {
    "question": "What will always be stocked in their kitchen?",
    "options": ["Peanuts", "Tea", "Bananas", "All of the above"]
  },
  {
    "question": "What will their perfect Sunday look like?",
    "options": ["Sleeping till noon", "Trekking", "Food exploration", "Endless conversations"]
  },
  {
    "question": "What will their first holiday disagreement be about?",
    "options": ["Destination", "Packing", "Transportation", "Taking too many photos"]
  },
  {
    "question": "What will become their favourite travel tradition?",
    "options": ["Exploring local food", "Visiting temples", "Finding hidden places", "Taking scenic train journeys"]
  },
  {
    "question": "What will they still be doing at 70?",
    "options": ["Sending GIFs", "Arguing about food", "Planning trips", "Teasing each other"]
  },
  {
    "question": "What will their future home have too much of?",
    "options": ["Penguin collectibles", "Travel souvenirs", "Photographs", "Snacks"]
  },
  {
    "question": "What will be the title of their marriage book?",
    "options": ["Married & Still Arguing", "The Roti Chronicles", "Two People, Endless GIFs", "The Magic Continues"]
  }
] as const;
