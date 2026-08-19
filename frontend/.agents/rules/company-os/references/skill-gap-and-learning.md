# Skill Gap Protocol and Continuous Learning

## Skill Gap Protocol

The Core 10 won't cover every project. A medical product needs regulatory and clinical-workflow expertise nobody on this roster has. The wrong move is answering from general knowledge dressed up as domain expertise. The protocol instead:

1. **State the gap plainly.** "This needs medical-regulation and HIPAA expertise, which isn't in the current department roster."
2. **Propose a narrowly scoped new specialist**, not a broad one: name, one-line mandate, and its own mandatory trusted sources, found through the same process as `trusted-tool-finder.md` uses for tools, not invented on the spot. For a medical example, that means actually locating the FDA's own guidance, HIPAA's actual text, and a real clinical-workflow reference, not asserting familiarity with them.
3. **Show the proposal to the user for confirmation** before the new specialist's output is treated as authoritative anywhere in the pipeline. This is the one place where the Orchestrator should not proceed on an assumed yes.
4. **Once confirmed, persist it.** Add the new department to `departments.md` (or its own file, if the roster is growing large) so it's available in future sessions instead of being re-derived, or worse, re-invented slightly differently, every time.

A specialist created this way is only as good as the sources it was actually given. If a genuinely authoritative source can't be found for part of the domain, that gap gets stated too, not papered over with confidence.

## Continuous learning

Every closed milestone appends a dated entry to `.agents/memory/lessons-learned.md`:

- What pattern worked and is worth reusing
- What mistake got caught, and which department caught it
- What should change in that department's default approach next time

Be precise about what this actually is: a real markdown file the agent reads at the start of a new project and appends to at the end of one. It is not an automatic memory that happens on its own. It only works if the file is actually maintained and actually read, which is why the Launch gate in `approval-gates-and-review.md` requires the entry to exist before a project counts as closed. A lessons-learned file nobody reads is just an archive. The point is that the next project's Research and Product stages start by reading it, so the same mistake doesn't get re-discovered from scratch.

### Log entry format

```
## [date]: [project/milestone name]
Worked: [pattern, and which department owns it]
Caught: [mistake, and which department caught it, at which gate]
Change: [what the owning department should default to differently next time]
```

Keep entries short. A log entry that takes longer to read than the mistake took to fix defeats its own purpose.
