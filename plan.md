1. **Fix `use-edit-product-form.ts`**: Replace destructured `watch` function calls with `useWatch` hook from `react-hook-form` to avoid memoization warnings with React Compiler.
2. **Fix `use-new-product-form.ts`**: Replace destructured `watch` function calls with `useWatch` hook from `react-hook-form` to avoid memoization warnings with React Compiler.
3. **Verify Fix**: Run `npm run lint`, `npm run typecheck` and `npm run test` locally and test that there are no warnings and all tests pass.
4. **Pre-commit Instructions**: Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
5. **Submit**: Submit changes once all checks pass.
