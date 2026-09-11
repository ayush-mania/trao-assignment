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
  runner = new Runner({
    deps: {
      llm: scriptedLlm(),
      crawl: { policy: { allowPrivate: true }, fetchImpl: fixtureFetch, delayMs: 0 },
      discussion: { fetchImpl: fixtureFetch },
    },
  });
  app = createApp(runner);
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

  it('recovers unfinished kits on boot and does not run a step that another runner holds', async () => {
    const agent = await signUp();
    const created = await agent
      .post('/kits')
      .send({ jd: JD, company_url: 'http://localhost:8099/acme/', days: 1 });
    await runner.idle();
    // Simulate a crash mid-run: status running with a fresh lock, then a stale lock.
    await KitModel.updateOne(
      { _id: created.body.kit._id },
      { $set: { status: 'running', runLock: new Date() } },
    );
    const second = new Runner({
      deps: { llm: fakeLlm([]), crawl: { policy: { allowPrivate: true } } },
    });
    expect(await second.recover()).toBe(1);
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
