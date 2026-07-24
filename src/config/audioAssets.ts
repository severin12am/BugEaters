import { CharacterType } from '../utils/constants';

/** Phaser cache keys for SFX loaded from public/assets/audio/. */
export const AUDIO_KEYS = {
  stepBug: 'audio-step-bug',
  stepHuman: 'audio-step-human',
  stepKlaus: 'audio-step-klaus',
  lampBuzz: 'audio-lamp-buzz',
  phrase2030: 'audio-phrase-2030',
  phraseBeCareful: 'audio-phrase-be-careful',
  phraseCarsFree: 'audio-phrase-cars-free',
  phraseDayBefore: 'audio-phrase-day-before',
  phraseDid1: 'audio-phrase-did-1',
  phraseDid2: 'audio-phrase-did-2',
  phraseDistortion: 'audio-phrase-distortion',
  phraseEveryoneVaccinated: 'audio-phrase-everyone-vaccinated',
  phraseForceBehaviours1: 'audio-phrase-force-behaviours-1',
  phraseForceBehaviours2: 'audio-phrase-force-behaviours-2',
  phraseForceBehaviours3: 'audio-phrase-force-behaviours-3',
  phraseForceBehaviours4: 'audio-phrase-force-behaviours-4',
  phraseForceBehaviours5: 'audio-phrase-force-behaviours-5',
  phraseFutureByUs: 'audio-phrase-future-by-us',
  phraseInfiniteCash1: 'audio-phrase-infinite-cash-1',
  phraseInfiniteCash2: 'audio-phrase-infinite-cash-2',
  phraseKing1: 'audio-phrase-king-1',
  phraseKing2: 'audio-phrase-king-2',
  phraseUntrue: 'audio-phrase-untrue',
} as const;

/** Random ambient voice lines from Unity PhraseManager. */
export const PHRASE_AUDIO_KEYS: readonly string[] = [
  AUDIO_KEYS.phrase2030,
  AUDIO_KEYS.phraseBeCareful,
  AUDIO_KEYS.phraseCarsFree,
  AUDIO_KEYS.phraseDayBefore,
  AUDIO_KEYS.phraseDid1,
  AUDIO_KEYS.phraseDid2,
  AUDIO_KEYS.phraseDistortion,
  AUDIO_KEYS.phraseEveryoneVaccinated,
  AUDIO_KEYS.phraseForceBehaviours1,
  AUDIO_KEYS.phraseForceBehaviours2,
  AUDIO_KEYS.phraseForceBehaviours3,
  AUDIO_KEYS.phraseForceBehaviours4,
  AUDIO_KEYS.phraseForceBehaviours5,
  AUDIO_KEYS.phraseFutureByUs,
  AUDIO_KEYS.phraseInfiniteCash1,
  AUDIO_KEYS.phraseInfiniteCash2,
  AUDIO_KEYS.phraseKing1,
  AUDIO_KEYS.phraseKing2,
  AUDIO_KEYS.phraseUntrue,
];

export const STEP_AUDIO_KEY: Record<CharacterType, string> = {
  [CharacterType.Bug]: AUDIO_KEYS.stepBug,
  [CharacterType.Human]: AUDIO_KEYS.stepHuman,
  [CharacterType.Klaus]: AUDIO_KEYS.stepKlaus,
};

const AUDIO_BASE = 'assets/audio';

/** File paths relative to public/ — extracted from the Unity WebGL build. */
export const AUDIO_PATHS: Record<string, string> = {
  [AUDIO_KEYS.stepBug]: `${AUDIO_BASE}/step_bug.wav`,
  [AUDIO_KEYS.stepHuman]: `${AUDIO_BASE}/step_human.wav`,
  [AUDIO_KEYS.stepKlaus]: `${AUDIO_BASE}/step_klaus.wav`,
  [AUDIO_KEYS.lampBuzz]: `${AUDIO_BASE}/lamp_buzz.wav`,
  [AUDIO_KEYS.phrase2030]: `${AUDIO_BASE}/2030.wav`,
  [AUDIO_KEYS.phraseBeCareful]: `${AUDIO_BASE}/be_careful.wav`,
  [AUDIO_KEYS.phraseCarsFree]: `${AUDIO_BASE}/cars_free.wav`,
  [AUDIO_KEYS.phraseDayBefore]: `${AUDIO_BASE}/day_before.wav`,
  [AUDIO_KEYS.phraseDid1]: `${AUDIO_BASE}/did_1.wav`,
  [AUDIO_KEYS.phraseDid2]: `${AUDIO_BASE}/did_2.wav`,
  [AUDIO_KEYS.phraseDistortion]: `${AUDIO_BASE}/distortion.wav`,
  [AUDIO_KEYS.phraseEveryoneVaccinated]: `${AUDIO_BASE}/everyone_vaccinated.wav`,
  [AUDIO_KEYS.phraseForceBehaviours1]: `${AUDIO_BASE}/force_behaviours_1.wav`,
  [AUDIO_KEYS.phraseForceBehaviours2]: `${AUDIO_BASE}/force_behaviours_2.wav`,
  [AUDIO_KEYS.phraseForceBehaviours3]: `${AUDIO_BASE}/force_behaviours_3.wav`,
  [AUDIO_KEYS.phraseForceBehaviours4]: `${AUDIO_BASE}/force_behaviours_4.wav`,
  [AUDIO_KEYS.phraseForceBehaviours5]: `${AUDIO_BASE}/force_behaviours_5.wav`,
  [AUDIO_KEYS.phraseFutureByUs]: `${AUDIO_BASE}/future_by_us.wav`,
  [AUDIO_KEYS.phraseInfiniteCash1]: `${AUDIO_BASE}/infinite_cash_1.wav`,
  [AUDIO_KEYS.phraseInfiniteCash2]: `${AUDIO_BASE}/infinite_cash_2.wav`,
  [AUDIO_KEYS.phraseKing1]: `${AUDIO_BASE}/king_1.wav`,
  [AUDIO_KEYS.phraseKing2]: `${AUDIO_BASE}/king_2.wav`,
  [AUDIO_KEYS.phraseUntrue]: `${AUDIO_BASE}/untrue.wav`,
};
