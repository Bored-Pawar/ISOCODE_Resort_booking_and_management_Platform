import type { SimChannel } from "./schema";

export type Preset = {
  id: string;
  label: string;
  channel: SimChannel;
  name: string;
  /** Synthetic contact. Presets never carry real people. */
  contact: string;
  message: string;
};

/** ENQ-4410 to 4412 are verbatim from the brief (also the seed). The rest are the tricky cases. */
export const PRESETS: readonly Preset[] = [
  {
    id: "4410",
    label: "ENQ-4410 Wedding",
    channel: "email",
    name: "Meera Nair",
    contact: "meera.sim@example.com",
    message: "Venue for my sister's wedding in Feb 2027, about 250 guests, 2 nights",
  },
  {
    id: "4411",
    label: "ENQ-4411 Villa",
    channel: "whatsapp",
    name: "Rohit Shetty",
    contact: "+919000000001",
    message: "Is a villa free 14-16 Nov for 2 adults and a child?",
  },
  {
    id: "4412",
    label: "ENQ-4412 Offsite",
    channel: "email",
    name: "Kavya Rao",
    contact: "kavya.sim@example.com",
    message: "Team of 45 wants a January offsite with a conference hall",
  },
  {
    id: "complaint",
    label: "Complaint",
    channel: "email",
    name: "Suresh Iyer",
    contact: "suresh.sim@example.com",
    message:
      "We stayed last weekend. The AC in our room did not work all night and nobody answered the front desk. I want a refund for the night.",
  },
  {
    id: "hinglish",
    label: "Hinglish",
    channel: "whatsapp",
    name: "Pooja Verma",
    contact: "+919000000002",
    message: "Bhaiya 20-22 December ke liye ek family room milega kya? 4 log hain, 2 bachche.",
  },
  {
    id: "vague",
    label: "Vague",
    channel: "whatsapp",
    name: "Dev Kapoor",
    contact: "+919000000003",
    message:
      "Hi, looking for something nice for a weekend sometime soon. Not sure yet. What do you have?",
  },
];
