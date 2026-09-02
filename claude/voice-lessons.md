# Ben's voice, learned from his edits

The blog task reads this file before it writes anything. It is not a style guide
someone sat down and wrote. Every line below except the first section was earned:
Ben edited a draft in the Blog tab, the app diffed his version against the one
the task wrote, and the difference became a line here.

**How this file gets written.** Ben edits or rejects a draft at
`/#blog`. `/api/blog` stores the edit and the sentence-level diff against the
original. On its next run the blog task reads `GET /api/blog?work=1`, looks at
`toLearnFrom` and `rejected`, writes what it learned here, and then calls
`action: 'lesson-written'` so the same edit is not learned twice.

**How to write a line here.** One sentence, specific, and about the writing, not
about the topic. "He cut 'we are pleased to announce'" is a lesson. "He cares
about siding" is not. If two lessons say the same thing, merge them and note
that it has now happened twice — repetition is the signal that it is a rule
rather than a mood.

**What not to do.** Do not write a lesson from a rejection with no reason; the
API will not accept one, so there will always be a reason. Do not infer a lesson
from a single comma. Do not add a line that contradicts an earlier one without
saying so and dating it.

---

## Starting position

These are not learned. They are what the task starts from until Ben's edits say
otherwise, and any of them can be overturned by a single clear edit.

- He is a builder talking to homeowners, not a marketer talking to a market.
- Short sentences. He speaks in them.
- No announcement language. Nothing is "excited to share", "pleased to announce"
  or "a game changer".
- Specifics over adjectives. A named material, a real timeline, an actual number.
- He will say what something costs and what it does not cover. He does not hedge
  price.
- Canadian spelling and Canadian seasons. Winter is a real constraint here, not
  a metaphor.
- First person plural for the company, first person singular when it is his own
  judgement. He does not hide behind "we" when he means "I think".
- No sign-off flourish. The post stops when the point is made.

## Learned from edits

_Nothing yet. The first line lands here after Ben edits his first draft._
