const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, origin, id, eventId, wait } = require('./test-wedding-browser.cjs');
const base = { category: 'prediction', kind: 'single', options: ['Meghalaya', 'Andaman scuba diving', 'Himalayan trek', 'Penguin spotting'],
  photoIds: [], status: 'open', startsAt: null, closesAt: null, revealAt: null, results: 'after_vote', pinned: false,
  provisional: false, mine: null, counts: null, total: null, words: [], correct: null, coupleAnswers: null };
const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of [390, 1440]) {
      const run = await scenario(browser, { width, initial: 'host' });
      const polls = [{ ...base, id: id(110), question: 'Which adventure will they tick off their bucket list first?' },
        { ...base, id: id(111), question: 'An unvoted question' },
        { ...base, id: id(112), category: 'quiz', question: 'A voted quiz', options: ['First', 'Second'], correct: 0 }];
      const votes = new Map([[id(110), [['0'], ['1']]], [id(112), [['0']]]]);
      const writes = []; let fail = false, delay = 0;
      const { page, context } = run;
      try {
        await context.route(url => url.pathname.endsWith('/rpc/wedding_playground'), route => json(route, {
          polls: polls.filter(p => !p.archived).map(p => ({ ...p, total: votes.get(p.id)?.length || 0,
            counts: p.options.map((_, i) => votes.get(p.id)?.filter(answer => answer.includes(String(i))).length || 0) })),
          teams: [], myTeam: null, stats: { votes: 3, voters: 2, completed: 2 }, pendingWords: [],
        }));
        await context.route(url => url.pathname.endsWith('/rpc/edit_wedding_poll'), async route => {
          const body = route.request().postDataJSON(); writes.push(body);
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          if (fail) return json(route, { message: 'Could not save this question. Try again.' }, 503);
          const next = body.p_poll, old = polls.find(p => p.id === next.id);
          const changed = ['question', 'options', 'category', 'kind', 'photoIds', 'correct', 'coupleAnswers'].some(key => JSON.stringify(old[key]) !== JSON.stringify(next[key]));
          if (changed && votes.get(old.id)?.length) {
            if (!body.p_allow_revision) return json(route, { message: 'Guests have already voted. Save these edits as a new voting round to keep their earlier answers intact' }, 400);
            old.archived = true; old.status = 'draft';
            const replacement = { ...base, ...next, id: id(200 + writes.length) };
            polls.push(replacement); return json(route, { id: replacement.id, revised: true });
          }
          Object.assign(old, next); return json(route, { id: old.id, revised: false });
        });
        const card = question => page.locator('.admin-poll-card').filter({ has: page.getByRole('heading', { name: question, exact: true }) });
        await page.goto(origin + '/admin/polls');
        await card('An unvoted question').getByRole('button', { name: 'Edit', exact: true }).click();
        await page.getByLabel('Question', { exact: true }).fill('A new question before voting');
        await page.getByLabel('Options, one per line (2–6)', { exact: true }).fill('One\nTwo\nThree\n');
        await page.getByRole('button', { name: 'Save poll', exact: true }).click();
        await page.getByText('Poll saved.', { exact: true }).waitFor();
        assert.equal(polls.find(p => p.id === id(111)).question, 'A new question before voting');
        assert.deepEqual(polls.find(p => p.id === id(111)).options, ['One', 'Two', 'Three']);
        await card('A new question before voting').getByRole('button', { name: 'Edit', exact: true }).click();
        await page.getByLabel('Question', { exact: true }).fill('An edit while a guest votes');
        votes.set(id(111), [['1']]);
        await page.getByRole('button', { name: 'Save poll', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Guests have already voted' }).waitFor();
        await page.getByRole('button', { name: 'Save new voting round', exact: true }).waitFor();
        assert.equal(await page.getByLabel('Question', { exact: true }).inputValue(), 'An edit while a guest votes');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();

        const original = polls.find(p => p.id === id(110));
        await card(original.question).getByRole('button', { name: 'Edit', exact: true }).click();
        await page.getByLabel('Question', { exact: true }).fill('Cancel this edit');
        await page.getByLabel('Options, one per line (2–6)', { exact: true }).fill('Coastal trip\nScuba diving\nHimalayan trek\nPenguin spotting');
        assert.ok(await page.getByLabel('Category', { exact: true }).isEnabled());
        assert.ok(await page.getByLabel('Response format', { exact: true }).isEnabled());
        assert.ok(await page.getByLabel('Options, one per line (2–6)', { exact: true }).isEnabled());
        await page.getByRole('button', { name: 'Save new voting round', exact: true }).waitFor();
        const beforeCancel = writes.length;
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(writes.length, beforeCancel); assert.equal(original.archived, undefined);

        await card(original.question).getByRole('button', { name: 'Edit', exact: true }).click();
        await page.getByLabel('Question', { exact: true }).fill('Which adventure should we try together?');
        await page.getByLabel('Options, one per line (2–6)', { exact: true }).fill('Coastal trip\nScuba diving\nHimalayan trek\nPenguin spotting');
        await page.locator('.poll-edit-notice').getByText(/keeps earlier answers archived/).waitFor();
        fail = true;
        await page.getByRole('button', { name: 'Save new voting round', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Could not save this question' }).waitFor();
        assert.equal(original.archived, undefined);
        assert.equal(await page.getByLabel('Question', { exact: true }).inputValue(), 'Which adventure should we try together?');
        await page.evaluate(() => document.fonts.ready);
        fs.mkdirSync(path.resolve(__dirname, '../artifacts'), { recursive: true });
        await page.locator('.poll-editor').screenshot({ path: path.resolve(__dirname, `../artifacts/poll-editing-${width}.png`) });
        fail = false; delay = 350;
        const beforeSave = writes.length;
        await page.getByRole('button', { name: 'Save new voting round', exact: true }).evaluate(button => { button.click(); button.click(); });
        await wait(() => writes.length === beforeSave + 1, 'One save request for rapid clicks');
        assert.ok(await page.getByLabel('Question', { exact: true }).isDisabled());
        await page.getByText('Question updated as a new voting round. Earlier answers are archived.', { exact: true }).waitFor();
        assert.equal(original.archived, true); assert.equal(original.options[0], 'Meghalaya');
        assert.deepEqual(votes.get(original.id), [['0'], ['1']]);
        await card('Which adventure should we try together?').waitFor();
        assert.equal(await card(original.question).count(), 0);

        delay = 0;
        await card('A voted quiz').getByRole('button', { name: 'Edit', exact: true }).click();
        assert.ok(await page.getByLabel('Correct answer', { exact: true }).isEnabled());
        await page.getByLabel('Status', { exact: true }).selectOption('closed');
        await page.getByRole('button', { name: 'Save poll', exact: true }).click();
        await page.getByText('Poll saved.', { exact: true }).waitFor();
        assert.equal(polls.find(p => p.id === id(112)).archived, undefined);
        assert.deepEqual(votes.get(id(112)), [['0']], 'Status-only saves keep ballots');
        await card('A voted quiz').getByRole('button', { name: 'Edit', exact: true }).click();
        await page.getByLabel('Correct answer', { exact: true }).selectOption('1');
        await page.getByRole('button', { name: 'Save new voting round', exact: true }).click();
        await page.getByText('Question updated as a new voting round. Earlier answers are archived.', { exact: true }).waitFor();
        assert.equal(polls.find(p => p.id === id(112)).correct, 0);
        assert.equal(polls.find(p => p.question === 'A voted quiz' && !p.archived).correct, 1);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(run.errors, []);
        console.log(`PASS ${width}px: editable question/choices/keys, clear new-round save, unvoted in-place edits, cancel, failure recovery, request lock, preserved old ballots and status-only saves`);

        if (width === 390) {
          const demo = await page.evaluate(async eventId => {
            const { api } = await import('/src/companion/lib/backend.ts');
            const { celebration } = await import('/src/companion/lib/celebration.ts');
            const previousKind = api.kind; api.kind = 'local';
            try {
              const before = await celebration.playground(eventId, true);
              const initial = before.polls.find(p => p.category === 'prediction');
              await celebration.vote(eventId, initial.id, ['0']);
              const edited = { ...initial, question: initial.question + ' Updated', options: ['First choice', 'Second choice'] };
              const result = await celebration.savePoll(eventId, edited, true);
              const retry = await celebration.savePoll(eventId, edited, true);
              const after = await celebration.playground(eventId, true);
              const saved = JSON.parse(localStorage.getItem(`as-wedding-celebration:${eventId}`));
              return { revised: result.revised, stable: result.id === retry.id, oldHidden: !after.polls.some(p => p.id === initial.id),
                newQuestion: after.polls.find(p => p.id === result.id).question, expectedQuestion: edited.question,
                savedAnswers: Object.values(saved.votes[initial.id]), oldOptions: saved.polls.find(p => p.id === initial.id).options, expectedOptions: initial.options };
            } finally { api.kind = previousKind; }
          }, eventId);
          assert.ok(demo.revised && demo.stable && demo.oldHidden);
          assert.equal(demo.newQuestion, demo.expectedQuestion); assert.deepEqual(demo.savedAnswers, [['0']]); assert.deepEqual(demo.oldOptions, demo.expectedOptions);
          console.log('PASS: demo revisions and retries preserve archived questions and ballots');
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
