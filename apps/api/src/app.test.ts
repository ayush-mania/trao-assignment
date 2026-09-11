// Runs against a real MongoDB (docker compose up -d mongo) with a fake LLM and fixture fetch.
import { fakeLlm, fixtureFetch } from '@trao/core/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

process.env.MONGODB_URI ??= 'mongodb://localhost:27017/trao-test';
process.env.MONGODB_URI = process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, '/trao-test$1');
process.env.SESSION_SECRET ??= 'test-secret';

const { createApp } = await import('./app.js');
const { connectDb, disconnectDb } = await import('./db.js');
const { Runner } = await import('./services/runner.js');
const { Session } = await import('./models/session.js');
const { KitModel } = await import('./models/kit.js');

const JD = `Backend Engineer at Acme Robotics\n\nRequirements:\n- Node.js\n- Mentoring engineers`;

function scriptedLlm() {
  return fakeLlm([
    {
      title: 'Backend Engineer',
      company: 'Acme Robotics',
      requirements: [
        { text: 'Node.js', evidence: 'Node.js', kind: 'technical' },
        { text: 'Mentoring engineers', evidence: 'Mentoring engineers', kind: 'behavioural' },
      ],
    },
    { summary: 'Acme builds robots.', what_they_do: 'Robots.', hiring_process: 'Take-home.' },
    { questions: [{ prompt: 'Event loop?', requirement_ids: ['r1'], difficulty: 2 }] },
    { questions: [{ prompt: 'Mentoring?', requirement_ids: ['r2'], difficulty: 1 }] },
    { questions: [{ prompt: 'Design ingestion', requirement_ids: ['r1'], difficulty: 3 }] }, // hiring page mentions system design
    { questions: [{ prompt: 'Why Acme?', requirement_ids: [], difficulty: 1 }] },
    { flashcards: [{ front: 'Loop?', back: 'phases', requirement_ids: ['r1'] }] },
  ]);
}

let runner: InstanceType<typeof Runner>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await connectDb(process.env.MONGODB_URI!);
});
beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
  // A fresh scripted model per test: answers are consumed in pipeline order.
  const llm = scriptedLlm();
  runner = new Runner({
    deps: {
      llm,
      crawl: { policy: { allowPrivate: true }, fetchImpl: fixtureFetch, delayMs: 0 },
      discussion: { fetchImpl: fixtureFetch },
    },
  });
  app = createApp(runner, llm);
});
afterAll(async () => {
  runner.stop();
  await disconnectDb();
});

async function signUp(email = 'a@example.com') {
  const agent = request.agent(app);
  const res = await agent.post('/auth/register').send({ email, password: 'correct horse battery' });
  expect(res.status).toBe(201);
  return agent;
}

describe('auth', () => {
  it('registers, keeps a session via cookie, logs out, and then is signed out', async () => {
    const agent = await signUp();
    expect((await agent.get('/auth/me')).body.user.email).toBe('a@example.com');
    expect((await agent.post('/auth/logout')).status).toBe(204);
    expect((await agent.get('/auth/me')).status).toBe(401);
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    await signUp();
    const wrong = await request(app)
      .post('/auth/login')
      .send({ email: 'a@example.com', password: 'nope nope nope' });
    const unknown = await request(app)
      .post('/auth/login')
      .send({ email: 'x@example.com', password: 'nope nope nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('treats an expired session as signed out', async () => {
    const agent = await signUp();
    await Session.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('validates bodies and refuses duplicate emails', async () => {
    expect(
      (await request(app).post('/auth/register').send({ email: 'bad', password: 'short' })).status,
    ).toBe(400);
    await signUp();
    expect(
      (
        await request(app)
          .post('/auth/register')
          .send({ email: 'a@example.com', password: 'correct horse battery' })
      ).status,
    ).toBe(409);
  });
});

describe('kits', () => {
  it('requires a session for every kit route', async () => {
    expect((await request(app).get('/kits')).status).toBe(401);
    expect((await request(app).post('/kits').send({})).status).toBe(401);
  });

  it('creates a kit, runs it to done through the runner, and serves it back with step progress', async () => {
    const agent = await signUp();
    const created = await agent
      .post('/kits')
      .send({ jd: JD, company_url: 'http://localhost:8099/acme/', days: 2 });
    expect(created.status).toBe(202);
    const id = created.body.kit._id;
    await runner.idle();
    const res = await agent.get(`/kits/${id}`);
    expect(res.body.kit.status).toBe('done');
    expect(res.body.kit.state.steps.map((s: { name: string }) => s.name)).toContain(
      'assemble_and_validate',
    );
    expect(res.body.kit.kit.role.requirements).toHaveLength(2);
    expect(res.body.kit.kit.schedule.days).toHaveLength(2);
    expect(res.body.kit.runLock).toBeNull();
  });

  it('returns the existing kit for the same description, company and days (duplicate submission)', async () => {
    const agent = await signUp();
    const a = await agent
      .post('/kits')
      .send({ jd: JD, company_url: 'http://localhost:8099/acme/', days: 2 });
    const b = await agent
      .post('/kits')
      .send({ jd: `  ${JD}  `, company_url: 'HTTP://localhost:8099/acme/', days: 2 });
    expect(b.status).toBe(200);
    expect(b.body.reused).toBe(true);
    expect(b.body.kit._id).toBe(a.body.kit._id);
    await runner.idle();
  });

  it('never shows one user another user’s kit', async () => {
    const alice = await signUp('alice@example.com');
    const bob = await signUp('bob@example.com');
    const created = await alice
      .post('/kits')
      .send({ jd: JD, company_url: 'http://localhost:8099/acme/', days: 1 });
    await runner.idle();
    expect((await bob.get(`/kits/${created.body.kit._id}`)).status).toBe(404);
    expect((await bob.delete(`/kits/${created.body.kit._id}`)).status).toBe(404);
    expect((await bob.get('/kits')).body.kits).toEqual([]);
    expect((await alice.get('/kits')).body.kits).toHaveLength(1);
  });

  it('rejects invalid input with structured issues and 404s a malformed id', async () => {
    const agent = await signUp();
    const bad = await agent.post('/kits').send({ jd: '', company_url: 'x', days: 0 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.issues.map((i: { path: string }) => i.path)).toEqual(['jd', 'days']);
    expect((await agent.get('/kits/not-an-id')).status).toBe(404);
  });

  it('a booting runner clears locks so a fast restart never strands a kit', async () => {
    const agent = await signUp();
    const created = await agent
      .post('/kits')
      .send({ jd: JD, company_url: 'http://localhost:8099/acme/', days: 1 });
    await runner.idle();
    await KitModel.updateOne(
      { _id: created.body.kit._id },
      { $set: { status: 'running', runLock: new Date() } },
    );
    const rebooted = new Runner({
      deps: { llm: fakeLlm([]), crawl: { policy: { allowPrivate: true } } },
    });
    expect(await rebooted.recover()).toBe(1);
    await rebooted.idle();
    const after = await KitModel.findById(created.body.kit._id).lean();
    expect(after!.status).toBe('done'); // state was already complete; the lock no longer blocks finalising
    expect(after!.runLock).toBeNull();
  });

  it('a live runner does not run a step another runner holds, but takes over a stale lock', async () => {
    const agent = await signUp();
    const created = await agent
      .post('/kits')
      .send({ jd: JD, company_url: 'http://localhost:8099/acme/', days: 1 });
    await runner.idle();
    await KitModel.updateOne(
      { _id: created.body.kit._id },
      { $set: { status: 'running', runLock: new Date() } },
    );
    const second = new Runner({
      deps: { llm: fakeLlm([]), crawl: { policy: { allowPrivate: true } } },
    });
    second.enqueue(created.body.kit._id);
    await second.idle();
    const still = await KitModel.findById(created.body.kit._id).lean();
    expect(still!.status).toBe('running'); // fresh lock respected: not touched
    await KitModel.updateOne(
      { _id: created.body.kit._id },
      { $set: { runLock: new Date(Date.now() - 10 * 60 * 1000) } },
    );
    second.enqueue(created.body.kit._id);
    await second.idle();
    const after = await KitModel.findById(created.body.kit._id).lean();
    expect(after!.status).toBe('done'); // stale lock taken over; state already complete → finalised
  });
});

describe('builder', () => {
  async function doneKit() {
    const agent = await signUp();
    const created = await agent
      .post('/kits')
      .send({ jd: JD, company_url: 'http://localhost:8099/acme/', days: 2 });
    await runner.idle();
    return { agent, id: created.body.kit._id as string };
  }

  it('edits, adds, reorders, pins and deletes through the API; every write re-validates', async () => {
    const { agent, id } = await doneKit();
    const edited = await agent.patch(`/kits/${id}/questions/q1`).send({ prompt: 'Edited by user' });
    expect(edited.status).toBe(200);
    expect(edited.body.meta.items.q1.origin).toBe('edited');
    const added = await agent
      .post(`/kits/${id}/questions`)
      .send({ category: 'technical', prompt: 'Mine', requirement_ids: ['r1'] });
    const newId = added.body.meta.order.technical.at(-1);
    expect(added.body.meta.items[newId].origin).toBe('manual');
    const reordered = await agent
      .put(`/kits/${id}/order`)
      .send({ category: 'technical', ids: [newId, 'q1'] });
    expect(reordered.body.kit.questions[0].id).toBe(newId);
    expect(
      (await agent.put(`/kits/${id}/order`).send({ category: 'technical', ids: ['q1'] })).status,
    ).toBe(400);
    expect(
      (await agent.post(`/kits/${id}/items/q1/pin`).send({ pinned: true })).body.meta.items.q1
        .pinned,
    ).toBe(true);
    expect(
      (await agent.patch(`/kits/${id}/questions/q1`).send({ requirement_ids: ['r99'] })).status,
    ).toBe(400);
    const deleted = await agent.delete(`/kits/${id}/items/${newId}`);
    expect(deleted.body.kit.questions.map((q: { id: string }) => q.id)).not.toContain(newId);
    expect((await agent.delete(`/kits/${id}/items/q404`)).status).toBe(404);
  });

  it('regenerating a category keeps the edited question and replaces the generated one', async () => {
    const { agent, id } = await doneKit();
    await agent.patch(`/kits/${id}/questions/q1`).send({ prompt: 'Keep me' });
    // scripted answers are exhausted; give the client one more for the regeneration call
    const before = await agent.get(`/kits/${id}`);
    const technicalBefore = before.body.kit.kit.questions.filter(
      (q: { category: string }) => q.category === 'technical',
    );
    expect(technicalBefore).toHaveLength(1);
    const regen = await agent
      .post(`/kits/${id}/regenerate`)
      .send({ section: 'questions:technical' });
    expect(regen.status).toBe(503); // model unavailable → surfaced as LLM_UNAVAILABLE, nothing changed
    expect(regen.body.error.code).toBe('LLM_UNAVAILABLE');
    const after = await agent.get(`/kits/${id}`);
    expect(after.body.kit.kit.questions.find((q: { id: string }) => q.id === 'q1').prompt).toBe(
      'Keep me',
    );
  });

  it('regenerating the schedule with a new day count is deterministic and keeps edits', async () => {
    const { agent, id } = await doneKit();
    await agent.patch(`/kits/${id}/brief`).send({ summary: 'My own summary' });
    const r = await agent.post(`/kits/${id}/regenerate`).send({ section: 'schedule', days: 5 });
    expect(r.status).toBe(200);
    expect(r.body.kit.schedule.days).toHaveLength(5);
    expect(r.body.kit.company_brief.summary).toBe('My own summary');
    expect(r.body.meta.sections.company_brief.origin).toBe('edited');
  });

  it('refuses builder operations on another user’s kit and on an unfinished kit', async () => {
    const { id } = await doneKit();
    const bob = await signUp('bob@example.com');
    expect((await bob.patch(`/kits/${id}/questions/q1`).send({ prompt: 'x' })).status).toBe(404);
    const queued = await bob
      .post('/kits')
      .send({ jd: 'Go developer wanted.', company_url: 'http://localhost:1/', days: 1 });
    runner.stop();
    expect(
      (await bob.patch(`/kits/${queued.body.kit._id}/brief`).send({ summary: 'x' })).status,
    ).toBe(409);
  });
});
