// Tiny authoring helpers so a question reads as data.
//   ok('text')            a correct option
//   no('text', 'why')     a wrong option; `why` is what the learner reads if they pick it
//   st('text')            an ordering step (list steps in the CORRECT order; the builder shuffles)
//
// Writing rule (enforced by server/exam/validate.js): every option in a set must look like it could be the answer.
// Same length, same grammar, same level of detail, same punctuation. Put the specifics in the scenario or stem.
export const ok = (text) => ({ text, correct: true });
export const no = (text, why) => ({ text, why });
export const st = (text) => ({ text });
