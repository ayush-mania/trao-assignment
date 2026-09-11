import { describe, expect, it } from 'vitest';
import type { QuestionGenInput } from '../generation/questions.js';
import { fakeLlm } from '../testing/fake-llm.js';
import type { Question, Requirement } from '../validation/kit-schema.js';
import { closeCoverage, findGaps } from './coverage.js';

const requirements: Requirement[] = [
  { id: 'r1', text: 'Node.js', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Mentoring', kind: 'behavioural', priority: 'must' },
  { id: 'r3', text: 'Kafka', kind: 'technical', priority: 'nice' },
];
const q = (id: string, ids: string[], category: Question['category'] = 'technical'): Question => ({
  id,
  requirement_ids: ids,
  category,
  prompt: `Q ${id}`,
  answer_outline: '',
  difficulty: 2,
});
const input: QuestionGenInput = {
  role: { title: 'Engineer', seniority: '', responsibilities: [] },
  requirements,
  research: { companyName: '', companyUrl: '', homepage: null, aboutPage: null, hiringPage: null, discussion: [], gaps: [] },
  hiringProcess: '',
};

describe('findGaps', () => {
  it('is a set difference split by priority', () => {
    expect(findGaps(requirements, [q('q1', ['r1'])])).toEqual({
      uncovered: ['r2', 'r3'],
      uncoveredMust: ['r2'],
      uncoveredNice: ['r3'],
    });
  });
});

describe('closeCoverage', () => {
  it('does nothing when every must-have is covered (nice gaps are reported, not chased)', async () => {
    const llm = fakeLlm([]);
    const r = await closeCoverage(input, [q('q1', ['r1']), q('q2', ['r2'], 'behavioural')], llm);
    expect(r).toMatchObject({ passes: 1, uncovered: ['r3'], stoppedBecause: 'covered' });
    expect(llm.calls).toHaveLength(0);
  });

  it('closes a must-have gap in a second pass, one call per category of gap', async () => {
    const llm = fakeLlm([
      { questions: [{ prompt: 'Kafka partitions?', requirement_ids: ['r3'], difficulty: 2 }] },
      { questions: [{ prompt: 'Tell me about mentoring', requirement_ids: ['r2'], difficulty: 1 }] },
    ]);
    const r = await closeCoverage(input, [q('q1', ['r1'])], llm);
    expect(r.passes).toBe(2);
    expect(r.uncovered).toEqual([]);
    expect(r.stoppedBecause).toBe('covered');
    expect(r.questions.map((x) => x.id)).toEqual(['q1', 'q2', 'q3']);
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[0]!.user).toContain('no question yet');
    expect(r.log).toEqual([{ pass: 2, gapsBefore: ['r2', 'r3'], generated: 2, gapsAfter: [] }]);
  });

  it('stops early when a pass makes no progress and reports the gap honestly', async () => {
    const llm = fakeLlm([
      { questions: [{ prompt: 'Unattributed', requirement_ids: [], difficulty: 2 }] },
      { questions: [{ prompt: 'Wrong id', requirement_ids: ['r1'], difficulty: 2 }] },
    ]);
    const r = await closeCoverage(input, [q('q1', ['r1']), q('q2', ['r3'])], llm);
    expect(r).toMatchObject({ passes: 2, uncovered: ['r2'], stoppedBecause: 'no_progress' });
    expect(r.questions).toHaveLength(2); // the unattributed question was discarded
  });

  it('never reuses an id after a deletion left a gap (q1, q3 → q4)', async () => {
    const llm = fakeLlm([{ questions: [{ prompt: 'm', requirement_ids: ['r2'], difficulty: 1 }] }]);
    const r = await closeCoverage(input, [q('q1', ['r1']), q('q3', ['r3'])], llm);
    expect(r.questions.map((x) => x.id)).toEqual(['q1', 'q3', 'q4']);
  });

  it('stops at the pass cap even while progress is still being made', async () => {
    const withExtraMust: QuestionGenInput = {
      ...input,
      requirements: [...requirements, { id: 'r4', text: 'Kafka ops', kind: 'technical', priority: 'must' }],
    };
    // Pass 2 closes r4 (progress, r2 still open), pass 3 closes r3 (progress, r2 still open):
    // the loop must stop because of the cap, not because of no_progress or coverage.
    const llm = fakeLlm([
      { questions: [{ prompt: 'ops', requirement_ids: ['r4'], difficulty: 2 }] }, // pass 2, technical (r3, r4)
      { questions: [] }, // pass 2, behavioural (r2)
      { questions: [{ prompt: 'kafka', requirement_ids: ['r3'], difficulty: 2 }] }, // pass 3, technical (r3)
      { questions: [] }, // pass 3, behavioural (r2)
    ]);
    const r = await closeCoverage(withExtraMust, [q('q1', ['r1'])], llm);
    expect(r.passes).toBe(3);
    expect(r.stoppedBecause).toBe('max_passes');
    expect(r.uncovered).toEqual(['r2']);
    expect(llm.calls).toHaveLength(4);
  });
});
