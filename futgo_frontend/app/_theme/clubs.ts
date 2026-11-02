export type ClubId =
  | "barcelona"
  | "madrid"
  | "manutd"
  | "mancity"
  | "bayern"
  | "chelsea"
  | "psg";

export type Club = {
  id: ClubId;
  name: string;
  short: string;
  /** [primary, secondary] preview colours for the picker */
  swatch: [string, string];
  brandTag: string;
  badge: string;
  /** Three hero lines; the last one gets the gradient */
  headline: [string, string, string];
  blurb: string;
  formation: string;
  stepTitles: [string, string, string];
  footerCheer: string;
};

export const CLUBS: Club[] = [
  {
    id: "barcelona",
    name: "FC Barcelona",
    short: "Barça",
    swatch: ["#a50044", "#004d98"],
    brandTag: "THE BLAUGRANA DRAFT",
    badge: "VISCA EL FUTBOL. YOUR PICKS. YOUR LEGACY.",
    headline: ["Més", "que un", "draft."],
    blurb: "Build your ultimate Blaugrana XI. Prove who really knows football.",
    formation: "TIKI-TAKA 4–3–3",
    stepTitles: ["Build your Blaugrana XI", "Outplay your rival", "Win the Clásico"],
    footerCheer: "Visca Barça!",
  },
  {
    id: "madrid",
    name: "Real Madrid",
    short: "Madrid",
    swatch: ["#febe10", "#00529f"],
    brandTag: "THE MADRIDISTA DRAFT",
    badge: "SIEMPRE REAL. YOUR PICKS. YOUR LEGACY.",
    headline: ["Hala", "Madrid,", "draft."],
    blurb: "Build your ultimate Galáctico XI. Prove who really knows football.",
    formation: "GALÁCTICO 4–3–3",
    stepTitles: ["Build your Galáctico XI", "Outplay your rival", "Win El Clásico"],
    footerCheer: "Hala Madrid!",
  },
  {
    id: "manutd",
    name: "Manchester United",
    short: "Man Utd",
    swatch: ["#da291c", "#fbe122"],
    brandTag: "THE RED DEVILS DRAFT",
    badge: "GLORY GLORY. YOUR PICKS. YOUR LEGACY.",
    headline: ["Glory", "glory,", "draft."],
    blurb: "Build your ultimate Red Devils XI. Prove who really knows football.",
    formation: "RED DEVILS 4–3–3",
    stepTitles: ["Build your Red Devils XI", "Outplay your rival", "Win the Derby"],
    footerCheer: "Glory Glory Man United!",
  },
  {
    id: "mancity",
    name: "Manchester City",
    short: "Man City",
    swatch: ["#6cabdd", "#1c2c5b"],
    brandTag: "THE CITIZENS DRAFT",
    badge: "BLUE MOON RISING. YOUR PICKS. YOUR LEGACY.",
    headline: ["Rise", "of the", "Blues."],
    blurb: "Build your ultimate Citizens XI. Prove who really knows football.",
    formation: "POSITIONAL 4–3–3",
    stepTitles: ["Build your Citizens XI", "Outplay your rival", "Win the Derby"],
    footerCheer: "Blue Moon!",
  },
  {
    id: "bayern",
    name: "Bayern Munich",
    short: "Bayern",
    swatch: ["#dc052d", "#0066b2"],
    brandTag: "THE BAVARIAN DRAFT",
    badge: "MIA SAN MIA. YOUR PICKS. YOUR LEGACY.",
    headline: ["Mia san", "mia,", "draft."],
    blurb: "Build your ultimate Bavarian XI. Prove who really knows football.",
    formation: "BAVARIAN 4–3–3",
    stepTitles: ["Build your Bavarian XI", "Outplay your rival", "Win Der Klassiker"],
    footerCheer: "Mia san Mia!",
  },
  {
    id: "chelsea",
    name: "Chelsea",
    short: "Chelsea",
    swatch: ["#034694", "#dba111"],
    brandTag: "THE BLUES DRAFT",
    badge: "KEEP THE BLUE FLAG FLYING. YOUR PICKS. YOUR LEGACY.",
    headline: ["Keep the", "blue flag", "flying."],
    blurb: "Build your ultimate Blues XI. Prove who really knows football.",
    formation: "LONDON 4–3–3",
    stepTitles: ["Build your Blues XI", "Outplay your rival", "Win the London Derby"],
    footerCheer: "Come on you Blues!",
  },
  {
    id: "psg",
    name: "Paris Saint-Germain",
    short: "PSG",
    swatch: ["#004170", "#da291c"],
    brandTag: "THE PARISIAN DRAFT",
    badge: "ICI C'EST PARIS. YOUR PICKS. YOUR LEGACY.",
    headline: ["Ici", "c'est", "Paris."],
    blurb: "Build your ultimate Parisian XI. Prove who really knows football.",
    formation: "PARISIAN 4–3–3",
    stepTitles: ["Build your Parisian XI", "Outplay your rival", "Win Le Classique"],
    footerCheer: "Allez Paris!",
  },
];

export const CLUB_IDS: ClubId[] = CLUBS.map((club) => club.id);
export const DEFAULT_CLUB: ClubId = "barcelona";
export const CLUB_STORAGE_KEY = "club";
export const CLUB_EVENT = "futgo-club-change";

export function isClubId(value: unknown): value is ClubId {
  return typeof value === "string" && (CLUB_IDS as string[]).includes(value);
}

export function getClub(id: ClubId): Club {
  return CLUBS.find((club) => club.id === id) ?? CLUBS[0];
}