// Parser for the raw practice-test result pages (the pasted question_sets/setN.txt files). Used ONCE by scripts/consolidate-questions.mjs
// to build questions/questions.json; after that the raw files are no longer needed.
//
// A block looks like:
//   Question 8 of 50
//   <stem, several paragraphs>
//   Your Answer
//   <answer line>            <- one per chosen answer, each followed by "This answer is correct./incorrect."
//   This answer is incorrect.
//   Correct Answer
//   <answer line>            <- one per correct answer, each followed by "This answer is correct."
//   This answer is correct.
//   <explanation, links, scrape noise>
//
// An answer line is text up to its "This answer is ..." marker, and an answer ends at that marker, so a multi-answer question is
// read correctly (the older scripts read only the first line after the heading).

const MARK = /^This answer is (correct|incorrect)\.\s*$/;

/**
 * Read the answers at the start of a section. An answer is: one or more text lines, a blank line, then a marker line
 * ("This answer is correct./incorrect."). Answers follow each other with no blank line between the marker and the next answer.
 * Reading stops at the first block that is NOT followed by a marker (that block is the start of the explanation).
 * Returns { answers, rest } where rest is everything after the last answer's marker.
 */
function readAnswers(lines) {
  const answers = [];
  let i = 0;
  for (;;) {
    // Collect text lines up to a blank line.
    let j = i;
    const text = [];
    while (j < lines.length && lines[j].trim() !== '' && !MARK.test(lines[j]) && lines[j] !== 'Correct Answer') text.push(lines[j++].trim());
    // An answer needs: text, then (blank lines), then a marker.
    let k = j;
    while (k < lines.length && lines[k].trim() === '') k++;
    if (!text.length || k >= lines.length || !MARK.test(lines[k])) break;
    answers.push({ text: text.join(' ').replace(/\s+/g, ' ').trim(), correct: MARK.exec(lines[k])[1] === 'correct' });
    i = k + 1;
  }
  return { answers, rest: lines.slice(i) };
}

const NOISE = /^(Introduction|Completed)$/;
const LINK_LINE = /(\| Microsoft Learn|- Training \| Microsoft Learn|^Additional Reading:)$/;

/** Parse the text after the second answer block into explanation, objective and the listed wrong options. */
function readExplanation(lines) {
  const text = lines.join('\n').replace(/^\s+/, '');
  const out = { explanation: '', objective: '', tests: '', options: [] };
  const rationale = /\nRationale:\n([\s\S]*)$/.exec(`\n${text}`);
  const objective = /\nObjective:\n+([^\n]+)/.exec(`\n${text}`);
  const tests = /\nWhat This Item Tests:\n+([^\n]+)/.exec(`\n${text}`);
  if (objective) out.objective = objective[1].trim();
  if (tests) out.tests = tests[1].trim();
  let body = rationale ? rationale[1] : text;
  // "Correct: X –– why" / "Incorrect: Y –– why" option lines
  for (const m of body.matchAll(/^(Correct|Incorrect): (.+?) –– (.+)$/gm)) out.options.push({ correct: m[1] === 'Correct', text: m[2].trim(), why: m[3].trim() });
  body = body.split('\n')
    .filter((l) => !NOISE.test(l.trim()) && !LINK_LINE.test(l.trim()) && !/^(Correct|Incorrect): .+ –– /.test(l) && !/^(Objective|What This Item Tests|Additional Reading|Rationale):\s*$/.test(l.trim()))
    .join('\n');
  // Drop a trailing run of reference titles (short lines with no sentence punctuation) after the prose.
  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  while (paras.length > 1 && paras.at(-1).length < 110 && !/[.!?]$/.test(paras.at(-1))) paras.pop();
  // The "Objective" and "tests" lines may have leaked into the prose when there is no Rationale heading.
  out.explanation = paras.filter((p) => p !== out.objective && p !== out.tests).join('\n\n').replace(/ Completed\b/g, '').trim();
  return out;
}

/** @returns [{ n, stem, mine:[{text,correct}], right:[{text}], explanation, objective, tests, options }] for one raw file's text */
export function parseSet(raw) {
  const text = raw.replace(/\r/g, '');
  const parts = text.split(/^Question (\d+) of \d+$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1];
    const a = body.indexOf('\nYour Answer\n');
    if (a < 0) continue;
    const stem = body.slice(0, a).replace(/\s+\n/g, '\n').trim();
    const after = body.slice(a + '\nYour Answer\n'.length).split('\n');
    const mine = readAnswers(after);
    const rightAt = mine.rest.findIndex((l) => l === 'Correct Answer');
    let right = { answers: [], rest: mine.rest };
    if (rightAt >= 0) right = readAnswers(mine.rest.slice(rightAt + 1));
    // When the learner was right the page can omit a separate "Correct Answer" heading; the answers are then the learner's.
    const rightList = right.answers.length ? right.answers : mine.answers.filter((x) => x.correct);
    out.push({ n: Number(parts[i]), stem, mine: mine.answers, right: rightList.map((x) => ({ text: x.text })), ...readExplanation(right.rest) });
  }
  return out;
}
