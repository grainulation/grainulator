let input = ''; for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const passed = request.answer.trim() === String(6 * 7);
console.log(passed ? 'Independent arithmetic check passed.' : 'The answer does not equal 6 × 7. Recalculate.');
process.exitCode = passed ? 0 : 1;
