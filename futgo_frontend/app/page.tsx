"use client";

import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Goal,
  Info,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import ClubPicker from "./components/ClubPicker";
import ThemeToggle from "./components/ThemeToggle";
import { useClub } from "./_theme/useClub";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

// "Play Draft" opens the game modes page, where the player picks Local or Online.
const DRAFT_HREF = "/game-modes";
const CARDS_HREF = "/cards";

const stepMeta = [
  {
    number: "01",
    description: "Pick your perfect starting eleven, one position at a time.",
    icon: Shield,
  },
  {
    number: "02",
    description: "Two managers. Two choices. Every pick changes the game.",
    icon: Swords,
  },
  {
    number: "03",
    description: "Complete your squad and find out who built the better team.",
    icon: Crown,
  },
];

// Pitch positions (x = across, y = GK at the top -> ST at the bottom).
const pitchPlayers = [
  { x: "50%", y: "13%", name: "GK", number: "01" },
  { x: "17%", y: "30%", name: "LB", number: "02" },
  { x: "39%", y: "30%", name: "CB", number: "03" },
  { x: "61%", y: "30%", name: "CB", number: "04" },
  { x: "83%", y: "30%", name: "RB", number: "05" },
  { x: "25%", y: "51%", name: "CM", number: "06" },
  { x: "50%", y: "51%", name: "DM", number: "07" },
  { x: "75%", y: "51%", name: "AM", number: "08" },
  { x: "20%", y: "73%", name: "LW", number: "09" },
  { x: "50%", y: "82%", name: "ST", number: "10" },
  { x: "80%", y: "73%", name: "RW", number: "11" },
];

type Tone = "club" | "gold" | "club2";
type HairStyle =
  | "buzz"
  | "fade"
  | "short"
  | "side-part"
  | "slick"
  | "curly"
  | "tight"
  | "mohawk"
  | "man-bun"
  | "long"
  | "bald";
type Kit = {
  base: string;
  trim: string;
  stripes?: boolean;
  collar?: "v" | "polo";
};

// Every attribute below changes how the avatar is drawn.
type Look = {
  skin: string;
  face?: "oval" | "square" | "round" | "long";
  hair: string;
  style: HairStyle;
  facial?: "stubble" | "beard" | "goatee" | "mustache";
  facialColor?: string;
  brows?: "thin" | "thick";
  eyes?: "brown" | "dark" | "blue" | "green" | "hazel";
  nose?: "small" | "medium" | "wide";
  mouth?: "neutral" | "smile" | "smirk";
  age?: "young" | "mature";
};

type Legend = {
  name: string;
  rating: number;
  pos: string;
  shirt: string;
  stats: [string, number][];
  look: Look;
  kit: Kit;
  // Optional: drop a PNG in /public/legends and set e.g. "/legends/messi.png"
  // to show a real image instead of the drawn avatar.
  image?: string;
};

type ClubKey =
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
  | "juventus"
  | "ac-milan"
  | "galatasaray"
  | "fiorentina"
  | "celtic"
  | "miami";

const KITS = {
  barcelona: { base: "#004D98", trim: "#A50044", stripes: true },
  realmadrid: { base: "#FFFFFF", trim: "#D4AF37", collar: "polo" },
  manutd: { base: "#DA291C", trim: "#FFFFFF", collar: "polo" },
  mancity: { base: "#6CABDD", trim: "#FFFFFF" },
  bayern: { base: "#DC052D", trim: "#FFFFFF" },
  chelsea: { base: "#034694", trim: "#FFFFFF" },
  psg: { base: "#004170", trim: "#DA291C" },
  arsenal: { base: "#EF0107", trim: "#FFFFFF", collar: "polo" },
  dortmund: { base: "#FDE100", trim: "#111111", collar: "polo" },
  inter: { base: "#0068A8", trim: "#111111", stripes: true },
  juventus: { base: "#F5F5F5", trim: "#111111", stripes: true },
  acmilan: { base: "#E50B14", trim: "#111111", stripes: true },
  galatasaray: { base: "#F9A61A", trim: "#A90432", stripes: true },
  fiorentina: { base: "#6B2C91", trim: "#FFFFFF" },
  celtic: { base: "#14883C", trim: "#FFFFFF", stripes: true },
  miami: { base: "#F5B6CD", trim: "#231F20" },
  argentina: { base: "#75AADB", trim: "#FFFFFF", stripes: true },
  brazil: { base: "#F9D423", trim: "#009C3B", collar: "polo" },
  france: { base: "#1B3A8C", trim: "#FFFFFF" },
} satisfies Record<string, Kit>;

const SKIN = {
  light: "#f0c8a8",
  fair: "#e6b794",
  medium: "#d9a679",
  tan: "#c68642",
  brown: "#8d5524",
  dark: "#5c3a21",
};

// Left card, centre (gold, best player) card, right card.
const LEGENDS: Record<ClubKey | "default", Legend[]> = {
  // MSN
  barcelona: [
    {
      name: "SUÁREZ",
      rating: 94,
      pos: "ST",
      shirt: "09",
      stats: [["SHO", 95], ["PHY", 90], ["DRI", 88]],
      look: {
        skin: SKIN.fair, face: "square", hair: "#2b1d14", style: "side-part",
        facial: "stubble", brows: "thick", eyes: "brown", nose: "medium",
        mouth: "neutral", age: "mature",
      },
      kit: KITS.barcelona,
    },
    {
      name: "MESSI",
      rating: 99,
      pos: "RW",
      shirt: "10",
      stats: [["DRI", 99], ["SHO", 96], ["PAS", 99]],
      look: {
        skin: SKIN.fair, face: "oval", hair: "#0c0501", style: "long",
        facial: "stubble", facialColor: "#7a4a2a", brows: "thick", eyes: "brown",
        nose: "medium", mouth: "smirk",
      },
      kit: KITS.barcelona,
    },
    {
      name: "NEYMAR",
      rating: 93,
      pos: "LW",
      shirt: "11",
      stats: [["DRI", 96], ["PAC", 91], ["PAS", 88]],
      look: {
        skin: "#c48e66", face: "oval", hair: "#ce9b1c", style: "fade",
        facial: "stubble", brows: "thin", eyes: "dark", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.barcelona,
    },
  ],
  // BBC
  madrid: [
    {
      name: "BALE",
      rating: 92,
      pos: "RW",
      shirt: "11",
      stats: [["PAC", 96], ["SHO", 91], ["PHY", 85]],
      look: {
        skin: SKIN.light, face: "long", hair: "#6b4a2a", style: "man-bun",
        facial: "stubble", brows: "thick", eyes: "blue", nose: "medium",
        mouth: "smirk",
      },
      kit: KITS.realmadrid,
    },
    {
      name: "RONALDO",
      rating: 98,
      pos: "ST",
      shirt: "07",
      stats: [["SHO", 98], ["PAC", 93], ["PHY", 92]],
      look: {
        skin: SKIN.fair, face: "oval", hair: "#2a1b12", style: "slick",
        facial: "stubble", brows: "thick", eyes: "dark", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.realmadrid,
    },
    {
      name: "BENZEMA",
      rating: 95,
      pos: "ST",
      shirt: "09",
      stats: [["SHO", 94], ["PAS", 90], ["DRI", 89]],
      look: {
        skin: SKIN.medium, face: "oval", hair: "#1f1510", style: "short",
        facial: "stubble", brows: "thick", eyes: "dark", nose: "medium",
        mouth: "neutral",
      },
      kit: KITS.realmadrid,
    },
  ],
  // The Holy Trinity
  manutd: [
    {
      name: "LAW",
      rating: 94,
      pos: "ST",
      shirt: "10",
      stats: [["SHO", 94], ["PHY", 88], ["PAS", 84]],
      look: {
        skin: SKIN.light, face: "long", hair: "#cdb078", style: "side-part",
        brows: "thin", eyes: "blue", nose: "medium", mouth: "smile",
      },
      kit: KITS.manutd,
    },
    {
      name: "BEST",
      rating: 96,
      pos: "RW",
      shirt: "07",
      stats: [["DRI", 97], ["PAC", 92], ["SHO", 91]],
      look: {
        skin: SKIN.light, face: "oval", hair: "#3a2616", style: "long",
        brows: "thick", eyes: "dark", nose: "medium", mouth: "smirk",
      },
      kit: KITS.manutd,
    },
    {
      name: "CHARLTON",
      rating: 93,
      pos: "CM",
      shirt: "09",
      stats: [["SHO", 95], ["PAS", 92], ["PHY", 86]],
      look: {
        skin: SKIN.light, face: "long", hair: "#a8a8a2", style: "bald",
        brows: "thin", eyes: "blue", nose: "medium", mouth: "neutral",
        age: "mature",
      },
      kit: KITS.manutd,
    },
  ],
  mancity: [
    {
      name: "AGÜERO",
      rating: 94,
      pos: "ST",
      shirt: "10",
      stats: [["SHO", 96], ["DRI", 90], ["PAC", 88]],
      look: {
        skin: "#c9936a", face: "round", hair: "#1b120c", style: "short",
        facial: "beard", facialColor: "#241810", brows: "thick", eyes: "dark",
        nose: "medium", mouth: "smile",
      },
      kit: KITS.mancity,
    },
    {
      name: "DE BRUYNE",
      rating: 96,
      pos: "CM",
      shirt: "17",
      stats: [["PAS", 98], ["SHO", 90], ["DRI", 88]],
      look: {
        skin: SKIN.light, face: "oval", hair: "#b8692e", style: "short",
        facial: "beard", facialColor: "#b0622e", brows: "thin", eyes: "blue",
        nose: "medium", mouth: "smirk",
      },
      kit: KITS.mancity,
    },
    {
      name: "SILVA",
      rating: 93,
      pos: "CAM",
      shirt: "21",
      stats: [["PAS", 94], ["DRI", 92], ["SHO", 82]],
      look: {
        skin: SKIN.fair, face: "oval", hair: "#2a1b12", style: "buzz",
        facial: "stubble", brows: "thick", eyes: "brown", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.mancity,
    },
  ],
  bayern: [
    {
      name: "ROBBEN",
      rating: 94,
      pos: "RW",
      shirt: "10",
      stats: [["PAC", 94], ["DRI", 93], ["SHO", 90]],
      look: {
        skin: SKIN.light, face: "oval", hair: "#8a7a62", style: "bald",
        facial: "stubble", facialColor: "#8a7a62", brows: "thin", eyes: "blue",
        nose: "medium", mouth: "smile",
      },
      kit: KITS.bayern,
    },
    {
      name: "LEWANDOWSKI",
      rating: 97,
      pos: "ST",
      shirt: "09",
      stats: [["SHO", 98], ["PHY", 90], ["PAS", 82]],
      look: {
        skin: SKIN.fair, face: "square", hair: "#5a4228", style: "short",
        facial: "stubble", brows: "thick", eyes: "blue", nose: "medium",
        mouth: "neutral",
      },
      kit: KITS.bayern,
    },
    {
      name: "RIBÉRY",
      rating: 93,
      pos: "LW",
      shirt: "07",
      stats: [["DRI", 94], ["PAS", 90], ["PAC", 89]],
      look: {
        skin: SKIN.medium, face: "round", hair: "#2a1b12", style: "short",
        facial: "stubble", brows: "thick", eyes: "dark", nose: "wide",
        mouth: "smile",
      },
      kit: KITS.bayern,
    },
  ],
  chelsea: [
    {
      name: "TERRY",
      rating: 92,
      pos: "CB",
      shirt: "26",
      stats: [["DEF", 94], ["PHY", 91], ["PAS", 70]],
      look: {
        skin: SKIN.light, face: "square", hair: "#5a4630", style: "buzz",
        brows: "thick", eyes: "blue", nose: "medium", mouth: "neutral",
      },
      kit: KITS.chelsea,
    },
    {
      name: "LAMPARD",
      rating: 95,
      pos: "CM",
      shirt: "08",
      stats: [["SHO", 92], ["PAS", 91], ["PHY", 85]],
      look: {
        skin: SKIN.fair, face: "oval", hair: "#3b2a1e", style: "side-part",
        facial: "stubble", brows: "thick", eyes: "brown", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.chelsea,
    },
    {
      name: "DROGBA",
      rating: 94,
      pos: "ST",
      shirt: "11",
      stats: [["SHO", 93], ["PHY", 96], ["PAC", 86]],
      look: {
        skin: SKIN.dark, face: "square", hair: "#120c08", style: "buzz",
        facial: "stubble", brows: "thick", eyes: "dark", nose: "wide",
        mouth: "smile",
      },
      kit: KITS.chelsea,
    },
  ],
  psg: [
    {
      name: "ZLATAN",
      rating: 94,
      pos: "ST",
      shirt: "10",
      stats: [["SHO", 94], ["PHY", 92], ["DRI", 88]],
      look: {
        skin: "#d4a074", face: "long", hair: "#2a1b12", style: "man-bun",
        facial: "goatee", brows: "thick", eyes: "dark", nose: "wide",
        mouth: "smirk",
      },
      kit: KITS.psg,
    },
    {
      name: "MBAPPÉ",
      rating: 97,
      pos: "ST",
      shirt: "07",
      stats: [["PAC", 99], ["DRI", 94], ["SHO", 93]],
      look: {
        skin: "#7a4a28", face: "oval", hair: "#120c08", style: "fade",
        brows: "thick", eyes: "dark", nose: "medium", mouth: "smile",
      },
      kit: KITS.psg,
    },
    {
      name: "NEYMAR",
      rating: 93,
      pos: "LW",
      shirt: "10",
      stats: [["DRI", 96], ["PAC", 91], ["PAS", 88]],
      look: {
        skin: "#c48e66", face: "oval", hair: "#d9b45a", style: "fade",
        facial: "stubble", brows: "thin", eyes: "dark", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.psg,
    },
  ],
  arsenal: [
    {
      name: "BERGKAMP",
      rating: 94,
      pos: "CAM",
      shirt: "10",
      stats: [["PAS", 95], ["DRI", 93], ["SHO", 90]],
      look: {
        skin: SKIN.light, face: "long", hair: "#6b5a3a", style: "short",
        brows: "thin", eyes: "blue", nose: "medium", mouth: "neutral",
        age: "mature",
      },
      kit: KITS.arsenal,
    },
    {
      name: "HENRY",
      rating: 97,
      pos: "ST",
      shirt: "14",
      stats: [["PAC", 96], ["SHO", 96], ["DRI", 94]],
      look: {
        skin: "#6a4126", face: "oval", hair: "#120c08", style: "buzz",
        facial: "stubble", brows: "thick", eyes: "dark", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.arsenal,
    },
    {
      name: "VIEIRA",
      rating: 93,
      pos: "CM",
      shirt: "04",
      stats: [["PHY", 95], ["PAS", 88], ["DEF", 90]],
      look: {
        skin: SKIN.dark, face: "square", hair: "#120c08", style: "buzz",
        brows: "thick", eyes: "dark", nose: "wide", mouth: "neutral",
      },
      kit: KITS.arsenal,
    },
  ],
  dortmund: [
    {
      name: "REUS",
      rating: 93,
      pos: "LW",
      shirt: "11",
      stats: [["DRI", 92], ["PAS", 90], ["SHO", 89]],
      look: {
        skin: SKIN.light, face: "long", hair: "#b08a52", style: "side-part",
        facial: "beard", facialColor: "#7a5a30", brows: "thin", eyes: "blue",
        nose: "medium", mouth: "smile",
      },
      kit: KITS.dortmund,
    },
    {
      name: "HAALAND",
      rating: 96,
      pos: "ST",
      shirt: "09",
      stats: [["SHO", 96], ["PHY", 95], ["PAC", 93]],
      look: {
        skin: SKIN.light, face: "long", hair: "#ffe8ad", style: "man-bun",
        brows: "thick", eyes: "blue", nose: "medium", mouth: "neutral",
      },
      kit: KITS.dortmund,
    },
    {
      name: "AUBAMEYANG",
      rating: 92,
      pos: "ST",
      shirt: "17",
      stats: [["PAC", 97], ["SHO", 92], ["DRI", 88]],
      look: {
        skin: SKIN.brown, face: "oval", hair: "#120c08", style: "fade",
        facial: "stubble", brows: "thick", eyes: "dark", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.dortmund,
    },
  ],
  inter: [
    {
      name: "ZANETTI",
      rating: 92,
      pos: "RB",
      shirt: "04",
      stats: [["DEF", 91], ["PHY", 90], ["PAS", 86]],
      look: {
        skin: SKIN.fair, face: "oval", hair: "#2a1b12", style: "short",
        facial: "stubble", brows: "thick", eyes: "brown", nose: "medium",
        mouth: "neutral", age: "mature",
      },
      kit: KITS.inter,
    },
    {
      name: "RONALDO",
      rating: 97,
      pos: "ST",
      shirt: "09",
      stats: [["PAC", 96], ["DRI", 97], ["SHO", 96]],
      look: {
        skin: SKIN.tan, face: "round", hair: "#120c08", style: "buzz",
        brows: "thick", eyes: "dark", nose: "medium", mouth: "smile",
      },
      kit: KITS.inter,
    },
    {
      name: "SNEIJDER",
      rating: 92,
      pos: "CAM",
      shirt: "10",
      stats: [["PAS", 93], ["SHO", 90], ["DRI", 88]],
      look: {
        skin: SKIN.light, face: "oval", hair: "#5a4630", style: "short",
        facial: "stubble", brows: "thin", eyes: "blue", nose: "medium",
        mouth: "smirk",
      },
      kit: KITS.inter,
    },
  ],
  juventus: [
    {
      name: "BUFFON",
      rating: 94,
      pos: "GK",
      shirt: "01",
      stats: [["REF", 95], ["DIV", 93], ["HAN", 92]],
      look: {
        skin: SKIN.fair, face: "square", hair: "#1f1510", style: "short",
        facial: "stubble", brows: "thick", eyes: "dark", nose: "medium",
        mouth: "neutral", age: "mature",
      },
      kit: KITS.juventus,
    },
    {
      name: "DEL PIERO",
      rating: 95,
      pos: "ST",
      shirt: "10",
      stats: [["SHO", 94], ["DRI", 93], ["PAS", 91]],
      look: {
        skin: SKIN.fair, face: "oval", hair: "#3b2a1e", style: "short",
        facial: "stubble", brows: "thick", eyes: "brown", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.juventus,
    },
    {
      name: "PIRLO",
      rating: 94,
      pos: "CM",
      shirt: "21",
      stats: [["PAS", 98], ["SHO", 88], ["DRI", 86]],
      look: {
        skin: SKIN.fair, face: "long", hair: "#4a3322", style: "slick",
        facial: "beard", facialColor: "#4a3322", brows: "thick", eyes: "brown",
        nose: "medium", mouth: "neutral", age: "mature",
      },
      kit: KITS.juventus,
    },
  ],
  "ac-milan": [
    {
      name: "MALDINI",
      rating: 95,
      pos: "CB",
      shirt: "03",
      stats: [["DEF", 97], ["PAC", 86], ["PHY", 90]],
      look: {
        skin: SKIN.fair, face: "long", hair: "#2a1b12", style: "slick",
        brows: "thick", eyes: "hazel", nose: "medium", mouth: "neutral",
        age: "mature",
      },
      kit: KITS.acmilan,
    },
    {
      name: "KAKÁ",
      rating: 96,
      pos: "CAM",
      shirt: "22",
      stats: [["DRI", 95], ["PAC", 92], ["PAS", 92]],
      look: {
        skin: SKIN.medium, face: "oval", hair: "#2a1b12", style: "buzz",
        brows: "thin", eyes: "brown", nose: "medium", mouth: "smile",
      },
      kit: KITS.acmilan,
    },
    {
      name: "SHEVCHENKO",
      rating: 93,
      pos: "ST",
      shirt: "07",
      stats: [["SHO", 95], ["PAC", 92], ["DRI", 88]],
      look: {
        skin: SKIN.fair, face: "square", hair: "#5a4630", style: "short",
        facial: "stubble", brows: "thick", eyes: "brown", nose: "medium",
        mouth: "neutral",
      },
      kit: KITS.acmilan,
    },
  ],
  galatasaray: [
    {
      name: "ŞÜKÜR",
      rating: 92,
      pos: "ST",
      shirt: "09",
      stats: [["SHO", 93], ["PHY", 88], ["PAC", 84]],
      look: {
        skin: SKIN.fair, face: "square", hair: "#2a1b12", style: "short",
        facial: "stubble", brows: "thick", eyes: "dark", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.galatasaray,
    },
    {
      name: "HAGI",
      rating: 94,
      pos: "CAM",
      shirt: "10",
      stats: [["PAS", 94], ["SHO", 93], ["DRI", 91]],
      look: {
        skin: SKIN.fair, face: "oval", hair: "#3b2a1e", style: "side-part",
        facial: "mustache", facialColor: "#3b2a1e", brows: "thick",
        eyes: "brown", nose: "medium", mouth: "smirk", age: "mature",
      },
      kit: KITS.galatasaray,
    },
    {
      name: "ARDA",
      rating: 91,
      pos: "CAM",
      shirt: "08",
      stats: [["DRI", 91], ["PAS", 89], ["PAC", 86]],
      look: {
        skin: SKIN.medium, face: "oval", hair: "#2a1b12", style: "side-part",
        facial: "beard", facialColor: "#2a1b12", brows: "thick", eyes: "dark",
        nose: "medium", mouth: "smile",
      },
      kit: KITS.galatasaray,
    },
  ],
  fiorentina: [
    {
      name: "RUI COSTA",
      rating: 93,
      pos: "CAM",
      shirt: "10",
      stats: [["PAS", 94], ["DRI", 91], ["SHO", 88]],
      look: {
        skin: SKIN.fair, face: "oval", hair: "#2a1b12", style: "short",
        facial: "stubble", brows: "thick", eyes: "brown", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.fiorentina,
    },
    {
      name: "BATISTUTA",
      rating: 95,
      pos: "ST",
      shirt: "09",
      stats: [["SHO", 97], ["PHY", 91], ["PAC", 88]],
      look: {
        skin: SKIN.fair, face: "square", hair: "#7a5a30", style: "long",
        facial: "stubble", brows: "thick", eyes: "brown", nose: "medium",
        mouth: "smirk",
      },
      kit: KITS.fiorentina,
    },
    {
      name: "BAGGIO",
      rating: 94,
      pos: "CAM",
      shirt: "10",
      stats: [["DRI", 95], ["PAS", 94], ["SHO", 92]],
      look: {
        skin: SKIN.fair, face: "long", hair: "#2a1b12", style: "man-bun",
        brows: "thin", eyes: "dark", nose: "medium", mouth: "neutral",
      },
      kit: KITS.fiorentina,
    },
  ],
  celtic: [
    {
      name: "DALGLISH",
      rating: 93,
      pos: "ST",
      shirt: "07",
      stats: [["SHO", 93], ["PAS", 92], ["PHY", 85]],
      look: {
        skin: SKIN.light, face: "oval", hair: "#5a4630", style: "short",
        brows: "thick", eyes: "blue", nose: "medium", mouth: "neutral",
      },
      kit: KITS.celtic,
    },
    {
      name: "LARSSON",
      rating: 94,
      pos: "ST",
      shirt: "07",
      stats: [["SHO", 95], ["PAC", 90], ["DRI", 90]],
      look: {
        skin: "#b98462", face: "oval", hair: "#1f1510", style: "buzz",
        facial: "stubble", brows: "thick", eyes: "dark", nose: "medium",
        mouth: "smile",
      },
      kit: KITS.celtic,
    },
    {
      name: "JOHNSTONE",
      rating: 92,
      pos: "RW",
      shirt: "07",
      stats: [["DRI", 95], ["PAC", 91], ["PAS", 84]],
      look: {
        skin: SKIN.light, face: "round", hair: "#c4642a", style: "curly",
        brows: "thin", eyes: "green", nose: "small", mouth: "smile",
      },
      kit: KITS.celtic,
    },
  ],
  miami: [
    {
      name: "BUSQUETS",
      rating: 91,
      pos: "CDM",
      shirt: "05",
      stats: [["PAS", 92], ["DEF", 88], ["DRI", 80]],
      look: {
        skin: SKIN.fair, face: "long", hair: "#3b2a1e", style: "side-part",
        facial: "stubble", brows: "thick", eyes: "brown", nose: "medium",
        mouth: "neutral", age: "mature",
      },
      kit: KITS.miami,
    },
    {
      name: "MESSI",
      rating: 98,
      pos: "RW",
      shirt: "10",
      stats: [["DRI", 98], ["SHO", 94], ["PAS", 94]],
      look: {
        skin: SKIN.fair, face: "oval", hair: "#4a3322", style: "side-part",
        facial: "beard", facialColor: "#7a4a2a", brows: "thick", eyes: "brown",
        nose: "medium", mouth: "smirk", age: "mature",
      },
      kit: KITS.miami,
    },
    {
      name: "SUÁREZ",
      rating: 90,
      pos: "ST",
      shirt: "09",
      stats: [["SHO", 91], ["PHY", 86], ["DRI", 84]],
      look: {
        skin: SKIN.fair, face: "square", hair: "#2b1d14", style: "side-part",
        facial: "stubble", brows: "thick", eyes: "brown", nose: "medium",
        mouth: "neutral", age: "mature",
      },
      kit: KITS.miami,
    },
  ],
  // Only used if the club can't be recognised (a warning is logged)
  default: [
    {
      name: "MARADONA",
      rating: 97,
      pos: "CAM",
      shirt: "10",
      stats: [["DRI", 99], ["PAS", 92], ["PHY", 80]],
      look: {
        skin: SKIN.tan, face: "round", hair: "#2a1b12", style: "curly",
        brows: "thick", eyes: "dark", nose: "medium", mouth: "smile",
      },
      kit: KITS.argentina,
    },
    {
      name: "PELÉ",
      rating: 98,
      pos: "ST",
      shirt: "10",
      stats: [["SHO", 97], ["DRI", 96], ["PAC", 93]],
      look: {
        skin: SKIN.dark, face: "oval", hair: "#120c08", style: "buzz",
        brows: "thick", eyes: "dark", nose: "wide", mouth: "smile",
      },
      kit: KITS.brazil,
    },
    {
      name: "ZIDANE",
      rating: 96,
      pos: "CM",
      shirt: "05",
      stats: [["PAS", 98], ["DRI", 95], ["PHY", 82]],
      look: {
        skin: SKIN.medium, face: "square", hair: "#2a1b12", style: "bald",
        facial: "stubble", brows: "thick", eyes: "dark", nose: "medium",
        mouth: "neutral", age: "mature",
      },
      kit: KITS.france,
    },
  ],
};

/**
 * Works out which club is selected. It reads the data-club attribute that
 * your theme sets on <html> first, then falls back to the strings inside the
 * club object (shortest first, because ids and names are short).
 */
const CLUB_RULES: [RegExp, ClubKey][] = [
  [/bayern|munich|münchen|munchen/, "bayern"],
  [/miami/, "miami"],
  [/\binter\b|internazionale|nerazzurri/, "inter"],
  [/milan/, "ac-milan"],
  [/barc|barç|blaugrana|culer|\bfcb\b/, "barcelona"],
  [/real|madrid|merengue|blancos|\brma\b/, "madrid"],
  [/united|manu|mufc|\bmun\b/, "manutd"],
  [/city|mancity|mcfc|\bmci\b/, "mancity"],
  [/chelsea|cfc|\bche\b/, "chelsea"],
  [/psg|paris|saint-germain/, "psg"],
  [/arsenal|gunners/, "arsenal"],
  [/dortmund|bvb|borussia/, "dortmund"],
  [/juve/, "juventus"],
  [/galatasaray|cim bom/, "galatasaray"],
  [/fiorentina|viola/, "fiorentina"],
  [/celtic|hoops/, "celtic"],
];

function clubKeyOf(club: unknown, domClub: string): ClubKey | "default" {
  const c = (club ?? {}) as Record<string, unknown>;
  const norm = (v: unknown) =>
    typeof v === "string" ? v.toLowerCase().trim() : "";

  // 1. Exact id match: the ids from your club list
  for (const id of [domClub, c.id, c.key, c.slug]) {
    const k = norm(id);
    if (k && k !== "default" && Object.prototype.hasOwnProperty.call(LEGENDS, k)) {
      return k as ClubKey;
    }
  }

  // 2. Fuzzy match on any short string in the club object
  const fromObject = Object.values(c)
    .filter((v): v is string => typeof v === "string")
    .sort((a, b) => a.length - b.length)
    .map((v) => v.toLowerCase());

  for (const haystack of [domClub.toLowerCase(), ...fromObject]) {
    if (!haystack) continue;
    for (const [rule, key] of CLUB_RULES) {
      if (rule.test(haystack)) return key;
    }
  }

  if (typeof window !== "undefined") {
    console.warn("[FutGo] Club not recognised for legend cards:", {
      domClub,
      club,
    });
  }
  return "default";
}

// Frame colour + glow per card position. The white frame and the glow are
// what make the cards stand out on dark backgrounds.
const toneByIndex: Tone[] = ["club", "gold", "club2"];

const toneClass: Record<Tone, string> = {
  club: "bg-accent shadow-2xl shadow-accent/60",
  club2: "bg-accent-2 shadow-2xl shadow-accent-2/60",
  gold: "bg-gradient-to-b from-amber-200 via-yellow-400 to-amber-600 shadow-[0_0_34px_rgba(251,191,36,0.6)]",
};

/* ------------------------------------------------------------------ */
/* Vertical pitch (sizes scale with the pitch's own width)             */
/* ------------------------------------------------------------------ */

function Pitch({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-accent/50 shadow-2xl shadow-accent/30 ${className}`}
      style={{ containerType: "inline-size" }}
    >
      {/* Stripes alternate the club's two colours */}
      <div className="absolute inset-0 flex flex-col bg-surface-2">
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 ${
              i % 2 === 0
                ? "bg-accent dark:brightness-75"
                : "bg-accent-2 dark:brightness-75"
            }`}
          />
        ))}
      </div>

      {/* Markings */}
      <div className="pitch-line absolute left-0 right-0 top-1/2 border-t" />
      <div className="pitch-line absolute left-1/2 top-1/2 aspect-square w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full border" />
      <div className="pitch-line absolute left-1/2 top-0 h-[13%] w-[48%] -translate-x-1/2 rounded-b-lg border-x border-b" />
      <div className="pitch-line absolute bottom-0 left-1/2 h-[13%] w-[48%] -translate-x-1/2 rounded-t-lg border-x border-t" />

      {pitchPlayers.map((p) => (
        <div
          key={p.number}
          className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: p.x, top: p.y }}
        >
          <div
            className="shirt flex items-center justify-center rounded-full border-2 font-black shadow-lg"
            style={{ width: "14cqw", height: "14cqw", fontSize: "6.2cqw" }}
          >
            {p.number}
          </div>
          {/* Position labels only on wider screens, too tiny on phones */}
          <span
            className="mt-[1cqw] hidden rounded bg-black/60 px-[2cqw] font-bold leading-tight text-white lg:block"
            style={{ fontSize: "4.4cqw" }}
          >
            {p.name}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drawn player avatar: shaded face, detailed features, club kit       */
/* ------------------------------------------------------------------ */

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function mix(hex: string, other: string, t: number) {
  const parts = (h: string) =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = parts(hex);
  const b = parts(other);
  return (
    "#" +
    a
      .map((v, i) => clamp255(v + (b[i] - v) * t).toString(16).padStart(2, "0"))
      .join("")
  );
}
const lighten = (hex: string, t: number) => mix(hex, "#ffffff", t);
const darken = (hex: string, t: number) => mix(hex, "#000000", t);

const EYE_COLOUR = {
  brown: "#5a3a22",
  dark: "#2a1a12",
  blue: "#4f86b8",
  green: "#5b8f62",
  hazel: "#8c6a34",
};

const FACE_PATH = {
  oval: "M33 38 C33 22 41 15 50 15 C59 15 67 22 67 38 C67 51 60 62 50 62 C40 62 33 51 33 38Z",
  square:
    "M33 36 C33 21 41 15 50 15 C59 15 67 21 67 36 L66 50 C65 58 60 62 54 62.5 L46 62.5 C40 62 35 58 34 50Z",
  round:
    "M32 38 C32 22 40 15 50 15 C60 15 68 22 68 38 C68 53 61 63 50 63 C39 63 32 53 32 38Z",
  long: "M34 36 C34 20 41 13 50 13 C59 13 66 20 66 36 C66 52 60 65 50 65 C40 65 34 52 34 36Z",
};

const NOSE_WIDTH = { small: 2.4, medium: 3, wide: 3.8 };

const JAW_SHADOW =
  "M34.5 44 C35 56 41 63 50 63 C59 63 65 56 65.5 44 C63 52 58 56 50 56 C42 56 37 52 34.5 44Z";

function Avatar({ look, kit }: { look: Look; kit: Kit }) {
  const uid = useId().replace(/:/g, "");
  const {
    skin,
    hair,
    style,
    face = "oval",
    facial,
    facialColor,
    brows = "thick",
    eyes = "brown",
    nose = "medium",
    mouth = "neutral",
    age = "young",
  } = look;

  const skinLight = lighten(skin, 0.2);
  const skinShade = darken(skin, 0.22);
  const lip = mix(skin, "#a0393a", 0.42);
  const lipLow = mix(skin, "#b2474a", 0.34);
  const hairLight = lighten(hair, 0.24);
  const hairDark = darken(hair, 0.32);
  const browColour = darken(hair, 0.18);
  const beardColour = facialColor ?? hair;
  const nw = NOSE_WIDTH[nose];
  const hairFill = `url(#hair-${uid})`;

  const eye = (cx: number) => (
    <g key={cx}>
      <path
        d={`M${cx - 3.6} 40.4 Q${cx} 37.4 ${cx + 3.6} 40.4 Q${cx} 42.6 ${cx - 3.6} 40.4Z`}
        fill="#f6f2ec"
      />
      <circle cx={cx} cy="40.2" r="1.8" fill={EYE_COLOUR[eyes]} />
      <circle cx={cx} cy="40.2" r="0.85" fill="#0d0907" />
      <circle cx={cx + 0.6} cy="39.5" r="0.45" fill="#fff" />
      <path
        d={`M${cx - 3.9} 40.5 Q${cx} 36.8 ${cx + 3.9} 40.5`}
        stroke={darken(hair, 0.45)}
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M${cx - 3 } 42 Q${cx} 43.2 ${cx + 3} 42`}
        stroke={skinShade}
        strokeWidth="0.5"
        strokeOpacity="0.5"
        fill="none"
      />
    </g>
  );

  const bumps = Array.from({ length: 13 }).map((_, i) => {
    const a = Math.PI + (i / 12) * Math.PI;
    return { x: 50 + 18.5 * Math.cos(a), y: 27 + 16 * Math.sin(a) };
  });

  const mustache = (
    <path
      d="M43.2 52 Q46.5 50.2 50 51.4 Q53.5 50.2 56.8 52 Q54 53.4 50 52.8 Q46 53.4 43.2 52Z"
      fill={beardColour}
      opacity={facial === "stubble" ? 0.3 : 0.9}
    />
  );

  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute bottom-0 left-1/2 w-full -translate-x-1/2"
      style={{ filter: "drop-shadow(0 1.5cqw 2cqw rgba(0,0,0,0.45))" }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`body-${uid}`}>
          <path d="M2 100 C2 76 22 64 50 64 C78 64 98 76 98 100Z" />
        </clipPath>
        <radialGradient id={`face-${uid}`} cx="0.38" cy="0.3" r="0.85">
          <stop offset="0" stopColor={skinLight} />
          <stop offset="0.6" stopColor={skin} />
          <stop offset="1" stopColor={skinShade} />
        </radialGradient>
        <linearGradient id={`hair-${uid}`} x1="0.1" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor={hairLight} />
          <stop offset="0.5" stopColor={hair} />
          <stop offset="1" stopColor={hairDark} />
        </linearGradient>
        <linearGradient id={`shirt-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lighten(kit.base, 0.16)} />
          <stop offset="0.55" stopColor={kit.base} />
          <stop offset="1" stopColor={darken(kit.base, 0.24)} />
        </linearGradient>
      </defs>

      {/* Long hair sits behind the head and falls over the shoulders */}
      {style === "long" && (
        <path
          d="M31 30 C25 50 28 70 38 78 L62 78 C72 70 75 50 69 30Z"
          fill={hairFill}
        />
      )}

      {/* Shirt */}
      <g clipPath={`url(#body-${uid})`}>
        <rect width="100" height="100" fill={`url(#shirt-${uid})`} />
        {kit.stripes &&
          Array.from({ length: 8 }).map((_, i) => (
            <rect
              key={i}
              x={i * 14 + 2}
              y="60"
              width="7"
              height="42"
              fill={kit.trim}
              opacity="0.92"
            />
          ))}
        {/* Fabric folds + shoulder shading */}
        <path d="M2 100 C2 80 10 72 20 68 L24 100Z" fill="#000" opacity="0.16" />
        <path d="M98 100 C98 80 90 72 80 68 L76 100Z" fill="#000" opacity="0.16" />
        <path d="M30 70 Q50 78 70 70" stroke="#fff" strokeOpacity="0.14" strokeWidth="1.4" fill="none" />
      </g>
      {/* Crest */}
      <path
        d="M68 82 h7 v5.5 q0 3.4 -3.5 4.6 q-3.5 -1.2 -3.5 -4.6z"
        fill="#fff"
        stroke={kit.trim}
        strokeWidth="1"
        opacity="0.95"
      />

      {/* Neck, shadow under the chin, collar */}
      <path d="M42 52 L58 52 L59 66 Q50 75 41 66Z" fill={skin} />
      <path d="M42 52 L58 52 L58.6 61 Q50 67 41.4 61Z" fill="#000" opacity="0.26" />
      {kit.collar === "polo" ? (
        <>
          {/* Soft, rounded polo neckline */}
          <path
            d="M39.5 60.5 C41.5 65.5 45.2 69 50 70.2 C54.8 69 58.5 65.5 60.5 60.5"
            fill="none"
            stroke={kit.trim}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Curved collar leaves, shaped like fabric rather than sharp triangles */}
          <path
            d="M39.2 59.8 C42.4 58.2 46.2 59.2 49.4 67.4 C49.8 68.6 49.1 70 47.8 70.2 C44.2 68.7 41.4 65.2 39.2 59.8Z"
            fill={kit.trim}
            stroke={darken(kit.trim, 0.12)}
            strokeWidth="0.55"
            strokeLinejoin="round"
          />
          <path
            d="M60.8 59.8 C57.6 58.2 53.8 59.2 50.6 67.4 C50.2 68.6 50.9 70 52.2 70.2 C55.8 68.7 58.6 65.2 60.8 59.8Z"
            fill={kit.trim}
            stroke={darken(kit.trim, 0.12)}
            strokeWidth="0.55"
            strokeLinejoin="round"
          />
          {/* Rounded button placket */}
          <path
            d="M50 69.5 C49.6 73 49.6 76.5 50 80"
            stroke={darken(kit.base, 0.28)}
            strokeOpacity="0.7"
            strokeWidth="1.15"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="50" cy="73.5" r="0.75" fill={kit.trim} />
          <circle cx="50" cy="77.2" r="0.75" fill={kit.trim} />
        </>
      ) : (
        <>
          {/* Rounded V-neck binding with a smooth curved point */}
          <path
            d="M40.8 60.8 C43.5 65.2 46.5 70.4 50 74.1 C53.5 70.4 56.5 65.2 59.2 60.8"
            fill="none"
            stroke={kit.trim}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M43.3 61.4 C45.4 64.9 47.8 68.5 50 70.9 C52.2 68.5 54.6 64.9 56.7 61.4"
            fill="none"
            stroke="#000"
            strokeOpacity="0.16"
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {/* Ears */}
      {[32.4, 67.6].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="41" rx="3" ry="4.6" fill={skin} />
          <ellipse cx={x} cy="41.5" rx="1.4" ry="2.6" fill={skinShade} opacity="0.55" />
        </g>
      ))}

      {/* Head */}
      <path d={FACE_PATH[face]} fill={`url(#face-${uid})`} />
      <path d={JAW_SHADOW} fill="#000" opacity="0.06" />

      {/* Cheeks */}
      <ellipse cx="39.5" cy="48" rx="4.2" ry="3" fill="#c0504a" opacity="0.13" />
      <ellipse cx="60.5" cy="48" rx="4.2" ry="3" fill="#c0504a" opacity="0.13" />

      {/* Age lines */}
      {age === "mature" && (
        <g stroke={skinShade} strokeOpacity="0.32" strokeWidth="0.7" fill="none" strokeLinecap="round">
          <path d="M42 28.5 Q50 27 58 28.5" />
          <path d="M43.5 30.8 Q50 29.6 56.5 30.8" />
          <path d="M37.4 40.5 l-2.4 -0.9 M37.4 42 l-2.4 0.7" />
          <path d="M62.6 40.5 l2.4 -0.9 M62.6 42 l2.4 0.7" />
          <path d="M44.5 49 Q43 53 45 56 M55.5 49 Q57 53 55 56" />
        </g>
      )}

      {/* Eyes + brows */}
      {eye(43.2)}
      {eye(56.8)}
      <g
        stroke={browColour}
        strokeWidth={brows === "thick" ? 2.3 : 1.4}
        strokeLinecap="round"
        fill="none"
      >
        <path d="M37.8 35.8 Q42.5 32.6 47.5 34.6" />
        <path d="M52.5 34.6 Q57.5 32.6 62.2 35.8" />
      </g>

      {/* Nose */}
      <path
        d={`M48.8 40.5 Q47.6 45 ${50 - nw + 0.4} 48.4`}
        stroke={skinShade}
        strokeOpacity="0.55"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M${50 - nw} 49.2 Q50 52 ${50 + nw} 49.2`}
        stroke={darken(skin, 0.4)}
        strokeOpacity="0.65"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="50" cy="47.6" r="1.3" fill="#fff" opacity="0.2" />

      {/* Mouth */}
      <path d="M46 55 Q50 58.4 54 55 Q50 56 46 55Z" fill={lipLow} />
      {mouth === "smile" && (
        <path d="M45.6 54.6 Q50 57 54.4 54.6 Q50 55.8 45.6 54.6Z" fill="#fdfbf8" />
      )}
      <path
        d="M45.2 54.6 Q47.6 53 50 53.8 Q52.4 53 54.8 54.6 Q50 55.6 45.2 54.6Z"
        fill={lip}
      />
      <path
        d={
          mouth === "smile"
            ? "M44.6 54.1 Q50 57 55.4 54.1"
            : mouth === "smirk"
              ? "M45 55 Q50 55.7 55.4 53.4"
              : "M45.2 54.6 Q50 55.9 54.8 54.6"
        }
        stroke="#4a2218"
        strokeOpacity="0.7"
        strokeWidth="0.8"
        fill="none"
        strokeLinecap="round"
      />

      {/* Facial hair */}
      {facial === "stubble" && (
        <>
          <path d={JAW_SHADOW} fill={beardColour} opacity="0.28" />
          {mustache}
        </>
      )}
      {facial === "beard" && (
        <>
          <path
            d="M33.8 43 C34 58 41 65.5 50 65.5 C59 65.5 66 58 66.2 43 C64.5 50.5 61 55 56 57 Q50 59.2 44 57 C39 55 35.5 50.5 33.8 43Z"
            fill={beardColour}
            opacity="0.88"
          />
          {mustache}
        </>
      )}
      {facial === "goatee" && (
        <>
          <path
            d="M44 56.5 Q50 55 56 56.5 Q57.5 62.5 50 65 Q42.5 62.5 44 56.5Z"
            fill={beardColour}
            opacity="0.9"
          />
          {mustache}
        </>
      )}
      {facial === "mustache" && mustache}

      {/* Hair (front) */}
      {style === "buzz" && (
        <path
          d="M33.4 34 C33 21 40 15.5 50 15.5 C60 15.5 67 21 66.6 34 C64.5 28 59 23 50 23 C41 23 35.5 28 33.4 34Z"
          fill={hairFill}
          opacity="0.6"
        />
      )}
      {style === "fade" && (
        <>
          <path
            d="M33.4 34 C33 21 40 15.5 50 15.5 C60 15.5 67 21 66.6 34 C64.5 28 59 23 50 23 C41 23 35.5 28 33.4 34Z"
            fill={hairFill}
            opacity="0.38"
          />
          <path
            d="M37.5 26 C37 14 44 10.5 51 10.5 C58 10.5 63.5 15 62.5 26 C59 21.5 54 19.5 48 20 C43 20.5 39.5 22.5 37.5 26Z"
            fill={hairFill}
          />
        </>
      )}
      {(style === "short" || style === "long") && (
        <path
          d="M32.5 37 C29.5 18 40 10 50 10 C60 10 70.5 18 67.5 37 C66 30.5 63 26 57.5 24.5 C52 26 44 26 40 23.5 C36.5 26.5 34 31 32.5 37Z"
          fill={hairFill}
        />
      )}
      {style === "side-part" && (
        <>
          <path
            d="M32.5 37 C29 17 41 9.5 51.5 10 C62.5 10.5 70.5 18 67.5 37 C66 29.5 62 24.5 56 22.5 C49 24.5 40.5 24 36 26.5 C34.5 29.5 33.5 33 32.5 37Z"
            fill={hairFill}
          />
          <path d="M45 11.5 Q47.5 17.5 44 23" stroke={hairDark} strokeOpacity="0.55" strokeWidth="0.8" fill="none" />
        </>
      )}
      {(style === "slick" || style === "man-bun") && (
        <>
          {style === "man-bun" && (
            <>
              <circle cx="50" cy="8.5" r="5.4" fill={hairFill} />
              <ellipse cx="50" cy="12.6" rx="4.2" ry="1.1" fill="#1c1c1c" />
            </>
          )}
          <path
            d="M33 36.5 C30.5 18 41 9.5 50 9.5 C59 9.5 69.5 18 67 36.5 C65.5 29 62 23.5 56 21.5 C50 20 42.5 21 38 24.5 C35 27.5 34 31.5 33 36.5Z"
            fill={hairFill}
          />
          <path d="M40 14 Q50 10.5 60 14" stroke={hairLight} strokeOpacity="0.5" strokeWidth="1.2" fill="none" />
          <path d="M38 18 Q50 13.5 62 18" stroke={hairLight} strokeOpacity="0.32" strokeWidth="1" fill="none" />
        </>
      )}
      {style === "curly" && (
        <g fill={hairFill}>
          <circle cx="36" cy="24" r="6" />
          <circle cx="42" cy="18" r="7" />
          <circle cx="50" cy="15" r="7.5" />
          <circle cx="58" cy="18" r="7" />
          <circle cx="64" cy="24" r="6" />
          <circle cx="33.5" cy="32" r="4.5" />
          <circle cx="66.5" cy="32" r="4.5" />
          <circle cx="46" cy="22" r="5" />
          <circle cx="54" cy="22" r="5" />
        </g>
      )}
      {style === "tight" && (
        <g fill={hairFill}>
          <path d="M33 35 C31 19 40 12.5 50 12.5 C60 12.5 69 19 67 35 C65 28.5 60 24 50 24 C40 24 35 28.5 33 35Z" />
          {bumps.map((b, i) => (
            <circle key={i} cx={b.x} cy={b.y} r="3.1" />
          ))}
        </g>
      )}
      {style === "mohawk" && (
        <>
          <path
            d="M33.4 34 C33 21 40 15.5 50 15.5 C60 15.5 67 21 66.6 34 C64.5 28 59 23 50 23 C41 23 35.5 28 33.4 34Z"
            fill={hairFill}
            opacity="0.4"
          />
          <path d="M44.5 5.5 Q50 2.5 55.5 5.5 L57.5 25 Q50 22.5 42.5 25Z" fill={hairFill} />
        </>
      )}
      {style === "bald" && (
        <>
          <path
            d="M33.2 36 C32.8 29 34.5 25 37.5 22.5 C37 27 37 32 37.8 37Z"
            fill={hairFill}
            opacity="0.85"
          />
          <path
            d="M66.8 36 C67.2 29 65.5 25 62.5 22.5 C63 27 63 32 62.2 37Z"
            fill={hairFill}
            opacity="0.85"
          />
          <ellipse cx="46" cy="19.5" rx="6" ry="2.4" fill="#fff" opacity="0.2" />
        </>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Clash-style legend card (everything scales with the card's width)   */
/* ------------------------------------------------------------------ */

function LegendCard({
  legend,
  tone,
  className = "",
}: {
  legend: Legend;
  tone: Tone;
  className?: string;
}) {
  const isGold = tone === "gold";
  // Long names (DE BRUYNE, LEWANDOWSKI) shrink so they never wrap
  const nameSize = Math.min(11.5, 76 / (legend.name.length * 0.78));

  return (
    <div
      className={`absolute aspect-[7/10] w-[40%] transition-transform duration-300 ${className}`}
    >
      <div className="h-full w-full" style={{ containerType: "inline-size" }}>
        <div
          className={`relative flex h-full w-full flex-col overflow-hidden ${toneClass[tone]}`}
          style={{
            borderRadius: "10cqw",
            border: "2.6cqw solid rgba(255,255,255,0.92)",
            padding: "3cqw",
          }}
        >
          {/* Depth: light from the top, shade at the bottom */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-black/35" />

          {/* Portrait */}
          <div
            className={`relative min-h-0 flex-1 overflow-hidden ${
              isGold ? "bg-amber-900/30" : "bg-black/30"
            }`}
            style={{ borderRadius: "6cqw" }}
          >
            {/* Sunburst */}
            <div
              className="absolute inset-[-60%] opacity-70"
              style={{
                background:
                  "repeating-conic-gradient(from 0deg at 50% 62%, rgba(255,255,255,0.22) 0deg 9deg, transparent 9deg 18deg)",
              }}
            />
            {/* Shirt number */}
            <span
              className="absolute inset-x-0 top-[8%] select-none text-center font-black leading-none text-white/25"
              style={{ fontSize: "58cqw" }}
            >
              {legend.shirt}
            </span>

            {legend.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={legend.image}
                alt={legend.name}
                className="absolute inset-0 h-full w-full object-cover object-top"
              />
            ) : (
              <Avatar look={legend.look} kit={legend.kit} />
            )}

            {/* Rating + position */}
            <div
              className="absolute left-[7%] top-[5%] flex flex-col items-center leading-none text-white"
              style={{ textShadow: "0 0.8cqw 0 rgba(0,0,0,0.5)" }}
            >
              <span className="font-black" style={{ fontSize: "26cqw" }}>
                {legend.rating}
              </span>
              <span className="font-extrabold" style={{ fontSize: "10cqw" }}>
                {legend.pos}
              </span>
            </div>

            {isGold && (
              <Star
                className="absolute right-[7%] top-[6%] fill-amber-200 text-amber-50"
                style={{ width: "16cqw", height: "16cqw" }}
              />
            )}
          </div>

          {/* Name plate */}
          <div
            className="relative mt-[2.5cqw] whitespace-nowrap bg-black/70 text-center font-black tracking-wide text-white"
            style={{
              borderRadius: "4cqw",
              fontSize: `${nameSize.toFixed(1)}cqw`,
              padding: "1.6cqw 1cqw",
            }}
          >
            {legend.name}
          </div>

          {/* Stats: three equal columns, label over value (desktop only) */}
          <div className="relative mt-[2cqw] hidden grid-cols-3 gap-[2cqw] lg:grid">
            {legend.stats.map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col items-center bg-black/35 leading-none text-white"
                style={{ borderRadius: "3cqw", padding: "2cqw 0" }}
              >
                <span
                  className="font-bold opacity-80"
                  style={{ fontSize: "6.5cqw" }}
                >
                  {label}
                </span>
                <span
                  className="font-black tabular-nums"
                  style={{ fontSize: "10cqw", marginTop: "0.8cqw" }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mode card (the whole card is the link)                              */
/* ------------------------------------------------------------------ */

const variants = {
  a: {
    hover: "hover:border-accent/70",
    glow: "bg-accent/25",
    stage: "bg-accent/30",
    pill: "border-trim/40 bg-trim/10 text-accent-text",
    arrow: "bg-accent text-accent-ink",
  },
  b: {
    hover: "hover:border-accent-2/70",
    glow: "bg-accent-2/25",
    stage: "bg-accent-2/30",
    pill: "border-accent-2/40 bg-accent-2/10 text-accent-2-text",
    arrow: "bg-accent-2 text-accent-2-ink",
  },
};

function ModeCard({
  href,
  title,
  tagline,
  pill,
  variant,
  children,
}: {
  href: string;
  title: string;
  tagline: string;
  pill: string;
  variant: keyof typeof variants;
  children: ReactNode;
}) {
  const v = variants[variant];

  return (
    <Link
      href={href}
      className={`group relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-surface-2 p-6 transition duration-300 hover:-translate-y-0.5 lg:p-9 ${v.hover}`}
    >
      <div className="brand-bar absolute inset-x-0 top-0 h-1" />
      <div
        className={`pointer-events-none absolute -top-12 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full blur-3xl ${v.glow}`}
      />

      {/* Visual */}
      <div className="relative min-h-0 flex-1">
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${v.stage}`}
        />
        <div
          className="absolute inset-0 flex items-center justify-center py-1"
          style={{ containerType: "size" }}
        >
          {children}
        </div>
      </div>

      {/* Label */}
      <div className="relative mt-2 flex items-center justify-between gap-3 lg:mt-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black tracking-tight lg:text-3xl">
              {title}
            </h2>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${v.pill}`}
            >
              {pill}
            </span>
          </div>
          <p className="mt-1 hidden text-sm text-muted sm:block">{tagline}</p>
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition group-hover:translate-x-1 lg:h-11 lg:w-11 ${v.arrow}`}
        >
          <ArrowRight size={19} />
        </span>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [showHow, setShowHow] = useState(false);
  const { club } = useClub();
  const [domClub, setDomClub] = useState("");
  const legends = useMemo(
    () => LEGENDS[clubKeyOf(club, domClub)],
    [club, domClub],
  );

  // Read the club straight from <html data-club="..."> so the cards always
  // follow the picker, even if the club object has no id field.
  useEffect(() => {
    const html = document.documentElement;
    const read = () => setDomClub(html.getAttribute("data-club") ?? "");
    read();
    const observer = new MutationObserver(read);
    observer.observe(html, { attributes: true, attributeFilter: ["data-club"] });
    return () => observer.disconnect();
  }, []);

  // Fix the page: no scrolling or rubber-banding on any screen size.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.style.overflow = "hidden";
    html.style.height = "100%";
    html.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.inset = "0";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      html.style.overflow = "";
      html.style.height = "";
      html.style.overscrollBehavior = "";
      body.style.position = "";
      body.style.inset = "";
      body.style.width = "";
      body.style.height = "";
      body.style.overflow = "";
      body.style.overscrollBehavior = "";
    };
  }, []);

  // Close the how-to-play dialog with Escape.
  useEffect(() => {
    if (!showHow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHow(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHow]);

  // Keep the browser's status-bar / notch colour in sync with the page
  // background (follows the light/dark toggle and the club theme).
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    const tag = meta;

    const sync = () => {
      const colour = getComputedStyle(document.body).backgroundColor;
      if (colour) tag.content = colour;
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-club", "style"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <main className="relative flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {/* Club colour bar */}
      <div className="brand-bar h-1.5 w-full shrink-0" />

      {/* Navigation */}
      <header className="relative z-20 shrink-0 border-b border-border">
        <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-4 sm:px-8 md:h-[68px] lg:px-12">
          <Link href="/" className="flex items-center gap-3">
            <div className="shirt flex h-10 w-10 items-center justify-center rounded-xl border-2">
              <Goal size={22} strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-xl font-black tracking-[0.18em]">
                FUT<span className="text-accent-text">GO</span>
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* The club picker lives on the landing page only */}
            <ClubPicker />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setShowHow(true)}
              aria-label="How to play"
              className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm font-semibold text-muted transition hover:border-accent/60 hover:text-foreground sm:px-4"
            >
              <Info size={18} />
              <span className="hidden sm:inline">How to play</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content: always fits one screen */}
      <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 -translate-y-3 flex-col justify-center gap-5 px-6 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-12 sm:pb-6 lg:translate-y-0 lg:gap-8 lg:px-20 lg:py-10">
        <div className="pointer-events-none absolute left-1/4 top-0 h-[300px] w-[420px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />
        <div className="pointer-events-none absolute right-0 top-10 h-[260px] w-[360px] rounded-full bg-accent-2/15 blur-[120px]" />

        {/* Club slogan */}
        <div className="relative flex shrink-0 items-end justify-between gap-4">
          <h1 className="text-[clamp(1.6rem,7.5vw,2.25rem)] font-black leading-[0.98] tracking-[-0.05em] sm:text-4xl lg:text-5xl">
            {club.headline[0]} {club.headline[1]}{" "}
            <span className="bg-gradient-to-r from-accent-text to-accent-2-text bg-clip-text text-transparent">
              {club.headline[2]}
            </span>
          </h1>
          <div className="hidden shrink-0 items-center gap-2 rounded-full border border-trim/40 bg-trim/10 px-4 py-2 text-xs font-semibold text-accent-text md:inline-flex">
            <Sparkles size={14} />
            {club.badge}
          </div>
        </div>

        {/* Two modes: stacked on mobile, side by side on desktop */}
        <div className="relative grid min-h-0 flex-1 grid-rows-2 gap-5 lg:h-[clamp(320px,54vh,420px)] lg:flex-none lg:grid-cols-2 lg:grid-rows-1 lg:gap-10">
          <ModeCard
            href={CARDS_HREF}
            title="Play Cards"
            tagline="Lock your best stat. Win their cards."
            pill="1v1 battle"
            variant="b"
          >
            <div
              className="relative"
              style={{ width: "min(100cqw, 150cqh)", aspectRatio: "1.5 / 1" }}
            >
              <LegendCard
                legend={legends[0]}
                tone={toneByIndex[0]}
                className="left-0 top-[12%] -rotate-[8deg] group-hover:-rotate-[12deg]"
              />
              <LegendCard
                legend={legends[2]}
                tone={toneByIndex[2]}
                className="right-0 top-[12%] rotate-[8deg] group-hover:rotate-[12deg]"
              />
              <LegendCard
                legend={legends[1]}
                tone={toneByIndex[1]}
                className="left-[30%] top-[7%] z-10 group-hover:-translate-y-1"
              />
            </div>
          </ModeCard>

          <ModeCard
            href={DRAFT_HREF}
            title="Play Draft"
            tagline="Build your dream XI, pick by pick."
            pill={club.formation}
            variant="a"
          >
            <Pitch className="aspect-[133/188] h-full max-w-full" />
          </ModeCard>
        </div>
                <Link
          href="/penalties"
          className="relative flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-5 py-3 transition hover:-translate-y-0.5 hover:border-accent/70"
        >
          <span className="flex items-center gap-3">
            <span className="shirt flex h-9 w-9 items-center justify-center rounded-xl border-2">
              <Target size={18} />
            </span>
            <span>
              <span className="block text-base font-black tracking-tight lg:text-lg">
                Play Penalties
              </span>
              <span className="hidden text-xs text-muted sm:block">
                Shootout tournament · 2 to 6 players
              </span>
            </span>
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-ink">
            <ArrowRight size={18} />
          </span>
        </Link>
        <p className="relative hidden shrink-0 text-center text-xs text-muted md:block">
          Built by Bikash, The PesGoalPoacher. {club.footerCheer}
        </p>
      </div>

      {/* How to play dialog */}
      {showHow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowHow(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="How to play"
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-surface p-7 shadow-2xl"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setShowHow(false)}
              className="absolute right-4 top-4 rounded-lg border border-border p-2 text-muted transition hover:text-foreground"
            >
              <X size={18} />
            </button>

            <div className="pr-10">
              <div className="text-[10px] font-bold tracking-[0.22em] text-accent-text">
                SIMPLE TO LEARN. HARD TO MASTER.
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight">
                THREE STEPS. ONE DREAM TEAM.
              </h2>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {stepMeta.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.number}
                    className="rounded-2xl border border-border bg-surface-2 p-5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-accent-text">
                        {step.number}
                      </span>
                      <Icon size={20} className="text-muted" />
                    </div>
                    <h3 className="mt-3 text-lg font-bold">
                      {club.stepTitles[i]}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {step.description}
                    </p>
                    <div
                      className={`mt-3 h-1 w-12 rounded-full ${
                        i % 2 === 0 ? "bg-accent" : "bg-accent-2"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}