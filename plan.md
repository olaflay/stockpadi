1. **Fix `.github/workflows/ci.yml`**: Update `npm ci` command to install dependencies in `frontend` and `backend` directories so that subsequent commands (`npm run lint`, `npm run test`, `npm run build`) which are delegated to the subdirectories have the required binaries (like `eslint`, `vitest`, `tsc`, `next` etc) available.
2. **Verify Fix**: Ensure that the commands run successfully locally.
3. **Pre-commit Instructions**: Run pre-commit checks.
4. **Submit**: Submit changes once all checks pass.
