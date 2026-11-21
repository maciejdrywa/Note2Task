import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Transpile the actual API modules for Node without introducing a second test framework.
const temporary = mkdtempSync(join(tmpdir(), "note2task-api-"));
for (const name of ["types", "client", "mapping"]) {
  const source = readFileSync(new URL(`../src/api/${name}.ts`, import.meta.url), "utf8")
    .replaceAll("import.meta.env", "({})")
    .replaceAll('"./types"', '"./types.mjs"');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  writeFileSync(join(temporary, `${name}.mjs`), result.outputText);
}
const { postSchedule } = await import(pathToFileURL(join(temporary, "client.mjs")));
const { fromScheduleResponse, toApiRequest } = await import(pathToFileURL(join(temporary, "mapping.mjs")));
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
  assert.ok(temporary.includes("note2task-api-"));
  rmSync(temporary, { recursive: true });
});

const event = {
  summary: "Kolacja",
  start: { dateTime: "2026-11-22T19:00:00+01:00" },
  end: { dateTime: "2026-11-22T20:00:00+01:00" },
};
const report = {
  calendar_id: "primary", status: "completed",
  results: [{ event, status: "created", google_event_id: "event1" }],
};

test("sends text to /schedule and maps the scheduling report", async () => {
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://127.0.0.1:8000/schedule");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { text: "Jutro kolacja" });
    assert.equal(options.signal, controller.signal);
    return Response.json(report);
  };
  const result = fromScheduleResponse(await postSchedule(toApiRequest(" Jutro kolacja "), controller.signal));
  assert.equal(result.tasks[0].action, "Kolacja");
  assert.equal(result.tasks[0].start, "19:00");
  assert.equal(result.tasks[0].description, null);
  assert.equal(result.schedule.results[0].google_event_id, "event1");
});

test("207 preserves both created and failed events and report", async () => {
  const partial = {
    ...report, status: "partial", results: [report.results[0], {
      event: { ...event, summary: "Sklep" }, status: "failed",
      error: { code: "google_http_403", message: "Access denied" },
    }],
  };
  globalThis.fetch = async () => Response.json(partial, { status: 207 });
  const result = fromScheduleResponse(await postSchedule({ text: "Dwa zadania" }));
  assert.equal(result.tasks.length, 2);
  assert.equal(result.schedule.status, "partial");
  assert.equal(result.schedule.results[1].error.code, "google_http_403");
});

test("unknown results remain visible without a retry", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ ...report, status: "failed", results: [{ event, status: "unknown" }] }, { status: 207 });
  };
  const result = fromScheduleResponse(await postSchedule({ text: "Kolacja" }));
  assert.equal(result.schedule.results[0].status, "unknown");
  assert.equal(calls, 1);
});

test("Google authorization errors retain the backend instruction", async () => {
  globalThis.fetch = async () => Response.json({ detail: "Uruchom authorize_google" }, { status: 503 });
  await assert.rejects(postSchedule({ text: "Kolacja" }), /authorize_google/);
});

test("rejects obsolete list responses instead of silently showing no tasks", async () => {
  globalThis.fetch = async () => Response.json([event]);
  await assert.rejects(postSchedule({ text: "Kolacja" }), /niepoprawny raport/);
});

test("an empty completed report is valid", async () => {
  globalThis.fetch = async () => Response.json({ ...report, results: [] });
  assert.deepEqual(fromScheduleResponse(await postSchedule({ text: "Bez zadań" })).tasks, []);
});

test("network failure reports uncertainty and is not retried", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError("offline"); };
  await assert.rejects(postSchedule({ text: "Kolacja" }), /mogły zostać zapisane/);
  assert.equal(calls, 1);
});
