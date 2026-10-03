## Description
<!-- What does this PR do? Be specific. -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Upgrade / enhancement
- [ ] Refactor (no functional change)
- [ ] Documentation
- [ ] Tests

## Related Issue
<!-- Closes #<issue_number> -->

## Testing
- [ ] Unit tests pass (`npm run test:unit`)
- [ ] Integration tests pass (`npm run test:int`)
- [ ] New tests added for new functionality
- [ ] Coverage does not drop below thresholds

## Checklist
- [ ] Code follows the existing style (no unnecessary bold/formatting)
- [ ] Sensitive data is never logged or returned in API responses
- [ ] All new routes have appropriate role-based access control
- [ ] Cache invalidation handled if data is mutated
- [ ] Socket.io events emitted where real-time update is needed
- [ ] `.env.example` updated if new env vars added
- [ ] No `console.log` left in production code (use `logger`)

## Screenshots (if UI change)
<!-- Before / After screenshots here -->
