# Run the benchmark after skill changes

- What happened: A ranking change passed the unit tests but lowered the hit rate.
- Proposed: Add to the Quality rules:
  - After any change to the skills package, run the benchmark.
  - Stop if the hit rate falls below the recorded baseline.
- Belongs in: rules.md
