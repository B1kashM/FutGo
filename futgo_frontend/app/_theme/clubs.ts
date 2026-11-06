export type ClubId =
  | "barcelona"
  | "madrid"
  | "manutd"
  | "mancity"
  | "bayern"
  | "chelsea"
  | "psg"
  | "arsenal"
  | "dortmund"
  | "inter"
//   | "ajax"
  | "juventus"
//   | "atletico"
  | "ac-milan"
//   | "benfica"
//   | "napoli"
//   | "roma"
//   | "tottenham"
  | "galatasaray"
//   | "fenerbahce"
  | "fiorentina"
  | "celtic"
  | "miami";

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
    headline: ["Més", "que un", "Club."],
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
    headline: ["Hala", "Madrid,", "Vamoss."],
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
    headline: ["Glory", "Glory,", "Man United."],
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
    headline: ["Mia san", "mia,", "Bayern."],
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
    {
    id: "arsenal",
    name: "Arsenal FC",
    short: "ARS",
    swatch: ["#EF0107", "#FFFFFF"],
    brandTag: "THE NORTH LONDON DRAFT",
    badge: "VICTORIA CONCORDIA CRESCIT. YOUR PICKS. YOUR LEGACY.",
    headline: ["Victoria", "Concordia", "Crescit."],
    blurb: "Build your ultimate Gunners XI. Prove who really knows football.",
    formation: "GUNNERS 4–3–3",
    stepTitles: ["Build your Arsenal XI", "Outplay your rival", "Win the North London Derby"],
    footerCheer: "Come On You Gunners!",
    },
    {
    id: "dortmund",
    name: "Borussia Dortmund",
    short: "BVB",
    swatch: ["#FDE100", "#000000"],
    brandTag: "THE YELLOW WALL DRAFT",
    badge: "EINMAL BORUSSE, IMMER BORUSSE. YOUR PICKS. YOUR LEGACY.",
    headline: ["Echte", "Liebe.", "BVB"],
    blurb: "Build your ultimate Dortmund XI. Prove who really knows football.",
    formation: "BORUSSIA 4–3–3",
    stepTitles: ["Build your Dortmund XI", "Outplay your rival", "Win Der Klassiker"],
    footerCheer: "Heja BVB!",
    },
    {
    id: "inter",
    name: "Inter Milan",
    short: "INT",
    swatch: ["#0068A8", "#000000"],
    brandTag: "THE NERAZZURRI DRAFT",
    badge: "NON SMETTERE MAI. YOUR PICKS. YOUR LEGACY.",
    headline: ["Forza", "Inter!",""],
    blurb: "Build your ultimate Nerazzurri XI. Prove who really knows football.",
    formation: "NERAZZURRI 3–5–2",
    stepTitles: ["Build your Inter XI", "Outplay your rival", "Win the Derby della Madonnina"],
    footerCheer: "Forza Inter!",
    },
    // {
    // id: "ajax",
    // name: "AFC Ajax",
    // short: "AJX",
    // swatch: ["#D71920", "#FFFFFF"],
    // brandTag: "THE AMSTERDAM DRAFT",
    // badge: "WIJ ZIJN AJAX. YOUR PICKS. YOUR LEGACY.",
    // headline: ["Forza", "Ajax!",""],
    // blurb: "Build your ultimate Ajax XI. Prove who really knows football.",
    // formation: "AJAX 4–3–3",
    // stepTitles: ["Build your Ajax XI", "Outplay your rival", "Rule Amsterdam"],
    // footerCheer: "Hup Ajax!",
    // },
    {
    id: "juventus",
    name: "Juventus FC",
    short: "JUV",
    swatch: ["#000000", "#FFFFFF"],
    brandTag: "THE BIANCONERI DRAFT",
    badge: "FINO ALLA FINE. YOUR PICKS. YOUR LEGACY.",
    headline: ["Fino", "Alla", "Fine."],
    blurb: "Build your ultimate Juventus XI. Prove who really knows football.",
    formation: "BIANCONERI 3–5–2",
    stepTitles: ["Build your Juventus XI", "Outplay your rival", "Rule Turin"],
    footerCheer: "Forza Juve!",
    },
    // {
    // id: "atletico",
    // name: "Atlético Madrid",
    // short: "ATM",
    // swatch: ["#C8102E", "#FFFFFF"],
    // brandTag: "THE ROJIBLANCO DRAFT",
    // badge: "NUNCA DEJES DE CREER. YOUR PICKS. YOUR LEGACY.",
    // headline: ["Aúpa", "Atleti!",""],
    // blurb: "Build your ultimate Atlético XI. Prove who really knows football.",
    // formation: "ROJIBLANCOS 4–4–2",
    // stepTitles: ["Build your Atleti XI", "Outplay your rival", "Rule Madrid"],
    // footerCheer: "Aúpa Atleti!",
    // },
    {
    id: "ac-milan",
    name: "AC Milan",
    short: "ACM",
    swatch: ["#FB090B", "#000000"],
    brandTag: "THE ROSSONERI DRAFT",
    badge: "SEMPRE MILAN. YOUR PICKS. YOUR LEGACY.",
    headline: ["Sempre", "Milan!",""],
    blurb: "Build your ultimate Rossoneri XI. Prove who really knows football.",
    formation: "ROSSONERI 4–2–3–1",
    stepTitles: ["Build your Milan XI", "Outplay your rival", "Rule Milano"],
    footerCheer: "Forza Milan!",
    },
    // {
    // id: "benfica",
    // name: "SL Benfica",
    // short: "BEN",
    // swatch: ["#D71920", "#FFFFFF"],
    // brandTag: "THE EAGLES DRAFT",
    // badge: "ETERNAMENTE BENFICA. YOUR PICKS. YOUR LEGACY.",
    // headline: ["E Pluribus", "Unum.",""],
    // blurb: "Build your ultimate Benfica XI. Prove who really knows football.",
    // formation: "ÁGUIAS 4–2–3–1",
    // stepTitles: ["Build your Benfica XI", "Outplay your rival", "Conquer Lisbon"],
    // footerCheer: "Força Benfica!",
    // },
    // {
    // id: "napoli",
    // name: "SSC Napoli",
    // short: "NAP",
    // swatch: ["#168ACB", "#FFFFFF"],
    // brandTag: "THE PARTENOPEI DRAFT",
    // badge: "SARÒ CON TE. YOUR PICKS. YOUR LEGACY.",
    // headline: ["Forza", "Napoli!",""],
    // blurb: "Build your ultimate Napoli XI. Prove who really knows football.",
    // formation: "PARTENOPEI 4–3–3",
    // stepTitles: ["Build your Napoli XI", "Outplay your rival", "Rule Naples"],
    // footerCheer: "Forza Napoli!",
    // },
    // {
    // id: "roma",
    // name: "AS Roma",
    // short: "ROM",
    // swatch: ["#8E1B2B", "#DDBB65"],
    // brandTag: "THE GIALLOROSSI DRAFT",
    // badge: "LA ROMA NON SI DISCUTE. YOUR PICKS. YOUR LEGACY.",
    // headline: ["Daje", "Roma!",""],
    // blurb: "Build your ultimate Giallorossi XI. Prove who really knows football.",
    // formation: "GIALLOROSSI 3–4–2–1",
    // stepTitles: ["Build your Roma XI", "Outplay your rival", "Conquer Rome"],
    // footerCheer: "Forza Roma!",
    // },
    // {
    // id: "tottenham",
    // name: "Tottenham Hotspur",
    // short: "TOT",
    // swatch: ["#132257", "#FFFFFF"],
    // brandTag: "THE NORTH LONDON DRAFT",
    // badge: "TO DARE IS TO DO. YOUR PICKS. YOUR LEGACY.",
    // headline: ["Come On", "You Spurs!",""],
    // blurb: "Build your ultimate Spurs XI. Prove who really knows football.",
    // formation: "SPURS 4–3–3",
    // stepTitles: ["Build your Spurs XI", "Outplay your rival", "Own North London"],
    // footerCheer: "Come On You Spurs!",
    // },
    {
    id: "galatasaray",
    name: "Galatasaray SK",
    short: "GAL",
    swatch: ["#A90432", "#FDB912"],
    brandTag: "THE ASLAN DRAFT",
    badge: "EN BÜYÜK CİMBOM. YOUR PICKS. YOUR LEGACY.",
    headline: ["Haydi", "Cimbom!",""],
    blurb: "Build your ultimate Galatasaray XI. Prove who really knows football.",
    formation: "ASLANLAR 4–2–3–1",
    stepTitles: ["Build your Gala XI", "Outplay your rival", "Rule Istanbul"],
    footerCheer: "Haydi Cimbom!",
    },
    // {
    // id: "fenerbahce",
    // name: "Fenerbahçe SK",
    // short: "FB",
    // swatch: ["#003399", "#FFED00"],
    // brandTag: "THE SARI LACIVERT DRAFT",
    // badge: "BÜYÜK FENERBAHÇE. YOUR PICKS. YOUR LEGACY.",
    // headline: ["Yaşa", "Fenerbahçe!",""],
    // blurb: "Build your ultimate Fenerbahçe XI. Prove who really knows football.",
    // formation: "KANARYALAR 4–3–3",
    // stepTitles: ["Build your Fenerbahçe XI", "Outplay your rival", "Rule Istanbul"],
    // footerCheer: "Yaşa Fenerbahçe!",
    // },
    {
    id: "fiorentina",
    name: "ACF Fiorentina",
    short: "FIO",
    swatch: ["#592C82", "#FFFFFF"],
    brandTag: "THE VIOLA DRAFT",
    badge: "FORZA VIOLA. YOUR PICKS. YOUR LEGACY.",
    headline: ["Forza", "Viola!",""],
    blurb: "Build your ultimate Fiorentina XI. Prove who really knows football.",
    formation: "VIOLA 4–2–3–1",
    stepTitles: ["Build your Fiorentina XI", "Outplay your rival", "Rule Florence"],
    footerCheer: "Forza Viola!",
    },
    {
    id: "celtic",
    name: "Celtic FC",
    short: "CEL",
    swatch: ["#16834B", "#FFFFFF"],
    brandTag: "THE PARADISE DRAFT",
    badge: "YOU'LL NEVER WALK ALONE. YOUR PICKS. YOUR LEGACY.",
    headline: ["Hail", "Hail!",""],
    blurb: "Build your ultimate Celtic XI. Prove who really knows football.",
    formation: "HOOPS 4–3–3",
    stepTitles: ["Build your Celtic XI", "Outplay your rival", "Rule Glasgow"],
    footerCheer: "Hail Hail!",
    },
    {
    id: "miami",
    name: "Inter Miami CF",
    short: "MIA",
    swatch: ["#F7B5CD", "#231F20"],
    brandTag: "THE MAGIC CITY DRAFT",
    badge: "FREEDOM TO DREAM. YOUR PICKS. YOUR LEGACY.",
    headline: ["Freedom", "To", "Dream."],
    blurb: "Build your ultimate Herons XI. Prove who really knows football.",
    formation: "HERONS 4–3–3",
    stepTitles: ["Build your Inter Miami XI", "Outplay your rival", "Conquer the MLS"],
    footerCheer: "Vamos Inter Miami!",
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