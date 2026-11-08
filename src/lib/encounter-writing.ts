import { buildManifestation, savedRendererVersion, type Intention, type SeraphConfig } from "./manifest";

export const WOVEN_DAILY_LORE_V2 = "The Woven Seraph keeps watch where the pattern breaks. Six wings carry the broken check around a single eye; gold traces the boundary between what repeats and what remains unfinished.";
export type EncounterWriting = { version: 2; dailyLore: string; passage: string; question: string; traits: string[] };

/** Absent markers always preserve the original entity-based text. Do not infer from date/renderer. */
export function savedContentVersion(snapshot: unknown): 1 | 2 {
  if (!snapshot || typeof snapshot !== "object" || !("contentVersion" in snapshot)) return 1;
  if (snapshot.contentVersion === 1 || snapshot.contentVersion === 2) return snapshot.contentVersion;
  throw new Error("Unsupported encounter content version");
}

export function visualTraitSummary(c: SeraphConfig): string[] {
  return [
    c.intention === "become" ? "Six elongated wings rise in three unfolding pairs" : c.intention === "release" ? "Six narrow wings separate from the eye; broken orbital lines" : c.intention === "receive" ? "Six broad curved wings spread around the eye" : "Six angular folded wings overlap, with gold offset echoes",
    `${c.eye.design} eye; ${c.eye.pupil === "slit" ? "slit" : "round"} pupil`,
    `${c.rings} gold orbital lines; ${c.orbit.rx > c.orbit.ry ? "wider than tall" : "taller than wide"}; ${c.orbit.satellites} satellite beads`,
    `${c.weave.angle === 0 ? "Upright" : "Diagonal"} black-and-white houndstooth; tile ${c.weave.size} SVG units`,
  ];
}

const PATHS: Record<Intention, readonly [string, string]> = {
  become: [
    "The six elongated wings rise in unequal reaches, as though the next shape were arriving at different speeds. You meet their unfolding without naming its destination. There is room here for an identity still in draft: one edge held, another already reaching beyond it. Let the distance between those wings remain a question rather than a fault. Nothing in this figure asks you to become complete before you begin.",
    "The upward wings offer several beginnings instead of one summit. Your attention can follow the longest reach, then return to a shorter wing still unfolding beside it. The diagonal check crosses those edges like a familiar language learning a different sentence. Growth, in this encounter, is not a verdict on the shape you brought with you. It is the quieter possibility that an old outline need not contain every part of what comes next.",
  ],
  release: [
    "The narrow wings stand apart from the eye, and the orbital lines leave deliberate breaks. You can look through those openings without finding something to replace them. What has loosened is not drawn as a wound; it is a distance the figure allows to remain. Stay with the interruption in the gold. An ending need not be made elegant before it is acknowledged, and an empty interval need not immediately become another obligation.",
    "Here the six wings separate like fragments that have stopped insisting on a single enclosure. The diagonal check continues across each piece, yet cannot bridge the dark between them. Your encounter rests in that disagreement: continuity in the cloth, an ending in its arrangement. You do not have to decide that everything was wasted in order to let one bond loosen. Follow an open orbital line to its break, and leave the missing stretch unfilled.",
  ],
  receive: [
    "The broad curved wings gather around the eye without sealing it away. Their spread offers a surround, not a demand. You arrive at the edge of that arrangement with no need to prove what you can carry. Notice how the figure keeps its center while making room around it. Allowing support might resemble this: not disappearing into another shape, but leaving a margin where something offered can rest without becoming a debt.",
    "Six broad wings open around the eye, their curved edges making a place rather than a barrier. The diagonal check refuses to sit squarely inside that welcome; even the cloth arrives at an angle. Your encounter need not be orderly to be receptive. What is offered may not resemble what you expected, and you may still choose its distance. Let the surrounding wings suggest a welcome with boundaries, spacious enough to include your hesitation.",
  ],
  remember: [
    "Folded wings overlap close to the eye, with fine gold echoes slightly displaced behind them. You cannot return every edge to its earlier position; the double outline keeps that difference visible. Recognition here is not a demand for perfect recall. It can begin with the way one fold shelters another, or with a familiar break in the check. Stay beside what seems known without forcing it to tell the whole story at once.",
    "The nested wings carry diagonal checks into folds that interrupt their repetition. Gold echoes linger behind the present outlines, not quite matching them. You meet a continuity that includes the places where memory shifts. Rediscovery may be less like recovering an untouched object than noticing a thread still passing through a changed arrangement. Let the diamond eye remain a boundary around that recognition; what returns can be familiar without being identical to what was left.",
  ],
};

function sensoryLine(c: SeraphConfig) {
  const eye = c.eye.design === "diamond" ? "diamond-shaped" : c.eye.design === "almond" ? "almond-shaped" : "round";
  const gaze = c.eye.pupil === "slit" ? "a narrow slit holds the center" : "a round pupil settles at the center";
  return `Within the ${eye} eye, ${gaze}; ${c.rings} gold orbital lines ${c.orbit.rx > c.orbit.ry ? "stretch sideways" : "rise taller than they spread"}.`;
}

/** Frozen content-v2 assembly: pure saved seed/intention/renderer input, no model or clock. */
export function encounterWriting(seed: number, intention: Intention, snapshot: unknown, entityName: string): EncounterWriting | null {
  if (savedContentVersion(snapshot) === 1) return null;
  const config = buildManifestation(seed, intention, savedRendererVersion(snapshot));
  // This authored vocabulary belongs only to the actual Woven Seraph renderer.
  if (entityName !== "The Woven Seraph" || config.v !== 2) return null;
  const diagonal = config.weave.angle !== 0;
  const passage = `${PATHS[intention][diagonal ? 1 : 0]} ${sensoryLine(config)}`;
  const questions: Record<Intention, readonly [string, string]> = {
    become: ["Which unfinished part of your identity could you let reach beyond its present outline?", "Which of these unequal upward reaches resembles a possibility you have not yet named?"],
    release: ["What could remain unfilled, like the break in this gold orbital line?", "Which connection could loosen while the thread of your own story continues?"],
    receive: ["Where could you leave a margin for support without surrendering your center?", "What might you allow to arrive at an unexpected angle, within your own boundaries?"],
    remember: ["Which small, familiar detail could you recognize without recovering the whole story?", "What still feels continuous even though its present outline no longer matches its echo?"],
  };
  return { version: 2, dailyLore: WOVEN_DAILY_LORE_V2, passage, question: questions[intention][diagonal ? 1 : 0], traits: visualTraitSummary(config) };
}