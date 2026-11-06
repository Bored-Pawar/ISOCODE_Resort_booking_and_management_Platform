import type { Enquiry } from "./index";

const common = {
  channel: "web",
  senderContact: "demo@example.com",
  aiStatus: "ok",
  lane: "sorted",
  status: "new",
  isComplaint: false,
} as const;

/** The three enquiries from the brief, verbatim. */
export const enquiriesFixture: Enquiry[] = [
  {
    ...common,
    id: "ENQ-4410",
    senderName: "Meera Nair",
    channel: "email",
    rawText: "Venue for my sister's wedding in Feb 2027, about 250 guests, 2 nights",
    receivedAt: "2026-11-06T09:12:00.000Z",
    category: "wedding",
    confidence: 0.94,
    ownerRole: "sales",
    summary: "Wedding venue, Feb 2027, ~250 guests, 2 nights",
  },
  {
    ...common,
    id: "ENQ-4411",
    senderName: "Rohit Shetty",
    channel: "whatsapp",
    senderContact: "+910000000001",
    rawText: "Is a villa free 14-16 Nov for 2 adults and a child?",
    receivedAt: "2026-11-06T11:40:00.000Z",
    category: "room",
    confidence: 0.91,
    ownerRole: "reservations",
    summary: "Villa 14-16 Nov, 2 adults + 1 child",
  },
  {
    ...common,
    id: "ENQ-4412",
    senderName: "Kavya Rao",
    channel: "email",
    rawText: "Team of 45 wants a January offsite with a conference hall",
    receivedAt: "2026-11-06T14:05:00.000Z",
    category: "offsite",
    confidence: 0.88,
    ownerRole: "sales",
    summary: "Corporate offsite, January, 45 people, conference hall",
  },
];
