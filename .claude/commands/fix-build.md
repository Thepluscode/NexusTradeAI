Diagnose and fix build issues in the bot-dashboard:

1. `cd clients/bot-dashboard && npm run build 2>&1` — capture full output
2. If build fails, analyze the error:
   - TypeScript errors: fix type issues
   - Import errors: fix module resolution
   - Dependency issues: check package.json
3. If build passes, run `npm run lint 2>&1` to check for lint errors
4. Fix any issues found and verify the build passes cleanly
5. Report what was fixed
