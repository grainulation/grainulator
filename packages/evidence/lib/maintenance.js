import { assertEvidenceMutation } from "./evidence-target.js";
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { observeCommand } from '../../shared/lib/observe-command.js';
import { loadClaims } from './load-claims.js';
import { prepareClaim, resolvePaths } from './claims-ops.js';
import { atomicWriteJSON } from '../../shared/lib/atomic.js';
import { withFileTransaction } from '../../shared/lib/transaction.js';
import { bytesDigest, captureSource, confinedEvidencePath, currentObservations, evidenceDigest, evidenceHealth, inspectObservation, premiseDigest } from './evidence-health.js';

const stamp = () => new Date().toISOString();
function load(dir) {
  const result = loadClaims(dir, { maxBytes: 8 * 1024 * 1024 });
  if (!result.data) throw new Error(result.errors[0]?.message || 'No sprint found.');
  return result.data;
}
function claimAt(data, id, active = true) {
  const claim = data.claims.find(item => item.id === id);
  if (!claim || active && claim.status !== 'active') throw new Error('Expected a known active claim ID.');
  return claim;
}
function reason(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw new Error('A nonempty reason of at most 4096 characters is required.');
  return value.trim();
}
function transaction(dir, operation) {
  assertEvidenceMutation(dir);
  const file = resolvePaths(dir).claims;
  return withFileTransaction(file, () => {
    const data = load(dir);
    const result = operation(data);
    const health = evidenceHealth(data, dir);
    if (health.errors.length) throw new Error(health.errors.map(error => error.message).join(' '));
    atomicWriteJSON(file, data, 2);
    return { status: 'ok', ...result };
  });
}
function checkHistoryCapacity(claim) {
  const entries = claim.maintenance_history ?? [];
  if (!Array.isArray(entries)) throw new Error('Invalid claim maintenance history.');
  if (entries.length >= 1000) throw new Error('Claim maintenance history limit reached; create a correction.');
}
function history(claim, action, details) {
  checkHistoryCapacity(claim);
  claim.maintenance_history ??= [];
  claim.maintenance_history.push({ action, at: stamp(), ...details });
}

export function linkPremises(dir, args) {
  return transaction(dir, data => {
    const claim = claimAt(data, args.claim_id);
    if (!Array.isArray(args.premises) || args.premises.length > 64
      || new Set(args.premises).size !== args.premises.length) throw new Error('premises must contain at most 64 unique claim IDs.');
    const explanation = reason(args.reason);
    const links = args.premises.map(id => {
      const parent = claimAt(data, id);
      if (id === claim.id) throw new Error('A claim cannot depend on itself.');
      return { claim_id: id, claim_sha256: premiseDigest(parent) };
    });
    history(claim, 'link_premises', { reason: explanation, previous: claim.premises || [], next: links });
    claim.premises = links;
    return { claim_id: claim.id, premises: links };
  });
}

export function correctClaim(dir, args) {
  return transaction(dir, data => {
    if (Object.keys(args).some(key => !['claim_id', 'id', 'content', 'reason', 'dir'].includes(key)))
      throw new Error('Corrections accept only claim_id, new id, content and reason; successors always start at stated evidence.');
    const previous = claimAt(data, args.claim_id);
    const explanation = reason(args.reason);
    if (typeof args.id !== 'string' || !args.id.trim() || args.id === previous.id) throw new Error('A new replacement ID is required.');
    const result = prepareClaim(dir, { id: args.id, content: args.content, type: previous.type,
      topic: previous.topic, evidence: 'stated',
      source: { origin: 'explicit-correction', artifact: null }, tags: previous.tags || [] }, data);
    if (result.status !== 'ok') throw new Error(result.message);
    const replacement = result.claim;
    replacement.supersedes = previous.id;
    // Existing dependency links are historical; new conclusions must link explicitly.
    previous.status = 'superseded';
    previous.resolved_by = replacement.id;
    previous.resolution = { winner: replacement.id, reason: explanation, resolved_at: stamp() };
    history(previous, 'correct', { reason: explanation, replacement: replacement.id });
    return { previous: previous.id, replacement: replacement.id,
      needs_reverification: evidenceHealth(data, dir).needs_reverification };
  });
}

export function observeSource(dir, args) {
  return transaction(dir, data => {
    const claim = claimAt(data, args.claim_id);
    if ((claim.observations || []).length >= 128) throw new Error('Observation limit reached; correct the claim.');
    const observation = { id: randomUUID(), kind: 'source', captured_at: stamp(),
      ...(args.supersedes ? { supersedes: args.supersedes } : {}),
      ...captureSource(dir, args.path, args.start_line, args.end_line) };
    claim.observations ??= [];
    claim.observations.push(observation);
    history(claim, 'observe_source', { observation_id: observation.id });
    return { observation, limits: 'Captures local source bytes; it does not establish semantic support or raise an evidence tier.' };
  });
}

/** Explicit local CLI verification only: never invoked by compile/status/report. */
export async function observeExecution(dir, args) {
  const before = load(dir);
  const beforeClaim = claimAt(before, args.claim_id);
  checkHistoryCapacity(beforeClaim);
  if (!Array.isArray(args.argv) || !args.argv.length || args.argv.length > 100
    || args.argv.some(value => typeof value !== 'string' || !value || value.includes('\0') || value.length > 16384))
    throw new Error('argv must be a nonempty JSON array of executable and literal arguments.');
  if (!Array.isArray(args.files) || !args.files.length || args.files.length > 64
    || new Set(args.files).size !== args.files.length) throw new Error('Execution requires 1–64 unique bound source files.');
  const timeout = args.timeout_ms ?? 60000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300000) throw new Error('timeout_ms must be between 1 and 300000.');
  const inputs = args.files.map(file => captureSource(dir, file, 1, 1));
  const pending = { id: randomUUID(), kind: 'execution', argv: args.argv, inputs,
    ...(args.supersedes !== undefined ? { supersedes: args.supersedes } : {}) };
  // Reject an inadmissible receipt before running a potentially effectful command.
  // The transaction below still rechecks the claim after execution for races.
  currentObservations({ ...beforeClaim, observations: [...(beforeClaim.observations || []), pending] });
  const health = evidenceHealth(before, dir);
  if (health.errors.length) throw new Error(health.errors.map(error => error.message).join(' '));
  const started = stamp(), startedMs = Date.now();
  const child = await observeCommand(args.argv, fs.realpathSync(dir), timeout);
  const output = Buffer.concat([Buffer.from(child.stdout || ''), Buffer.from('\0'), Buffer.from(child.stderr || '')]);
  let inputChanged = true;
  try { inputChanged = evidenceDigest(args.files.map(file => captureSource(dir, file, 1, 1))) !== evidenceDigest(inputs); } catch {}
  const observation = { ...pending, started_at: started,
    duration_ms: Date.now() - startedMs, argv: args.argv, cwd: '.', inputs,
    inputs_sha256: evidenceDigest(inputs), input_changed: inputChanged,
    exit_code: child.code, signal: child.signal, failure: child.failure,
    output_sha256: bytesDigest(output), stdout_sha256: bytesDigest(child.stdout || ''), stderr_sha256: bytesDigest(child.stderr || '') };
  return transaction(dir, data => {
    const claim = claimAt(data, args.claim_id);
    if (premiseDigest(claim) !== premiseDigest(beforeClaim)) throw new Error('Claim changed during execution; receipt was not attached.');
    if ((claim.observations || []).length >= 128) throw new Error('Observation limit reached; correct the claim.');
    claim.observations ??= [];
    claim.observations.push(observation);
    history(claim, 'observe_execution', { observation_id: observation.id });
    return { observation, check: inspectObservation(dir, observation),
      limits: 'The command executed locally with inherited host permissions; passing proves this command result on the bound files, not semantic correctness.' };
  });
}

export function inspectEvidence(dir) { return { status: 'ok', ...evidenceHealth(load(dir), dir) }; }

export function findingAction(dir, args) {
  return transaction(dir, data => {
    const claim = claimAt(data, args.claim_id);
    const prior = claim.audit || { revision: 0, verdict: 'unverified', resolution: 'open', duplicate_of: null };
    if (!Number.isSafeInteger(args.expected_revision) || args.expected_revision !== prior.revision)
      throw new Error(`Audit revision changed; refresh and retry with expected_revision ${prior.revision}.`);
    const explanation = reason(args.reason);
    const next = { ...prior, revision: prior.revision + 1 };
    if (args.action === 'verify') {
      if (!['confirmed', 'partial', 'refuted'].includes(args.verdict)) throw new Error('verdict must be confirmed, partial or refuted.');
      const observation = currentObservations(claim).find(item => item.id === args.observation_id);
      if (!observation || !['intact', 'passed'].includes(inspectObservation(dir, observation).status))
        throw new Error('Verification requires a current local source or passing execution observation.');
      next.verdict = args.verdict; next.observation_id = observation.id;
    } else if (args.action === 'resolve') {
      if (!['fixed', 'already_fixed', 'wont_fix'].includes(args.resolution)) throw new Error('resolution must be fixed, already_fixed or wont_fix.');
      if (args.resolution !== 'wont_fix') {
        const observation = currentObservations(claim).find(item => item.id === args.observation_id);
        if (!observation || !['intact', 'passed'].includes(inspectObservation(dir, observation).status))
          throw new Error('A fixed resolution requires a current observation.');
        next.resolution_observation_id = observation.id;
      }
      next.resolution = args.resolution;
    } else if (args.action === 'reopen') {
      next.resolution = 'open'; next.duplicate_of = null;
      delete next.resolution_observation_id;
    }
    else if (args.action === 'duplicate') {
      const target = claimAt(data, args.duplicate_of);
      const seen = new Set([claim.id]);
      let cursor = target;
      while (cursor) {
        if (seen.has(cursor.id)) throw new Error('Duplicate links cannot form cycles.');
        seen.add(cursor.id);
        cursor = cursor.audit?.duplicate_of ? claimAt(data, cursor.audit.duplicate_of) : null;
      }
      next.duplicate_of = target.id;
    } else throw new Error('Unknown finding action.');
    claim.audit = next;
    history(claim, `finding_${args.action}`, { reason: explanation, previous: prior, next });
    return { claim_id: claim.id, audit: next };
  });
}

export function duplicateCandidates(dir) {
  const data = load(dir), groups = new Map();
  const eligible = data.claims.filter(claim => claim.status === 'active' && !claim.audit?.duplicate_of
    && !['fixed', 'already_fixed', 'wont_fix'].includes(claim.audit?.resolution) && claim.audit?.verdict !== 'refuted');
  if (eligible.length > 10000) throw new Error('Too many findings.');
  for (const claim of eligible) for (const obs of currentObservations(claim)) {
    if (obs.kind !== 'source' || inspectObservation(dir, obs).status !== 'intact') continue;
    const key = JSON.stringify([obs.path, obs.file_sha256]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ claim_id: claim.id, start_line: obs.start_line, end_line: obs.end_line });
  }
  const pairs = new Map();
  for (const [key, ranges] of groups) {
    ranges.sort((a, b) => a.start_line - b.start_line || a.claim_id.localeCompare(b.claim_id));
    for (let i = 0; i < ranges.length; i++) for (let j = i + 1; j < ranges.length && ranges[j].start_line <= ranges[i].end_line; j++) {
      const a = ranges[i], b = ranges[j];
      if (a.claim_id === b.claim_id) continue;
      const ids = [a.claim_id, b.claim_id].sort(), id = JSON.stringify([key, ids]);
      pairs.set(id, { claim_ids: ids, path: JSON.parse(key)[0], file_sha256: JSON.parse(key)[1],
        overlap: { start_line: Math.max(a.start_line, b.start_line), end_line: Math.min(a.end_line, b.end_line) } });
      if (pairs.size > 10000) throw new Error('Too many duplicate candidates; narrow the sprint.');
    }
  }
  return { status: 'ok', candidates: [...pairs.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    limits: 'Shared current source ranges are candidates only; distinct defects may occupy the same lines. No records were merged.' };
}

export function listFindings(dir) {
  return { status: 'ok', findings: load(dir).claims.filter(claim => claim.status === 'active').map(claim => {
    const observations = currentObservations(claim);
    const support = id => !id ? 'not_recorded' : observations.some(item => item.id === id)
      ? inspectObservation(dir, observations.find(item => item.id === id)).status : 'superseded';
    return { claim_id: claim.id, content: claim.content,
      audit: claim.audit || { revision: 0, verdict: 'unverified', resolution: 'open', duplicate_of: null },
      verification_observation_status: support(claim.audit?.observation_id),
      resolution_observation_status: support(claim.audit?.resolution_observation_id),
    };
  }) };
}

export function acceptanceGaps(dir) {
  const data = load(dir), questions = [];
  if (!data.meta?.question?.trim()) questions.push({ field: 'question', question: 'What concrete outcome should this work achieve?' });
  if (!data.claims.some(claim => claim.status === 'active' && claim.type === 'constraint'
    && claim.topic === 'done-criteria' && claim.content?.trim()))
    questions.push({ field: 'done', question: 'What observable result will establish completion?' });
  return { status: 'ok', questions, clarification_needed: questions.length > 0,
    limits: 'Checks explicit missing goal/completion fields, not model-scored ambiguity. No compulsory interview or model call.' };
}

export function setAcceptance(dir, args) {
  return transaction(dir, data => {
    const explanation = reason(args.reason);
    if (args.question !== undefined) {
      if (typeof args.question !== 'string' || !args.question.trim()) throw new Error('question must be nonempty.');
      data.meta.acceptance_history ??= [];
      data.meta.acceptance_history.push({ at: stamp(), previous_question: data.meta.question, reason: explanation });
      data.meta.question = args.question.trim();
    }
    if (args.done !== undefined) {
      if (typeof args.done !== 'string' || !args.done.trim()) throw new Error('done must be nonempty.');
      const id = `done-${randomUUID()}`;
      const result = prepareClaim(dir, { id, type: 'constraint', topic: 'done-criteria', content: args.done.trim(),
        evidence: 'stated', source: { origin: 'stakeholder' } }, data);
      if (result.status !== 'ok') throw new Error(result.message);
      for (const old of data.claims.filter(claim => claim.id !== id && claim.status === 'active' && claim.type === 'constraint' && claim.topic === 'done-criteria')) {
        old.status = 'superseded'; old.resolved_by = id;
        old.resolution = { winner: id, reason: explanation, resolved_at: stamp() };
      }
    }
    if (args.question === undefined && args.done === undefined) throw new Error('Supply question or done.');
    return { question: data.meta.question, done: args.done ?? null };
  });
}
