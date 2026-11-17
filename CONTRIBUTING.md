# Contributing

## Development setup

Use Node.js 22 and npm. Follow the setup instructions in the repository [README](README.md). Local PostgreSQL is provided through Docker Compose; Docker must be installed to run it.

## Branch and pull request workflow

- Keep `main` production-ready; use `develop` as the integration branch when it is available.
- Create focused `feature/*`, `fix/*`, or `hotfix/*` branches.
- Do not push directly to `main`.
- Open a pull request, explain the change, and request review from the designated maintainers.
- Do not merge until required CI checks pass and approvals are configured.

Branch protections, reviewer assignments, and team access are GitHub settings and must be configured by repository administrators.

## Quality and security

Before opening a pull request, run:

```sh
npm run lint
npm test
npm run build
```

Add or update tests for behavior changes. Never commit secrets, real user or booking data, or unapproved policy assumptions. Do not put sensitive security reports in public issues.
