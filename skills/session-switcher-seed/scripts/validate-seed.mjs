#!/usr/bin/env node
// Validate a Local Session Switcher seed file before importing it.
//
//   node validate-seed.mjs path/to/project.seed.json
//
// Mirrors the extension's runtime rules: origins, recipe-on-origins, template
// variable scope (an unknown {{var}} aborts the real run), extract-rule shape,
// clear-rule shapes, and user structure. Exits 0 when clean, 1 otherwise.
// Zero dependencies.

import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node validate-seed.mjs <seed.json>');
  process.exit(1);
}

const errors = [];
const warnings = [];
const err = (path, message) => errors.push(`${path}: ${message}`);
const warn = (path, message) => warnings.push(`${path}: ${message}`);

let raw;
try {
  raw = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`FAIL ${file}\n  json: ${error.message}`);
  process.exit(1);
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const BODY_TYPES = ['json', 'form', 'raw'];
const RELOADS = ['matching-tabs', 'active-tab', 'none'];
const SAME_SITE = ['no_restriction', 'lax', 'strict', 'unspecified'];
const EXTRACT_KEYS = ['jsonPath', 'regex', 'header', 'cookie'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const TEMPLATE_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

function templatesIn(value, scope, path) {
  if (isStr(value)) {
    for (const match of value.matchAll(TEMPLATE_RE)) {
      if (!scope.has(match[1])) err(path, `unknown template variable {{${match[1]}}} — available: ${[...scope].join(', ')}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, i) => templatesIn(entry, scope, `${path}[${i}]`));
    return;
  }
  if (isObj(value)) {
    for (const [key, entry] of Object.entries(value)) templatesIn(entry, scope, `${path}.${key}`);
  }
}

function validateOrigin(value, path) {
  if (!isStr(value) || !value.trim()) {
    err(path, 'must be a non-empty origin like http://localhost:3000');
    return null;
  }
  const normalized = value.trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(normalized);
  } catch {
    err(path, `"${value}" is not a valid URL`);
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') err(path, `"${value}" must be http(s)`);
  if (url.origin !== normalized) err(path, `"${value}" must be an origin only — no path (expected "${url.origin}")`);
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    err(path, `"${value}" is outside the extension's host permissions (localhost / 127.0.0.1 only)`);
  }
  return normalized;
}

function validateExtractRule(rule, path) {
  if (!isObj(rule)) return err(path, 'must be an object');
  const keys = Object.keys(rule);
  const matched = EXTRACT_KEYS.filter((key) => key in rule);
  if (matched.length !== 1) {
    err(path, `exactly one of ${EXTRACT_KEYS.join(' / ')} required, got [${keys.join(', ')}]`);
    return;
  }
  if ('jsonPath' in rule && !isStr(rule.jsonPath)) err(`${path}.jsonPath`, 'must be a string');
  if ('regex' in rule) {
    if (!isStr(rule.regex)) err(`${path}.regex`, 'must be a string');
    else {
      try {
        new RegExp(rule.regex);
      } catch (error) {
        err(`${path}.regex`, `invalid pattern: ${error.message}`);
      }
    }
    if (rule.group !== undefined && (!Number.isInteger(rule.group) || rule.group < 0)) {
      err(`${path}.group`, 'must be a non-negative integer');
    }
  }
  if ('header' in rule && !isStr(rule.header)) err(`${path}.header`, 'must be a string');
  if ('cookie' in rule && !isStr(rule.cookie)) err(`${path}.cookie`, 'must be a string');
  if (rule.decode !== undefined && !['none', 'url', 'base64'].includes(rule.decode)) {
    err(`${path}.decode`, 'must be none | url | base64');
  }
}

function validateSink(sink, scope, path, origins) {
  if (!isObj(sink)) return err(path, 'must be an object');
  if (!['cookie', 'localStorage', 'sessionStorage'].includes(sink.kind)) {
    return err(path, `kind must be cookie | localStorage | sessionStorage, got "${sink.kind}"`);
  }
  if (sink.kind === 'cookie') {
    if (!isStr(sink.name) || !sink.name) err(`${path}.name`, 'required string');
    if (!isStr(sink.value)) err(`${path}.value`, 'required string (use {{accessToken}} etc.)');
    if (sink.sameSite !== undefined && !SAME_SITE.includes(sink.sameSite)) {
      err(`${path}.sameSite`, `must be ${SAME_SITE.join(' | ')}`);
    }
    if (sink.expirationDate !== undefined && typeof sink.expirationDate !== 'number') {
      err(`${path}.expirationDate`, 'unix seconds (number)');
    }
  } else {
    if (!isStr(sink.key) || !sink.key) err(`${path}.key`, 'required string');
    if (!isStr(sink.value)) err(`${path}.value`, 'required string');
  }
  if (sink.origin !== undefined && origins && !origins.includes(sink.origin.replace(/\/+$/, ''))) {
    err(`${path}.origin`, `must be one of the project origins [${origins.join(', ')}]`);
  }
  templatesIn(sink.value, scope, `${path}.value`);
}

function validateStep(step, scope, origins, path) {
  if (!isObj(step)) {
    err(path, 'must be an object');
    return new Set(scope);
  }
  if (step.method !== undefined && !METHODS.includes(step.method)) {
    err(`${path}.method`, `must be ${METHODS.join(' | ')}`);
  }
  if (!isStr(step.url) || !step.url) {
    err(`${path}.url`, 'required string');
  } else {
    templatesIn(step.url, scope, `${path}.url`);
    const probe = step.url.replace(TEMPLATE_RE, 'x').replace(/\/+$/, '');
    try {
      const origin = new URL(probe).origin;
      if (!origins.includes(origin)) {
        err(`${path}.url`, `"${origin}" is not one of the project origins [${origins.join(', ')}] — the extension refuses off-origin auth requests`);
      }
    } catch {
      err(`${path}.url`, `"${step.url}" is not a valid URL`);
    }
  }
  if (step.bodyType !== undefined && !BODY_TYPES.includes(step.bodyType)) {
    err(`${path}.bodyType`, `must be ${BODY_TYPES.join(' | ')}`);
  }
  if (step.credentials !== undefined && !['include', 'omit'].includes(step.credentials)) {
    err(`${path}.credentials`, 'must be include | omit');
  }
  if (step.headers !== undefined) {
    if (!isObj(step.headers)) err(`${path}.headers`, 'must be an object');
    else for (const [name, value] of Object.entries(step.headers)) templatesIn(value, scope, `${path}.headers.${name}`);
  }
  if (step.expectStatus !== undefined && (!Array.isArray(step.expectStatus) || step.expectStatus.some((s) => !Number.isInteger(s)))) {
    err(`${path}.expectStatus`, 'array of integer status codes');
  }
  if (step.body !== undefined) templatesIn(step.body, scope, `${path}.body`);

  const next = new Set(scope);
  if (step.extract !== undefined) {
    if (!isObj(step.extract)) err(`${path}.extract`, 'must be an object');
    else {
      for (const [name, rule] of Object.entries(step.extract)) {
        validateExtractRule(rule, `${path}.extract.${name}`);
        next.add(name);
      }
    }
  }
  return next;
}

function validateClearStorage(value, path) {
  if (value === 'all') return;
  if (!isObj(value)) return err(path, 'must be "all" or {mode: "all", exclude} or {mode: "keys", keys}');
  if (value.mode === 'all') {
    if (value.exclude !== undefined && (!Array.isArray(value.exclude) || value.exclude.some((x) => !isStr(x)))) {
      err(`${path}.exclude`, 'array of strings');
    }
  } else if (value.mode === 'keys') {
    if (!Array.isArray(value.keys) || value.keys.some((x) => !isStr(x))) err(`${path}.keys`, 'array of strings');
  } else {
    err(`${path}.mode`, 'must be "all" or "keys"');
  }
}

function validateProject(project, index) {
  const p = `projects[${index}]`;
  if (!isObj(project)) return err(p, 'must be an object');

  if (!isStr(project.name) || !project.name.trim()) err(`${p}.name`, 'required non-empty string');

  const origins = [];
  if (!Array.isArray(project.origins) || project.origins.length === 0) {
    err(`${p}.origins`, 'required array with at least one origin');
  } else {
    project.origins.forEach((origin, i) => {
      const ok = validateOrigin(origin, `${p}.origins[${i}]`);
      if (ok) origins.push(ok);
    });
  }

  if (project.reload !== undefined && !RELOADS.includes(project.reload)) {
    err(`${p}.reload`, `must be ${RELOADS.join(' | ')}`);
  }

  if (project.tags !== undefined) {
    if (!Array.isArray(project.tags)) err(`${p}.tags`, 'array of {name, color?}');
    else {
      project.tags.forEach((tag, i) => {
        if (!isObj(tag) || !isStr(tag.name) || !tag.name) err(`${p}.tags[${i}]`, 'needs a string name');
        else if (tag.color !== undefined && !isStr(tag.color)) err(`${p}.tags[${i}].color`, 'must be a string');
      });
    }
  }

  if (project.clear !== undefined) {
    const clear = project.clear;
    if (!isObj(clear)) {
      err(`${p}.clear`, 'object');
    } else {
      if (clear.cookies !== undefined) {
        const cookies = clear.cookies;
        const valid = cookies === 'all' || (isObj(cookies) && (Array.isArray(cookies.names) || Array.isArray(cookies.prefixes)));
        if (!valid) err(`${p}.clear.cookies`, 'must be "all" or {names: []} or {prefixes: []}');
      }
      if (clear.localStorage !== undefined) validateClearStorage(clear.localStorage, `${p}.clear.localStorage`);
      if (clear.sessionStorage !== undefined) validateClearStorage(clear.sessionStorage, `${p}.clear.sessionStorage`);
    }
  }

  const baseScope = new Set(['username', 'password', 'accessToken', 'refreshToken']);
  const users = Array.isArray(project.users) ? project.users : [];
  if (project.users !== undefined && !Array.isArray(project.users)) err(`${p}.users`, 'array');
  users.forEach((user, ui) => {
    if (isObj(user) && isObj(user.credentials) && isObj(user.credentials.extra)) {
      for (const key of Object.keys(user.credentials.extra)) baseScope.add(key);
    }
  });

  if (project.auth !== undefined) {
    const auth = project.auth;
    if (!isObj(auth)) {
      err(`${p}.auth`, 'object');
    } else if (origins.length > 0) {
      if (!isObj(auth.login)) {
        err(`${p}.auth.login`, 'required when auth is present');
      } else {
        auth.preflight = auth.preflight ?? [];
        let scope;
        if (!Array.isArray(auth.preflight)) {
          err(`${p}.auth.preflight`, 'array');
          scope = validateStep(auth.login, baseScope, origins, `${p}.auth.login`);
        } else {
          // Preflight steps run in order: each one sees the previous step's extracts,
          // and the login step sees all of them.
          const running = new Set(baseScope);
          auth.preflight.forEach((step, i) => {
            const next = validateStep(step, running, origins, `${p}.auth.preflight[${i}]`);
            running.clear();
            for (const key of next) running.add(key);
          });
          scope = validateStep(auth.login, running, origins, `${p}.auth.login`);
        }

        if (auth.outputs !== undefined) {
          if (!Array.isArray(auth.outputs)) err(`${p}.auth.outputs`, 'array of sinks');
          else auth.outputs.forEach((sink, i) => validateSink(sink, scope, `${p}.auth.outputs[${i}]`, origins));
        }

        let refreshScope = scope;
        if (auth.refresh !== undefined) {
          refreshScope = validateStep(auth.refresh, scope, origins, `${p}.auth.refresh`);
          if (auth.refresh.outputs !== undefined) {
            if (!Array.isArray(auth.refresh.outputs)) err(`${p}.auth.refresh.outputs`, 'array of sinks');
            else auth.refresh.outputs.forEach((sink, i) => validateSink(sink, refreshScope, `${p}.auth.refresh.outputs[${i}]`, origins));
          }
        }

        if (auth.session !== undefined) {
          if (!isObj(auth.session)) err(`${p}.auth.session`, 'object');
          else {
            if (auth.session.ttlMinutes !== undefined && (typeof auth.session.ttlMinutes !== 'number' || auth.session.ttlMinutes <= 0)) {
              err(`${p}.auth.session.ttlMinutes`, 'positive number');
            }
            if (auth.session.verify !== undefined) {
              validateStep({ ...auth.session.verify, extract: {} }, scope, origins, `${p}.auth.session.verify`);
              if (typeof auth.session.verify.expectStatus !== 'number') {
                err(`${p}.auth.session.verify.expectStatus`, 'integer status code');
              }
            }
          }
        }
      }
    }
  }

  users.forEach((user, ui) => {
    const up = `${p}.users[${ui}]`;
    if (!isObj(user)) return err(up, 'must be an object');
    if (!isStr(user.name) || !user.name.trim()) err(`${up}.name`, 'required non-empty string');
    if (user.id !== undefined && !isStr(user.id)) err(`${up}.id`, 'string');
    if (user.tags !== undefined && (!Array.isArray(user.tags) || user.tags.some((t) => !isStr(t)))) {
      err(`${up}.tags`, 'array of strings');
    }
    if (user.cookies !== undefined) {
      if (!Array.isArray(user.cookies)) err(`${up}.cookies`, 'array');
      else {
        user.cookies.forEach((cookie, ci) => {
          const cp = `${up}.cookies[${ci}]`;
          if (!isObj(cookie)) return err(cp, 'object');
          if (!isStr(cookie.name) || !cookie.name) err(`${cp}.name`, 'required');
          if (!isStr(cookie.value)) err(`${cp}.value`, 'required');
          if (cookie.sameSite !== undefined && !SAME_SITE.includes(cookie.sameSite)) {
            err(`${cp}.sameSite`, `must be ${SAME_SITE.join(' | ')}`);
          }
          if (cookie.expirationDate !== undefined && typeof cookie.expirationDate !== 'number') {
            err(`${cp}.expirationDate`, 'unix seconds (number)');
          }
        });
      }
    }
    if (user.storage !== undefined) {
      if (!isObj(user.storage)) err(`${up}.storage`, 'object keyed by origin');
      else {
        for (const [origin, buckets] of Object.entries(user.storage)) {
          const normalized = origin.replace(/\/+$/, '');
          if (!origins.includes(normalized) && origins.length > 0) {
            warn(`${up}.storage.${origin}`, `not one of the project origins [${origins.join(', ')}] — this storage will never be injected`);
          }
          if (!isObj(buckets)) return err(`${up}.storage.${origin}`, 'object with localStorage / sessionStorage');
          for (const area of ['localStorage', 'sessionStorage']) {
            if (buckets[area] === undefined) continue;
            if (!isObj(buckets[area])) return err(`${up}.storage.${origin}.${area}`, 'record of string → string');
            for (const [key, value] of Object.entries(buckets[area])) {
              if (!isStr(value)) err(`${up}.storage.${origin}.${area}.${key}`, 'must be a string');
            }
          }
        }
      }
    }
    if (user.credentials !== undefined) {
      if (!isObj(user.credentials)) err(`${up}.credentials`, 'object');
      else {
        if (user.credentials.username !== undefined && !isStr(user.credentials.username)) err(`${up}.credentials.username`, 'string');
        if (user.credentials.password !== undefined && !isStr(user.credentials.password)) err(`${up}.credentials.password`, 'string');
        if (user.credentials.extra !== undefined && (!isObj(user.credentials.extra) || Object.values(user.credentials.extra).some((v) => !isStr(v)))) {
          err(`${up}.credentials.extra`, 'record of string → string');
        }
      }
    }
  });

  for (const key of Object.keys(project)) {
    if (!['id', 'name', 'origins', 'tags', 'auth', 'clear', 'reload', 'users'].includes(key)) {
      warn(`${p}.${key}`, 'unknown field — will be ignored (typo?)');
    }
  }
}

// ── run ────────────────────────────────────────────────────────────────────
if (!isObj(raw)) {
  err('$', 'seed must be a JSON object');
} else {
  // Accept both doors: a seed document {projects:[…]} or a single project
  // object {name, origins, …} (what the extension's Data tab holds).
  if (raw.projects === undefined && raw.name !== undefined) {
    warn('$', 'single-project shape detected (project JSON) — validating wrapped as { "projects": [ … ] }');
    raw = { projects: [raw] };
  }
  if (!Array.isArray(raw.projects) || raw.projects.length === 0) {
    err(
      'projects',
      'required array with at least one project — pass a seed ({ "projects": [ … ] }) or a single project object ({ "name", "origins", … })',
    );
  } else {
    raw.projects.forEach((project, index) => validateProject(project, index));
    for (const key of Object.keys(raw)) {
      if (!['schemaVersion', 'projects'].includes(key)) warn(`$.${key}`, 'unknown top-level field (typo?)');
    }
    if (raw.schemaVersion !== undefined && typeof raw.schemaVersion !== 'number') {
      err('schemaVersion', 'must be a number (1)');
    }
  }
}

if (warnings.length) {
  console.log(`warnings (${warnings.length}):`);
  for (const line of warnings) console.log(`  ! ${line}`);
}
if (errors.length) {
  console.error(`FAIL ${file} — ${errors.length} error(s):`);
  for (const line of errors) console.error(`  x ${line}`);
  process.exit(1);
}
const projectCount = Array.isArray(raw.projects) ? raw.projects.length : 0;
console.log(`OK ${file} — valid seed, ${projectCount} project(s), ${Array.isArray(raw.projects) ? raw.projects.reduce((n, p) => n + (Array.isArray(p?.users) ? p.users.length : 0), 0) : 0} user(s). Ready for Settings → Import seed.`);
