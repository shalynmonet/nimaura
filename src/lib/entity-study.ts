import { mulberry32, type Intention } from "./manifest";

export const STUDY_PATHS: Intention[] = ["become", "release", "receive", "remember"];
export const STUDY_SEEDS = [408325749, 73120846] as const;
export type StudyIdentity = "seraph" | "orbital" | "veiled";
export const ENTITY_LINEUP = [
  { id: "seraph", name: "The Woven Seraph", epithet: "Watcher of the unfinished", meaning: "Identity held in living threads", structure: "Six curled wings around one living eye", material: "Houndstooth silk, ivory sclera, gold seams", motion: "Phased wing breathing and a wandering gaze", lore: "Before the first threshold had a name, a watcher gathered the threads left by those who crossed it. Six wings carry what was not yet finished; its eye attends to the space between a shape and the shape it might become." },
  { id: "orbital", name: "The Parallax Choir", epithet: "Witnesses without a centre", meaning: "Relationship without a fixed hierarchy", structure: "Intersecting annular bands with distributed eyes; an empty centre", material: "Woven enamel bands, polished gold rims, pearl eyes", motion: "Independent counter-precession; eyes travel with their own bands", lore: "The Choir formed where seven routes crossed without meeting. No eye commands another, and nothing occupies its centre. Its woven rings carry witnesses past one another, keeping distance without mistaking distance for absence. A changed angle makes a different relationship visible." },
  { id: "veiled", name: "The Foldkeeper", epithet: "Custodian of the unspoken", meaning: "Privacy as a living threshold", structure: "A tall asymmetrical mantle of folded fabric around a concealed pearl", material: "Woven satin, gilded hems, luminous porcelain", motion: "Travelling pleats open and close a narrow inner aperture", lore: "The Foldkeeper keeps no door and carries no key. It gathers the folds of things not ready to be spoken, sheltering a porcelain presence behind a moving seam. Its mantle never opens all at once. What is glimpsed remains whole even when it cannot be seen." },
  { id: "crystalline", name: "The Quiet Prism", epithet: "Bearer of divided light", meaning: "Difference without fracture", structure: "Asymmetric suspended translucent volumes with woven inclusions", material: "Smoky crystal, ivory inclusions, gold edges", motion: "Unequal facets pulse and gently change spacing", lore: "A single light learned to inhabit unequal chambers without making them alike." },
  { id: "organism", name: "The Astral Orchard", epithet: "Gardener of unopened rooms", meaning: "Growth through patient branching", structure: "Curved branching skeleton and opening chambers", material: "Porcelain ribs, woven membranes, warm gold joints", motion: "Branches flex as chambers unfurl in a travelling sequence", lore: "Its chambers grew around the pauses between distant stars." },
  { id: "fragmented", name: "The Unbound Reliquary", epithet: "Keeper of distant pieces", meaning: "Continuity without physical attachment", structure: "Separated irregular relics bound by invisible orbital relationships", material: "Broken woven ceramic, exposed gold cores", motion: "Fragments exchange positions without touching", lore: "Nothing broke it; its pieces chose a distance that could hold them all." },
  { id: "labyrinth", name: "The Turning House", epithet: "Architect of the inward passage", meaning: "Orientation through change", structure: "Interlocking architectural corridors and shifting focal chamber", material: "Ivory masonry, woven inlays, gold lintels", motion: "Passages slide while a small focal light migrates", lore: "It remembers every visitor as a passage, never as a prisoner." },
] as const;

const directions = {
  seraph: {
    become: ["Elongated ascending wings", "Upward unfolding", "What part of you is still taking shape?"],
    release: ["Separated wing roots and open space", "Outward loosening", "Which thread can remain unfinished?"],
    receive: ["Broad sheltering wings", "Inward breathing", "What could the wings shelter without closing?"],
    remember: ["Nested curled wings", "Echoing phases", "Which familiar fold still belongs to you?"],
  },
  orbital: {
    become: ["Steep ascending ring axes", "Accelerating counter-precession", "Which relationship changes when you rise?"],
    release: ["Displaced rings and wider empty centre", "Slow outward drift", "Which orbit no longer needs your centre?"],
    receive: ["Broad overlapping annular bowls", "Inward cupping pulse", "Can you accept attention from more than one direction?"],
    remember: ["Closely nested ring tracks", "Recurring alignment", "What returns when two distant tracks align?"],
  },
  veiled: {
    become: ["Tall tapered mantle and rising opening", "Pleats travel upward", "What is ready to emerge without being forced?"],
    release: ["Separated hems and a wide aperture", "Folds peel away", "What can leave without exposing everything?"],
    receive: ["Broad rounded protective folds", "Aperture gently cups inward", "What deserves shelter before it is named?"],
    remember: ["Layered inset folds and a narrow seam", "An earlier fold repeats behind the first", "Which hidden seam do you recognize?"],
  },
} as const;

export function buildEntityStudy(identity: StudyIdentity, seed: number, path: Intention) {
  const random = mulberry32(seed ^ (identity === "orbital" ? 93017 : identity === "veiled" ? 42731 : 0));
  return { studyVersion: 1, identity, seed, path,
    count: identity === "orbital" ? 4 + Math.floor(random() * 3) : identity === "veiled" ? 7 + Math.floor(random() * 4) : 6,
    aspect: .78 + random() * .36, opening: .25 + random() * .28,
    weave: 6 + Math.floor(random() * 5), rhythm: path === "become" ? .7 : path === "release" ? .4 : path === "receive" ? .5 : .32,
    parts: Array.from({ length: 12 }, () => ({ phase: random() * Math.PI * 2, tilt: random() * .8, breadth: .15 + random() * .22, offset: (random() - .5) * .45 })),
  };
}
export type EntityStudyConfig = ReturnType<typeof buildEntityStudy>;
export function studyDirection(identity: StudyIdentity, path: Intention) { return directions[identity][path]; }
export function studyWriting(config: EntityStudyConfig) {
  const { identity, path, count, aspect, opening } = config;
  const narrow = aspect < .95;
  const observed = identity === "orbital"
    ? `${count} woven bands cross at ${narrow ? "steep, close" : "broad, unequal"} angles. Each carries its own pearl witness; the centre stays empty.`
    : identity === "veiled"
    ? `${count} unequal folds gather into a ${narrow ? "slender" : "broad"} mantle. A ${opening < .4 ? "fine" : "generous"} seam admits the light of a porcelain presence, while the gold hems mark what remains concealed.`
    : `Six patterned wings curl around a watchful eye. Their unequal lengths and woven seams carry a rhythm that never quite repeats from one wing to the next.`;
  const passages = {
    orbital: {
      become: "The rings stand more steeply, making a path upward without assembling a ladder. As they counter-turn, a witness once hidden behind another band becomes visible. Becoming here is not the occupation of the empty centre; it is a changed angle within a company that already exists.",
      release: "The bands drift apart without losing their relation. Through the widened centre, you see the darkness that was always present. No ring falls away and no eye pursues it. Release takes the form of distance: enough space for each witness to keep its own course.",
      receive: "The bands broaden into overlapping bowls. Their pulse brings the witnesses inward, but the hollow remains unclaimed. There is room for attention without a single owner of it. Receiving does not require you to become the centre around which every other presence must turn.",
      remember: "Nested tracks return to a brief alignment and then part again. The eyes do not hold that meeting still. Recognition lives in the interval between one crossing and the next: a relation can endure without preserving the exact position in which you first found it.",
    },
    veiled: {
      become: "A travelling pleat lifts the opening higher. The inner presence is not pulled into view; the cloth makes room for it to appear. Becoming belongs to the seam as much as to what it shelters. An outline can change without surrendering every private layer at once.",
      release: "The hems peel outward, admitting darkness between the folds. The porcelain presence remains intact behind them. What loosens is not the whole mantle but its grip on one edge. Release can leave a shelter standing while allowing something once held there to pass beyond it.",
      receive: "Rounded folds cup toward the light, then soften away again. The aperture welcomes without becoming a display. Nothing asks the hidden presence to explain itself. Receiving here is a shape the cloth makes: a place where arrival need not be followed immediately by exposure.",
      remember: "A second fold follows the first, carrying an earlier curve back toward the seam. The presence flickers into recognition rather than full disclosure. What returns is not a perfect view but the contour of a shelter you have known: familiar, yet still allowed its hidden rooms.",
    },
    seraph: {
      become: "The wings lengthen upward, each opening a little before its neighbour. Its gaze remains low enough to meet you. Growth is held between those two gestures: the reach toward a possible shape and the attention that does not abandon what is already here. Nothing in the weave asks you to finish today.",
      release: "The roots loosen and darkness enters between the wings. The eye does not close against that space. A thread can cease to bind without vanishing from the weave; a shape can be recognized by what it no longer encloses. The watcher attends to the opening, not to the demand to fill it.",
      receive: "The broad wings gather around the gaze without shutting it away. Their motion resembles shelter rather than capture. Light passes between the folds, touching the woven surface before reaching the eye. What arrives may rest here without becoming another thread you must immediately learn to carry.",
      remember: "The wings curl into nested echoes, one seam answering another. The eye wanders, then returns across the same opening. Recognition does not flatten their differences. What was woven before remains present in the living surface, not as a command to repeat it but as a contour still available to touch.",
    },
  };
  return { passage: `${observed} ${passages[identity][path]}`, question: directions[identity][path][2] };
}

export const STUDY_CLUES = {
  seraph: ["Six pauses surround a listening dark.", "A thread watches what it cannot bind.", "The unfinished has a witness."],
  orbital: ["Several witnesses agree on no centre.", "A crossing is not a collision.", "Distance keeps its own company."],
  veiled: ["A seam admits what a door cannot.", "The hidden remains whole.", "One fold remembers another."],
};