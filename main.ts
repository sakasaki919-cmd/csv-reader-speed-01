// Driver for the csv-reader-speed-01 entry. It loads run() from solve.js,
// reads every case out of /input/cases.json, answers each one alone, and
// writes the answers, in the cases' order, to /output/answers.json.
// Runs on Node 22, which strips this file's types as it runs it.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Switch V8's incremental marking off before solve.js is loaded, so all of
// the timed work runs under the same flags as the house baseline.
setFlagsFromString('--no-incremental-marking');

type CaseRunner = (input: unknown) => unknown;
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: CaseRunner };

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];
const answers = cases.map((c) => run(c.input));
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
