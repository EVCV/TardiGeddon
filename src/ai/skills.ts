// The CPU's skill levels, for the menu (without downloading the CPU itself).

export type CpuSkill = 'easy' | 'normal' | 'hard' | 'perfect';

/** The skill levels offered in the menu. */
export const CPU_SKILLS: { id: CpuSkill; name: string }[] = [
  { id: 'easy', name: 'Easy' },
  { id: 'normal', name: 'Normal' },
  { id: 'hard', name: 'Hard' },
  { id: 'perfect', name: 'Expert' },
];
